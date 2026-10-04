"""Peer-review response assistant — drafts point-by-point replies to reviewer comments.

Comment-only: the endpoint returns drafts and proposed changes; it never edits the manuscript.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException

from src.api.agent_deps import assert_paper_session_access, get_agent_user_id
from src.models.peer_review_schemas import PeerReviewRequest, PeerReviewResponse
from src.services.llm_errors import friendly_llm_error
from src.services.peer_review import PeerReviewError, respond_to_reviews
from src.services.quota_policy import QuotaExceededError

logger = logging.getLogger(__name__)

router = APIRouter()

_ERROR_STATUS = {"timeout": 504, "parse_failed": 502}


@router.post("/review/respond", response_model=PeerReviewResponse)
async def review_respond(
    request: PeerReviewRequest,
    user_id: uuid.UUID | None = Depends(get_agent_user_id),
) -> PeerReviewResponse:
    """Split reviewer comments into classified items and draft a response + proposed change for each."""
    assert_paper_session_access(request.session_id or "", user_id)
    try:
        return await respond_to_reviews(request, user_id=user_id)
    except QuotaExceededError as exc:
        raise HTTPException(status_code=429, detail={"code": "quota_exceeded", "message": str(exc)}) from exc
    except PeerReviewError as exc:
        logger.warning("review_respond failed (%s): %s", exc.code, exc)
        raise HTTPException(
            status_code=_ERROR_STATUS.get(exc.code, 502),
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
    except Exception as exc:
        logger.exception("review_respond LLM failure: %s", exc)
        raise HTTPException(
            status_code=502,
            detail={"code": "llm_error", "message": friendly_llm_error(exc)},
        ) from exc
