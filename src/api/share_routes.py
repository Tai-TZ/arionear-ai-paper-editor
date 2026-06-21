from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, WebSocket
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db_session
from src.db.models import User
from src.models.schemas import PaperSharePublicResponse, PaperShareStatusResponse
from src.services.share_room import relay_share_websocket
from src.services.share_service import (
    disable_paper_share,
    enable_paper_share,
    get_share_status,
    get_shared_paper,
)

router = APIRouter(tags=["share"])


@router.get("/papers/{paper_id}/share", response_model=PaperShareStatusResponse)
async def read_paper_share_status(
    paper_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    try:
        pid = uuid.UUID(paper_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid paper id.") from e

    try:
        status = get_share_status(db, user.id, pid)
    except LookupError as e:
        raise HTTPException(status_code=404, detail="Paper not found.") from e
    return PaperShareStatusResponse(**status)


@router.post("/papers/{paper_id}/share", response_model=PaperShareStatusResponse)
async def create_paper_share_link(
    paper_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    try:
        pid = uuid.UUID(paper_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid paper id.") from e

    try:
        enable_paper_share(db, user.id, pid)
        status = get_share_status(db, user.id, pid)
    except LookupError as e:
        raise HTTPException(status_code=404, detail="Paper not found.") from e
    return PaperShareStatusResponse(**status)


@router.delete("/papers/{paper_id}/share", status_code=204)
async def revoke_paper_share_link(
    paper_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    try:
        pid = uuid.UUID(paper_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid paper id.") from e

    try:
        disable_paper_share(db, user.id, pid)
    except LookupError as e:
        raise HTTPException(status_code=404, detail="Paper not found.") from e


@router.get("/share/{token}", response_model=PaperSharePublicResponse)
async def read_shared_paper(
    token: str,
    db: Session = Depends(get_db_session),
):
    paper = get_shared_paper(db, token)
    if not paper:
        raise HTTPException(status_code=404, detail="Shared link not found or disabled.")
    metadata = paper.metadata_ or {}
    return PaperSharePublicResponse(
        id=str(paper.id),
        name=paper.title,
        latex=paper.raw_latex,
        metadata=metadata,
        updated_at=paper.updated_at,
    )


@router.websocket("/ws/share/{token}")
async def share_yjs_websocket(websocket: WebSocket, token: str):
    await relay_share_websocket(websocket, token)
