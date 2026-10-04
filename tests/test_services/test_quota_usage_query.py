"""Quota usage sum: indexed ``ai_sessions.user_id`` filter, no join to ``papers``."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import event

from src.config import get_settings
from src.db import engine as engine_mod
from src.db.engine import get_db, init_db, reset_db_state
from src.db.models import AiSession, Paper, TaskType, User
from src.services.quota_policy import _sum_tokens_for_user
from src.services.usage_tracking import record_ai_usage

_REPO = Path(__file__).resolve().parents[2]


@pytest.fixture
def usage_db(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'quota.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DIRECT_DATABASE_URL", url)
    monkeypatch.setenv("APP_ENV", "test")
    get_settings.cache_clear()
    reset_db_state()
    assert init_db()
    yield
    reset_db_state()
    get_settings.cache_clear()


def _user_with_paper(email: str) -> tuple[uuid.UUID, str]:
    with get_db() as db:
        user = User(email=email, full_name=email)
        db.add(user)
        db.flush()
        paper = Paper(user_id=user.id, title="p")
        db.add(paper)
        db.flush()
        return user.id, str(paper.id)


def test_sum_tokens_counts_only_the_users_rows_in_window(usage_db):
    uid, pid = _user_with_paper("a@test.local")
    other_uid, other_pid = _user_with_paper("b@test.local")
    record_ai_usage(paper_id=pid, task_type="chat", user_input="q", ai_output="a", tokens_used=100)
    record_ai_usage(paper_id=pid, task_type="edit", user_input="q", ai_output="a", tokens_used=50)
    record_ai_usage(paper_id=other_pid, task_type="chat", user_input="q", ai_output="a", tokens_used=999)
    old = datetime.now(UTC) - timedelta(days=40)
    with get_db() as db:
        db.add(AiSession(paper_id=uuid.UUID(pid), user_id=uid, task_type=TaskType.CHAT, tokens_used=7, created_at=old))

    now = datetime.now(UTC)
    with get_db() as db:
        assert _sum_tokens_for_user(db, uid, start=now - timedelta(days=1), end=now + timedelta(days=1)) == 150
        assert _sum_tokens_for_user(db, uid) == 157
        assert _sum_tokens_for_user(db, other_uid) == 999


def test_sum_tokens_ignores_empty_placeholder_sessions(usage_db):
    uid, pid = _user_with_paper("c@test.local")
    with get_db() as db:
        db.add(AiSession(paper_id=uuid.UUID(pid), user_id=uid, task_type=TaskType.CHAT))
    with get_db() as db:
        assert _sum_tokens_for_user(db, uid) == 0


def test_sum_tokens_query_does_not_join_papers(usage_db):
    uid, _pid = _user_with_paper("d@test.local")
    statements: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    eng = engine_mod._get_engine()
    event.listen(eng, "before_cursor_execute", record)
    try:
        with get_db() as db:
            _sum_tokens_for_user(db, uid, start=datetime.now(UTC) - timedelta(days=1))
    finally:
        event.remove(eng, "before_cursor_execute", record)

    (sql,) = statements
    assert "papers" not in sql
    assert "ai_sessions.user_id = " in sql


def test_user_created_at_index_is_declared_everywhere():
    name = "ix_ai_sessions_user_id_created_at"
    indexes = {ix.name: [c.name for c in ix.columns] for ix in AiSession.__table__.indexes}
    assert indexes[name] == ["user_id", "created_at"]
    schema = (_REPO / "prisma" / "schema.prisma").read_text(encoding="utf-8")
    assert f'@@index([userId, createdAt], map: "{name}")' in schema
    create_sql = f'CREATE INDEX "{name}" ON "ai_sessions"("user_id", "created_at")'
    migrations = (_REPO / "prisma" / "migrations").glob("*/migration.sql")
    assert any(create_sql in m.read_text(encoding="utf-8") for m in migrations)
