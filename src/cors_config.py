"""CORS policy for FastAPI — shared by main and tests."""

from __future__ import annotations

from src.config import Settings

# Production frontends/API on *.arionear.id.vn (e.g. arionear.id.vn).
_ARIONEAR_ORIGIN_REGEX = r"https://([a-zA-Z0-9-]+\.)*arionear\.id\.vn"


def _dedupe_origins(origins: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for origin in origins:
        if origin and origin not in seen:
            seen.add(origin)
            out.append(origin)
    return out


def resolve_cors_origins(settings: Settings) -> list[str]:
    """Merge explicit CORS_ORIGINS with FRONTEND/BACKEND base URLs."""
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    for url in (settings.frontend_base_url, settings.backend_base_url):
        candidate = url.strip().rstrip("/")
        if candidate:
            origins.append(candidate)
    return _dedupe_origins(origins)


def build_cors_middleware_kwargs(settings: Settings) -> dict:
    kwargs: dict = {
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
        "allow_origins": resolve_cors_origins(settings),
    }
    if settings.app_env == "development":
        kwargs["allow_origin_regex"] = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
    elif settings.app_env == "production":
        kwargs["allow_origin_regex"] = _ARIONEAR_ORIGIN_REGEX
    return kwargs
