from __future__ import annotations

import re
from copy import deepcopy
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from src.db.models import User
from src.models.profile_schemas import ResearcherProfileResponse, ResearcherProfileUpdate

ORCID_RE = re.compile(r"^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$", re.IGNORECASE)

DEFAULT_PROFILE_SETTINGS: dict[str, Any] = {
    "department": None,
    "position": None,
    "orcid": None,
    "google_scholar_url": None,
    "avatar_url": None,
    "timezone": "Asia/Bangkok",
    "ui_language": "en",
    "paper_type": "journal",
    "target_venue": None,
    "target_deadline": None,
    "default_template": "imrad",
    "citation_style": "ieee",
    "writing_locale": "en-US",
    "default_llm_provider": "openrouter",
    "default_llm_model": None,
    "rewrite_intensity": "light",
    "integrity_strictness": "standard",
    "auto_compile": False,
    "auto_save": True,
    "synctex_highlight_ms": 5000,
    "store_drafts": True,
    "telemetry_opt_in": False,
    "subscription_plan": "free",
}

_COLUMN_FIELDS = {
    "name": "full_name",
    "affiliation": "institution",
    "native_language": "native_language",
    "research_field": "research_field",
}


def _normalize_settings(raw: dict | None) -> dict[str, Any]:
    merged = deepcopy(DEFAULT_PROFILE_SETTINGS)
    if raw:
        for key, value in raw.items():
            if key in merged:
                merged[key] = value
    return merged


def _coerce_synctex_ms(value: object) -> int:
    try:
        ms = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return DEFAULT_PROFILE_SETTINGS["synctex_highlight_ms"]
    return max(1000, min(15000, ms))


def _coerce_enum(value: object, default: str, allowed: set[str]) -> str:
    if isinstance(value, str) and value in allowed:
        return value
    return default


def _validate_orcid(value: str | None) -> str | None:
    if not value or not value.strip():
        return None
    cleaned = value.strip()
    if not ORCID_RE.match(cleaned):
        raise ValueError("ORCID must look like 0000-0000-0000-0000.")
    return cleaned


def apply_google_avatar_if_empty(user: User, avatar_url: str | None) -> None:
    """Set profile avatar from Google SSO when the user has none yet."""
    if not avatar_url or not avatar_url.strip():
        return
    url = avatar_url.strip()[:500]
    settings = _normalize_settings(user.profile_settings)
    if settings.get("avatar_url"):
        return
    settings["avatar_url"] = url
    user.profile_settings = settings


def user_to_profile(user: User) -> ResearcherProfileResponse:
    settings = _normalize_settings(user.profile_settings or {})
    updated = user.last_active_at or user.created_at
    return ResearcherProfileResponse(
        id=str(user.id),
        name=user.full_name,
        email=user.email,
        affiliation=user.institution,
        department=settings.get("department") or None,
        position=settings.get("position") or None,
        native_language=user.native_language,
        research_field=user.research_field,
        orcid=settings.get("orcid") or None,
        google_scholar_url=settings.get("google_scholar_url") or None,
        avatar_url=settings.get("avatar_url") or None,
        timezone=settings.get("timezone") or "Asia/Bangkok",
        ui_language=_coerce_enum(settings.get("ui_language"), "en", {"en", "vi"}),  # type: ignore[arg-type]
        paper_type=_coerce_enum(
            settings.get("paper_type"),
            "journal",
            {"journal", "conference", "thesis", "report"},
        ),  # type: ignore[arg-type]
        target_venue=settings.get("target_venue") or None,
        target_deadline=settings.get("target_deadline") or None,
        default_template=_coerce_enum(
            settings.get("default_template"),
            "imrad",
            {"imrad", "ieee", "acm", "springer", "blank"},
        ),  # type: ignore[arg-type]
        citation_style=_coerce_enum(
            settings.get("citation_style"),
            "ieee",
            {"ieee", "apa", "vancouver", "chicago", "nature"},
        ),  # type: ignore[arg-type]
        writing_locale=_coerce_enum(settings.get("writing_locale"), "en-US", {"en-US", "en-GB"}),  # type: ignore[arg-type]
        default_llm_provider=_coerce_enum(
            "tokenrouter"
            if settings.get("default_llm_provider") == "nvidia"
            else settings.get("default_llm_provider"),
            "zai",
            {"openrouter", "openai", "anthropic", "zai", "tokenrouter"},
        ),  # type: ignore[arg-type]
        default_llm_model=settings.get("default_llm_model") or None,
        rewrite_intensity=_coerce_enum(
            settings.get("rewrite_intensity"),
            "light",
            {"light", "moderate", "strong"},
        ),  # type: ignore[arg-type]
        integrity_strictness=_coerce_enum(
            settings.get("integrity_strictness"),
            "standard",
            {"relaxed", "standard", "strict"},
        ),  # type: ignore[arg-type]
        auto_compile=bool(settings.get("auto_compile", False)),
        auto_save=bool(settings.get("auto_save", True)),
        synctex_highlight_ms=_coerce_synctex_ms(settings.get("synctex_highlight_ms", 5000)),
        store_drafts=bool(settings.get("store_drafts", True)),
        telemetry_opt_in=bool(settings.get("telemetry_opt_in", False)),
        updated_at=updated.isoformat() if updated else None,
    )


def update_user_profile(db: Session, user: User, patch: ResearcherProfileUpdate) -> ResearcherProfileResponse:
    data = patch.model_dump(exclude_unset=True)
    settings = _normalize_settings(user.profile_settings or {})

    if "orcid" in data:
        data["orcid"] = _validate_orcid(data.get("orcid"))

    for api_field, column in _COLUMN_FIELDS.items():
        if api_field in data:
            setattr(user, column, data.pop(api_field) or None)

    for key, value in data.items():
        if key in settings:
            settings[key] = value

    user.profile_settings = settings
    user.last_active_at = datetime.now(UTC)
    db.flush()
    return user_to_profile(user)
