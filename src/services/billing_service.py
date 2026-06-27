"""Billing service — subscription tiers and defense turn quota.

V1: FREE (5 turns) / PRO (50 turns), QR-based mock payment.
V2: Stripe/PayOS — add stripe_customer_id, stripe_subscription_id to
    UserSubscription, replace create_checkout_session with
    stripe.checkout.sessions.create() and confirm_checkout with
    webhook signature verification.
"""
from __future__ import annotations

import base64
import io
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import qrcode
import qrcode.image.pil
from sqlalchemy.orm import Session

from src.db.models import User, UserSubscription, UserTier
from src.services.quota_policy import QuotaExceededError

logger = logging.getLogger(__name__)

UserTierLabel = Literal["free", "pro"]

FREE_DEFENSE_TURNS: int = 5
PRO_DEFENSE_TURNS: int = 50

PLAN_LIMITS: dict[str, int] = {
    UserTier.FREE: FREE_DEFENSE_TURNS,
    UserTier.PRO: PRO_DEFENSE_TURNS,
}

# ─── QR Checkout sessions ─────────────────────────────────────────────────────
# In-memory store: {checkout_id → session_data}
# V2: replace with Stripe Session IDs persisted to DB/Redis.

_pending_checkouts: dict[str, dict[str, Any]] = {}
CHECKOUT_TTL_MINUTES: int = 15


def _generate_qr_png_b64(data: str) -> str:
    """Render *data* as a QR code and return a base-64 encoded PNG string."""
    img = qrcode.make(data)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


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


def create_checkout_session(user: User) -> str:
    """Create a short-lived QR checkout token for the given user.

    Returns the opaque checkout_id; the caller is responsible for building
    the confirm_url and generating the QR image.

    V2 path: call stripe.checkout.sessions.create(…) here and return the
    Stripe session ID instead.
    """
    user_id_str = str(user.id)

    # Invalidate any previous un-used checkout for this user to avoid orphans.
    stale = [
        k for k, v in _pending_checkouts.items()
        if v["user_id"] == user_id_str and not v["used"]
    ]
    for k in stale:
        del _pending_checkouts[k]

    checkout_id = secrets.token_urlsafe(32)
    _pending_checkouts[checkout_id] = {
        "user_id": user_id_str,
        "expires_at": datetime.now(UTC) + timedelta(minutes=CHECKOUT_TTL_MINUTES),
        "used": False,
    }
    logger.info("Checkout session created for user %s (id=%s)", user.email, checkout_id[:8])
    return checkout_id


def confirm_checkout(db: Session, checkout_id: str) -> dict | None:
    """Validate a QR token and upgrade the user to Pro.

    Returns None if token is invalid/expired, otherwise the billing status dict.
    Returns {"already_confirmed": True} if already used (idempotent).

    V2 path: verify Stripe webhook signature, extract session from event,
    then call upgrade_to_pro().
    """
    session_data = _pending_checkouts.get(checkout_id)
    if session_data is None:
        return None
    if session_data["used"]:
        return {"already_confirmed": True}
    if datetime.now(UTC) > session_data["expires_at"]:
        del _pending_checkouts[checkout_id]
        logger.info("Checkout session %s expired", checkout_id[:8])
        return None

    user = db.query(User).filter(User.id == session_data["user_id"]).first()
    if user is None:
        logger.warning("Checkout confirm: user %s not found", session_data["user_id"])
        return None

    billing_data = upgrade_to_pro(db, user)
    db.commit()
    session_data["used"] = True
    logger.info("User %s upgraded to Pro via QR checkout", user.email)
    return billing_data


def upgrade_to_pro(db: Session, user: User) -> dict:
    """Flip user tier to Pro and persist.

    Called internally by confirm_checkout() after payment verification.
    V2: only call this from the Stripe webhook handler, never directly.
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
