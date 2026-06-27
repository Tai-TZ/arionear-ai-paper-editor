"""Thin adapter — delegates all quota logic to billing_service.

Kept for backward compat: defense_stream.py imports assert_defense_allowed
and record_defense_turn from here.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from src.db.models import User
from src.services.billing_service import (
    FREE_DEFENSE_TURNS,
    PRO_DEFENSE_TURNS,
    assert_defense_allowed,
    daily_quota_resets_at_iso,
    get_billing_status,
    get_or_create_subscription,
    record_defense_turn,
    upgrade_to_pro,
)

__all__ = [
    "FREE_DEFENSE_TURNS",
    "PRO_DEFENSE_TURNS",
    "assert_defense_allowed",
    "defense_quota_status",
    "get_or_create_subscription",
    "record_defense_turn",
    "upgrade_to_pro",
]


def defense_quota_status(db: Session, user: User) -> dict:
    """Legacy helper used by defense_routes GET /defense/quota."""
    status = get_billing_status(db, user)
    return {
        "plan": status["tier"],
        "limit": status["defense_turns_limit"],
        "used": status["defense_turns_used"],
        "remaining": status["defense_turns_remaining"],
        "period": "day",
        "period_type": "daily",
        "resets_at": daily_quota_resets_at_iso(),
    }
