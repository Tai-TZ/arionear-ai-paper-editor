"""Server-Sent Events helpers shared by the editor chat stream and the defense stream.

Event names and JSON payloads are part of the frontend contract (``frontend/src/lib/api/academic.ts`` and
``defense-api.ts`` parse ``event:`` / ``data:`` blocks and skip ``:`` comment lines).
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

KEEPALIVE_SSE = ": keepalive\n\n"

# Some proxies hold back the first ~2-4 KB of a response before forwarding anything. One padding
# comment ahead of the first event pushes the headers and first bytes through; after that the
# response headers (``X-Accel-Buffering: no``, ``Cache-Control: no-transform``) keep events flowing,
# so later events are sent as-is instead of each carrying another 2 KB of padding.
SSE_FLUSH_PAD = ": " + (" " * 2048) + "\n\n"
_SSE_FLUSH_PAD_BYTES = SSE_FLUSH_PAD.encode("utf-8")

# Characters per ``token`` event when replaying an already-complete reply. The frontend reveals text
# per animation frame (``frontend/src/lib/smooth-stream.ts``), so chunk size does not change what the
# user sees — it only sets how many events (and bytes of SSE framing) go over the wire.
TEXT_CHUNK_CHARS = 48


def sse_event(event: str, data: dict[str, Any]) -> str:
    """Format one SSE event (``event:`` + single-line JSON ``data:``)."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def chunk_text(text: str, size: int = TEXT_CHUNK_CHARS) -> list[str]:
    """Split ``text`` into ``size``-character pieces for ``token`` events."""
    if size < 1:
        raise ValueError("size must be >= 1")
    return [text[i : i + size] for i in range(0, len(text), size)]


async def flush_sse_stream(source: AsyncIterator[str | bytes]) -> AsyncIterator[bytes]:
    """Encode SSE chunks and yield each one immediately; pad once before the first event."""
    first = True
    async for chunk in source:
        if first:
            yield _SSE_FLUSH_PAD_BYTES
            first = False
        yield chunk.encode("utf-8") if isinstance(chunk, str) else chunk
        # Hand control back to the event loop so the ASGI server writes this chunk now.
        await asyncio.sleep(0)
