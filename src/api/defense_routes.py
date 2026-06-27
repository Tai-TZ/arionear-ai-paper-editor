"""Defense / mock-viva agent endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db_session
from src.db.models import User
from src.models.schemas import DefenseQuotaResponse, DefenseRequest
from src.services.defense_quota import defense_quota_status
from src.services.defense_stream import flush_sse_stream, stream_defense

router = APIRouter()


@router.get("/defense/quota", response_model=DefenseQuotaResponse)
def defense_quota_endpoint(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> DefenseQuotaResponse:
    """Monthly defense turn allowance for the authenticated user."""
    return DefenseQuotaResponse.model_validate(defense_quota_status(db, user))


@router.post("/defense/stream")
async def defense_stream_endpoint(
    request: DefenseRequest,
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Stream a defense council question/response as Server-Sent Events.

    Requires authentication (Bearer token). Events: activity, token, done, error.
    """
    return StreamingResponse(
        flush_sse_stream(stream_defense(request, user_id=user.id)),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
