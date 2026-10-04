import re

import pytest

from src.config import Settings, get_settings
from src.cors_config import build_cors_middleware_kwargs, resolve_cors_origins


def test_resolve_cors_origins_merges_frontend_and_backend():
    settings = Settings(
        cors_origins="http://localhost:8080",
        frontend_base_url="https://app.arionear.id.vn",
        backend_base_url="https://api.arionear.id.vn",
    )
    origins = resolve_cors_origins(settings)
    assert "http://localhost:8080" in origins
    assert "https://app.arionear.id.vn" in origins
    assert "https://api.arionear.id.vn" in origins


def test_production_allows_arionear_subdomains():
    settings = Settings(
        app_env="production",
        cors_origins="http://localhost:8080",
        frontend_base_url="https://app.arionear.id.vn",
    )
    kwargs = build_cors_middleware_kwargs(settings)
    pattern = re.compile(kwargs["allow_origin_regex"])
    assert pattern.fullmatch("https://app.arionear.id.vn")
    assert pattern.fullmatch("https://api.arionear.id.vn")
    assert pattern.fullmatch("https://arionear.id.vn")
    assert not pattern.fullmatch("https://evil-arionear.id.vn.evil.com")


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
