import re

import pytest

from src.config import Settings, get_settings
from src.cors_config import build_cors_middleware_kwargs, resolve_cors_origins


def test_resolve_cors_origins_merges_frontend_and_backend():
    settings = Settings(
        cors_origins="http://localhost:8080",
        frontend_base_url="https://app.proofline.example",
        backend_base_url="https://api.proofline.example",
    )
    origins = resolve_cors_origins(settings)
    assert "http://localhost:8080" in origins
    assert "https://app.proofline.example" in origins
    assert "https://api.proofline.example" in origins


def test_production_allows_configured_origin_regex():
    settings = Settings(
        app_env="production",
        cors_origins="http://localhost:8080",
        frontend_base_url="https://app.proofline.example",
        cors_origin_regex=r"https://([a-zA-Z0-9-]+\.)*proofline\.example",
    )
    kwargs = build_cors_middleware_kwargs(settings)
    pattern = re.compile(kwargs["allow_origin_regex"])
    assert pattern.fullmatch("https://app.proofline.example")
    assert pattern.fullmatch("https://api.proofline.example")
    assert pattern.fullmatch("https://proofline.example")
    assert not pattern.fullmatch("https://evil-proofline.example.evil.com")


def test_production_without_origin_regex_only_allows_listed_origins():
    settings = Settings(app_env="production", frontend_base_url="https://app.proofline.example")
    kwargs = build_cors_middleware_kwargs(settings)
    assert "allow_origin_regex" not in kwargs
    assert "https://app.proofline.example" in kwargs["allow_origins"]


def test_development_allows_localhost_ports():
    settings = Settings(app_env="development", cors_origins="http://localhost:8080")
    kwargs = build_cors_middleware_kwargs(settings)
    pattern = re.compile(kwargs["allow_origin_regex"])
    assert pattern.fullmatch("http://localhost:5173")
    assert pattern.fullmatch("http://127.0.0.1:8081")


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
