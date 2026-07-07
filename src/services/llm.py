from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI

from src.config import ENABLED_LLM_PROVIDERS, LLMProvider, Settings, get_settings, normalize_llm_provider
from src.services.llm_failover import FailoverChatModel
from src.services.provider_key_store import get_provider_api_keys, provider_has_api_key

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
        "google": settings.google_default_model,
    }
    return defaults.get(provider, settings.model_name)


def _resolve_api_key(settings: Settings, provider: LLMProvider) -> str:
    keys = get_provider_api_keys(provider)
    if keys:
        return keys[0]
    env_keys = {
        "openai": settings.openai_api_key,
        "anthropic": settings.anthropic_api_key,
        "openrouter": settings.openrouter_api_key,
        "zai": settings.zai_api_key,
        "google": settings.google_api_key,
    }
    key = (env_keys.get(provider) or "").strip()
    if not key:
        raise ValueError(
            f"No API key configured for provider '{provider}'. "
            f"Set {provider.upper()}_API_KEY in .env or add a key in Admin → LLM Keys."
        )
    return key


def _build_llm_with_key(
    provider: LLMProvider,
    api_key: str,
    model: str | None = None,
    temperature: float | None = None,
    thinking: bool | None = None,
    json_output: bool = False,
) -> BaseChatModel:
    """Build a concrete chat model for one API key (no failover wrapper)."""
    settings = get_settings()
    model_name = _resolve_model(settings, provider, model)
    if temperature is not None:
        temp = temperature
    elif is_reasoning_model(model_name):
        temp = REASONING_MODEL_TEMPERATURE
    else:
        temp = settings.llm_temperature

    request_timeout = settings.llm_request_timeout_sec

    if provider == "openai":
        openai_kwargs: dict = {}
        if json_output:
            openai_kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
        return ChatOpenAI(
            model=model_name,
            api_key=api_key,
            base_url=settings.openai_base_url,
            temperature=temp,
            timeout=request_timeout,
            **openai_kwargs,
        )

    if provider == "anthropic":
        try:
            from langchain_anthropic import ChatAnthropic

            return ChatAnthropic(
                model=model_name,
                api_key=api_key,
                temperature=temp,
                timeout=request_timeout,
            )
        except ImportError:
            return ChatOpenAI(
                model=model_name,
                api_key=api_key,
                base_url=f"{settings.anthropic_base_url.rstrip('/')}/v1",
                temperature=temp,
                timeout=request_timeout,
            )

    if provider == "openrouter":
        default_headers: dict[str, str] = {}
        if settings.openrouter_site_url:
            default_headers["HTTP-Referer"] = settings.openrouter_site_url
        if settings.openrouter_app_name:
            default_headers["X-Title"] = settings.openrouter_app_name

        openrouter_kwargs: dict = {}
        if json_output:
            openrouter_kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
        return ChatOpenAI(
            model=model_name,
            api_key=api_key,
            base_url=settings.openrouter_base_url,
            temperature=temp,
            default_headers=default_headers or None,
            timeout=request_timeout,
            **openrouter_kwargs,
        )

    if provider == "zai":
        use_thinking = thinking if thinking is not None else False
        return ChatOpenAI(
            model=model_name,
            api_key=api_key,
            base_url=settings.zai_base_url,
            temperature=temp,
            extra_body={"thinking": {"type": "enabled" if use_thinking else "disabled"}},
            timeout=request_timeout,
        )

    if provider == "google":
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except ImportError as exc:
            raise ImportError(
                "Google Gemini requires langchain-google-genai. "
                "Run: pip install langchain-google-genai (or pip install -r requirements.txt)"
            ) from exc

        return ChatGoogleGenerativeAI(
            model=model_name,
            google_api_key=api_key,
            temperature=temp,
            timeout=request_timeout,
            response_mime_type="application/json" if json_output else None,
        )

    raise ValueError(f"Unsupported LLM provider: {provider}")


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


def _text_from_llm_content(raw: object) -> str:
    """Normalize AIMessage.content — Gemini may return a list of content blocks."""
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw
    if isinstance(raw, list):
        parts: list[str] = []
        for part in raw:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                text = part.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return str(raw)


def extract_llm_text(response: object) -> str:
    """Merge visible content and reasoning_content (reasoning / thinking models)."""
    content = _text_from_llm_content(getattr(response, "content", None)).strip()
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
    content_delta = _text_from_llm_content(getattr(chunk, "content", None))
    reasoning_delta = ""
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
    json_output: bool = False,
) -> BaseChatModel:
    """Return a chat model with admin-key failover for OpenAI-compatible providers."""
    settings = get_settings()
    provider = normalize_llm_provider(provider or settings.llm_provider) or settings.llm_provider
    model_name = _resolve_model(settings, provider, model)
    if temperature is not None:
        temp = temperature
    elif is_reasoning_model(model_name):
        temp = REASONING_MODEL_TEMPERATURE
    else:
        temp = settings.llm_temperature

    _resolve_api_key(settings, provider)

    def build(api_key: str) -> BaseChatModel:
        return _build_llm_with_key(
            provider,
            api_key,
            model=model_name,
            temperature=temp,
            thinking=thinking,
            json_output=json_output,
        )

    return FailoverChatModel(
        provider=provider,
        model_name=model_name,
        temperature=temp,
        thinking=thinking,
        build_llm=build,
    )


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

GOOGLE_CHAT_MODEL_CATALOG: list[tuple[str, str]] = [
    ("gemini-2.5-flash-lite", "Gemini 2.5 Flash Lite · free"),
    ("gemini-3.1-flash-lite", "Gemini 3.1 Flash Lite · free"),
    ("gemini-3-flash-preview", "Gemini 3 Flash · preview"),
]

# Reserved for logic audit engine only — not exposed in the chat model dropdown.
GOOGLE_LOGIC_AUDIT_QUICK_MODEL = "gemini-2.5-flash"
GOOGLE_LOGIC_AUDIT_DEEP_MODEL = "gemini-3.5-flash"


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


def _provider_spec(
    provider_id: LLMProvider,
    settings: Settings,
) -> tuple[str, str, list[tuple[str, str]]]:
    specs: dict[LLMProvider, tuple[str, str, list[tuple[str, str]]]] = {
        "openai": ("OpenAI", settings.openai_default_model, OPENAI_MODEL_CATALOG),
        "anthropic": ("Anthropic (Claude)", settings.anthropic_default_model, ANTHROPIC_MODEL_CATALOG),
        "openrouter": ("OpenRouter", settings.openrouter_default_model, OPENROUTER_MODEL_CATALOG),
        "zai": ("Z.AI (GLM)", settings.zai_default_model, ZAI_MODEL_CATALOG),
        "google": ("Google (Gemini)", settings.google_default_model, GOOGLE_CHAT_MODEL_CATALOG),
    }
    return specs[provider_id]


def list_provider_catalog() -> list[dict]:
    """Full provider + model catalog for admin (enabled providers only)."""
    settings = get_settings()
    return [
        {
            "id": provider_id,
            "name": name,
            "default_model": default_model,
            "configured": bool(provider_has_api_key(provider_id)),
            "models": _model_options(catalog, default_model),
        }
        for provider_id in ENABLED_LLM_PROVIDERS
        for name, default_model, catalog in [_provider_spec(provider_id, settings)]
    ]


def list_providers() -> list[dict]:
    """Return configured providers for the frontend selector."""
    settings = get_settings()
    providers: list[dict] = []

    for provider_id in ENABLED_LLM_PROVIDERS:
        if not provider_has_api_key(provider_id):
            continue
        name, default, catalog = _provider_spec(provider_id, settings)
        providers.append(
            {
                "id": provider_id,
                "name": name,
                "default_model": default,
                "models": _model_options(catalog, default),
            }
        )

    return providers
