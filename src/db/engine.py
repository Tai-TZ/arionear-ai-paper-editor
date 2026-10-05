from __future__ import annotations

import functools
import random
import time
from collections.abc import Callable, Generator
from contextlib import contextmanager
from typing import TypeVar

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from src.config import get_settings
from src.db.models import Base

_T = TypeVar("_T")

# psycopg2 raises SQLSTATE 55P03 (lock_not_available) when a statement is
# cancelled after waiting past ``lock_timeout``.
_LOCK_TIMEOUT_PGCODE = "55P03"


def _is_lock_timeout(exc: BaseException) -> bool:
    orig = getattr(exc, "orig", None)
    if getattr(orig, "pgcode", None) == _LOCK_TIMEOUT_PGCODE:
        return True
    return "lock timeout" in str(exc).lower()


def retry_on_lock_timeout(
    attempts: int = 5, base_delay: float = 0.15
) -> Callable[[Callable[..., _T]], Callable[..., _T]]:
    """Retry a self-contained DB write that hit a Postgres ``lock_timeout``.

    Only for idempotent unit-of-work functions that open their own transaction
    (e.g. via ``with get_db()``): each retry runs a fresh transaction after the
    previous one has already rolled back. Non-lock errors propagate immediately.
    """

    def decorator(fn: Callable[..., _T]) -> Callable[..., _T]:
        @functools.wraps(fn)
        def wrapper(*args: object, **kwargs: object) -> _T:
            for attempt in range(attempts):
                try:
                    return fn(*args, **kwargs)
                except OperationalError as exc:
                    if attempt < attempts - 1 and _is_lock_timeout(exc):
                        time.sleep(base_delay * (2**attempt) + random.uniform(0, base_delay))
                        continue
                    raise
            raise AssertionError("unreachable")  # pragma: no cover

        return wrapper

    return decorator


_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None
_db_ready: bool = False
_db_error: str | None = None


def is_db_enabled() -> bool:
    url = get_settings().sqlalchemy_database_url()
    return bool(url) and not url.startswith("memory://")


def db_error_detail() -> str | None:
    return _db_error


def _enable_sqlite_foreign_keys(dbapi_connection, _record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def _get_engine() -> Engine:
    global _engine, _SessionLocal
    if _engine is None:
        settings = get_settings()
        db_url = settings.sqlalchemy_database_url()
        if not db_url:
            raise ValueError(
                "PostgreSQL is required. Set DIRECT_DATABASE_URL=postgresql://... in .env "
                "(copy 'Direct connection' from Prisma Console). "
                "If DATABASE_URL is prisma+postgres:// Accelerate only, DIRECT_DATABASE_URL is mandatory."
            )
        connect_args: dict = {}
        if db_url.startswith("postgresql"):
            connect_args = {
                "connect_timeout": 5 if settings.app_env == "development" else 10,
                "options": "-c statement_timeout=15000 -c lock_timeout=8000",
            }
        elif db_url.startswith("sqlite"):
            connect_args = {"check_same_thread": False}
        engine_kwargs: dict = {
            "pool_pre_ping": True,
            "connect_args": connect_args,
        }
        if settings.app_env == "development":
            engine_kwargs["poolclass"] = NullPool
        else:
            engine_kwargs["pool_timeout"] = 10
        _engine = create_engine(db_url, **engine_kwargs)
        if db_url.startswith("sqlite"):
            # SQLite only enforces foreign keys (and their ON DELETE actions) when asked; tests rely
            # on the same cascades as Postgres now that deletes are passive.
            event.listen(_engine, "connect", _enable_sqlite_foreign_keys)
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
    return _engine


def init_db() -> bool:
    """Verify the DB connection. PostgreSQL schema comes from Prisma migrations
    (``prisma migrate deploy``); only the SQLite test database is created here."""
    global _db_ready, _db_error
    _db_error = None
    if not is_db_enabled():
        _db_ready = False
        return False

    try:
        engine = _get_engine()
        dialect = engine.dialect.name

        if dialect == "sqlite":
            Base.metadata.create_all(bind=engine)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            conn.commit()
    except Exception as exc:
        _db_ready = False
        _db_error = str(exc)
        return False

    _db_ready = True
    return True


def db_is_ready() -> bool:
    return _db_ready


def ping_db() -> None:
    """Round-trip ``SELECT 1`` on a pooled connection (raises on failure). Blocking — run in a thread."""
    with _get_engine().connect() as conn:
        conn.execute(text("SELECT 1"))


@contextmanager
def get_db() -> Generator[Session, None, None]:
    if _SessionLocal is None:
        _get_engine()
    assert _SessionLocal is not None
    db = _SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def reset_db_state() -> None:
    """Test helper — reset singleton engine."""
    global _engine, _SessionLocal, _db_ready, _db_error
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None
    _db_ready = False
    _db_error = None
