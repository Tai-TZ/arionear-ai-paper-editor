"""Integration tests for admin → env key failover chain."""

from __future__ import annotations

import os

import pytest
from langchain_core.messages import HumanMessage

from src.config import get_settings
from src.db.engine import get_db, init_db, reset_db_state
from src.services.llm_failover import FailoverChatModel
from src.services.provider_key_store import (
    get_provider_api_keys,
    invalidate_provider_key_cache,
    refresh_provider_key_cache,
    upsert_provider_key,
)


@pytest.fixture
def failover_db(monkeypatch):
    db_path = os.path.join(os.path.dirname(__file__), "_test_llm_failover.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DIRECT_DATABASE_URL", url)
    monkeypatch.setenv("AUTH_SECRET_KEY", "test-secret-key-for-jwt-signing-32chars")
    monkeypatch.setenv("OPENROUTER_API_KEY", "env-openrouter-fallback-key-99")
    get_settings.cache_clear()
    reset_db_state()
    invalidate_provider_key_cache()
    init_db()
    yield
    reset_db_state()
    invalidate_provider_key_cache()
    get_settings.cache_clear()
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass


@pytest.mark.asyncio
async def test_failover_tries_env_after_admin_auth_error(failover_db):
    with get_db() as db:
        upsert_provider_key(
            db,
            provider="openrouter",
            api_key="admin-bad-openrouter-key-xx",
            priority=0,
            updated_by=None,
        )
        refresh_provider_key_cache(db)

    keys = get_provider_api_keys("openrouter")
    assert keys == ["admin-bad-openrouter-key-xx", "env-openrouter-fallback-key-99"]

    attempts: list[str] = []

    def build_llm(api_key: str):
        attempts.append(api_key)

        class FakeLLM:
            async def _agenerate(self, *args, **kwargs):
                if api_key.startswith("admin-bad"):
                    raise ValueError("Error 401: Invalid API key")
                from langchain_core.outputs import ChatGeneration, ChatResult

                return ChatResult(generations=[ChatGeneration(message=HumanMessage(content="OK"))])

        return FakeLLM()

    model = FailoverChatModel(
        provider="openrouter",
        model_name="test-model",
        temperature=0.0,
        build_llm=build_llm,
    )
    result = await model._agenerate([HumanMessage(content="hi")])
    assert attempts == ["admin-bad-openrouter-key-xx", "env-openrouter-fallback-key-99"]
    assert result.generations[0].message.content == "OK"
