from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db_session
from src.db.models import User
from src.models.profile_schemas import ResearcherProfileResponse, ResearcherProfileUpdate
from src.services.profile_service import update_user_profile, user_to_profile

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me/profile", response_model=ResearcherProfileResponse)
async def get_my_profile(
    user: User = Depends(get_current_user),
) -> ResearcherProfileResponse:
    return user_to_profile(user)


@router.patch("/me/profile", response_model=ResearcherProfileResponse)
async def patch_my_profile(
    body: ResearcherProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> ResearcherProfileResponse:
    try:
        return update_user_profile(db, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
