from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db_session
from src.db.models import Paper, User
from src.models.schemas import PaperCreate, PaperResponse, PaperSummary, PaperUpdate
from src.services.paper_service import (
    create_paper,
    delete_paper,
    get_paper,
    list_papers,
    update_paper,
)

router = APIRouter(prefix="/papers", tags=["papers"])


def _to_summary(paper: Paper) -> PaperSummary:
    return PaperSummary(
        id=str(paper.id),
        name=paper.title,
        created_at=paper.created_at,
        updated_at=paper.updated_at,
    )


def _to_response(paper: Paper) -> PaperResponse:
    return PaperResponse(
        id=str(paper.id),
        name=paper.title,
        latex=paper.raw_latex,
        metadata=paper.metadata_ or {},
        created_at=paper.created_at,
        updated_at=paper.updated_at,
    )


@router.get("", response_model=list[PaperSummary])
async def list_user_papers(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    papers = list_papers(db, user.id)
    return [_to_summary(paper) for paper in papers]


@router.post("", response_model=PaperResponse, status_code=201)
async def create_user_paper(
    body: PaperCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    paper = create_paper(
        db,
        user.id,
        name=body.name,
        latex=body.latex,
        metadata=body.metadata,
    )
    return _to_response(paper)


@router.get("/{paper_id}", response_model=PaperResponse)
async def get_user_paper(
    paper_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    try:
        pid = uuid.UUID(paper_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid paper id.") from e

    paper = get_paper(db, user.id, pid)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found.")
    return _to_response(paper)


@router.patch("/{paper_id}", response_model=PaperResponse)
async def update_user_paper(
    paper_id: str,
    body: PaperUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    try:
        pid = uuid.UUID(paper_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid paper id.") from e

    paper = update_paper(
        db,
        user.id,
        pid,
        name=body.name,
        latex=body.latex,
        metadata=body.metadata,
        assets=body.assets or None,
    )
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found.")
    return _to_response(paper)


@router.delete("/{paper_id}", status_code=204)
async def delete_user_paper(
    paper_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    try:
        pid = uuid.UUID(paper_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid paper id.") from e

    if not delete_paper(db, user.id, pid):
        raise HTTPException(status_code=404, detail="Paper not found.")
