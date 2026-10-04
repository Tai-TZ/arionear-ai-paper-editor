from __future__ import annotations

from typing import Any

from src.config import LLMProvider, get_settings, normalize_llm_provider
from src.services.provider_key_store import provider_has_api_key

LogicAuditMode = str  # "quick" | "deep"

QUICK_DEFAULT_SECTION_KEYS = ("abstract", "introduction", "conclusion")
QUICK_MAX_SECTIONS = 3
DEEP_MAX_SECTIONS = 1
QUICK_FULL_MAX_SECTIONS = 20
DEEP_FULL_MAX_SECTIONS = 8
LOGIC_AUDIT_SCOPE_FULL = "full"
LOGIC_AUDIT_SCOPE_SELECTED = "selected"


def resolve_logic_audit_llm(
    mode: str,
    chat_provider: str | None,
    *,
    scope: str = LOGIC_AUDIT_SCOPE_SELECTED,
) -> tuple[LLMProvider, str | None]:
    """Pick provider/model for logic audit — full-manuscript uses Gemini quality model."""
    settings = get_settings()
    normalized_mode = (mode or "quick").strip().lower()
    normalized_scope = (scope or LOGIC_AUDIT_SCOPE_SELECTED).strip().lower()
    use_quality_model = normalized_mode == "deep" or normalized_scope == LOGIC_AUDIT_SCOPE_FULL
    chat = normalize_llm_provider(chat_provider)

    if use_quality_model:
        if provider_has_api_key("google"):
            return "google", settings.google_logic_audit_deep_model
        if provider_has_api_key("openrouter"):
            return "openrouter", settings.openrouter_logic_audit_quick_model
        if provider_has_api_key("zai"):
            return "zai", settings.zai_default_model
        if chat:
            return chat, None
        return settings.llm_provider, settings.google_logic_audit_deep_model

    if provider_has_api_key("google"):
        return "google", settings.google_logic_audit_quick_model
    if provider_has_api_key("openrouter"):
        return "openrouter", settings.openrouter_logic_audit_quick_model
    if provider_has_api_key("zai"):
        return "zai", settings.zai_default_model
    if chat:
        return chat, None
    return settings.llm_provider, settings.google_logic_audit_quick_model


def logic_audit_engine_label(
    mode: str,
    *,
    scope: str = LOGIC_AUDIT_SCOPE_SELECTED,
) -> str:
    settings = get_settings()
    normalized_mode = (mode or "quick").strip().lower()
    normalized_scope = (scope or LOGIC_AUDIT_SCOPE_SELECTED).strip().lower()
    use_quality_model = normalized_mode == "deep" or normalized_scope == LOGIC_AUDIT_SCOPE_FULL
    if use_quality_model:
        model = settings.google_logic_audit_deep_model
        if model == "gemini-3.5-flash":
            return "Gemini 3.5 Flash"
        if model == "gemini-3-flash-preview":
            return "Gemini 3 Flash"
        if model == "gemini-2.5-flash":
            return "Gemini 2.5 Flash"
        return model
    model = settings.google_logic_audit_quick_model
    if model == "gemini-2.5-flash":
        return "Gemini 2.5 Flash"
    if model == "gemini-2.5-flash-lite":
        return "Gemini 2.5 Flash Lite"
    if model == "gemini-3.5-flash":
        return "Gemini 3.5 Flash"
    return model


def _name_matches_filter(section_name: str, filters: list[str]) -> bool:
    lower = section_name.lower()
    return any(f.strip().lower() in lower or lower in f.strip().lower() for f in filters if f.strip())


def select_logic_targets(
    sections: list[dict],
    *,
    mode: str = "quick",
    scope: str = "selected",
    section_filter: list[str] | None = None,
    max_sections: int | None = None,
) -> list[dict]:
    """Choose manuscript sections to audit based on mode, scope, and user selection."""
    available = [s for s in sections if (s.get("content") or "").strip()]
    normalized_mode = (mode or "quick").strip().lower()
    normalized_scope = (scope or LOGIC_AUDIT_SCOPE_SELECTED).strip().lower()

    if normalized_scope == LOGIC_AUDIT_SCOPE_FULL:
        limit = max_sections
        if limit is None:
            limit = DEEP_FULL_MAX_SECTIONS if normalized_mode == "deep" else QUICK_FULL_MAX_SECTIONS
        return available[:limit]

    if section_filter:
        picked = [s for s in available if _name_matches_filter(str(s.get("name") or ""), section_filter)]
        if picked:
            available = picked
    elif normalized_mode == "quick":
        defaults: list[dict] = []
        for key in QUICK_DEFAULT_SECTION_KEYS:
            for section in available:
                name = str(section.get("name") or "").lower()
                if key in name and section not in defaults:
                    defaults.append(section)
                    break
        if defaults:
            available = defaults

    limit = max_sections
    if limit is None:
        limit = DEEP_MAX_SECTIONS if normalized_mode == "deep" else QUICK_MAX_SECTIONS
    return available[:limit]


def logic_audit_runtime_flags(
    mode: str,
    provider: str | None,
    *,
    scope: str = "selected",
) -> dict[str, Any]:
    """Pipeline tuning per mode — quick favors speed; deep favors depth."""
    settings = get_settings()
    normalized_mode = (mode or "quick").strip().lower()
    normalized_scope = (scope or LOGIC_AUDIT_SCOPE_SELECTED).strip().lower()
    is_full = normalized_scope == LOGIC_AUDIT_SCOPE_FULL
    cooldown = settings.logic_audit_section_cooldown_sec if is_full else 0.0

    if normalized_mode == "deep":
        return {
            "mode": "deep",
            "scope": normalized_scope,
            "use_combined_persona": False,
            "persona_sequential": True,
            "section_concurrency": 1,
            "section_char_limit": 8000,
            "run_cross_section": True,
            "max_sections": DEEP_FULL_MAX_SECTIONS if is_full else DEEP_MAX_SECTIONS,
            "section_cooldown_sec": cooldown,
        }

    return {
        "mode": "quick",
        "scope": normalized_scope,
        "use_combined_persona": True,
        "persona_sequential": False,
        "section_concurrency": 1 if is_full else 2,
        "section_char_limit": 6000,
        "run_cross_section": is_full,
        "max_sections": QUICK_FULL_MAX_SECTIONS if is_full else QUICK_MAX_SECTIONS,
        "section_cooldown_sec": cooldown,
    }


def compute_logic_audit_timeout_sec(
    mode: str,
    scope: str,
    section_count: int,
    *,
    run_cross_section: bool = False,
    targets: list[dict] | None = None,
    section_char_limit: int = 6000,
    section_concurrency: int = 2,
) -> float:
    """Estimate stream timeout from mode, scope, section count, and chunking."""
    settings = get_settings()
    normalized_mode = (mode or "quick").strip().lower()
    if normalized_mode == "gate":
        return min(
            settings.logic_audit_gate_timeout_sec + 20.0,
            settings.logic_audit_stream_timeout_max_sec,
        )
    is_full = (scope or LOGIC_AUDIT_SCOPE_SELECTED).strip().lower() == LOGIC_AUDIT_SCOPE_FULL
    count = max(1, section_count)

    persona_t = settings.logic_audit_persona_timeout_sec
    synth_t = settings.logic_audit_synth_timeout_sec

    if normalized_mode == "deep":
        per_chunk = 3 * persona_t + synth_t + 30.0
        concurrency = 1
        floor = 360.0 if not is_full else 600.0
        max_chunks = 3
    else:
        per_chunk = persona_t + synth_t + 20.0
        concurrency = max(1, section_concurrency)
        floor = 240.0 if not is_full else 480.0
        max_chunks = 2

    if targets:
        section_chunk_counts = [
            len(
                split_section_text(
                    str(target.get("content") or ""),
                    section_char_limit,
                    max_chunks=max_chunks,
                )
            )
            for target in targets
        ]
    else:
        section_chunk_counts = [1] * count

    section_times = [chunks * per_chunk for chunks in section_chunk_counts]
    total = 0.0
    for index in range(0, len(section_times), concurrency):
        batch = section_times[index : index + concurrency]
        if batch:
            total += max(batch)

    if run_cross_section:
        total += persona_t + synth_t + 20.0

    return min(max(total, floor), settings.logic_audit_stream_timeout_max_sec)


def split_section_text(text: str, limit: int, *, max_chunks: int = 2) -> list[str]:
    """Split long section text into overlapping chunks for audit."""
    from src.services.logic_audit.text_utils import split_section_text_subsection_aware

    return split_section_text_subsection_aware(text, limit, max_chunks=max_chunks)
