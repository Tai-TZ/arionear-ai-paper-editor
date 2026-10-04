"""Cost / latency bounds for the peer-review response pipeline."""

from __future__ import annotations

from src.services.llm import is_reasoning_model

# Input caps (characters) — anything beyond is truncated before it reaches the LLM.
MAX_COMMENTS_CHARS = 24_000
MAX_MANUSCRIPT_CHARS = 30_000
MAX_OUTLINE_SECTIONS = 40

# Output caps.
MAX_ITEMS = 30
DRAFT_BATCH_SIZE = 6
DRAFT_CONCURRENCY = 3
MAX_QUOTE_CHARS = 2_000
MAX_SUMMARY_CHARS = 300
MAX_RESPONSE_CHARS = 4_000
MAX_CHANGE_CHARS = 2_000
MAX_SECTION_REFS = 5
# Bad output echoed back to the model in the single repair attempt.
MAX_REPAIR_ECHO_CHARS = 6_000

# Per-call timeouts (seconds); reasoning models get extra headroom like agent_timeouts.py.
SPLIT_TIMEOUT_SEC = 90.0
DRAFT_TIMEOUT_SEC = 120.0
_REASONING_MULTIPLIER = 1.5
# Whole pipeline budget so the (non-streaming) HTTP request stays under typical proxy limits.
PIPELINE_BUDGET_SEC = 280.0

# Sampling temperatures (clamped by admin policy via resolve_llm_temperature).
SPLIT_TEMPERATURE = 0.1
DRAFT_TEMPERATURE = 0.4


def stage_timeout_sec(base: float, model: str | None) -> float:
    if is_reasoning_model(model):
        return base * _REASONING_MULTIPLIER
    return base
