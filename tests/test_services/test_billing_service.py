"""Tests for billing subscription and defense turn quota."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest

from src.db.models import UserTier
from src.services.billing_service import (
    FREE_DEFENSE_TURNS,
    PRO_DEFENSE_TURNS,
    assert_defense_allowed,
    get_billing_status,
    get_or_create_subscription,
    record_defense_turn,
    upgrade_to_pro,
)
from src.services.defense_quota import defense_quota_status
from src.services.quota_policy import QuotaExceededError


def _mock_db_with_subscription(*, tier: UserTier = UserTier.FREE, turns_used: int = 0):
    sub = MagicMock()
    sub.tier = tier
    sub.defense_turns_used = turns_used
    sub.upgraded_at = None
    sub.turns_reset_at = datetime.now(UTC)
    sub.created_at = MagicMock()
    sub.created_at.isoformat.return_value = "2026-06-26T00:00:00+00:00"

    db = MagicMock()
    query = MagicMock()
    query.filter.return_value.first.return_value = sub
    db.query.return_value = query
    return db, sub


def test_plan_limits():
    assert FREE_DEFENSE_TURNS == 5
    assert PRO_DEFENSE_TURNS == 50


def test_get_billing_status_free_user():
    user = MagicMock(id=uuid.uuid4())
    db, sub = _mock_db_with_subscription(tier=UserTier.FREE, turns_used=2)

    status = get_billing_status(db, user)

    assert status["tier"] == "free"
    assert status["defense_turns_limit"] == FREE_DEFENSE_TURNS
    assert status["defense_turns_used"] == 2
    assert status["defense_turns_remaining"] == FREE_DEFENSE_TURNS - 2


def test_defense_quota_status_adapter():
    user = MagicMock(id=uuid.uuid4())
    db, _ = _mock_db_with_subscription(tier=UserTier.PRO, turns_used=10)

    status = defense_quota_status(db, user)

    assert status["plan"] == "pro"
    assert status["limit"] == PRO_DEFENSE_TURNS
    assert status["used"] == 10
    assert status["remaining"] == PRO_DEFENSE_TURNS - 10
    assert status["period"] == "day"
    assert status["period_type"] == "daily"
    assert status["resets_at"] is not None


def test_assert_blocks_when_exhausted():
    user = MagicMock(id=uuid.uuid4())
    db, _ = _mock_db_with_subscription(tier=UserTier.FREE, turns_used=FREE_DEFENSE_TURNS)

    with pytest.raises(QuotaExceededError):
        assert_defense_allowed(db, user)


def test_record_defense_turn_increments():
    user = MagicMock(id=uuid.uuid4())
    db, sub = _mock_db_with_subscription(tier=UserTier.FREE, turns_used=1)

    record_defense_turn(db, user)

    assert sub.defense_turns_used == 2
    db.flush.assert_called()


def test_get_or_create_subscription_creates_when_missing():
    user_id = uuid.uuid4()
    db = MagicMock()
    query = MagicMock()
    query.filter.return_value.first.return_value = None
    db.query.return_value = query

    sub = get_or_create_subscription(db, user_id)

    db.add.assert_called_once()
    db.flush.assert_called()
    assert sub.user_id == user_id
    assert sub.tier == UserTier.FREE


def test_upgrade_to_pro():
    user = MagicMock(id=uuid.uuid4())
    db, sub = _mock_db_with_subscription(tier=UserTier.FREE, turns_used=3)

    status = upgrade_to_pro(db, user)

    assert sub.tier == UserTier.PRO
    assert sub.upgraded_at is not None
    assert status["tier"] == "pro"
    assert status["defense_turns_limit"] == PRO_DEFENSE_TURNS


def test_free_quota_resets_after_period_end():
    user = MagicMock(id=uuid.uuid4())
    db, sub = _mock_db_with_subscription(tier=UserTier.FREE, turns_used=FREE_DEFENSE_TURNS)
    sub.turns_reset_at = datetime.now(UTC) - timedelta(days=1)

    status = get_billing_status(db, user)

    assert sub.defense_turns_used == 0
    assert status["defense_turns_used"] == 0
    assert status["defense_turns_remaining"] == FREE_DEFENSE_TURNS


def test_pro_quota_resets_after_period_end():
    user = MagicMock(id=uuid.uuid4())
    db, sub = _mock_db_with_subscription(tier=UserTier.PRO, turns_used=PRO_DEFENSE_TURNS)
    sub.turns_reset_at = datetime.now(UTC) - timedelta(days=1)

    status = get_billing_status(db, user)

    assert sub.defense_turns_used == 0
    assert status["defense_turns_used"] == 0
    assert status["defense_turns_remaining"] == PRO_DEFENSE_TURNS
