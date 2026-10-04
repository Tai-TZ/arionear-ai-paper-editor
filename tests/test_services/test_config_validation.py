"""Startup guard: production must not run with a weak JWT signing secret."""

from __future__ import annotations

import pytest

from src.config import DEFAULT_AUTH_SECRET_KEY, Settings, get_settings, validate_production_settings

STRONG_SECRET = "a" * 64


def _settings(**overrides) -> Settings:
    return Settings(_env_file=None, **overrides)


@pytest.mark.parametrize("app_env", ["development", "test"])
def test_dev_and_test_accept_default_secret(app_env):
    validate_production_settings(_settings(app_env=app_env, auth_secret_key=DEFAULT_AUTH_SECRET_KEY))
    validate_production_settings(_settings(app_env=app_env, auth_secret_key="short"))


def test_production_rejects_default_secret():
    with pytest.raises(RuntimeError, match="AUTH_SECRET_KEY"):
        validate_production_settings(_settings(app_env="production", auth_secret_key=DEFAULT_AUTH_SECRET_KEY))


@pytest.mark.parametrize("secret", ["", "short", "x" * 31])
def test_production_rejects_short_secret(secret):
    with pytest.raises(RuntimeError, match="at least 32"):
        validate_production_settings(_settings(app_env="production", auth_secret_key=secret))


def test_production_accepts_strong_secret():
    validate_production_settings(_settings(app_env="production", auth_secret_key="x" * 32))
    validate_production_settings(_settings(app_env="production", auth_secret_key=STRONG_SECRET))


@pytest.fixture
def production_env(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AUTH_SECRET_KEY", DEFAULT_AUTH_SECRET_KEY)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_lifespan_refuses_to_start_in_production_with_default_secret(production_env):
    from src.main import app, lifespan

    with pytest.raises(RuntimeError, match="AUTH_SECRET_KEY"):
        async with lifespan(app):
            pass
