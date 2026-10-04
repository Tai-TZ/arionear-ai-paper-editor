"""Baseline security response headers for the API (pure ASGI, so SSE streaming is untouched)."""

from __future__ import annotations

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

BASE_SECURITY_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
}
# Only for non-HTML responses: the billing confirm page (and /docs) rely on inline styles/scripts.
API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'"
HSTS_VALUE = "max-age=31536000; includeSubDomains"


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, *, hsts: bool = False) -> None:
        self.app = app
        self.hsts = hsts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                message.setdefault("headers", [])
                headers = MutableHeaders(scope=message)
                for name, value in BASE_SECURITY_HEADERS.items():
                    headers.setdefault(name, value)
                if not headers.get("content-type", "").lower().startswith("text/html"):
                    headers.setdefault("Content-Security-Policy", API_CONTENT_SECURITY_POLICY)
                if self.hsts:
                    headers.setdefault("Strict-Transport-Security", HSTS_VALUE)
            await send(message)

        await self.app(scope, receive, send_with_headers)
