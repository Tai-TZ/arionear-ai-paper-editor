"""DatabaseSessionStore on SQLite: targeted loads, deterministic session choice, identical PaperSession."""

from __future__ import annotations

import uuid
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import event
from sqlalchemy.orm import joinedload

from src.config import get_settings
from src.db import engine as engine_mod
from src.db.engine import get_db, init_db, reset_db_state
from src.db.models import AiSession, Paper, Suggestion, TaskType, User
from src.db.paper_repository import DatabaseSessionStore, _citation_to_registry_row, _status_to_action
from src.services.sessions import PaperSession, RevisionRecord
from src.services.usage_tracking import record_ai_usage

_REPO = Path(__file__).resolve().parents[2]


@pytest.fixture
def store(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'repo.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DIRECT_DATABASE_URL", url)
    monkeypatch.setenv("APP_ENV", "test")
    get_settings.cache_clear()
    reset_db_state()
    assert init_db()
    yield DatabaseSessionStore()
    reset_db_state()
    get_settings.cache_clear()


def _legacy_session(paper_id: str) -> PaperSession:
    """The pre-refactor builder (joinedload of the whole graph) — the reference output."""
    with get_db() as db:
        paper = (
            db.query(Paper)
            .options(
                joinedload(Paper.citations),
                joinedload(Paper.ai_sessions).joinedload(AiSession.suggestions),
            )
            .filter(Paper.id == uuid.UUID(paper_id))
            .one()
        )
        revisions = [
            RevisionRecord(
                id=str(s.id),
                section=s.section_label or "",
                original=s.original_text,
                suggestion=s.suggested_text,
                action=_status_to_action(s.status),
                created_at=s.created_at,
            )
            for ai_session in paper.ai_sessions
            for s in ai_session.suggestions
        ]
        revisions.sort(key=lambda r: r.created_at)
        return PaperSession(
            id=str(paper.id),
            name=paper.title,
            latex_content=paper.raw_latex,
            metadata=paper.metadata_ or {},
            citation_registry=[_citation_to_registry_row(c) for c in paper.citations],
            revision_history=revisions,
            created_at=paper.created_at,
            updated_at=paper.updated_at,
        )


def _same_content(actual: PaperSession, expected: PaperSession) -> bool:
    """Equal apart from paper timestamps (in-memory aware values vs. SQLite's naive read-back)."""
    return replace(actual, created_at=None, updated_at=None) == replace(expected, created_at=None, updated_at=None)


class _StatementLog:
    def __init__(self) -> None:
        self.statements: list[str] = []

    def __enter__(self) -> _StatementLog:
        event.listen(engine_mod._get_engine(), "before_cursor_execute", self._record)
        return self

    def __exit__(self, *exc: object) -> None:
        event.remove(engine_mod._get_engine(), "before_cursor_execute", self._record)

    def _record(self, conn, cursor, statement, parameters, context, executemany) -> None:
        self.statements.append(" ".join(statement.split()))

    def selects_from(self, table: str) -> list[str]:
        return [s for s in self.statements if s.startswith("SELECT") and f"FROM {table}" in s]


def _seed_paper_with_history(store: DatabaseSessionStore) -> str:
    sid = str(uuid.uuid4())
    store.create(sid, name="Paper", latex_content="\\documentclass{article}", metadata={"journal": "Nature"})
    first = store.add_revision(sid, section="intro", original="a", suggestion="b")
    for i in range(5):
        record_ai_usage(paper_id=sid, task_type="chat", user_input=f"q{i}", ai_output="x" * 500)
    store.add_revision(sid, section="methods", original="c", suggestion="d")
    store.set_revision_action(sid, first.id, "accepted")
    store.set_citation_registry(
        sid,
        [
            {"key": "smith2024", "status": "verified", "layers": ["crossref"], "metadata": {"title": "A"}},
            {"key": "doe2023", "status": "not_found", "metadata": {}, "message": "nope"},
        ],
    )
    return sid


def test_get_matches_legacy_joinedload_output(store):
    sid = _seed_paper_with_history(store)

    session = store.get(sid)

    assert session == _legacy_session(sid)
    assert [r.section for r in session.revision_history] == ["intro", "methods"]
    assert [r.action for r in session.revision_history] == ["accepted", "pending"]
    assert [c["key"] for c in session.citation_registry] == ["smith2024", "doe2023"]


def test_get_never_hydrates_usage_rows(store):
    sid = _seed_paper_with_history(store)

    with _StatementLog() as log:
        store.get(sid)

    assert len(log.selects_from("papers")) == 1
    assert not any("ai_output" in s or "user_input" in s for s in log.statements)
    assert all(" JOIN " not in s for s in log.selects_from("papers"))


def test_update_returns_fresh_session_without_reloading_paper(store):
    sid = _seed_paper_with_history(store)

    with _StatementLog() as log:
        updated = store.update(sid, name="Renamed", latex_content="new", metadata={"k": 1})

    assert _same_content(updated, _legacy_session(sid))
    assert updated.name == "Renamed"
    assert updated.metadata == {"journal": "Nature", "k": 1}
    assert len(updated.revision_history) == 2
    assert len(log.selects_from("papers")) == 1


def test_create_existing_paper_returns_full_session(store):
    sid = _seed_paper_with_history(store)

    again = store.create(sid, name="Again")

    assert _same_content(again, _legacy_session(sid))
    assert again.name == "Again"


def test_new_paper_session_is_empty(store):
    sid = str(uuid.uuid4())

    created = store.create(sid, name="Fresh", latex_content="x")

    assert _same_content(created, _legacy_session(sid))
    assert created.revision_history == []
    assert created.citation_registry == []


def test_suggestions_attach_to_editor_session_not_usage_rows(store):
    sid = _seed_paper_with_history(store)
    pid = uuid.UUID(sid)
    with get_db() as db:
        # Push a usage row into the future so a naive "last session" pick would choose it.
        usage = db.query(AiSession).filter(AiSession.paper_id == pid, AiSession.user_input != "").first()
        usage.created_at = datetime.now(UTC) + timedelta(days=1)

    store.add_revision(sid, section="results", original="e", suggestion="f")

    with get_db() as db:
        owners = (
            db.query(AiSession.user_input, AiSession.ai_output)
            .join(Suggestion, Suggestion.session_id == AiSession.id)
            .filter(AiSession.paper_id == pid)
            .distinct()
            .all()
        )
    assert owners == [("", "")]


def test_paper_ai_sessions_relationship_is_ordered(store):
    sid = str(uuid.uuid4())
    store.create(sid)
    pid = uuid.UUID(sid)
    base = datetime(2026, 1, 1, tzinfo=UTC)
    with get_db() as db:
        for offset in (3, 1, 2):
            db.add(AiSession(paper_id=pid, task_type=TaskType.CHAT, created_at=base + timedelta(minutes=offset)))
    with get_db() as db:
        paper = db.get(Paper, pid)
        stamps = [s.created_at for s in paper.ai_sessions]
    assert stamps == sorted(stamps)


def test_set_revision_action_is_scoped_to_paper(store):
    sid_a = str(uuid.uuid4())
    sid_b = str(uuid.uuid4())
    store.create(sid_a)
    store.create(sid_b)
    rev = store.add_revision(sid_a, section="s", original="o", suggestion="n")

    assert store.set_revision_action(sid_b, rev.id, "accepted") is None
    assert store.set_revision_action(str(uuid.uuid4()), rev.id, "accepted") is None
    resolved = store.set_revision_action(sid_a, rev.id, "rejected")
    assert resolved is not None
    assert resolved.action == "rejected"
    assert store.get(sid_a).revision_history[0].action == "rejected"


def test_set_citation_registry_can_be_rerun_with_same_keys(store):
    sid = str(uuid.uuid4())
    store.create(sid)
    registry = [{"key": "smith2024", "status": "verified", "metadata": {"title": "A"}}]

    store.set_citation_registry(sid, registry)
    store.set_citation_registry(sid, [{**registry[0], "status": "not_found"}])

    rows = store.get(sid).citation_registry
    assert [(r["key"], r["status"]) for r in rows] == [("smith2024", "not_found")]


def test_every_verifier_status_round_trips(store):
    sid = str(uuid.uuid4())
    store.create(sid)
    statuses = ["verified", "possible_mismatch", "not_found", "unverified", "partial", "error"]
    store.set_citation_registry(sid, [{"key": f"k{i}", "status": s} for i, s in enumerate(statuses)])

    rows = store.get(sid).citation_registry

    assert sorted((r["key"], r["status"]) for r in rows) == [(f"k{i}", s) for i, s in enumerate(statuses)]


def test_unknown_status_still_falls_back_to_unverified(store):
    sid = str(uuid.uuid4())
    store.create(sid)
    store.set_citation_registry(sid, [{"key": "a", "status": "weird"}, {"key": "b"}])

    assert {r["status"] for r in store.get(sid).citation_registry} == {"unverified"}


def test_possible_mismatch_enum_is_in_schema_and_migrations():
    schema = (_REPO / "prisma" / "schema.prisma").read_text(encoding="utf-8")
    enum_block = schema.split("enum CitationVerificationStatus {", 1)[1].split("}", 1)[0]
    assert "POSSIBLE_MISMATCH" in enum_block.split()
    migrations = (_REPO / "prisma" / "migrations").glob("*/migration.sql")
    assert any(
        "ALTER TYPE \"CitationVerificationStatus\" ADD VALUE IF NOT EXISTS 'POSSIBLE_MISMATCH'"
        in m.read_text(encoding="utf-8")
        for m in migrations
    )


def test_usage_rows_carry_owner_user_id(store):
    with get_db() as db:
        user = User(email="owner@test.local", full_name="Owner")
        db.add(user)
        db.flush()
        paper = Paper(user_id=user.id, title="Owned")
        db.add(paper)
        db.flush()
        pid, uid = str(paper.id), user.id

    record_ai_usage(paper_id=pid, task_type="chat", user_input="hi", ai_output="there")

    with get_db() as db:
        rows = db.query(AiSession.user_id).filter(AiSession.paper_id == uuid.UUID(pid)).all()
    assert rows == [(uid,)]
