import os
import uuid

import pytest

from src.config import get_settings
from src.db.engine import init_db, reset_db_state
from tests.test_api.auth_helpers import register_user_via_verification


@pytest.fixture
def disclosure_db(monkeypatch):
    db_path = os.path.join(os.path.dirname(__file__), "_test_ai_disclosure.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DIRECT_DATABASE_URL", url)
    monkeypatch.setenv("AUTH_SECRET_KEY", "test-secret-key-for-jwt-signing-32chars")
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("SMTP_HOST", "")
    monkeypatch.setenv("SMTP_FROM", "")
    monkeypatch.setenv("SMTP_USER", "")
    monkeypatch.setenv("SMTP_PASSWORD", "")
    get_settings.cache_clear()
    reset_db_state()
    init_db()
    yield
    reset_db_state()
    get_settings.cache_clear()
    # The revisions endpoint rebinds the global session store to the DB store; undo for later tests.
    import src.services.sessions as sessions_mod

    sessions_mod._store = None
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass


async def _register(client, email: str, name: str) -> dict[str, str]:
    body = await register_user_via_verification(client, name=name, email=email, password="SecurePass1")
    return {"Authorization": f"Bearer {body['access_token']}"}


async def _create_paper(client, headers: dict[str, str], name: str = "Disclosure Paper") -> str:
    res = await client.post("/api/v1/papers", headers=headers, json={"name": name, "latex": "\\documentclass{article}"})
    assert res.status_code == 201, res.text
    return res.json()["id"]


@pytest.mark.asyncio
async def test_ai_disclosure_requires_auth(client, disclosure_db):
    headers = await _register(client, "disc-auth@uni.edu", "Auth User")
    paper_id = await _create_paper(client, headers)

    anonymous = await client.get(f"/api/v1/papers/{paper_id}/ai-disclosure")
    assert anonymous.status_code == 401

    bad_token = await client.get(
        f"/api/v1/papers/{paper_id}/ai-disclosure",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert bad_token.status_code == 401


@pytest.mark.asyncio
async def test_ai_disclosure_is_scoped_to_paper_owner(client, disclosure_db):
    owner = await _register(client, "disc-owner@uni.edu", "Owner")
    other = await _register(client, "disc-other@uni.edu", "Other")
    paper_id = await _create_paper(client, owner)

    forbidden = await client.get(f"/api/v1/papers/{paper_id}/ai-disclosure", headers=other)
    assert forbidden.status_code == 404

    invalid = await client.get("/api/v1/papers/not-a-uuid/ai-disclosure", headers=owner)
    assert invalid.status_code == 400

    missing = await client.get(f"/api/v1/papers/{uuid.uuid4()}/ai-disclosure", headers=owner)
    assert missing.status_code == 404

    res = await client.get(f"/api/v1/papers/{paper_id}/ai-disclosure", headers=owner)
    assert res.status_code == 200
    body = res.json()
    # A fresh paper only has the empty placeholder AI session, which is not an interaction.
    assert body["paper_id"] == paper_id
    assert body["paper_title"] == "Disclosure Paper"
    assert body["has_ai_usage"] is False
    assert body["totals"]["interactions"] == 0
    assert body["by_task"] == []
    assert body["statement"]["en"].startswith("No use of Arionear's AI writing assistant was recorded")


@pytest.mark.asyncio
async def test_ai_disclosure_aggregates_recorded_usage_and_decisions(client, disclosure_db):
    from src.db.engine import get_db
    from src.db.models import AiSession, TaskType
    from src.db.paper_repository import DatabaseSessionStore
    from src.services.usage_tracking import record_ai_usage

    owner = await _register(client, "disc-usage@uni.edu", "Usage Owner")
    paper_id = await _create_paper(client, owner)
    store = DatabaseSessionStore()

    style_rev = store.add_revision(paper_id, "intro", "old intro", "new intro")
    assert style_rev is not None
    record_ai_usage(
        paper_id=paper_id,
        task_type="style",
        user_input="Polish the introduction",
        ai_output="Done",
        llm_provider="zai",
        llm_model="glm-4.7-flash",
        revision_id=style_rev.id,
    )
    edit_rev = store.add_revision(paper_id, "methods", "old methods", "new methods")
    assert edit_rev is not None
    record_ai_usage(
        paper_id=paper_id,
        task_type="edit",
        user_input="Rewrite methods",
        ai_output="Done",
        llm_provider="zai",
        llm_model="glm-4.7-flash",
        revision_id=edit_rev.id,
    )
    record_ai_usage(
        paper_id=paper_id,
        task_type="citation",
        user_input="Check references",
        ai_output="2/2 verified",
        llm_provider="google",
    )

    accepted = await client.post(
        f"/api/v1/revisions/{paper_id}/{style_rev.id}", headers=owner, json={"action": "accepted"}
    )
    assert accepted.status_code == 200
    rejected = await client.post(
        f"/api/v1/revisions/{paper_id}/{edit_rev.id}", headers=owner, json={"action": "rejected"}
    )
    assert rejected.status_code == 200

    # "edit" has no TaskType member: stored as CHAT, but the raw task + revision link are kept in metadata.
    with get_db() as db:
        edit_rows = [
            row
            for row in db.query(AiSession).filter(AiSession.paper_id == uuid.UUID(paper_id)).all()
            if (row.metadata_ or {}).get("task") == "edit"
        ]
        assert len(edit_rows) == 1
        assert edit_rows[0].task_type == TaskType.CHAT
        assert edit_rows[0].metadata_["revision_id"] == edit_rev.id

    res = await client.get(f"/api/v1/papers/{paper_id}/ai-disclosure", headers=owner)
    assert res.status_code == 200
    body = res.json()

    assert body["has_ai_usage"] is True
    totals = body["totals"]
    assert (totals["interactions"], totals["proposed"], totals["accepted"], totals["rejected"]) == (3, 2, 1, 1)
    assert totals["pending"] == 0
    assert body["attribution"] == {"linked": 2, "inferred": 0, "unattributed": 0}

    by_task = {row["task"]: row for row in body["by_task"]}
    assert list(by_task) == ["style", "edit", "citation"]
    assert (by_task["style"]["interactions"], by_task["style"]["accepted"]) == (1, 1)
    assert (by_task["edit"]["interactions"], by_task["edit"]["rejected"]) == (1, 1)
    assert (by_task["citation"]["interactions"], by_task["citation"]["proposed"]) == (1, 0)

    assert {(m["provider"], m["model"]) for m in body["models"]} == {("zai", "glm-4.7-flash"), ("google", None)}
    assert body["period"]["first_interaction_at"] is not None
    assert body["period"]["last_interaction_at"] is not None

    en = body["statement"]["en"]
    assert "glm-4.7-flash via Z.AI GLM and Google Gemini" in en
    assert "Arionear proposed 2 text revisions" in en
    assert "1 accepted and 1 rejected." in en
    assert "logical consistency" not in en
    assert body["statement"]["vi"].startswith("Trong quá trình chuẩn bị công trình này")
    assert "\\section*{Declaration of generative AI" in body["latex"]["en"]
    assert "\\section*{Tuyên bố" in body["latex"]["vi"]
