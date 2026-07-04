from src.services.agent_timeouts import (
    AGENT_TASK_TIMEOUT_SEC,
    compute_agent_task_timeout_sec,
)


def test_default_edit_timeout():
    assert compute_agent_task_timeout_sec("edit", None) == 120.0


def test_reasoning_model_gets_extra_headroom():
    assert compute_agent_task_timeout_sec("edit", "nvidia/nemotron") == 180.0


def test_legacy_constant_matches_default():
    assert AGENT_TASK_TIMEOUT_SEC == 120.0
