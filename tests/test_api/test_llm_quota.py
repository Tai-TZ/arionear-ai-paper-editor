"""LLM quota is enforced for every editor LLM entry point, with or without a session/paper id."""

from __future__ import annotations

import json
import os
import uuid

import pytest

from src.api import routes
from src.config import get_settings
from src.db.engine import get_db, init_db, reset_db_state
from src.db.models import User
from src.models.admin_schemas import LlmLimits
from src.services.llm_policy import set_llm_limits_on_profile
from src.services.quota_policy import QuotaExceededError, enforce_llm_quota_for_paper, reset_rate_limit_state
from tests.test_api.auth_helpers import register_user_via_verification


@pytest.fixture
def quota_db(monkeypatch):
    db_path = os.path.join(os.path.dirname(__file__), "_test_llm_quota.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DIRECT_DATABASE_URL", url)
    monkeypatch.setenv("AUTH_SECRET_KEY", "test-secret-key-for-jwt-signing-32chars")
    monkeypatch.setenv("APP_ENV", "test")
    for name in ("SMTP_HOST", "SMTP_FROM", "SMTP_USER", "SMTP_PASSWORD"):
        monkeypatch.setenv(name, "")
    get_settings.cache_clear()
    reset_db_state()
    init_db()
    reset_rate_limit_state()
    yield
    reset_rate_limit_state()
    reset_db_state()
    get_settings.cache_clear()
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass


@pytest.fixture
def no_llm(monkeypatch):
    """The agent must never be reached when quota blocks; when allowed it returns a canned result."""
    calls: list[dict] = []

    async def fake_ainvoke(payload):
        calls.append(payload)
        return {"response": "ok", "task": payload.get("task") or "chat", "suggestion": "s", "original_text": "t"}

    monkeypatch.setattr(routes.agent, "ainvoke", fake_ainvoke)
    return calls


async def _register(client, email: str) -> tuple[uuid.UUID, dict[str, str]]:
    body = await register_user_via_verification(client, name="Quota", email=email, password="SecurePass1")
    return uuid.UUID(body["user"]["id"]), {"Authorization": f"Bearer {body['access_token']}"}


def _set_limits(user_id: uuid.UUID, limits: LlmLimits) -> None:
    with get_db() as db:
        user = db.query(User).filter(User.id == user_id).one()
        user.profile_settings = set_llm_limits_on_profile(user.profile_settings, limits)


async def _create_paper(client, headers) -> str:
    res = await client.post("/api/v1/papers", headers=headers, json={"name": "P", "latex": "\\documentclass{article}"})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _sse_events(text: str) -> list[tuple[str, dict]]:
    events = []
    for block in text.split("\n\n"):
        name, data = "", ""
        for line in block.splitlines():
            if line.startswith("event:"):
                name = line[6:].strip()
            elif line.startswith("data:"):
                data += line[5:].strip()
        if name:
            events.append((name, json.loads(data) if data else {}))
    return events


# ─── quota_policy ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_enforce_falls_back_to_caller_without_paper(client, quota_db):
    user_id, _ = await _register(client, "fallback@uni.edu")
    _set_limits(user_id, LlmLimits(llm_enabled=False))

    with pytest.raises(QuotaExceededError):
        enforce_llm_quota_for_paper(None, user_id=user_id)
    with pytest.raises(QuotaExceededError):
        enforce_llm_quota_for_paper("not-a-uuid", user_id=user_id)


@pytest.mark.asyncio
async def test_enforce_prefers_paper_owner(client, quota_db):
    owner_id, owner_headers = await _register(client, "owner@uni.edu")
    caller_id, _ = await _register(client, "caller@uni.edu")
    paper_id = await _create_paper(client, owner_headers)
    _set_limits(owner_id, LlmLimits(llm_enabled=False))

    with pytest.raises(QuotaExceededError):
        enforce_llm_quota_for_paper(paper_id, user_id=caller_id)
    enforce_llm_quota_for_paper(None, user_id=caller_id)  # caller alone is within limits


def test_enforce_is_noop_without_owner_or_caller(quota_db):
    enforce_llm_quota_for_paper(None)
    enforce_llm_quota_for_paper(None, user_id=None)


# ─── routes ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_chat_without_session_is_blocked_when_over_limit(client, quota_db, no_llm):
    user_id, headers = await _register(client, "chat@uni.edu")
    _set_limits(user_id, LlmLimits(llm_enabled=False))

    res = await client.post("/api/v1/chat", headers=headers, json={"message": "Hello there"})

    assert res.status_code == 429
    assert no_llm == []


@pytest.mark.asyncio
async def test_chat_counts_exactly_one_request_against_rate_limit(client, quota_db, no_llm):
    user_id, headers = await _register(client, "rate@uni.edu")
    _set_limits(user_id, LlmLimits(rate_limit_per_min=1))

    first = await client.post("/api/v1/chat", headers=headers, json={"message": "Hello there"})
    second = await client.post("/api/v1/chat", headers=headers, json={"message": "Hello again"})

    assert first.status_code == 200, first.text
    assert second.status_code == 429
    assert len(no_llm) == 1


@pytest.mark.asyncio
async def test_edit_style_is_blocked_when_over_limit(client, quota_db, no_llm):
    user_id, headers = await _register(client, "style@uni.edu")
    paper_id = await _create_paper(client, headers)
    _set_limits(user_id, LlmLimits(llm_enabled=False))

    res = await client.post(
        "/api/v1/edit/style",
        headers=headers,
        json={"session_id": paper_id, "text": "Some sentence to polish."},
    )

    assert res.status_code == 429
    assert no_llm == []


@pytest.mark.asyncio
async def test_chat_stream_without_session_is_blocked_when_over_limit(client, quota_db, monkeypatch):
    user_id, headers = await _register(client, "stream@uni.edu")
    _set_limits(user_id, LlmLimits(llm_enabled=False))

    async def fail_classify(*_args, **_kwargs):
        raise AssertionError("the LLM pipeline must not run over quota")

    monkeypatch.setattr("src.services.chat_stream.classify_intent", fail_classify)

    res = await client.post("/api/v1/chat/stream", headers=headers, json={"message": "Hello there"})

    assert res.status_code == 200
    events = _sse_events(res.text)
    errors = [data for name, data in events if name == "error"]
    assert errors, events
    assert "chưa được bật quyền dùng AI" in errors[0]["message"]


@pytest.mark.asyncio
async def test_citation_relevance_passes_caller_to_quota(client, quota_db, monkeypatch):
    user_id, headers = await _register(client, "cite@uni.edu")
    paper_id = await _create_paper(client, headers)
    seen: list[tuple] = []

    async def fake_run(request, *, user_id=None):
        seen.append((request.session_id, user_id))
        raise QuotaExceededError("over")

    monkeypatch.setattr(routes, "run_citation_relevance", fake_run)

    res = await client.post("/api/v1/citations/relevance", headers=headers, json={"session_id": paper_id})

    assert res.status_code == 429
    assert seen == [(paper_id, user_id)]
