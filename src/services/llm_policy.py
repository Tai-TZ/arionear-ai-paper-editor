from __future__ import annotations

import json
from pathlib import Path

from src.config import get_settings
from src.models.admin_schemas import LlmGlobalDefaults, LlmLimits

ADMIN_CONFIG_PATH = Path("data/admin_llm_defaults.json")

DEFAULT_LLM_LIMITS = LlmLimits()
DEFAULT_GLOBAL_DEFAULTS = LlmGlobalDefaults()


def read_global_defaults() -> LlmGlobalDefaults:
    if not ADMIN_CONFIG_PATH.exists():
        return DEFAULT_GLOBAL_DEFAULTS.model_copy()
    try:
        raw = json.loads(ADMIN_CONFIG_PATH.read_text(encoding="utf-8"))
        return LlmGlobalDefaults.model_validate(raw.get("defaults", raw))
    except (json.JSONDecodeError, OSError, ValueError):
        return DEFAULT_GLOBAL_DEFAULTS.model_copy()


def write_global_defaults(defaults: LlmGlobalDefaults) -> LlmGlobalDefaults:
    ADMIN_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    ADMIN_CONFIG_PATH.write_text(
        json.dumps({"defaults": defaults.model_dump()}, indent=2),
        encoding="utf-8",
    )
    return defaults


def global_defaults_as_limits() -> LlmLimits:
    defaults = read_global_defaults()
    return LlmLimits(
        daily_token_max=defaults.daily_token_max,
        monthly_cost_cap_usd=defaults.monthly_cost_cap_usd,
        rate_limit_per_min=defaults.rate_limit_per_min,
        llm_enabled=True,
    )


def get_llm_limits_from_profile(profile_settings: dict | None) -> LlmLimits:
    """Effective per-user limits: global defaults merged with profile overrides."""
    base = global_defaults_as_limits()
    raw = (profile_settings or {}).get("llm_limits")
    if not isinstance(raw, dict):
        return base
    merged = {**base.model_dump(), **raw}
    return LlmLimits.model_validate(merged)


def set_llm_limits_on_profile(profile_settings: dict | None, limits: LlmLimits) -> dict:
    settings = dict(profile_settings or {})
    settings["llm_limits"] = limits.model_dump()
    return settings


def cost_rate_per_token() -> float:
    return read_global_defaults().estimated_cost_per_1k_tokens_usd / 1000.0


def resolve_llm_temperature(requested: float | None = None) -> float:
    """Clamp chat temperature to admin global policy."""
    defaults = read_global_defaults()
    settings = get_settings()
    temp = requested if requested is not None else defaults.default_temperature
    if temp is None:
        temp = settings.llm_temperature
    return max(defaults.min_temperature, min(defaults.max_temperature, float(temp)))
