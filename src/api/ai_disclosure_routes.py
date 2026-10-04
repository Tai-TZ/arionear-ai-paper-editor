from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db_session
from src.db.models import User
from src.models.ai_disclosure_schemas import AiDisclosureReport
from src.services.ai_disclosure import build_ai_disclosure_report, collect_ai_disclosure_inputs
from src.services.paper_service import get_paper

router = APIRouter(tags=["ai-disclosure"])


@router.get("/papers/{paper_id}/ai-disclosure", response_model=AiDisclosureReport)
def read_ai_disclosure_report(
    paper_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    """Deterministic AI Contribution Report for the owner's paper (read-only; inserts nothing)."""
    try:
        pid = uuid.UUID(paper_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid paper id.") from e

    paper = get_paper(db, user.id, pid)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found.")

    interactions, suggestions = collect_ai_disclosure_inputs(db, paper.id)
    return build_ai_disclosure_report(
        paper_id=str(paper.id),
        paper_title=paper.title,
        interactions=interactions,
        suggestions=suggestions,
    )
