"""Readiness probe (``GET /ready``), mounted at the app root next to the liveness ``GET /health``.

``/health`` only says the process is up. ``/ready`` answers "can this instance serve traffic": when a
database is configured it must be initialised and answer ``SELECT 1`` within ``READY_DB_TIMEOUT_SEC``.
TeX availability is reported (the same check as ``/api/v1/compile/status``) but does not gate readiness —
without TeX only PDF compile degrades.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.db.engine import db_is_ready, is_db_enabled, ping_db
from src.services.latex_compile import compile_status

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])

READY_DB_TIMEOUT_SEC = 1.0


async def _database_check() -> str:
    if not is_db_enabled():
        return "not_configured"
    if not db_is_ready():
        return "unavailable"
    try:
        await asyncio.wait_for(asyncio.to_thread(ping_db), timeout=READY_DB_TIMEOUT_SEC)
    except TimeoutError:
        logger.warning("Readiness: database ping exceeded %.1fs", READY_DB_TIMEOUT_SEC)
        return "timeout"
    except Exception as exc:
        logger.warning("Readiness: database ping failed: %s", type(exc).__name__)
        return "unavailable"
    return "ok"


async def _tex_available() -> bool:
    try:
        status = await asyncio.to_thread(compile_status)
    except Exception:
        return False
    return bool(status.available)


@router.get("/ready")
async def ready() -> JSONResponse:
    database, tex_available = await asyncio.gather(_database_check(), _tex_available())
    is_ready = database in ("ok", "not_configured")
    return JSONResponse(
        status_code=200 if is_ready else 503,
        content={
            "status": "ready" if is_ready else "not_ready",
            "database": database,
            "tex": {"available": tex_available},
        },
    )
