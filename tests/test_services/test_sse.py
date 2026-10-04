"""Shared SSE helpers + chat token streaming (padding once, chunked replies, bounded error scan)."""

from __future__ import annotations

import json

import pytest
from langchain_core.messages import AIMessageChunk

from src.models.schemas import ChatRequest
from src.services import chat_stream, defense_stream
from src.services.intent_rules import IntentResult
from src.services.sse import (
    KEEPALIVE_SSE,
    SSE_FLUSH_PAD,
    TEXT_CHUNK_CHARS,
    chunk_text,
    flush_sse_stream,
    sse_event,
)


async def _agen(items):
    for item in items:
        yield item


async def _drain(source) -> list[bytes]:
    return [chunk async for chunk in source]


def test_sse_event_format_is_unchanged():
    assert sse_event("token", {"delta": "Xin chào"}) == 'event: token\ndata: {"delta": "Xin chào"}\n\n'


def test_chat_and_defense_share_one_helper():
    assert chat_stream._sse is sse_event
    assert defense_stream._sse is sse_event
    assert chat_stream._KEEPALIVE_SSE == defense_stream._KEEPALIVE_SSE == KEEPALIVE_SSE
    assert chat_stream.flush_sse_stream is flush_sse_stream


@pytest.mark.asyncio
async def test_flush_pads_only_before_first_event():
    events = [sse_event("activity", {"text": "a"}), KEEPALIVE_SSE, sse_event("done", {"response": "ok"})]

    out = await _drain(flush_sse_stream(_agen(events)))

    assert out[0] == SSE_FLUSH_PAD.encode("utf-8")
    assert out[1:] == [e.encode("utf-8") for e in events]
    assert sum(1 for chunk in out if chunk == SSE_FLUSH_PAD.encode("utf-8")) == 1


@pytest.mark.asyncio
async def test_flush_passes_bytes_through_and_empty_stream_sends_nothing():
    assert await _drain(flush_sse_stream(_agen([b"raw"]))) == [SSE_FLUSH_PAD.encode("utf-8"), b"raw"]
    assert await _drain(flush_sse_stream(_agen([]))) == []


def test_chunk_text_default_size_round_trips():
    text = "Đây là một câu trả lời dài " * 20
    pieces = chunk_text(text)
    assert TEXT_CHUNK_CHARS == 48
    assert "".join(pieces) == text
    assert all(len(p) == TEXT_CHUNK_CHARS for p in pieces[:-1])
    assert 0 < len(pieces[-1]) <= TEXT_CHUNK_CHARS
    assert chunk_text("") == []
    with pytest.raises(ValueError):
        chunk_text("x", 0)


# ---------------------------------------------------------------------------
# Chat path: provider-error detection only looks at the head of the stream
# ---------------------------------------------------------------------------


class _FakeLLM:
    def __init__(self, parts: list[str]) -> None:
        self._parts = parts

    async def astream(self, _messages):
        for part in self._parts:
            yield AIMessageChunk(content=part)


def _parse(chunks: list[str]) -> list[tuple[str, dict]]:
    events = []
    for chunk in chunks:
        if chunk.startswith(":"):
            continue
        lines = chunk.strip().split("\n")
        name = lines[0].removeprefix("event: ")
        events.append((name, json.loads(lines[1].removeprefix("data: "))))
    return events


async def _run_chat(monkeypatch, parts: list[str]) -> list[tuple[str, dict]]:
    async def _classify(*_args, **_kwargs):
        return IntentResult(action="chat")

    monkeypatch.setattr("src.services.llm.get_provider_api_keys", lambda _provider: ["test-key"])
    monkeypatch.setattr(chat_stream, "classify_intent", _classify)
    monkeypatch.setattr(chat_stream, "enforce_llm_quota_for_paper", lambda *_a, **_k: None)
    monkeypatch.setattr(chat_stream, "get_llm", lambda *_a, **_k: _FakeLLM(parts))
    request = ChatRequest(message="Tóm tắt phần giới thiệu giúp tôi", session_id="sse-chat-test")
    return _parse([chunk async for chunk in chat_stream.stream_chat(request)])


@pytest.mark.asyncio
async def test_chat_stream_aborts_on_provider_error_at_start(monkeypatch):
    events = await _run_chat(monkeypatch, ["Error code: 404 - ", "{'error': {'message': 'model not found'}}"])

    names = [name for name, _ in events]
    assert "error" in names
    assert "done" not in names


@pytest.mark.asyncio
async def test_chat_stream_keeps_long_answer_mentioning_error_codes(monkeypatch):
    prose = "Phần giới thiệu trình bày bối cảnh nghiên cứu và mục tiêu chính của bài báo. " * 8
    tail = "Ví dụ, máy chủ có thể trả về error code: 404 khi tài nguyên không tồn tại."
    parts = [prose[i : i + 20] for i in range(0, len(prose), 20)] + [tail]

    events = await _run_chat(monkeypatch, parts)

    names = [name for name, _ in events]
    assert "error" not in names
    done = next(data for name, data in events if name == "done")
    assert done["response"] == (prose + tail).strip()
    streamed = "".join(data["delta"] for name, data in events if name == "token")
    assert streamed == prose + tail
