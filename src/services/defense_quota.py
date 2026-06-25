"""Per-plan defense (mock viva) question turn limits."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from src.db.models import User
from src.services.quota_policy import QuotaExceededError

SubscriptionPlan = Literal["free", "pro"]
PeriodType = Literal["daily", "monthly"]

FREE_DEFENSE_TURNS = 5
PRO_DEFENSE_TURNS = 25

# Set to True when re-enabling per-plan defense turn limits.
DEFENSE_QUOTA_ENABLED = False

DEFENSE_QUOTA_DAILY = "DEFENSE_QUOTA_DAILY"
DEFENSE_QUOTA_MONTHLY = "DEFENSE_QUOTA_MONTHLY"


def get_subscription_plan(profile_settings: dict | None) -> SubscriptionPlan:
    raw = (profile_settings or {}).get("subscription_plan", "free")
    return "pro" if raw == "pro" else "free"


def get_defense_turn_limit(plan: SubscriptionPlan) -> int:
    return PRO_DEFENSE_TURNS if plan == "pro" else FREE_DEFENSE_TURNS


def get_period_type(plan: SubscriptionPlan) -> PeriodType:
    return "monthly" if plan == "pro" else "daily"


def _current_period(plan: SubscriptionPlan) -> str:
    now = datetime.now(UTC)
    if plan == "pro":
        return now.strftime("%Y-%m")
    return now.strftime("%Y-%m-%d")


def get_defense_turns_used(profile_settings: dict | None, *, plan: SubscriptionPlan) -> int:
    raw = (profile_settings or {}).get("defense_usage")
    if not isinstance(raw, dict):
        return 0
    if raw.get("period") != _current_period(plan):
        return 0
    try:
        return max(0, int(raw.get("turns", 0)))
    except (TypeError, ValueError):
        return 0


def defense_quota_status(user: User) -> dict[str, int | str]:
    if not DEFENSE_QUOTA_ENABLED:
        return {
            "plan": "free",
            "limit": 9999,
            "used": 0,
            "remaining": 9999,
            "period": _current_period("free"),
            "period_type": "daily",
        }
    settings = user.profile_settings or {}
    plan = get_subscription_plan(settings)
    limit = get_defense_turn_limit(plan)
    used = get_defense_turns_used(settings, plan=plan)
    remaining = max(0, limit - used)
    return {
        "plan": plan,
        "limit": limit,
        "used": used,
        "remaining": remaining,
        "period": _current_period(plan),
        "period_type": get_period_type(plan),
    }


def assert_defense_allowed(user: User) -> None:
    if not DEFENSE_QUOTA_ENABLED:
        return
    status = defense_quota_status(user)
    if int(status["remaining"]) <= 0:
        plan = status["plan"]
        limit = int(status["limit"])
        if plan == "pro":
            raise QuotaExceededError(
                f"{DEFENSE_QUOTA_MONTHLY}:You have used all {limit} defense turns for this month."
            )
        raise QuotaExceededError(
            f"{DEFENSE_QUOTA_DAILY}:You have used all {limit} free defense turns for today."
        )


def record_defense_turn(db: Session, user: User) -> None:
    if not DEFENSE_QUOTA_ENABLED:
        return
    settings = dict(user.profile_settings or {})
    plan = get_subscription_plan(settings)
    period = _current_period(plan)
    usage = settings.get("defense_usage")
    if not isinstance(usage, dict) or usage.get("period") != period:
        usage = {"period": period, "turns": 0}
    usage["turns"] = int(usage.get("turns", 0)) + 1
    settings["defense_usage"] = usage
    user.profile_settings = settings
    flag_modified(user, "profile_settings")
    db.flush()
