from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI

from src.config import LLMProvider, Settings, get_settings, normalize_llm_provider

if TYPE_CHECKING:
    pass

# OpenRouter — NVIDIA Nemotron 3 Ultra (free tier).
OPENROUTER_NEMOTRON_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"
REASONING_MODEL_TEMPERATURE = 1.0


def _resolve_model(settings: Settings, provider: LLMProvider, model: str | None) -> str:
    if model:
        return model
    defaults = {
        "openai": settings.openai_default_model,
        "anthropic": settings.anthropic_default_model,
        "openrouter": settings.openrouter_default_model,
        "zai": settings.zai_default_model,
    }
    return defaults.get(provider, settings.model_name)


def _resolve_api_key(settings: Settings, provider: LLMProvider) -> str:
    keys = {
        "openai": settings.openai_api_key,
        "anthropic": settings.anthropic_api_key,
        "openrouter": settings.openrouter_api_key,
        "zai": settings.zai_api_key,
    }
    key = keys.get(provider, "")
    if not key:
        raise ValueError(
            f"No API key configured for provider '{provider}'. "
            f"Set {provider.upper()}_API_KEY in .env"
        )
    return key


def is_reasoning_model(model: str | None) -> bool:
    if not model:
        return False
    lowered = model.lower()
    return "nemotron" in lowered or "deepseek-r1" in lowered


def resolve_heavy_edit_model(
    model: str | None,
    *,
    text_chars: int,
    apply_mode: str = "selection",
) -> str:
    """Reasoning models (Nemotron) time out on full-manuscript edits — use a fast model."""
    settings = get_settings()
    effective = model or settings.openrouter_default_model
    if apply_mode == "document" and text_chars > 6000 and is_reasoning_model(effective):
        return settings.openrouter_logic_audit_quick_model
    return effective


def extract_llm_text(response: object) -> str:
    """Merge visible content and reasoning_content (reasoning / thinking models)."""
    content = str(getattr(response, "content", None) or "").strip()
    if content:
        return content
    extra = getattr(response, "additional_kwargs", None) or {}
    if isinstance(extra, dict):
        reasoning = extra.get("reasoning_content")
        if isinstance(reasoning, str) and reasoning.strip():
            return reasoning.strip()
    return ""


def extract_llm_stream_deltas(chunk: object) -> tuple[str, str]:
    """Return (content_delta, reasoning_delta) from a streaming chunk."""
    content_delta = ""
    reasoning_delta = ""
    raw_content = getattr(chunk, "content", None)
    if isinstance(raw_content, str):
        content_delta = raw_content
    elif isinstance(raw_content, list):
        for part in raw_content:
            if isinstance(part, str):
                content_delta += part
            elif isinstance(part, dict):
                text = part.get("text")
                if isinstance(text, str):
                    content_delta += text
    extra = getattr(chunk, "additional_kwargs", None) or {}
    if isinstance(extra, dict):
        reasoning = extra.get("reasoning_content")
        if isinstance(reasoning, str):
            reasoning_delta = reasoning
    return content_delta, reasoning_delta


def get_llm(
    provider: LLMProvider | None = None,
    model: str | None = None,
    temperature: float | None = None,
    thinking: bool | None = None,
) -> BaseChatModel:
    """Return a chat model for OpenAI, Anthropic, OpenRouter, or Z.AI (GLM)."""
    settings = get_settings()
    provider = normalize_llm_provider(provider or settings.llm_provider) or settings.llm_provider
    model_name = _resolve_model(settings, provider, model)
    if temperature is not None:
        temp = temperature
    elif is_reasoning_model(model_name):
        temp = REASONING_MODEL_TEMPERATURE
    else:
        temp = settings.llm_temperature

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


# Curated top-10 for academic LaTeX editing: free-first, plus cheap paid for quality.
OPENROUTER_MODEL_CATALOG: list[tuple[str, str]] = [
    (OPENROUTER_NEMOTRON_MODEL, "Nemotron 3 Ultra · reasoning (free)"),
    ("deepseek/deepseek-r1:free", "DeepSeek R1 · reasoning (free)"),
    ("meta-llama/llama-3.3-70b-instruct:free", "Llama 3.3 70B · balanced (free)"),
    ("google/gemma-2-9b-it:free", "Gemma 2 9B · writing (free)"),
    ("meta-llama/llama-3.2-3b-instruct:free", "Llama 3.2 3B · fast drafts (free)"),
    ("openai/gpt-4o-mini", "GPT-4o Mini · fast & reliable"),
    ("google/gemini-2.5-flash-preview", "Gemini 2.5 Flash · fast"),
    ("anthropic/claude-3.5-haiku", "Claude 3.5 Haiku · precise"),
    ("qwen/qwen-2.5-72b-instruct", "Qwen 2.5 72B · academic"),
    ("deepseek/deepseek-chat-v3-0324", "DeepSeek V3 · quality"),
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


def list_provider_catalog() -> list[dict]:
    """Full provider + model catalog for admin (all providers, regardless of API keys)."""
    settings = get_settings()
    specs: list[tuple[str, str, str, list[tuple[str, str]], bool]] = [
        (
            "openai",
            "OpenAI",
            settings.openai_default_model,
            OPENAI_MODEL_CATALOG,
            bool(settings.openai_api_key.strip()),
        ),
        (
            "anthropic",
            "Anthropic (Claude)",
            settings.anthropic_default_model,
            ANTHROPIC_MODEL_CATALOG,
            bool(settings.anthropic_api_key.strip()),
        ),
        (
            "openrouter",
            "OpenRouter",
            settings.openrouter_default_model,
            OPENROUTER_MODEL_CATALOG,
            bool(settings.openrouter_api_key.strip()),
        ),
        (
            "zai",
            "Z.AI (GLM)",
            settings.zai_default_model,
            ZAI_MODEL_CATALOG,
            bool(settings.zai_api_key.strip()),
        ),
    ]
    return [
        {
            "id": provider_id,
            "name": name,
            "default_model": default_model,
            "configured": configured,
            "models": _model_options(catalog, default_model),
        }
        for provider_id, name, default_model, catalog, configured in specs
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

    return providers
