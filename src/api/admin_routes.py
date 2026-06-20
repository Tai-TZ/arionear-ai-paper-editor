from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.api.deps import get_admin_user, get_db_session
from src.db.models import User
from src.models.admin_schemas import (
    AdminCostReport,
    AdminUsageSummary,
    AdminUserListResponse,
    AdminUserPatch,
    AdminUserRow,
    LlmGlobalConfigResponse,
    LlmGlobalDefaults,
    LlmGlobalDefaultsPatch,
)
from src.services.admin_service import (
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


@router.get("/usage/cost-report", response_model=AdminCostReport)
def admin_cost_report(
    year: int,
    month: int,
    _admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db_session),
):
    try:
        return get_cost_report(db, year=year, month=month)
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
