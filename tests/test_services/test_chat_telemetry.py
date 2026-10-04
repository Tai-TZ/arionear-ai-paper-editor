"""Fire-and-forget Inngest emits keep a strong task reference until they finish."""

from __future__ import annotations

import asyncio
import gc

import pytest

from src.services import chat_telemetry


@pytest.mark.asyncio
async def test_emit_holds_task_until_done_then_releases(monkeypatch):
    release = asyncio.Event()
    sent: list[str] = []

    async def slow_send(event):
        await release.wait()
        sent.append(event.name)

    monkeypatch.setattr(chat_telemetry, "_inngest_enabled", lambda: True)
    monkeypatch.setattr(chat_telemetry.inngest_client, "send", slow_send)

    await chat_telemetry.emit_chat_event("ario/chat.stage", {"stage": "x"})
    gc.collect()

    assert len(chat_telemetry._pending_emits) == 1
    release.set()
    for _ in range(10):
        if not chat_telemetry._pending_emits:
            break
        await asyncio.sleep(0)
    assert sent == ["ario/chat.stage"]
    assert chat_telemetry._pending_emits == set()


@pytest.mark.asyncio
async def test_emit_failure_is_swallowed_and_released(monkeypatch):
    async def failing_send(_event):
        raise RuntimeError("inngest down")

    monkeypatch.setattr(chat_telemetry, "_inngest_enabled", lambda: True)
    monkeypatch.setattr(chat_telemetry.inngest_client, "send", failing_send)

    await chat_telemetry.emit_chat_event("ario/chat.failed", {})
    for _ in range(10):
        if not chat_telemetry._pending_emits:
            break
        await asyncio.sleep(0)
    assert chat_telemetry._pending_emits == set()


@pytest.mark.asyncio
async def test_emit_is_noop_when_disabled(monkeypatch):
    monkeypatch.setattr(chat_telemetry, "_inngest_enabled", lambda: False)
    await chat_telemetry.emit_chat_event("ario/chat.stage", {})
    assert chat_telemetry._pending_emits == set()
