"""SSE streaming service for the defense viva agent."""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import AIMessageChunk, HumanMessage, SystemMessage

from src.db.engine import db_is_ready, get_db
from src.db.models import User
from src.models.schemas import DefenseConversationTurn, DefenseRequest
from src.services.defense_citations import prepare_defense_council_markdown
from src.services.defense_quota import assert_defense_allowed, record_defense_turn
from src.services.llm import get_llm
from src.services.llm_errors import friendly_llm_error
from src.services.prompts import get_prompt, render_template
from src.services.quota_policy import QuotaExceededError

logger = logging.getLogger(__name__)

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


_BOILERPLATE_OPENERS = (
    "tôi ghi nhận điều đó",
    "i acknowledge that",
    "i note that",
    "cảm ơn bạn",
    "thank you",
)


def strip_defense_boilerplate_opening(text: str) -> str:
    """Remove generic acknowledgment openers models overuse in follow-up turns."""
    stripped = text.lstrip()
    lower = stripped.lower()
    for opener in _BOILERPLATE_OPENERS:
        if lower.startswith(opener):
            stripped = stripped[len(opener) :].lstrip(" .,;:-—")
            if stripped and stripped[0].islower():
                stripped = stripped[0].upper() + stripped[1:]
            break
    return stripped


def _might_be_boilerplate(text: str) -> bool:
    sample = text.lower().lstrip()
    if not sample:
        return False
    return any(opener.startswith(sample) or sample.startswith(opener) for opener in _BOILERPLATE_OPENERS)


class _OpeningStripper:
    """Hold the first phrase briefly so boilerplate openers can be stripped before display."""

    def __init__(self, *, max_hold: int = 60) -> None:
        self._buf = ""
        self._done = False
        self._max_hold = max_hold

    def feed(self, chunk: str) -> str:
        if self._done:
            return chunk
        self._buf += chunk
        if not _might_be_boilerplate(self._buf) and len(self._buf.strip()) > 3:
            self._done = True
            return self._buf
        if ". " in self._buf or "?" in self._buf or "!" in self._buf or len(self._buf) >= self._max_hold:
            cleaned = strip_defense_boilerplate_opening(self._buf)
            self._done = True
            return cleaned
        return ""

    def flush(self) -> str:
        if self._done or not self._buf:
            return ""
        cleaned = strip_defense_boilerplate_opening(self._buf)
        self._done = True
        return cleaned


def _assistant_opening_snippet(content: str, *, max_len: int = 48) -> str:
    snippet = content.strip().split("\n", 1)[0].strip()
    for sep in (". ", "? ", "! ", "。"):
        if sep in snippet:
            snippet = snippet.split(sep, 1)[0].strip()
            break
    if len(snippet) > max_len:
        snippet = snippet[: max_len - 1].rstrip() + "…"
    return snippet


def _build_turn_directive(history: list[DefenseConversationTurn], *, locale: str = "vi") -> str:
    if not history:
        if locale == "en":
            return "This is the opening turn — brief introduction, then ask the first question."
        return "Đây là lượt mở đầu phiên — giới thiệu ngắn và đặt câu hỏi đầu tiên."

    if history[-1].role != "user":
        if locale == "en":
            return "Continue the defense session."
        return "Tiếp tục phiên phản biện."

    recent_openers = [
        _assistant_opening_snippet(turn.content)
        for turn in history
        if turn.role == "assistant" and turn.content.strip()
    ][-3:]

    if locale == "en":
        lines = [
            "This is the next question after the author's reply.",
            'FORBIDDEN openers: "I acknowledge that", "Thank you", "I note that", or any generic acknowledgment.',
            "Start directly with the question or a specific observation about the paper/answer.",
        ]
        if recent_openers:
            lines.append("Openers you have already used — do not repeat: " + " | ".join(recent_openers))
    else:
        lines = [
            "Đây là lượt hỏi tiếp theo sau câu trả lời của tác giả.",
            "CẤM mở đầu bằng: \"Tôi ghi nhận điều đó\", \"Cảm ơn bạn\", \"I acknowledge that\", hoặc bất kỳ câu ghi nhận chung nào.",
            "Bắt đầu trực tiếp bằng câu hỏi hoặc một nhận xét cụ thể về nội dung bài/câu trả lời vừa rồi.",
        ]
        if recent_openers:
            lines.append("Các mở đầu bạn đã dùng — không lặp lại: " + " | ".join(recent_openers))
    return "\n".join(lines)


def _build_system_message(
    latex_content: str,
    turn_count: int,
    history: list[DefenseConversationTurn],
    *,
    user_name: str = "bạn",
    locale: str = "vi",
) -> str:
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
        turn_directive=_build_turn_directive(history, locale=locale),
        user_name=user_name,
        locale=locale,
    )

    return f"{system_template.strip()}\n\n{user_section.strip()}"


async def _stream_tokens_sanitized(llm: Any, messages: list) -> AsyncIterator[str]:
    """Stream council output, stripping overused acknowledgment openers on follow-ups."""
    stripper = _OpeningStripper()
    async for delta in _stream_tokens(llm, messages):
        out = stripper.feed(delta)
        if out:
            yield out
    tail = stripper.flush()
    if tail:
        yield tail


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
    if user_id is not None and db_is_ready():
        try:
            with get_db() as db:
                user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
                if user:
                    assert_defense_allowed(db, user)
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
    locale = request.locale or "vi"
    user_name = (request.user_name or "").strip() or ("bạn" if locale == "vi" else "there")
    system_content = _build_system_message(
        request.latex_content,
        turn_count,
        request.conversation_history,
        user_name=user_name,
        locale=locale,
    )

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
        trigger = "[Start defense session]" if locale == "en" else "[Bắt đầu phiên phản biện]"
        messages.append(HumanMessage(content=trigger))

    # Emit initial activity (localized; UI also maps to its own copy)
    if locale == "en":
        activity_text = (
            "Analyzing the research paper..."
            if turn_count == 0
            else "Preparing the next question..."
        )
    else:
        activity_text = (
            "Đang phân tích bài nghiên cứu..."
            if turn_count == 0
            else "Đang soạn câu hỏi tiếp theo..."
        )
    yield _sse("activity", {"text": activity_text})

    use_stripper = any(t.role == "user" for t in request.conversation_history)
    stream_fn = _stream_tokens_sanitized if use_stripper else _stream_tokens

    # Stream tokens
    assembled: list[str] = []
    try:
        async for delta in stream_fn(llm, messages):
            assembled.append(delta)
            yield _sse("token", {"delta": delta})
            # keepalive every ~50 tokens to prevent proxy timeouts
            if len(assembled) % 50 == 0:
                yield _KEEPALIVE_SSE
    except Exception as exc:
        err_msg = friendly_llm_error(exc)
        yield _sse("error", {"message": err_msg})
        return

    full_response = strip_defense_boilerplate_opening("".join(assembled)) if use_stripper else "".join(assembled)
    full_response = prepare_defense_council_markdown(full_response, request.latex_content)
    yield _sse("done", {"response": full_response})

    if user_id is not None and full_response.strip() and db_is_ready():
        try:
            with get_db() as db:
                user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
                if user:
                    record_defense_turn(db, user)
        except Exception as exc:
            # Non-fatal: the response was already sent. Log so ops can detect DB issues.
            logger.warning("Failed to record defense turn for user %s: %s", user_id, exc)
