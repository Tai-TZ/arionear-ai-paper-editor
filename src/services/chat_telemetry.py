from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any

import inngest

from src.config import get_settings
from src.inngest.client import inngest_client

logger = logging.getLogger(__name__)


def _inngest_enabled() -> bool:
    return get_settings().inngest_enabled()


class ChatRunTracker:
    """Tracks per-stage timing for chat streams; emits Inngest events when configured."""

    def __init__(
        self,
        *,
        session_id: str | None,
        provider: str,
        model: str | None,
        message_preview: str,
    ) -> None:
        self.run_id = str(uuid.uuid4())
        self.session_id = session_id or ""
        self.provider = provider
        self.model = model or ""
        self.message_preview = message_preview[:160]
        self.task = ""
        self._started = time.perf_counter()
        self._last = self._started
        self._stages: list[dict[str, Any]] = []

    def _base_payload(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "session_id": self.session_id,
            "provider": self.provider,
            "model": self.model,
            "message_preview": self.message_preview,
            "task": self.task,
        }

    async def stage(self, name: str, **extra: Any) -> dict[str, Any]:
        now = time.perf_counter()
        stage_ms = round((now - self._last) * 1000)
        total_ms = round((now - self._started) * 1000)
        self._last = now

        payload = {
            **self._base_payload(),
            "stage": name,
            "stage_ms": stage_ms,
            "total_ms": total_ms,
            **extra,
        }
        self._stages.append(payload)
        await emit_chat_event("ario/chat.stage", payload)
        return payload

    async def complete(self, *, success: bool = True, **extra: Any) -> None:
        total_ms = round((time.perf_counter() - self._started) * 1000)
        payload = {
            **self._base_payload(),
            "success": success,
            "total_ms": total_ms,
            "stages": self._stages,
            **extra,
        }
        event = "ario/chat.completed" if success else "ario/chat.failed"
        await emit_chat_event(event, payload)

    async def fail(self, error: str, **extra: Any) -> None:
        await self.complete(success=False, error=error[:500], **extra)


async def emit_chat_event(name: str, data: dict[str, Any]) -> None:
    if not _inngest_enabled():
        return

    async def _send() -> None:
        try:
            await inngest_client.send(inngest.Event(name=name, data=data))
        except Exception as exc:
            logger.debug("Inngest emit skipped (%s): %s", name, exc)

    task = asyncio.create_task(_send())
    task.add_done_callback(lambda t: t.exception() if not t.cancelled() else None)
