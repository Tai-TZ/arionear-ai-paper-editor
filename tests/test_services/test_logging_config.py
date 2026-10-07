"""Logging setup: JSON lines / text mode, request-id middleware, Cloud Trace field, secret masking."""

from __future__ import annotations

import json
import logging

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.config import get_settings
from src.logging_config import (
    CLOUD_TRACE_FIELD,
    RequestContextFilter,
    SecretMaskingFilter,
    configure_logging,
    mask_secrets,
)
from src.request_context import REQUEST_ID_HEADER, RequestContextMiddleware, cloud_trace_resource


@pytest.fixture
def restore_logging(monkeypatch):
    yield monkeypatch
    monkeypatch.undo()
    get_settings.cache_clear()
    configure_logging()


def _configure(monkeypatch, app_env: str, **env: str) -> None:
    monkeypatch.setenv("APP_ENV", app_env)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    configure_logging()


@pytest.mark.parametrize(
    ("raw", "masked"),
    [
        ("/api/v1/share/abcDEF123", "/api/v1/share/***"),
        ("/api/v1/ws/share/tok_en-1?x=1", "/api/v1/ws/share/***?x=1"),
        ("/api/v1/billing/confirm/chk_42", "/api/v1/billing/confirm/***"),
        ("/api/v1/auth/google/callback?code=4/abc&state=xyz", "/api/v1/auth/google/callback?code=***&state=***"),
        ("/api/v1/papers/123/share", "/api/v1/papers/123/share"),
        ("/api/v1/billing/status", "/api/v1/billing/status"),
        ("no path here", "no path here"),
    ],
)
def test_mask_secrets(raw, masked):
    assert mask_secrets(raw) == masked


def test_uvicorn_access_record_path_is_masked():
    record = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:5000", "GET", "/api/v1/share/secret-token", "1.1", 200),
        None,
    )
    assert SecretMaskingFilter().filter(record)
    assert record.getMessage() == '127.0.0.1:5000 - "GET /api/v1/share/*** HTTP/1.1" 200'


def test_json_lines_in_production(restore_logging, capsys):
    _configure(restore_logging, "production")
    capsys.readouterr()

    logging.getLogger("proofline.test").warning("Xin chào %s", "thế giới")

    line = capsys.readouterr().out.strip().splitlines()[-1]
    payload = json.loads(line)
    assert payload["severity"] == "WARNING"
    assert payload["message"] == "Xin chào thế giới"
    assert payload["logger"] == "proofline.test"
    assert payload["request_id"] == "-"
    assert "time" in payload
    assert "color_message" not in payload


def test_text_lines_in_development(restore_logging, capsys):
    _configure(restore_logging, "development")
    capsys.readouterr()

    logging.getLogger("proofline.test").info("hello")

    line = capsys.readouterr().out.strip().splitlines()[-1]
    assert line.endswith("INFO     proofline.test [-] hello")


def test_uvicorn_loggers_propagate_to_root(restore_logging):
    _configure(restore_logging, "production")
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        assert logger.handlers == []
        assert logger.propagate is True


class _Collect(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []
        self.addFilter(RequestContextFilter())

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


@pytest.fixture
def request_log():
    log = logging.getLogger("proofline.test.request")
    handler = _Collect()
    log.addHandler(handler)
    log.setLevel(logging.INFO)
    yield log, handler.records
    log.removeHandler(handler)


@pytest.mark.asyncio
async def test_request_id_is_generated_echoed_and_logged(monkeypatch, request_log):
    log, records = request_log
    monkeypatch.setenv("GCP_PROJECT_ID", "demo-project")
    get_settings.cache_clear()
    app = FastAPI()
    app.add_middleware(RequestContextMiddleware)

    @app.get("/ping")
    async def ping():
        log.info("inside request")
        return {"ok": True}

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            generated = await client.get("/ping")
            echoed = await client.get(
                "/ping",
                headers={
                    REQUEST_ID_HEADER: "req-123",
                    "X-Cloud-Trace-Context": "105445AA7843BC8BF206B12000100000/1;o=1",
                },
            )
            unsafe = await client.get("/ping", headers={REQUEST_ID_HEADER: "bad id\twith spaces"})
    finally:
        get_settings.cache_clear()

    assert len(generated.headers[REQUEST_ID_HEADER]) == 32
    assert echoed.headers[REQUEST_ID_HEADER] == "req-123"
    assert unsafe.headers[REQUEST_ID_HEADER] != "bad id\twith spaces"
    assert [r.request_id for r in records] == [
        generated.headers[REQUEST_ID_HEADER],
        "req-123",
        unsafe.headers[REQUEST_ID_HEADER],
    ]
    assert getattr(records[1], CLOUD_TRACE_FIELD) == "projects/demo-project/traces/105445aa7843bc8bf206b12000100000"
    assert not hasattr(records[0], CLOUD_TRACE_FIELD)


def test_cloud_trace_resource_without_project(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    monkeypatch.setenv("GCP_PROJECT_ID", "")
    get_settings.cache_clear()
    try:
        assert cloud_trace_resource("abc123/9;o=1") == "abc123"
        assert cloud_trace_resource("not-a-trace") is None
        assert cloud_trace_resource(None) is None
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_main_app_returns_request_id(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.headers[REQUEST_ID_HEADER]
