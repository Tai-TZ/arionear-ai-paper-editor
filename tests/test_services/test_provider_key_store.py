import os

import pytest

from src.config import get_settings
from src.db.engine import get_db, init_db, reset_db_state
from src.services.llm_auth_errors import is_provider_key_error
from src.services.provider_key_store import (
    get_provider_api_keys,
    invalidate_provider_key_cache,
    provider_has_api_key,
    refresh_provider_key_cache,
    upsert_provider_key,
)
from src.services.secret_crypto import decrypt_secret, encrypt_secret, key_hint


@pytest.fixture
def key_store_db(monkeypatch):
    db_path = os.path.join(os.path.dirname(__file__), "_test_provider_keys.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DIRECT_DATABASE_URL", url)
    monkeypatch.setenv("AUTH_SECRET_KEY", "test-secret-key-for-jwt-signing-32chars")
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


def test_secret_crypto_roundtrip():
    plain = "sk-or-v1-test-key-12345678"
    ciphertext = encrypt_secret(plain)
    assert decrypt_secret(ciphertext) == plain
    assert key_hint(plain).startswith("sk-o")


def test_is_provider_key_error_detects_auth_and_quota():
    assert is_provider_key_error("Error 401: Invalid API key")
    assert is_provider_key_error("402 Payment Required — insufficient balance")
    assert is_provider_key_error("quota exceeded for model")
    assert not is_provider_key_error("timeout connecting to upstream")


def test_upsert_and_failover_order(key_store_db, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "env-openrouter-backup-key-99")
    get_settings.cache_clear()

    with get_db() as db:
        upsert_provider_key(
            db,
            provider="openrouter",
            api_key="admin-primary-openrouter-key",
            priority=0,
            label="primary",
            updated_by=None,
        )
        upsert_provider_key(
            db,
            provider="openrouter",
            api_key="admin-backup-openrouter-key",
            priority=1,
            label="backup",
            updated_by=None,
        )
        refresh_provider_key_cache(db)

    keys = get_provider_api_keys("openrouter")
    assert keys == [
        "admin-primary-openrouter-key",
        "admin-backup-openrouter-key",
        "env-openrouter-backup-key-99",
    ]
    assert provider_has_api_key("openrouter")


def test_env_fallback_only_when_no_admin_keys(key_store_db, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "env-openrouter-backup-key-99")
    get_settings.cache_clear()
    invalidate_provider_key_cache()
    keys = get_provider_api_keys("openrouter")
    assert keys == ["env-openrouter-backup-key-99"]


def test_admin_keys_append_env_fallback(key_store_db, monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "env-google-fallback-key-12345")
    get_settings.cache_clear()

    with get_db() as db:
        upsert_provider_key(
            db,
            provider="google",
            api_key="admin-google-primary-key-1",
            priority=0,
            updated_by=None,
        )
        refresh_provider_key_cache(db)

    assert get_provider_api_keys("google") == [
        "admin-google-primary-key-1",
        "env-google-fallback-key-12345",
    ]


def test_env_not_duplicated_when_same_as_admin(key_store_db, monkeypatch):
    shared = "shared-openrouter-key-12345678"
    monkeypatch.setenv("OPENROUTER_API_KEY", shared)
    get_settings.cache_clear()

    with get_db() as db:
        upsert_provider_key(
            db,
            provider="openrouter",
            api_key=shared,
            priority=0,
            updated_by=None,
        )
        refresh_provider_key_cache(db)

    assert get_provider_api_keys("openrouter") == [shared]


def test_provider_has_api_key_env_only(key_store_db, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-openai-env-key-12345678")
    get_settings.cache_clear()
    invalidate_provider_key_cache()
    assert provider_has_api_key("openai")
    assert get_provider_api_keys("openai") == ["sk-openai-env-key-12345678"]
