"""Tests for defense turn quota policy."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from src.services.defense_quota import (
    FREE_DEFENSE_TURNS,
    PRO_DEFENSE_TURNS,
    assert_defense_allowed,
    defense_quota_status,
    get_defense_turn_limit,
    get_defense_turns_used,
    get_subscription_plan,
    record_defense_turn,
)
from src.services.quota_policy import QuotaExceededError


def test_free_plan_default_limit():
    assert get_subscription_plan({}) == "free"
    assert get_defense_turn_limit("free") == FREE_DEFENSE_TURNS
    assert FREE_DEFENSE_TURNS == 5


def test_pro_plan_limit():
    assert get_subscription_plan({"subscription_plan": "pro"}) == "pro"
    assert get_defense_turn_limit("pro") == PRO_DEFENSE_TURNS
    assert PRO_DEFENSE_TURNS >= 10


def test_usage_resets_on_new_period():
    settings = {"defense_usage": {"period": "2020-01-01", "turns": 4}}
    assert get_defense_turns_used(settings, plan="free") == 0


@patch("src.services.defense_quota.DEFENSE_QUOTA_ENABLED", True)
@patch("src.services.defense_quota._current_period", return_value="2026-06-25")
def test_usage_counts_current_daily_period(mock_period):
    settings = {"defense_usage": {"period": "2026-06-25", "turns": 3}}
    assert get_defense_turns_used(settings, plan="free") == 3
    status = defense_quota_status(MagicMock(profile_settings=settings))
    assert status["used"] == 3
    assert status["remaining"] == FREE_DEFENSE_TURNS - 3
    assert status["period_type"] == "daily"


@patch("src.services.defense_quota.DEFENSE_QUOTA_ENABLED", True)
@patch("src.services.defense_quota._current_period", return_value="2026-06")
def test_pro_usage_monthly_period(mock_period):
    settings = {
        "subscription_plan": "pro",
        "defense_usage": {"period": "2026-06", "turns": 2},
    }
    status = defense_quota_status(MagicMock(profile_settings=settings))
    assert status["period_type"] == "monthly"
    assert status["used"] == 2


@patch("src.services.defense_quota.DEFENSE_QUOTA_ENABLED", True)
@patch("src.services.defense_quota._current_period", return_value="2026-06-25")
def test_assert_blocks_when_exhausted(mock_period):
    settings = {
        "subscription_plan": "free",
        "defense_usage": {"period": "2026-06-25", "turns": FREE_DEFENSE_TURNS},
    }
    user = MagicMock(profile_settings=settings)
    with pytest.raises(QuotaExceededError):
        assert_defense_allowed(user)


@patch("src.services.defense_quota.DEFENSE_QUOTA_ENABLED", True)
@patch("src.services.defense_quota._current_period", return_value="2026-06-25")
def test_record_defense_turn_increments(mock_period):
    user = MagicMock(id=uuid.uuid4(), profile_settings={})
    db = MagicMock()
    record_defense_turn(db, user)
    assert user.profile_settings["defense_usage"]["turns"] == 1
    assert user.profile_settings["defense_usage"]["period"] == "2026-06-25"
    db.flush.assert_called_once()
