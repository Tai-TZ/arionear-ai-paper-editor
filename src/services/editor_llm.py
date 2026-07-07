"""Fixed auxiliary LLM routing for editor internals (intent, edit planner).

Uses a small/fast model with a stable provider chain — independent of the
user's chat provider/model selection for more reliable routing and lower latency.
"""

from __future__ import annotations

from src.config import LLMProvider, get_settings
from src.services.provider_key_store import provider_has_api_key


def resolve_editor_aux_llm() -> tuple[LLMProvider, str | None]:
    """Pick provider/model for intent router and edit planner."""
    settings = get_settings()

    if provider_has_api_key("google"):
        return "google", settings.google_default_model
    if provider_has_api_key("openrouter"):
        return "openrouter", settings.openrouter_logic_audit_quick_model
    if provider_has_api_key("zai"):
        return "zai", settings.zai_default_model

    return settings.llm_provider, None
