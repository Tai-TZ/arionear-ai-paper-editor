from __future__ import annotations

import uuid

from sqlalchemy import case, cast, func
from sqlalchemy.types import Integer

from src.db.engine import db_is_ready, get_db
from src.db.models import AiSession, Paper, TaskType


def estimate_tokens(text: str) -> int:
    """Rough token estimate (~4 chars per token) when provider usage is unavailable."""
    if not text:
        return 0
    return max(1, len(text) // 4)


def effective_tokens_expr():
    """DB expression: stored tokens, or estimate from ai_output when unset."""
    return case(
        (AiSession.tokens_used > 0, AiSession.tokens_used),
        else_=cast(func.coalesce(func.length(AiSession.ai_output), 0) / 4, Integer),
    )


def resolved_user_id_expr():
    """Prefer ai_sessions.user_id; fall back to paper owner."""
    return func.coalesce(AiSession.user_id, Paper.user_id)


def record_ai_usage(
    *,
    paper_id: str,
    task_type: str,
    user_input: str,
    ai_output: str,
    tokens_used: int | None = None,
    llm_provider: str | None = None,
    llm_model: str | None = None,
    revision_id: str | None = None,
) -> None:
    """Persist one AI interaction for admin usage / cost reporting (and the AI disclosure report)."""
    if not db_is_ready():
        return
    try:
        pid = uuid.UUID(paper_id)
    except ValueError:
        return

    task_map = {t.value.lower(): t for t in TaskType}
    task = task_map.get(task_type.lower(), TaskType.CHAT)
    input_text = user_input[:10_000]
    output_text = ai_output[:50_000]
    tokens = tokens_used
    if tokens is None:
        tokens = estimate_tokens(input_text) + estimate_tokens(output_text)

    try:
        with get_db() as db:
            paper = db.query(Paper).filter(Paper.id == pid).first()
            if not paper:
                return
            # Raw task name: TaskType has no EDIT member, so "edit" would otherwise be stored as CHAT.
            metadata: dict[str, str] = {"task": task_type.lower()}
            if revision_id:
                metadata["revision_id"] = revision_id
            if llm_provider:
                metadata["llm_provider"] = llm_provider
            if llm_model:
                metadata["llm_model"] = llm_model
            session = AiSession(
                paper_id=pid,
                user_id=paper.user_id,
                task_type=task,
                user_input=input_text,
                ai_output=output_text,
                tokens_used=max(int(tokens), 0),
                metadata_=metadata,
            )
            db.add(session)
    except Exception:
        # Usage tracking must never break the chat pipeline.
        return
