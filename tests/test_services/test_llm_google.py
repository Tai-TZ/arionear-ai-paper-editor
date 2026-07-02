import pytest

from src.config import get_settings
from src.services.llm import list_provider_catalog, list_providers


@pytest.fixture
def google_llm_env(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "test-google-key")
    monkeypatch.setenv("GOOGLE_DEFAULT_MODEL", "gemini-2.5-flash")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_list_providers_includes_google_when_key_set(google_llm_env):
    providers = list_providers()
    google = next((p for p in providers if p["id"] == "google"), None)
    assert google is not None
    assert google["default_model"] == "gemini-2.5-flash"
    model_ids = {m["id"] for m in google["models"]}
    assert "gemini-2.5-flash" in model_ids
    assert "gemini-2.5-flash-lite" in model_ids
    assert "gemini-3.1-flash-lite" in model_ids
    assert "gemini-3.5-flash" in model_ids
    assert "gemini-2.5-pro" in model_ids


def test_provider_catalog_always_lists_google(google_llm_env):
    catalog = list_provider_catalog()
    google = next((p for p in catalog if p["id"] == "google"), None)
    assert google is not None
    assert google["configured"] is True
    assert google["name"] == "Google (Gemini)"
