from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.api.deps import get_admin_user, get_db_session
from src.db.models import User
from src.models.admin_schemas import (
    AdminCostReport,
    AdminOverviewResponse,
    AdminUsageSummary,
    AdminUserListResponse,
    AdminUserPatch,
    AdminUserRow,
    LlmGlobalConfigResponse,
    LlmGlobalDefaults,
    LlmGlobalDefaultsPatch,
    ProviderKeyListResponse,
    ProviderKeyRow,
    ProviderKeyTestRequest,
    ProviderKeyTestResponse,
    ProviderKeyUpsertRequest,
)
from src.services.admin_provider_keys import (
    list_admin_provider_keys,
    remove_admin_provider_key,
    remove_all_admin_provider_keys,
    save_admin_provider_key,
    test_admin_provider_key,
)
from src.services.admin_service import (
    get_admin_overview,
    get_cost_report,
    get_global_llm_config,
    get_usage_summary,
    list_admin_users,
    update_admin_user,
    update_global_llm_defaults,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=AdminUserListResponse)
def admin_list_users(
    _admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db_session),
):
    users = list_admin_users(db)
    return AdminUserListResponse(users=users, total=len(users))


@router.patch("/users/{user_id}", response_model=AdminUserRow)
def admin_patch_user(
    user_id: str,
    body: AdminUserPatch,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db_session),
):
    if str(admin.id) == user_id and body.is_active is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    if str(admin.id) == user_id and body.role == "RESEARCHER":
        raise HTTPException(status_code=400, detail="You cannot remove your own admin role.")

    try:
        updated = update_admin_user(
            db,
            user_id,
            role=body.role,
            is_active=body.is_active,
            llm_limits=body.llm_limits,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="User not found.")
    return updated


@router.get("/usage/summary", response_model=AdminUsageSummary)
def admin_usage_summary(
    _admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db_session),
):
    return get_usage_summary(db)


@router.get("/overview", response_model=AdminOverviewResponse)
def admin_overview(
    _admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db_session),
):
    return get_admin_overview(db)


@router.get("/usage/cost-report", response_model=AdminCostReport)
def admin_cost_report(
    year: int,
    month: int,
    include_unused: bool = False,
    _admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db_session),
):
    try:
        return get_cost_report(db, year=year, month=month, include_unused=include_unused)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/llm/config", response_model=LlmGlobalConfigResponse)
def admin_llm_config(_admin: User = Depends(get_admin_user)):
    return get_global_llm_config()


@router.patch("/llm/defaults", response_model=LlmGlobalDefaults)
def admin_patch_llm_defaults(
    body: LlmGlobalDefaultsPatch,
    _admin: User = Depends(get_admin_user),
):
    try:
        return update_global_llm_defaults(body.defaults)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/llm/keys", response_model=ProviderKeyListResponse)
def admin_list_provider_keys(
    provider: str | None = None,
    _admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db_session),
):
    return list_admin_provider_keys(db, provider)


@router.put("/llm/keys/{provider}", response_model=ProviderKeyRow)
def admin_upsert_provider_key(
    provider: str,
    body: ProviderKeyUpsertRequest,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db_session),
):
    try:
        return save_admin_provider_key(db, provider, body, updated_by=admin.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/llm/keys/{key_id}", status_code=204)
def admin_delete_provider_key(
    key_id: str,
    _admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db_session),
):
    if not remove_admin_provider_key(db, key_id):
        raise HTTPException(status_code=404, detail="Key not found.")
    return None


@router.delete("/llm/keys/provider/{provider}", status_code=204)
def admin_clear_provider_keys(
    provider: str,
    _admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db_session),
):
    try:
        remove_all_admin_provider_keys(db, provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return None


@router.post("/llm/keys/{provider}/test", response_model=ProviderKeyTestResponse)
async def admin_test_provider_key(
    provider: str,
    body: ProviderKeyTestRequest,
    _admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db_session),
):
    try:
        return await test_admin_provider_key(
            db,
            provider,
            api_key=body.api_key,
            key_id=body.key_id,
            model=body.model,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
