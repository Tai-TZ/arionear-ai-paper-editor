"""Unified pre-LLM request guard — scope + prompt injection."""

from __future__ import annotations

from src.services.guardrails.editor_scope import evaluate_editor_scope
from src.services.guardrails.prompt_injection import evaluate_prompt_injection


def evaluate_user_request(
    query: str,
    *,
    locale: str | None = None,
    history: list | None = None,
) -> tuple[bool, str]:
    """Return (allowed, refusal_message). Checks run before any LLM call."""
    allowed, refusal = evaluate_prompt_injection(query, locale=locale, history=history)
    if not allowed:
        return False, refusal
    return evaluate_editor_scope(query, locale=locale)
