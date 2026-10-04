"""POST /api/v1/review/respond — peer-review response drafts (comment-only, never edits the paper)."""

import json
import os
import uuid

import pytest

from src.config import get_settings
from src.db.engine import init_db, reset_db_state
from src.services.quota_policy import QuotaExceededError, reset_rate_limit_state
from tests.peer_review_helpers import FakeReviewLLM, install_fake_llm, split_reply
from tests.test_api.auth_helpers import register_user_via_verification

COMMENTS = """Reviewer 1
1. Please justify the sample size of the user study.
2. Typo in the abstract: "acheive".
"""

LATEX = "\\documentclass{article}\\begin{document}\\section{Methods}We sampled 12 participants.\\end{document}"

SPLIT = split_reply(
    [
        {
            "reviewer": "R1",
            "quote": "Please justify the sample size of the user study.",
            "category": "major",
            "summary": "Justify sample size.",
        },
        {"reviewer": "R1", "quote": 'Typo in the abstract: "acheive".', "category": "editorial", "summary": "Typo."},
    ]
)


@pytest.fixture
def review_db(monkeypatch):
    db_path = os.path.join(os.path.dirname(__file__), "_test_review.db")
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
    reset_rate_limit_state()
    init_db()
    yield
    reset_db_state()
    reset_rate_limit_state()
    get_settings.cache_clear()
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass


@pytest.mark.asyncio
async def test_review_respond_returns_drafts_without_touching_manuscript(client, monkeypatch):
    llm = install_fake_llm(monkeypatch, FakeReviewLLM(split_replies=[SPLIT]))
    session_id = str(uuid.uuid4())
    created = await client.post(
        "/api/v1/sessions",
        json={"id": session_id, "name": "Review Test", "latex_content": LATEX},
    )
    assert created.status_code == 200

    res = await client.post(
        "/api/v1/review/respond",
        json={
            "comments": COMMENTS,
            "latex_content": LATEX,
            "session_id": session_id,
            "locale": "vi",
            "tone": "formal",
        },
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert [item["id"] for item in body["items"]] == ["R1.1", "R1.2"]
    assert [item["category"] for item in body["items"]] == ["major", "editorial"]
    assert body["reviewers"] == ["R1"]
    assert body["letter_language"] == "en"
    assert all(item["response"] and item["proposed_change"] for item in body["items"])
    assert "Formal and neutral" in str(llm.draft_calls[0][0].content)

    # Human Gate: drafting never changes the stored manuscript and creates no pending revision.
    session = await client.get(f"/api/v1/sessions/{session_id}")
    assert session.json()["latex_content"] == LATEX
    revisions = await client.get(f"/api/v1/sessions/{session_id}/revisions")
    assert revisions.json()["revisions"] == []


@pytest.mark.asyncio
async def test_review_respond_validation(client):
    empty = await client.post("/api/v1/review/respond", json={"comments": "   "})
    assert empty.status_code == 422
    too_long = await client.post("/api/v1/review/respond", json={"comments": "x" * 100_001})
    assert too_long.status_code == 422
    bad_tone = await client.post("/api/v1/review/respond", json={"comments": "Fine.", "tone": "rude"})
    assert bad_tone.status_code == 422


@pytest.mark.asyncio
async def test_review_respond_maps_provider_errors(client, monkeypatch):
    def _no_key(**_kwargs):
        raise ValueError("No API key configured for provider 'zai'.")

    monkeypatch.setattr("src.services.peer_review.pipeline.get_llm", _no_key)

    res = await client.post("/api/v1/review/respond", json={"comments": COMMENTS})

    assert res.status_code == 502
    detail = res.json()["detail"]
    assert detail["code"] == "llm_error"
    assert "API key" in detail["message"]


@pytest.mark.asyncio
async def test_review_respond_maps_parse_failure(client, monkeypatch):
    install_fake_llm(monkeypatch, FakeReviewLLM(split_replies=[SPLIT], draft_replies=["bad", "worse"]))

    res = await client.post("/api/v1/review/respond", json={"comments": COMMENTS})

    assert res.status_code == 502
    assert res.json()["detail"]["code"] == "parse_failed"


@pytest.mark.asyncio
async def test_review_respond_quota_exceeded(client, monkeypatch):
    def _quota(_user_id, _session_id):
        raise QuotaExceededError("Bạn đã dùng hết hạn mức token hôm nay.")

    monkeypatch.setattr("src.services.peer_review.service.enforce_peer_review_quota", _quota)
    llm = install_fake_llm(monkeypatch, FakeReviewLLM(split_replies=[SPLIT]))

    res = await client.post("/api/v1/review/respond", json={"comments": COMMENTS})

    assert res.status_code == 429
    assert res.json()["detail"]["code"] == "quota_exceeded"
    assert llm.calls == []


@pytest.mark.asyncio
async def test_review_respond_requires_auth_when_db_enabled(client, review_db, monkeypatch):
    install_fake_llm(monkeypatch, FakeReviewLLM(split_replies=[SPLIT]))

    anonymous = await client.post("/api/v1/review/respond", json={"comments": COMMENTS})
    assert anonymous.status_code == 401

    body = await register_user_via_verification(
        client, name="Reviewer User", email="review-user@uni.edu", password="SecurePass1"
    )
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    paper = await client.post("/api/v1/papers", headers=headers, json={"name": "Paper", "latex": LATEX})
    assert paper.status_code == 201
    paper_id = paper.json()["id"]

    ok = await client.post(
        "/api/v1/review/respond",
        headers=headers,
        json={"comments": COMMENTS, "latex_content": LATEX, "session_id": paper_id},
    )
    assert ok.status_code == 200, ok.text
    assert len(ok.json()["items"]) == 2

    other = await register_user_via_verification(
        client, name="Other User", email="other-user@uni.edu", password="SecurePass1"
    )
    foreign = await client.post(
        "/api/v1/review/respond",
        headers={"Authorization": f"Bearer {other['access_token']}"},
        json={"comments": COMMENTS, "session_id": paper_id},
    )
    assert foreign.status_code == 404


@pytest.mark.asyncio
async def test_review_respond_records_usage(client, review_db, monkeypatch):
    install_fake_llm(monkeypatch, FakeReviewLLM(split_replies=[SPLIT]))
    body = await register_user_via_verification(
        client, name="Usage User", email="usage-user@uni.edu", password="SecurePass1"
    )
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    paper = await client.post("/api/v1/papers", headers=headers, json={"name": "Paper", "latex": LATEX})
    paper_id = paper.json()["id"]

    res = await client.post(
        "/api/v1/review/respond",
        headers=headers,
        json={"comments": COMMENTS, "latex_content": LATEX, "session_id": paper_id},
    )
    assert res.status_code == 200

    from src.db.engine import get_db
    from src.db.models import AiSession

    with get_db() as db:
        sessions = db.query(AiSession).filter(AiSession.paper_id == uuid.UUID(paper_id)).all()
        tracked = [s for s in sessions if (s.tokens_used or 0) > 0]
        assert len(tracked) == 1
        assert "R1.1" in (tracked[0].ai_output or "")
        assert json.loads(json.dumps(tracked[0].metadata_ or {})).get("llm_model")
