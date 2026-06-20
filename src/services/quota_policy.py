from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from src.db.engine import db_is_ready, get_db
from src.db.models import AiSession, Paper, User
from src.services.llm_policy import cost_rate_per_token, get_llm_limits_from_profile
from src.services.usage_tracking import effective_tokens_expr, resolved_user_id_expr

_rate_buckets: dict[str, list[float]] = {}


class QuotaExceededError(ValueError):
    """Raised when a user exceeds LLM quota or rate limits."""


def reset_rate_limit_state() -> None:
    """Test helper — clear in-memory rate limit buckets."""
    _rate_buckets.clear()


def resolve_paper_user_id(paper_id: str | None) -> uuid.UUID | None:
    if not paper_id or not db_is_ready():
        return None
    try:
        pid = uuid.UUID(paper_id)
    except ValueError:
        return None
    try:
        with get_db() as db:
            paper = db.query(Paper).filter(Paper.id == pid).first()
            return paper.user_id if paper else None
    except Exception:
        return None


def _meaningful_session_filter():
    return or_(
        AiSession.tokens_used > 0,
        func.coalesce(func.length(AiSession.ai_output), 0) > 0,
        func.coalesce(func.length(AiSession.user_input), 0) > 0,
    )


def _sum_tokens_for_user(
    db: Session,
    user_id: uuid.UUID,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
) -> int:
    token_expr = effective_tokens_expr()
    query = (
        db.query(func.coalesce(func.sum(token_expr), 0))
        .outerjoin(Paper, AiSession.paper_id == Paper.id)
        .filter(resolved_user_id_expr() == user_id)
        .filter(_meaningful_session_filter())
    )
    if start is not None:
        query = query.filter(AiSession.created_at >= start)
    if end is not None:
        query = query.filter(AiSession.created_at < end)
    return int(query.scalar() or 0)


def check_rate_limit(user_id: uuid.UUID, limit_per_min: int) -> None:
    now = time.time()
    key = str(user_id)
    bucket = _rate_buckets.setdefault(key, [])
    bucket[:] = [t for t in bucket if now - t < 60]
    if len(bucket) >= limit_per_min:
        raise QuotaExceededError(
            f"Rate limit exceeded ({limit_per_min} requests per minute). Please wait and try again."
        )
    bucket.append(now)


def assert_llm_allowed(db: Session, user: User) -> None:
    """Raise QuotaExceededError if the user may not call the LLM."""
    limits = get_llm_limits_from_profile(user.profile_settings)
    if not limits.llm_enabled:
        raise QuotaExceededError("LLM access is disabled for your account. Contact the platform admin.")

    check_rate_limit(user.id, limits.rate_limit_per_min)

    now = datetime.now(UTC)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 12:
        month_end = datetime(now.year + 1, 1, 1, tzinfo=UTC)
    else:
        month_end = datetime(now.year, now.month + 1, 1, tzinfo=UTC)

    daily_tokens = _sum_tokens_for_user(db, user.id, start=day_start, end=day_start + timedelta(days=1))
    if daily_tokens >= limits.daily_token_max:
        raise QuotaExceededError(
            f"Daily token limit reached ({limits.daily_token_max:,} tokens). Try again tomorrow or contact admin."
        )

    monthly_tokens = _sum_tokens_for_user(db, user.id, start=month_start, end=month_end)
    monthly_cost = monthly_tokens * cost_rate_per_token()
    if monthly_cost >= limits.monthly_cost_cap_usd:
        raise QuotaExceededError(
            f"Monthly cost cap reached (${limits.monthly_cost_cap_usd:.2f} estimated). Contact admin to increase your quota."
        )


def enforce_llm_quota_for_paper(paper_id: str | None) -> None:
    """Check quota for the owner of a paper/session. Skips if unauthenticated paper."""
    if not db_is_ready():
        return
    user_id = resolve_paper_user_id(paper_id)
    if not user_id:
        return
    with get_db() as db:
        user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
        if not user:
            return
        assert_llm_allowed(db, user)
