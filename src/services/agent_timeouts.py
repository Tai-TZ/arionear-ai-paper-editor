from __future__ import annotations

from src.services.llm import is_reasoning_model

# Default for tests and legacy imports.
AGENT_TASK_TIMEOUT_SEC = 120.0

_TASK_BASE_TIMEOUT_SEC: dict[str, float] = {
    "edit": 120.0,
    "style": 120.0,
    "structure": 90.0,
    "citation": 90.0,
    "template": 60.0,
    "chat": 90.0,
}

_REASONING_MULTIPLIER = 1.5
_MAX_AGENT_TIMEOUT_SEC = 180.0


def compute_agent_task_timeout_sec(task: str, model: str | None = None) -> float:
    """Task-aware agent timeout; reasoning models get extra headroom."""
    base = _TASK_BASE_TIMEOUT_SEC.get((task or "").strip().lower(), AGENT_TASK_TIMEOUT_SEC)
    if is_reasoning_model(model):
        base = min(base * _REASONING_MULTIPLIER, _MAX_AGENT_TIMEOUT_SEC)
    return base
