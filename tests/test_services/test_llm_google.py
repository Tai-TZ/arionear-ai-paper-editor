import pytest

from src.config import get_settings
from src.services.llm import GOOGLE_CHAT_MODEL_CATALOG, list_provider_catalog, list_providers


@pytest.fixture
def google_llm_env(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "test-google-key")
    monkeypatch.setenv("GOOGLE_DEFAULT_MODEL", "gemini-3.1-flash-lite")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_google_chat_catalog_excludes_audit_reserved_models():
    model_ids = {model_id for model_id, _ in GOOGLE_CHAT_MODEL_CATALOG}
    assert model_ids == {
        "gemini-2.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3-flash-preview",
    }
    assert "gemini-2.5-flash" not in model_ids
    assert "gemini-3.5-flash" not in model_ids


def test_list_providers_includes_google_when_key_set(google_llm_env):
    providers = list_providers()
    google = next((p for p in providers if p["id"] == "google"), None)
    assert google is not None
    assert google["default_model"] == "gemini-3.1-flash-lite"
    model_ids = {m["id"] for m in google["models"]}
    assert model_ids == {
        "gemini-2.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3-flash-preview",
    }


def test_provider_catalog_always_lists_google(google_llm_env):
    catalog = list_provider_catalog()
    google = next((p for p in catalog if p["id"] == "google"), None)
    assert google is not None
    assert google["configured"] is True
    assert google["name"] == "Google (Gemini)"


def test_get_llm_google_json_output(google_llm_env, monkeypatch):
    captured: dict = {}

    class FakeGoogleLLM:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr("langchain_google_genai.ChatGoogleGenerativeAI", FakeGoogleLLM)
    from src.services.llm import get_llm

    get_llm(provider="google", json_output=True)
    assert captured.get("response_mime_type") == "application/json"
