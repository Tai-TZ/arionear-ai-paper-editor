"""Entry point used by the API: quota gate → pipeline → usage accounting."""

from __future__ import annotations

import asyncio
import logging
import uuid

from src.db.engine import db_is_ready, get_db
from src.db.models import User
from src.models.peer_review_schemas import PeerReviewRequest, PeerReviewResponse
from src.services.peer_review.pipeline import run_peer_review_pipeline
from src.services.quota_policy import assert_llm_allowed, enforce_llm_quota_for_paper
from src.services.usage_tracking import record_ai_usage

logger = logging.getLogger(__name__)

USAGE_TASK_TYPE = "peer_review"  # stored as TaskType.CHAT (no dedicated enum value yet)


def enforce_peer_review_quota(user_id: uuid.UUID | None, session_id: str | None) -> None:
    """Same LLM policy as the editor chat: enabled flag, rate limit, daily tokens, monthly cost.

    Raises QuotaExceededError. No-op without a database (in-memory dev/test mode).
    """
    if not db_is_ready():
        return
    if user_id is None:
        enforce_llm_quota_for_paper(session_id)
        return
    with get_db() as db:
        user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
        if user:
            assert_llm_allowed(db, user)


def _usage_output(response: PeerReviewResponse) -> str:
    return "\n\n".join(f"[{item.id}] {item.response}" for item in response.items if item.response)


async def respond_to_reviews(request: PeerReviewRequest, *, user_id: uuid.UUID | None) -> PeerReviewResponse:
    await asyncio.to_thread(enforce_peer_review_quota, user_id, request.session_id)
    run = await run_peer_review_pipeline(request)
    if request.session_id:
        try:
            await asyncio.to_thread(
                record_ai_usage,
                paper_id=request.session_id,
                task_type=USAGE_TASK_TYPE,
                user_input=request.comments,
                ai_output=_usage_output(run.response),
                tokens_used=run.tokens,
                llm_provider=run.response.provider,
                llm_model=run.response.model,
            )
        except Exception as exc:  # usage tracking must never break the response
            logger.warning("peer_review: usage tracking failed: %s", exc)
    return run.response
