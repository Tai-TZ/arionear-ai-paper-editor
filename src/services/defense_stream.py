"""SSE streaming service for the defense / mock-viva agent."""
from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import AIMessageChunk, HumanMessage, SystemMessage

from src.config import get_settings
from src.db.engine import db_is_ready, get_db
from src.db.models import User
from src.models.schemas import DefenseRequest
from src.services.defense_quota import assert_defense_allowed, record_defense_turn
from src.services.llm import get_llm
from src.services.llm_errors import friendly_llm_error
from src.services.prompts import get_prompt, render_template
from src.services.quota_policy import QuotaExceededError

# Proxy/ASGI buffering workaround — same as chat_stream.py
_SSE_FLUSH_PAD = ": " + (" " * 2048) + "\n\n"
_KEEPALIVE_SSE = ": keepalive\n\n"


async def flush_sse_stream(source: AsyncIterator[str]) -> AsyncIterator[bytes]:
    """Yield each SSE chunk immediately (defeats proxy buffering)."""
    first = True
    async for chunk in source:
        if first:
            yield _SSE_FLUSH_PAD.encode("utf-8")
            first = False
        payload = chunk.encode("utf-8") if isinstance(chunk, str) else chunk
        yield payload
        if isinstance(chunk, str) and len(payload) < 2048:
            yield _SSE_FLUSH_PAD.encode("utf-8")
        await asyncio.sleep(0)


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _build_system_message(latex_content: str, mode: str, turn_count: int) -> str:
    """Render the defense council system prompt with paper context."""
    system_template = get_prompt("defense_council_member", "system")
    user_template = get_prompt("defense_council_member", "user")

    # Truncate very large papers to ~60 000 chars to stay within context window
    truncated = latex_content[:60_000]
    if len(latex_content) > 60_000:
        truncated += "\n\n[... bản thảo bị rút ngắn để phù hợp ngữ cảnh ...]"

    user_section = render_template(
        user_template,
        latex_content=truncated,
        turn_count=str(turn_count),
        mode=mode,
    )

    return f"{system_template.strip()}\n\n{user_section.strip()}"


async def _stream_tokens(llm: Any, messages: list) -> AsyncIterator[str]:
    """Yield token deltas from llm.astream(), handling thinking models."""
    async for chunk in llm.astream(messages):
        if not isinstance(chunk, AIMessageChunk):
            continue
        # Standard text content
        if isinstance(chunk.content, str) and chunk.content:
            yield chunk.content
        elif isinstance(chunk.content, list):
            for part in chunk.content:
                if isinstance(part, dict) and part.get("type") == "text":
                    text = part.get("text", "")
                    if text:
                        yield text
        # Thinking / reasoning delta (ZAI, MiniMax M3)
        reasoning = getattr(chunk, "additional_kwargs", {}).get("reasoning_content")
        if reasoning:
            pass  # skip thinking tokens from the council output


async def stream_defense(
    request: DefenseRequest,
    *,
    user_id: uuid.UUID | None = None,
) -> AsyncIterator[str]:
    """
    Main SSE generator for the defense agent.

    Events emitted (same shape as chat_stream.py):
      activity  → {"text": "..."}
      token     → {"delta": "..."}
      done      → {"response": "<full assembled text>"}
      error     → {"message": "..."}
    """
    settings = get_settings()

    if user_id is not None and db_is_ready():
        try:
            with get_db() as db:
                user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
                if user:
                    assert_defense_allowed(user)
        except QuotaExceededError as exc:
            yield _sse("error", {"message": str(exc)})
            return

    try:
        llm = get_llm(
            provider=request.llm_provider,
            model=request.llm_model or None,
            temperature=0.7,
        )
    except Exception as exc:
        yield _sse("error", {"message": friendly_llm_error(exc)})
        return

    # Build conversation messages
    turn_count = len(request.conversation_history)
    system_content = _build_system_message(request.latex_content, request.mode, turn_count)

    messages: list = [SystemMessage(content=system_content)]

    # Inject conversation history as alternating Human/AI messages
    for turn in request.conversation_history:
        if turn.role == "user":
            messages.append(HumanMessage(content=turn.content))
        else:
            from langchain_core.messages import AIMessage
            messages.append(AIMessage(content=turn.content))

    # If starting fresh (proactive mode), the system prompt already instructs
    # the model to open the session — no extra human message needed.
    # If it's a follow-up, the last human message from history drives the next turn.
    # If history is empty (first call), add a trigger so the LLM starts the session.
    if not request.conversation_history:
        messages.append(
            HumanMessage(content="[Bắt đầu phiên phản biện]")
        )

    # Emit initial activity
    activity_text = (
        "Đang phân tích bản thảo nghiên cứu..."
        if turn_count == 0
        else "Đang soạn câu hỏi tiếp theo..."
    )
    yield _sse("activity", {"text": activity_text})

    # Stream tokens
    assembled: list[str] = []
    try:
        async for delta in _stream_tokens(llm, messages):
            assembled.append(delta)
            yield _sse("token", {"delta": delta})
            # keepalive every ~50 tokens to prevent proxy timeouts
            if len(assembled) % 50 == 0:
                yield _KEEPALIVE_SSE
    except Exception as exc:
        err_msg = friendly_llm_error(exc)
        yield _sse("error", {"message": err_msg})
        return

    full_response = "".join(assembled)
    yield _sse("done", {"response": full_response})

    if user_id is not None and full_response.strip() and db_is_ready():
        try:
            with get_db() as db:
                user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
                if user:
                    record_defense_turn(db, user)
        except Exception:
            pass
