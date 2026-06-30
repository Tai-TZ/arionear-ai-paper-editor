from __future__ import annotations

from typing import Any

from src.config import LLMProvider, get_settings, normalize_llm_provider

LogicAuditMode = str  # "quick" | "deep"

ZAI_LOGIC_AUDIT_QUICK_MODEL = "glm-4.7-flash"
ZAI_LOGIC_AUDIT_DEEP_MODEL = "glm-4.7"

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
) -> tuple[LLMProvider, str | None]:
    """Pick provider/model for logic audit — independent of chat dropdown when possible."""
    settings = get_settings()
    normalized_mode = (mode or "quick").strip().lower()
    chat = normalize_llm_provider(chat_provider)

    if normalized_mode == "deep":
        if settings.zai_api_key.strip():
            return "zai", ZAI_LOGIC_AUDIT_DEEP_MODEL
        if settings.openai_api_key.strip():
            return "openai", settings.openai_default_model
        if settings.anthropic_api_key.strip():
            return "anthropic", settings.anthropic_default_model
        if chat:
            return chat, None
        return settings.llm_provider, ZAI_LOGIC_AUDIT_DEEP_MODEL

    # Quick — Z.AI GLM-4.7 Flash first.
    if settings.zai_api_key.strip():
        return "zai", ZAI_LOGIC_AUDIT_QUICK_MODEL
    if settings.openai_api_key.strip():
        return "openai", settings.openai_default_model
    if settings.anthropic_api_key.strip():
        return "anthropic", settings.anthropic_default_model
    if chat:
        return chat, None
    return settings.llm_provider, None


def logic_audit_engine_label(mode: str) -> str:
    if (mode or "quick").strip().lower() == "deep":
        return "GLM-4.7"
    return "GLM-4.7 Flash"


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
            limit = (
                DEEP_FULL_MAX_SECTIONS
                if normalized_mode == "deep"
                else QUICK_FULL_MAX_SECTIONS
            )
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
    normalized_mode = (mode or "quick").strip().lower()
    normalized_scope = (scope or LOGIC_AUDIT_SCOPE_SELECTED).strip().lower()
    is_full = normalized_scope == LOGIC_AUDIT_SCOPE_FULL

    if normalized_mode == "deep":
        return {
            "mode": "deep",
            "scope": normalized_scope,
            "use_combined_persona": False,
            "persona_sequential": True,
            "section_concurrency": 1,
            "section_char_limit": 4500,
            "run_cross_section": True,
            "max_sections": DEEP_FULL_MAX_SECTIONS if is_full else DEEP_MAX_SECTIONS,
        }

    return {
        "mode": "quick",
        "scope": normalized_scope,
        "use_combined_persona": True,
        "persona_sequential": False,
        "section_concurrency": 2,
        "section_char_limit": 4000,
        "run_cross_section": is_full,
        "max_sections": QUICK_FULL_MAX_SECTIONS if is_full else QUICK_MAX_SECTIONS,
    }
