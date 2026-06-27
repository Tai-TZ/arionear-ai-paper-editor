"""Billing service — subscription tiers and defense turn quota.

V1: FREE (5 turns) / PRO (50 turns), no real payment gateway.
    Stripe/PayOS integration ready: add stripe_customer_id, stripe_subscription_id
    columns to UserSubscription when moving to V2.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from sqlalchemy.orm import Session

from src.db.models import User, UserSubscription, UserTier
from src.services.quota_policy import QuotaExceededError

UserTierLabel = Literal["free", "pro"]

FREE_DEFENSE_TURNS: int = 5
PRO_DEFENSE_TURNS: int = 50

PLAN_LIMITS: dict[str, int] = {
    UserTier.FREE: FREE_DEFENSE_TURNS,
    UserTier.PRO: PRO_DEFENSE_TURNS,
}


# ─── Internal helpers ────────────────────────────────────────────────────────


def get_or_create_subscription(db: Session, user_id: object) -> UserSubscription:
    """Return existing UserSubscription, or create a FREE one on first access."""
    sub = db.query(UserSubscription).filter(UserSubscription.user_id == user_id).first()
    if sub is None:
        sub = UserSubscription(
            user_id=user_id,
            tier=UserTier.FREE,
            defense_turns_used=0,
            turns_reset_at=datetime.now(UTC),
        )
        db.add(sub)
        db.flush()
    return sub


# ─── Public API ──────────────────────────────────────────────────────────────


def get_billing_status(db: Session, user: User) -> dict:
    """Return serialisable billing status for the authenticated user.

    Shape mirrors BillingStatusResponse pydantic model.
    """
    sub = get_or_create_subscription(db, user.id)
    limit = PLAN_LIMITS[sub.tier]
    used = sub.defense_turns_used
    remaining = max(0, limit - used)
    return {
        "tier": sub.tier.lower(),
        "defense_turns_limit": limit,
        "defense_turns_used": used,
        "defense_turns_remaining": remaining,
        "upgraded_at": sub.upgraded_at.isoformat() if sub.upgraded_at else None,
        "created_at": sub.created_at.isoformat(),
    }


def upgrade_to_pro(db: Session, user: User) -> dict:
    """Mock-upgrade user to Pro tier (no payment required in V1).

    In V2: call Stripe Checkout here and only flip tier after webhook confirms.
    """
    sub = get_or_create_subscription(db, user.id)
    sub.tier = UserTier.PRO
    sub.upgraded_at = datetime.now(UTC)
    db.flush()
    return get_billing_status(db, user)


def assert_defense_allowed(db: Session, user: User) -> None:
    """Raise QuotaExceededError when user has exhausted their defense turns."""
    sub = get_or_create_subscription(db, user.id)
    limit = PLAN_LIMITS[sub.tier]
    if sub.defense_turns_used >= limit:
        tier_label = sub.tier.lower()
        if tier_label == "pro":
            raise QuotaExceededError(
                f"PRO_QUOTA_EXCEEDED:You have used all {limit} Pro defense turns. "
                "Contact support to reset your quota."
            )
        raise QuotaExceededError(
            f"FREE_QUOTA_EXCEEDED:You have used all {FREE_DEFENSE_TURNS} free defense turns. "
            "Upgrade to Pro for 50 turns per month."
        )


def record_defense_turn(db: Session, user: User) -> None:
    """Increment the defense turn counter for the given user."""
    sub = get_or_create_subscription(db, user.id)
    sub.defense_turns_used += 1
    db.flush()
