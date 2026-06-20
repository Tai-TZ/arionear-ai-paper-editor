import uuid

import pytest

from src.config import get_settings
from src.models.admin_schemas import LlmGlobalDefaults
from src.services.llm_policy import (
    get_llm_limits_from_profile,
    resolve_llm_temperature,
    write_global_defaults,
)
from src.services.quota_policy import QuotaExceededError, check_rate_limit, reset_rate_limit_state


@pytest.fixture
def policy_env(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    get_settings.cache_clear()
    yield tmp_path
    reset_rate_limit_state()
    get_settings.cache_clear()


def test_global_defaults_apply_to_users_without_custom_limits(policy_env):
    write_global_defaults(
        LlmGlobalDefaults(
            daily_token_max=50_000,
            monthly_cost_cap_usd=10.0,
            rate_limit_per_min=5,
            default_temperature=0.5,
        )
    )
    limits = get_llm_limits_from_profile(None)
    assert limits.daily_token_max == 50_000
    assert limits.monthly_cost_cap_usd == 10.0
    assert limits.rate_limit_per_min == 5


def test_profile_overrides_merge_on_top_of_global_defaults(policy_env):
    write_global_defaults(
        LlmGlobalDefaults(daily_token_max=80_000, monthly_cost_cap_usd=30.0, rate_limit_per_min=15)
    )
    limits = get_llm_limits_from_profile({"llm_limits": {"daily_token_max": 12_000}})
    assert limits.daily_token_max == 12_000
    assert limits.monthly_cost_cap_usd == 30.0


def test_resolve_llm_temperature_clamped(policy_env):
    write_global_defaults(LlmGlobalDefaults(min_temperature=0.1, max_temperature=1.0, default_temperature=0.3))
    assert resolve_llm_temperature(2.5) == 1.0
    assert resolve_llm_temperature(0.0) == 0.1
    assert resolve_llm_temperature(None) == 0.3


def test_rate_limit_blocks_burst():
    reset_rate_limit_state()
    uid = uuid.uuid4()
    for _ in range(3):
        check_rate_limit(uid, 3)
    with pytest.raises(QuotaExceededError):
        check_rate_limit(uid, 3)
