from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.admin_schemas import (
    LlmModelOption,
    LlmProviderStatus,
    ProviderKeyListResponse,
    ProviderKeyRow,
    ProviderKeyTestResponse,
    ProviderKeyUpsertRequest,
)
from src.services.llm import list_provider_catalog
from src.services.llm_failover import test_provider_api_key
from src.services.provider_key_store import (
    ADMIN_LLM_PROVIDERS,
    clear_provider_keys,
    delete_provider_key,
    list_provider_key_rows,
    provider_has_api_key,
    row_to_admin_dict,
    upsert_provider_key,
    _env_api_key,
    mark_provider_key_verified,
)
from src.services.secret_crypto import decrypt_secret
from src.db.models import PlatformProviderKey


def _env_fallback_map() -> dict[str, bool]:
    settings = get_settings()
    return {provider: bool(_env_api_key(settings, provider)) for provider in ADMIN_LLM_PROVIDERS}


def list_admin_provider_keys(db: Session, provider: str | None = None) -> ProviderKeyListResponse:
    rows = list_provider_key_rows(db, provider)
    catalog = list_provider_catalog()
    return ProviderKeyListResponse(
        keys=[ProviderKeyRow(**row_to_admin_dict(row)) for row in rows],
        env_fallback_configured=_env_fallback_map(),
        providers=[
            LlmProviderStatus(
                id=entry["id"],
                label=entry["name"],
                configured=entry["configured"],
                default_model=entry["default_model"],
                models=[LlmModelOption(**model) for model in entry["models"]],
            )
            for entry in catalog
        ],
    )


def save_admin_provider_key(
    db: Session,
    provider: str,
    body: ProviderKeyUpsertRequest,
    *,
    updated_by: uuid.UUID,
) -> ProviderKeyRow:
    row = upsert_provider_key(
        db,
        provider=provider,
        api_key=body.api_key,
        priority=body.priority,
        label=body.label,
        is_active=body.is_active,
        updated_by=updated_by,
    )
    return ProviderKeyRow(**row_to_admin_dict(row))


def remove_admin_provider_key(db: Session, key_id: str) -> bool:
    return delete_provider_key(db, key_id)


def remove_all_admin_provider_keys(db: Session, provider: str) -> int:
    return clear_provider_keys(db, provider)


async def test_admin_provider_key(
    db: Session,
    provider: str,
    *,
    api_key: str | None = None,
    key_id: str | None = None,
    model: str | None = None,
) -> ProviderKeyTestResponse:
    hint: str | None = None
    test_key = (api_key or "").strip()

    if not test_key and key_id:
        row = db.query(PlatformProviderKey).filter(PlatformProviderKey.id == uuid.UUID(key_id)).first()
        if not row:
            raise ValueError("Key not found.")
        test_key = decrypt_secret(row.key_ciphertext)
        hint = row.key_hint
    elif test_key:
        from src.services.secret_crypto import key_hint as make_hint

        hint = make_hint(test_key)
    else:
        settings = get_settings()
        test_key = _env_api_key(settings, provider)
        hint = "env"

    if not test_key:
        raise ValueError("No API key to test.")

    ok, message, latency_ms = await test_provider_api_key(provider, test_key, model=model)
    if key_id:
        mark_provider_key_verified(db, key_id, error=None if ok else message[:240])
    return ProviderKeyTestResponse(
        ok=ok,
        message=message,
        latency_ms=latency_ms,
        provider=provider,
        key_hint=hint,
    )


def provider_configured_for_admin(provider: str) -> bool:
    return provider_has_api_key(provider)
