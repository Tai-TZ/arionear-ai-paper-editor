from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI

from src.config import LLMProvider, Settings, get_settings

if TYPE_CHECKING:
    pass


def _resolve_model(settings: Settings, provider: LLMProvider, model: str | None) -> str:
    if model:
        return model
    defaults = {
        "openai": settings.openai_default_model,
        "anthropic": settings.anthropic_default_model,
        "openrouter": settings.openrouter_default_model,
    }
    return defaults.get(provider, settings.model_name)


def _resolve_api_key(settings: Settings, provider: LLMProvider) -> str:
    keys = {
        "openai": settings.openai_api_key,
        "anthropic": settings.anthropic_api_key,
        "openrouter": settings.openrouter_api_key,
    }
    key = keys.get(provider, "")
    if not key:
        raise ValueError(
            f"No API key configured for provider '{provider}'. "
            f"Set {provider.upper()}_API_KEY in .env"
        )
    return key


def get_llm(
    provider: LLMProvider | None = None,
    model: str | None = None,
    temperature: float | None = None,
) -> BaseChatModel:
    """Return a chat model for OpenAI, Anthropic (direct), or OpenRouter."""
    settings = get_settings()
    provider = provider or settings.llm_provider
    model_name = _resolve_model(settings, provider, model)
    temp = temperature if temperature is not None else settings.llm_temperature

    if provider == "openai":
        return ChatOpenAI(
            model=model_name,
            api_key=_resolve_api_key(settings, "openai"),
            base_url=settings.openai_base_url,
            temperature=temp,
        )

    if provider == "anthropic":
        try:
            from langchain_anthropic import ChatAnthropic

            return ChatAnthropic(
                model=model_name,
                api_key=_resolve_api_key(settings, "anthropic"),
                temperature=temp,
            )
        except ImportError:
            return ChatOpenAI(
                model=model_name,
                api_key=_resolve_api_key(settings, "anthropic"),
                base_url=f"{settings.anthropic_base_url.rstrip('/')}/v1",
                temperature=temp,
            )

    if provider == "openrouter":
        default_headers: dict[str, str] = {}
        if settings.openrouter_site_url:
            default_headers["HTTP-Referer"] = settings.openrouter_site_url
        if settings.openrouter_app_name:
            default_headers["X-Title"] = settings.openrouter_app_name

        return ChatOpenAI(
            model=model_name,
            api_key=_resolve_api_key(settings, "openrouter"),
            base_url=settings.openrouter_base_url,
            temperature=temp,
            default_headers=default_headers or None,
        )

    raise ValueError(f"Unsupported LLM provider: {provider}")


def _dedupe_models(models: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for model in models:
        if model in seen:
            continue
        seen.add(model)
        unique.append(model)
    return unique


def list_providers() -> list[dict]:
    """Return configured providers for the frontend selector."""
    settings = get_settings()
    providers: list[dict] = []

    if settings.openai_api_key:
        providers.append(
            {
                "id": "openai",
                "name": "OpenAI",
                "default_model": settings.openai_default_model,
                "models": _dedupe_models(
                    [
                        settings.openai_default_model,
                        "gpt-4o",
                        "gpt-4o-mini",
                    ]
                ),
            }
        )

    if settings.anthropic_api_key:
        providers.append(
            {
                "id": "anthropic",
                "name": "Anthropic (Claude)",
                "default_model": settings.anthropic_default_model,
                "models": _dedupe_models(
                    [
                        settings.anthropic_default_model,
                        "claude-sonnet-4-20250514",
                        "claude-3-5-haiku-20241022",
                    ]
                ),
            }
        )

    if settings.openrouter_api_key:
        providers.append(
            {
                "id": "openrouter",
                "name": "OpenRouter",
                "default_model": settings.openrouter_default_model,
                "models": _dedupe_models(
                    [
                        settings.openrouter_default_model,
                        "openai/gpt-4o-mini",
                        "anthropic/claude-sonnet-4",
                        "openai/gpt-4o",
                        "google/gemini-2.5-flash-preview",
                        "meta-llama/llama-3.3-70b-instruct",
                    ]
                ),
            }
        )

    return providers
