from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from src.db.engine import db_is_ready, is_db_enabled


def _utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass
class RevisionRecord:
    id: str
    section: str
    original: str
    suggestion: str
    action: str = "pending"
    created_at: datetime = field(default_factory=_utcnow)


@dataclass
class PaperSession:
    id: str
    name: str
    latex_content: str = ""
    metadata: dict = field(default_factory=dict)
    citation_registry: list[dict] = field(default_factory=list)
    revision_history: list[RevisionRecord] = field(default_factory=list)
    created_at: datetime = field(default_factory=_utcnow)
    updated_at: datetime = field(default_factory=_utcnow)


class InMemorySessionStore:
    """Fallback when DATABASE_URL is not configured."""

    def __init__(self) -> None:
        self._sessions: dict[str, PaperSession] = {}

    def create(
        self,
        session_id: str | None = None,
        name: str = "Untitled",
        latex_content: str = "",
        metadata: dict | None = None,
    ) -> PaperSession:
        sid = session_id or str(uuid.uuid4())
        session = PaperSession(
            id=sid,
            name=name,
            latex_content=latex_content,
            metadata=metadata or {},
        )
        self._sessions[sid] = session
        return session

    def get(self, session_id: str) -> PaperSession | None:
        return self._sessions.get(session_id)

    def get_or_create(
        self,
        session_id: str,
        name: str = "Untitled",
        latex_content: str = "",
        metadata: dict | None = None,
    ) -> PaperSession:
        existing = self.get(session_id)
        if existing:
            if latex_content and not existing.latex_content:
                existing.latex_content = latex_content
            return existing
        return self.create(session_id, name, latex_content, metadata)

    def update(
        self,
        session_id: str,
        name: str | None = None,
        latex_content: str | None = None,
        metadata: dict | None = None,
    ) -> PaperSession | None:
        session = self.get(session_id)
        if not session:
            return None
        if name is not None:
            session.name = name
        if latex_content is not None:
            session.latex_content = latex_content
        if metadata is not None:
            merged = {**(session.metadata or {}), **metadata}
            session.metadata = merged
        session.updated_at = _utcnow()
        return session

    def add_revision(
        self,
        session_id: str,
        section: str,
        original: str,
        suggestion: str,
    ) -> RevisionRecord | None:
        session = self.get(session_id)
        if not session:
            return None
        record = RevisionRecord(
            id=str(uuid.uuid4()),
            section=section,
            original=original,
            suggestion=suggestion,
        )
        session.revision_history.append(record)
        session.updated_at = _utcnow()
        return record

    def set_revision_action(self, session_id: str, revision_id: str, action: str) -> RevisionRecord | None:
        session = self.get(session_id)
        if not session:
            return None
        for record in session.revision_history:
            if record.id == revision_id:
                record.action = action
                session.updated_at = _utcnow()
                return record
        return None

    def set_citation_registry(self, session_id: str, registry: list[dict]) -> None:
        session = self.get(session_id)
        if session:
            session.citation_registry = registry
            session.updated_at = _utcnow()

    def set_logic_audit_report(
        self,
        session_id: str,
        report: dict,
        latex_fingerprint: str | None = None,
    ) -> None:
        session = self.get(session_id)
        if not session:
            return
        audit_mode = (report.get("meta") or {}).get("audit_mode")
        key = "logic_gate_audit_report" if audit_mode == "gate" else "logic_audit_report"
        meta = {**(session.metadata or {}), key: report}
        if audit_mode == "gate" and latex_fingerprint:
            meta["logic_gate_audit_fingerprint"] = latex_fingerprint
        session.metadata = meta
        session.updated_at = _utcnow()


def _build_store():
    if is_db_enabled() and db_is_ready():
        from src.db.paper_repository import DatabaseSessionStore

        return DatabaseSessionStore()
    return InMemorySessionStore()


_store: InMemorySessionStore | object | None = None


def get_session_store():
    """Return DB-backed store when available (lazy rebind after startup)."""
    global _store
    if is_db_enabled() and db_is_ready():
        from src.db.paper_repository import DatabaseSessionStore

        if not isinstance(_store, DatabaseSessionStore):
            _store = DatabaseSessionStore()
    elif _store is None:
        _store = InMemorySessionStore()
    return _store


class SessionStoreProxy:
    def __getattr__(self, name: str):
        return getattr(get_session_store(), name)


session_store = SessionStoreProxy()


def refresh_session_store() -> None:
    """Rebind global store after DB init (app startup / tests)."""
    global _store
    _store = _build_store()
