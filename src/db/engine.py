from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from src.config import get_settings
from src.db.models import Base

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None
_db_ready: bool = False


def is_db_enabled() -> bool:
    url = get_settings().sqlalchemy_database_url()
    return bool(url) and not url.startswith("memory://")


def _get_engine() -> Engine:
    global _engine, _SessionLocal
    if _engine is None:
        settings = get_settings()
        db_url = settings.sqlalchemy_database_url()
        if not db_url:
            raise ValueError(
                "DATABASE_URL is a Prisma Accelerate URL (prisma+postgres://). "
                "Add DIRECT_DATABASE_URL=postgresql://... to .env "
                "(copy 'Direct connection' from Prisma Console)."
            )
        connect_args = {}
        if db_url.startswith("sqlite"):
            connect_args["check_same_thread"] = False
        _engine = create_engine(
            db_url,
            pool_pre_ping=True,
            connect_args=connect_args,
        )
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
    return _engine


def init_db() -> bool:
    """Create tables (SQLite dev) or verify PostgreSQL connection."""
    global _db_ready
    if not is_db_enabled():
        _db_ready = False
        return False

    engine = _get_engine()
    if engine.dialect.name == "sqlite":
        Base.metadata.create_all(bind=engine)
    else:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    _db_ready = True
    return True


def db_is_ready() -> bool:
    return _db_ready


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
    global _engine, _SessionLocal, _db_ready
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None
    _db_ready = False
