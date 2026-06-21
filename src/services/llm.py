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
        "zai": settings.zai_default_model,
        "nvidia": settings.nvidia_default_model,
    }
    return defaults.get(provider, settings.model_name)


def _resolve_api_key(settings: Settings, provider: LLMProvider) -> str:
    keys = {
        "openai": settings.openai_api_key,
        "anthropic": settings.anthropic_api_key,
        "openrouter": settings.openrouter_api_key,
        "zai": settings.zai_api_key,
        "nvidia": settings.nvidia_api_key,
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
    thinking: bool | None = None,
) -> BaseChatModel:
    """Return a chat model for OpenAI, Anthropic, OpenRouter, or Z.AI (GLM)."""
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

    if provider == "zai":
        use_thinking = thinking if thinking is not None else False
        return ChatOpenAI(
            model=model_name,
            api_key=_resolve_api_key(settings, "zai"),
            base_url=settings.zai_base_url,
            temperature=temp,
            extra_body={"thinking": {"type": "enabled" if use_thinking else "disabled"}},
        )

    if provider == "nvidia":
        try:
            from langchain_nvidia_ai_endpoints import ChatNVIDIA
        except ImportError as exc:
            raise ValueError(
                "NVIDIA provider requires langchain-nvidia-ai-endpoints. "
                "Install with: pip install langchain-nvidia-ai-endpoints"
            ) from exc
        return ChatNVIDIA(
            model=model_name,
            api_key=_resolve_api_key(settings, "nvidia"),
            temperature=temp,
            top_p=0.95,
            max_completion_tokens=8192,
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


OPENROUTER_MODEL_CATALOG: list[tuple[str, str]] = [
    ("openai/gpt-4o-mini", "GPT-4o Mini · fast & cheap"),
    ("google/gemini-2.5-flash-preview", "Gemini 2.5 Flash · fast"),
    ("anthropic/claude-3.5-haiku", "Claude 3.5 Haiku · fast"),
    ("meta-llama/llama-3.3-70b-instruct", "Llama 3.3 70B · quality"),
    ("qwen/qwen-2.5-72b-instruct", "Qwen 2.5 72B · academic"),
    ("meta-llama/llama-3.2-3b-instruct:free", "Llama 3.2 3B · free"),
    ("google/gemma-2-9b-it:free", "Gemma 2 9B · free"),
]

OPENAI_MODEL_CATALOG: list[tuple[str, str]] = [
    ("gpt-4o-mini", "GPT-4o Mini"),
    ("gpt-4o", "GPT-4o"),
]

ANTHROPIC_MODEL_CATALOG: list[tuple[str, str]] = [
    ("claude-3-5-haiku-20241022", "Claude 3.5 Haiku · fast"),
    ("claude-sonnet-4-20250514", "Claude Sonnet 4 · quality"),
]

ZAI_MODEL_CATALOG: list[tuple[str, str]] = [
    ("glm-4.7-flash", "GLM-4.7 Flash · free"),
    ("glm-4.7-flashx", "GLM-4.7 FlashX"),
    ("glm-4.7", "GLM-4.7 · quality"),
]

NVIDIA_MODEL_CATALOG: list[tuple[str, str]] = [
    ("minimaxai/minimax-m3", "MiniMax M3 · reasoning"),
]


def _model_options(
    catalog: list[tuple[str, str]],
    default_model: str,
) -> list[dict[str, str]]:
    """Build model dropdown entries; default model is always first."""
    ids = _dedupe_models([default_model, *[model_id for model_id, _ in catalog]])
    labels = {model_id: label for model_id, label in catalog}
    return [
        {
            "id": model_id,
            "label": labels.get(model_id, model_id.split("/")[-1]),
        }
        for model_id in ids
    ]


def list_providers() -> list[dict]:
    """Return configured providers for the frontend selector."""
    settings = get_settings()
    providers: list[dict] = []

    if settings.openai_api_key:
        default = settings.openai_default_model
        providers.append(
            {
                "id": "openai",
                "name": "OpenAI",
                "default_model": default,
                "models": _model_options(OPENAI_MODEL_CATALOG, default),
            }
        )

    if settings.anthropic_api_key:
        default = settings.anthropic_default_model
        providers.append(
            {
                "id": "anthropic",
                "name": "Anthropic (Claude)",
                "default_model": default,
                "models": _model_options(ANTHROPIC_MODEL_CATALOG, default),
            }
        )

    if settings.openrouter_api_key:
        default = settings.openrouter_default_model
        providers.append(
            {
                "id": "openrouter",
                "name": "OpenRouter",
                "default_model": default,
                "models": _model_options(OPENROUTER_MODEL_CATALOG, default),
            }
        )

    if settings.zai_api_key:
        default = settings.zai_default_model
        providers.append(
            {
                "id": "zai",
                "name": "Z.AI (GLM)",
                "default_model": default,
                "models": _model_options(ZAI_MODEL_CATALOG, default),
            }
        )

    if settings.nvidia_api_key:
        default = settings.nvidia_default_model
        providers.append(
            {
                "id": "nvidia",
                "name": "NVIDIA NIM (MiniMax)",
                "default_model": default,
                "models": _model_options(NVIDIA_MODEL_CATALOG, default),
            }
        )

    return providers
