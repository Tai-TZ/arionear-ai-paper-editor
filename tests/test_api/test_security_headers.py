"""Security response headers (SecurityHeadersMiddleware)."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.applications import Starlette
from starlette.responses import HTMLResponse, JSONResponse, StreamingResponse
from starlette.routing import Route, WebSocketRoute
from starlette.testclient import TestClient

from src.security_headers import API_CONTENT_SECURITY_POLICY, BASE_SECURITY_HEADERS, SecurityHeadersMiddleware


def _probe_app(*, hsts: bool) -> Starlette:
    async def json_endpoint(_request):
        return JSONResponse({"ok": True})

    async def html_endpoint(_request):
        return HTMLResponse("<style>body{color:red}</style><script>1</script>")

    async def sse_endpoint(_request):
        async def events():
            yield b"data: one\n\n"
            yield b"data: two\n\n"

        return StreamingResponse(events(), media_type="text/event-stream")

    async def custom_frame_endpoint(_request):
        return JSONResponse({}, headers={"X-Frame-Options": "SAMEORIGIN"})

    async def ws_endpoint(websocket):
        await websocket.accept()
        await websocket.send_text("hi")
        await websocket.close()

    app = Starlette(
        routes=[
            Route("/json", json_endpoint),
            Route("/html", html_endpoint),
            Route("/sse", sse_endpoint),
            Route("/custom", custom_frame_endpoint),
            WebSocketRoute("/ws", ws_endpoint),
        ]
    )
    app.add_middleware(SecurityHeadersMiddleware, hsts=hsts)
    return app


async def _get(app, path: str):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.get(path)


def _assert_base_headers(res) -> None:
    for name, value in BASE_SECURITY_HEADERS.items():
        assert res.headers.get(name) == value, name


@pytest.mark.asyncio
async def test_api_json_responses_get_security_headers_and_csp(client):
    res = await client.get("/health")
    assert res.status_code == 200
    _assert_base_headers(res)
    assert res.headers["Content-Security-Policy"] == API_CONTENT_SECURITY_POLICY
    assert "Strict-Transport-Security" not in res.headers  # not production


@pytest.mark.asyncio
async def test_api_error_responses_get_security_headers(client):
    res = await client.get("/api/v1/does-not-exist")
    assert res.status_code == 404
    _assert_base_headers(res)


@pytest.mark.asyncio
async def test_html_responses_skip_csp_but_keep_other_headers():
    res = await _get(_probe_app(hsts=False), "/html")
    assert res.status_code == 200
    _assert_base_headers(res)
    assert "Content-Security-Policy" not in res.headers
    assert "<style>" in res.text


@pytest.mark.asyncio
async def test_hsts_only_when_enabled():
    with_hsts = await _get(_probe_app(hsts=True), "/json")
    assert with_hsts.headers["Strict-Transport-Security"] == "max-age=31536000; includeSubDomains"
    without = await _get(_probe_app(hsts=False), "/json")
    assert "Strict-Transport-Security" not in without.headers


@pytest.mark.asyncio
async def test_streaming_responses_pass_through():
    res = await _get(_probe_app(hsts=False), "/sse")
    assert res.text == "data: one\n\ndata: two\n\n"
    _assert_base_headers(res)


@pytest.mark.asyncio
async def test_endpoint_headers_are_not_overridden():
    res = await _get(_probe_app(hsts=False), "/custom")
    assert res.headers["X-Frame-Options"] == "SAMEORIGIN"


def test_websockets_are_untouched():
    with TestClient(_probe_app(hsts=True)).websocket_connect("/ws") as ws:
        assert ws.receive_text() == "hi"
