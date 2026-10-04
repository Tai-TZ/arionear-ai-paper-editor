"""Defense / mock-viva agent endpoints."""

from __future__ import annotations

import asyncio
import contextlib

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db_session
from src.db.models import User
from src.models.schemas import DefenseQuotaResponse, DefenseRequest
from src.services.defense_quota import defense_quota_status
from src.services.defense_stream import stream_defense
from src.services.sse import flush_sse_stream

router = APIRouter()


@router.get("/defense/quota", response_model=DefenseQuotaResponse)
def defense_quota_endpoint(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> DefenseQuotaResponse:
    """Daily defense turn allowance for the authenticated user."""
    return DefenseQuotaResponse.model_validate(defense_quota_status(db, user))


@router.post("/defense/stream")
async def defense_stream_endpoint(
    request: DefenseRequest,
    http_request: Request,
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Stream a defense council question/response as Server-Sent Events.

    Requires authentication (Bearer token). Events: activity, token, done, error.
    """
    cancel = asyncio.Event()

    async def watch_disconnect() -> None:
        while not cancel.is_set():
            if await http_request.is_disconnected():
                cancel.set()
                return
            await asyncio.sleep(0.2)

    async def stream_with_disconnect():
        watcher = asyncio.create_task(watch_disconnect())
        agen = stream_defense(request, user_id=user.id, cancel_event=cancel)
        try:
            async for chunk in flush_sse_stream(agen):
                if cancel.is_set():
                    break
                yield chunk
        finally:
            cancel.set()
            watcher.cancel()
            with contextlib.suppress(Exception):
                await agen.aclose()
            with contextlib.suppress(asyncio.CancelledError):
                await watcher

    return StreamingResponse(
        stream_with_disconnect(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Content-Encoding": "identity",
        },
    )
