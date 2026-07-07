from __future__ import annotations

import logging
import threading
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from src.config import ENABLED_LLM_PROVIDERS, LLMProvider, Settings, get_settings
from src.db.models import PlatformProviderKey
from src.services.secret_crypto import decrypt_secret, encrypt_secret, key_hint

logger = logging.getLogger(__name__)

ADMIN_LLM_PROVIDERS: frozenset[str] = frozenset(ENABLED_LLM_PROVIDERS)

_cache_lock = threading.Lock()
_key_cache: dict[str, list[tuple[str, str]]] = {}


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.isoformat()


def _env_api_key(settings: Settings, provider: str) -> str:
    mapping = {
        "openai": settings.openai_api_key,
        "anthropic": settings.anthropic_api_key,
        "openrouter": settings.openrouter_api_key,
        "zai": settings.zai_api_key,
        "google": settings.google_api_key,
    }
    return (mapping.get(provider) or "").strip()


def invalidate_provider_key_cache() -> None:
    with _cache_lock:
        _key_cache.clear()


def refresh_provider_key_cache(db: Session) -> None:
    rows = (
        db.query(PlatformProviderKey)
        .filter(PlatformProviderKey.is_active.is_(True))
        .order_by(PlatformProviderKey.provider.asc(), PlatformProviderKey.priority.asc())
        .all()
    )
    grouped: dict[str, list[tuple[str, str]]] = {}
    for row in rows:
        try:
            plain = decrypt_secret(row.key_ciphertext)
        except ValueError as exc:
            logger.warning("Skip provider key %s priority %s: %s", row.provider, row.priority, exc)
            continue
        grouped.setdefault(row.provider, []).append((str(row.id), plain))
    with _cache_lock:
        _key_cache.clear()
        _key_cache.update(grouped)


def _append_env_fallback(keys: list[str], env_key: str) -> list[str]:
    """Append .env key after admin keys when set and not already in the chain."""
    if not env_key or env_key in keys:
        return keys
    return [*keys, env_key]


def get_provider_api_keys(provider: LLMProvider | str) -> list[str]:
    """Ordered keys: admin DB (by priority), then .env as final fallback on auth/quota errors."""
    provider_id = str(provider)
    settings = get_settings()
    with _cache_lock:
        cached = [plain for _, plain in _key_cache.get(provider_id, [])]
    env_key = _env_api_key(settings, provider_id)
    if cached:
        return _append_env_fallback(cached, env_key)
    return [env_key] if env_key else []


def provider_has_api_key(provider: str) -> bool:
    return bool(get_provider_api_keys(provider))


def list_provider_key_rows(db: Session, provider: str | None = None) -> list[PlatformProviderKey]:
    query = db.query(PlatformProviderKey)
    if provider:
        query = query.filter(PlatformProviderKey.provider == provider)
    return query.order_by(
        PlatformProviderKey.provider.asc(),
        PlatformProviderKey.priority.asc(),
    ).all()


def _validate_provider(provider: str) -> str:
    normalized = provider.strip().lower()
    if normalized not in ADMIN_LLM_PROVIDERS:
        raise ValueError(f"Unsupported provider '{provider}'.")
    return normalized


def upsert_provider_key(
    db: Session,
    *,
    provider: str,
    api_key: str,
    priority: int = 0,
    label: str | None = None,
    is_active: bool = True,
    updated_by: uuid.UUID | None,
) -> PlatformProviderKey:
    provider_id = _validate_provider(provider)
    plain = api_key.strip()
    if len(plain) < 8:
        raise ValueError("API key is too short.")

    row = (
        db.query(PlatformProviderKey)
        .filter(
            PlatformProviderKey.provider == provider_id,
            PlatformProviderKey.priority == priority,
        )
        .first()
    )
    now = datetime.now(UTC)
    ciphertext = encrypt_secret(plain)
    hint = key_hint(plain)

    if row:
        row.key_ciphertext = ciphertext
        row.key_hint = hint
        row.label = label
        row.is_active = is_active
        row.last_error = None
        row.updated_by = updated_by
        row.updated_at = now
    else:
        row = PlatformProviderKey(
            provider=provider_id,
            priority=priority,
            label=label,
            key_ciphertext=ciphertext,
            key_hint=hint,
            is_active=is_active,
            updated_by=updated_by,
            created_at=now,
            updated_at=now,
        )
        db.add(row)

    db.flush()
    refresh_provider_key_cache(db)
    return row


def delete_provider_key(db: Session, key_id: str) -> bool:
    row = db.query(PlatformProviderKey).filter(PlatformProviderKey.id == uuid.UUID(key_id)).first()
    if not row:
        return False
    db.delete(row)
    db.flush()
    refresh_provider_key_cache(db)
    return True


def clear_provider_keys(db: Session, provider: str) -> int:
    provider_id = _validate_provider(provider)
    deleted = (
        db.query(PlatformProviderKey)
        .filter(PlatformProviderKey.provider == provider_id)
        .delete(synchronize_session=False)
    )
    db.flush()
    refresh_provider_key_cache(db)
    return int(deleted or 0)


def mark_provider_key_verified(db: Session, key_id: str, *, error: str | None = None) -> None:
    row = db.query(PlatformProviderKey).filter(PlatformProviderKey.id == uuid.UUID(key_id)).first()
    if not row:
        return
    row.last_verified_at = datetime.now(UTC)
    row.last_error = error
    row.updated_at = datetime.now(UTC)
    db.flush()


def row_to_admin_dict(row: PlatformProviderKey) -> dict:
    source = "admin" if row.priority >= 0 else "admin"
    return {
        "id": str(row.id),
        "provider": row.provider,
        "priority": row.priority,
        "label": row.label,
        "key_hint": row.key_hint,
        "is_active": row.is_active,
        "source": source,
        "last_verified_at": _iso(row.last_verified_at),
        "last_error": row.last_error,
        "updated_at": _iso(row.updated_at),
    }
