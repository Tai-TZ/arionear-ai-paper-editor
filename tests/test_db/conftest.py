import os

import pytest

from src.db.engine import init_db, reset_db_state
from src.services.sessions import refresh_session_store


@pytest.fixture(autouse=True)
def sqlite_test_db(monkeypatch):
    """Use isolated SQLite for DB integration tests."""
    db_path = os.path.join(os.path.dirname(__file__), "_test_app.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    from src.config import get_settings

    get_settings.cache_clear()
    reset_db_state()
    init_db()
    refresh_session_store()
    yield
    reset_db_state()
    get_settings.cache_clear()
    if os.path.exists(db_path):
        os.remove(db_path)
