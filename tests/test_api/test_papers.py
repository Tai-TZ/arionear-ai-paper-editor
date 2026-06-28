import os
import uuid

import pytest

from src.config import get_settings
from src.db.engine import init_db, reset_db_state
from tests.test_api.auth_helpers import register_user_via_verification


@pytest.fixture
def papers_db(monkeypatch):
    db_path = os.path.join(os.path.dirname(__file__), "_test_papers.db")
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
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass


async def _register(client, email: str, name: str = "Test User") -> str:
    body = await register_user_via_verification(
        client,
        name=name,
        email=email,
        password="SecurePass1",
    )
    return body["access_token"]


@pytest.mark.asyncio
async def test_papers_crud_isolated_per_user(client, papers_db):
    token_a = await _register(client, "user-a@uni.edu", "User A")
    token_b = await _register(client, "user-b@uni.edu", "User B")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    create = await client.post(
        "/api/v1/papers",
        headers=headers_a,
        json={"name": "My Paper", "latex": "\\documentclass{article}"},
    )
    assert create.status_code == 201
    paper_id = create.json()["id"]
    assert create.json()["name"] == "My Paper"

    listed_a = await client.get("/api/v1/papers", headers=headers_a)
    assert listed_a.status_code == 200
    assert len(listed_a.json()) == 1
    assert listed_a.json()[0]["id"] == paper_id

    listed_b = await client.get("/api/v1/papers", headers=headers_b)
    assert listed_b.status_code == 200
    assert listed_b.json() == []

    forbidden = await client.get(f"/api/v1/papers/{paper_id}", headers=headers_b)
    assert forbidden.status_code == 404

    updated = await client.patch(
        f"/api/v1/papers/{paper_id}",
        headers=headers_a,
        json={"name": "Renamed Paper", "latex": "\\documentclass{article}\\begin{document}\\end{document}"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed Paper"

    deleted = await client.delete(f"/api/v1/papers/{paper_id}", headers=headers_a)
    assert deleted.status_code == 204

    empty = await client.get("/api/v1/papers", headers=headers_a)
    assert empty.json() == []


@pytest.mark.asyncio
async def test_delete_paper_with_suggestions(client, papers_db):
    from src.db.engine import get_db
    from src.db.models import Suggestion, SuggestionStatus, SuggestionType, User
    from src.services.paper_service import get_paper

    token = await _register(client, "del-sugg@uni.edu", "Delete Sugg User")
    headers = {"Authorization": f"Bearer {token}"}

    create = await client.post(
        "/api/v1/papers",
        headers=headers,
        json={"name": "Paper with suggestions", "latex": "\\documentclass{article}"},
    )
    assert create.status_code == 201
    paper_id = create.json()["id"]

    with get_db() as db:
        user = db.query(User).filter(User.email == "del-sugg@uni.edu").one()
        paper = get_paper(db, user.id, uuid.UUID(paper_id))
        assert paper is not None
        ai_session = paper.ai_sessions[0]
        db.add(
            Suggestion(
                session_id=ai_session.id,
                suggestion_type=SuggestionType.STYLE,
                original_text="original",
                suggested_text="suggested",
                status=SuggestionStatus.PENDING,
            )
        )
        db.commit()

    deleted = await client.delete(f"/api/v1/papers/{paper_id}", headers=headers)
    assert deleted.status_code == 204

    empty = await client.get("/api/v1/papers", headers=headers)
    assert empty.json() == []


@pytest.mark.asyncio
async def test_papers_requires_auth(client, papers_db):
    res = await client.get("/api/v1/papers")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_share_token_survives_metadata_patch(client, papers_db):
    token = await _register(client, "share-meta@uni.edu", "Share Meta User")
    headers = {"Authorization": f"Bearer {token}"}

    create = await client.post(
        "/api/v1/papers",
        headers=headers,
        json={"name": "Shared Paper", "latex": "\\documentclass{article}"},
    )
    assert create.status_code == 201
    paper_id = create.json()["id"]

    share = await client.post(f"/api/v1/papers/{paper_id}/share", headers=headers)
    assert share.status_code == 200
    share_token = share.json()["token"]
    assert share_token

    patched = await client.patch(
        f"/api/v1/papers/{paper_id}",
        headers=headers,
        json={
            "latex": "\\documentclass{article}\\begin{document}Hello\\end{document}",
            "metadata": {"mainFile": "main.tex", "compiler": "pdflatex", "files": []},
        },
    )
    assert patched.status_code == 200

    status = await client.get(f"/api/v1/papers/{paper_id}/share", headers=headers)
    assert status.status_code == 200
    assert status.json()["enabled"] is True
    assert status.json()["token"] == share_token

    public = await client.get(f"/api/v1/share/{share_token}")
    assert public.status_code == 200
    assert public.json()["name"] == "Shared Paper"
