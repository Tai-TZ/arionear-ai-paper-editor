"""GET /ready (readiness) vs GET /health (liveness)."""

from __future__ import annotations

import time
from types import SimpleNamespace

import pytest

from src.api import health_routes
from src.config import get_settings
from src.db.engine import init_db, reset_db_state


@pytest.fixture
def sqlite_db(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'ready.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DIRECT_DATABASE_URL", url)
    get_settings.cache_clear()
    reset_db_state()
    assert init_db()
    yield
    reset_db_state()
    get_settings.cache_clear()


@pytest.fixture
def tex(monkeypatch):
    def _set(available: bool) -> None:
        monkeypatch.setattr(health_routes, "compile_status", lambda: SimpleNamespace(available=available))

    _set(True)
    return _set


@pytest.mark.asyncio
async def test_ready_without_database_is_ready(client, tex, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("DIRECT_DATABASE_URL", raising=False)
    get_settings.cache_clear()
    tex(False)

    response = await client.get("/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "database": "not_configured", "tex": {"available": False}}


@pytest.mark.asyncio
async def test_ready_with_database(client, sqlite_db, tex):
    response = await client.get("/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "database": "ok", "tex": {"available": True}}


@pytest.mark.asyncio
async def test_ready_fails_when_ping_fails(client, sqlite_db, tex, monkeypatch):
    def boom() -> None:
        raise RuntimeError("connection refused")

    monkeypatch.setattr(health_routes, "ping_db", boom)

    response = await client.get("/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"
    assert response.json()["database"] == "unavailable"


@pytest.mark.asyncio
async def test_ready_times_out_slow_database(client, sqlite_db, tex, monkeypatch):
    monkeypatch.setattr(health_routes, "READY_DB_TIMEOUT_SEC", 0.05)
    monkeypatch.setattr(health_routes, "ping_db", lambda: time.sleep(0.5))

    started = time.perf_counter()
    response = await client.get("/ready")

    assert response.status_code == 503
    assert response.json()["database"] == "timeout"
    assert time.perf_counter() - started < 0.45


@pytest.mark.asyncio
async def test_ready_fails_when_database_init_failed(client, tex, monkeypatch):
    monkeypatch.setenv("DIRECT_DATABASE_URL", "postgresql://user:pw@127.0.0.1:1/none")
    get_settings.cache_clear()
    reset_db_state()
    try:
        response = await client.get("/ready")
    finally:
        reset_db_state()
        get_settings.cache_clear()

    assert response.status_code == 503
    assert response.json()["database"] == "unavailable"


@pytest.mark.asyncio
async def test_health_is_unchanged(client):
    response = await client.get("/health")

    assert response.status_code == 200
    assert set(response.json()) == {"status", "env", "database"}
    assert response.json()["status"] == "ok"
