"""Per-request context for logs: request id + Cloud Trace id, set by a pure ASGI middleware.

``RequestContextMiddleware`` reuses a well-formed incoming ``X-Request-ID`` (or generates one), stores it
in a contextvar for the logging filter, and echoes it on the HTTP response. When Google's front end sends
``X-Cloud-Trace-Context``, the trace id is kept too so log lines group under the request in Cloud Logging.
"""

from __future__ import annotations

import os
import re
import uuid
from contextvars import ContextVar

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from src.config import get_settings

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_HEADER_RAW = REQUEST_ID_HEADER.lower().encode("latin-1")
_CLOUD_TRACE_HEADER_RAW = b"x-cloud-trace-context"

# Accept caller-supplied ids only when they are short and log-safe (no spaces / newlines / quotes).
_REQUEST_ID_RE = re.compile(r"[A-Za-z0-9._:\-]{1,128}")
# X-Cloud-Trace-Context: TRACE_ID/SPAN_ID;o=OPTIONS
_TRACE_ID_RE = re.compile(r"^([0-9a-fA-F]{1,64})(?:/|;|$)")

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
cloud_trace_var: ContextVar[str | None] = ContextVar("cloud_trace", default=None)


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers") or ():
        if key.lower() == name:
            return value.decode("latin-1")
    return None


def resolve_request_id(incoming: str | None) -> str:
    candidate = (incoming or "").strip()
    return candidate if _REQUEST_ID_RE.fullmatch(candidate) else uuid.uuid4().hex


def gcp_project_id() -> str:
    return get_settings().gcp_project_id.strip() or os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip()


def cloud_trace_resource(header: str | None) -> str | None:
    """``projects/<project>/traces/<id>`` (Cloud Logging's trace field) from ``X-Cloud-Trace-Context``."""
    match = _TRACE_ID_RE.match((header or "").strip())
    if not match:
        return None
    trace_id = match.group(1).lower()
    project = gcp_project_id()
    return f"projects/{project}/traces/{trace_id}" if project else trace_id


class RequestContextMiddleware:
    """Pure ASGI middleware (no ``BaseHTTPMiddleware``): safe for streaming responses and websockets."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        request_id = resolve_request_id(_header(scope, _REQUEST_ID_HEADER_RAW))
        id_token = request_id_var.set(request_id)
        trace_token = cloud_trace_var.set(cloud_trace_resource(_header(scope, _CLOUD_TRACE_HEADER_RAW)))

        async def send_with_request_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                if REQUEST_ID_HEADER not in headers:
                    headers.append(REQUEST_ID_HEADER, request_id)
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            request_id_var.reset(id_token)
            cloud_trace_var.reset(trace_token)
