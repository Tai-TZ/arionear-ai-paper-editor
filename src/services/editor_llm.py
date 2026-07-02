"""Fixed auxiliary LLM routing for editor internals (intent, edit planner).

Uses a small/fast model with a stable provider chain — independent of the
user's chat provider/model selection for more reliable routing and lower latency.
"""

from __future__ import annotations

from src.config import LLMProvider, get_settings


def resolve_editor_aux_llm() -> tuple[LLMProvider, str | None]:
    """Pick provider/model for intent router and edit planner."""
    settings = get_settings()

    if settings.zai_api_key.strip():
        return "zai", settings.zai_default_model
    if settings.google_api_key.strip():
        return "google", settings.google_default_model
    if settings.openai_api_key.strip():
        return "openai", settings.openai_default_model
    if settings.anthropic_api_key.strip():
        return "anthropic", settings.anthropic_default_model
    if settings.openrouter_api_key.strip():
        return "openrouter", settings.openrouter_logic_audit_quick_model

    return settings.llm_provider, None
