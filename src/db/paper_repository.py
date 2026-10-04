from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session, defer

from src.db.engine import get_db, retry_on_lock_timeout
from src.db.models import (
    AiSession,
    Citation,
    CitationVerificationStatus,
    Paper,
    PaperStatus,
    Suggestion,
    SuggestionStatus,
    SuggestionType,
    TaskType,
)
from src.services.sessions import PaperSession, RevisionRecord


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _parse_uuid(value: str) -> uuid.UUID:
    return uuid.UUID(value)


def _status_to_action(status: SuggestionStatus) -> str:
    return status.value.lower()


def _action_to_status(action: str) -> SuggestionStatus:
    mapping = {
        "pending": SuggestionStatus.PENDING,
        "accepted": SuggestionStatus.ACCEPTED,
        "rejected": SuggestionStatus.REJECTED,
        "modified": SuggestionStatus.MODIFIED,
    }
    return mapping.get(action.lower(), SuggestionStatus.PENDING)


def _verification_status_from_api(status: str | None) -> CitationVerificationStatus:
    if not status:
        return CitationVerificationStatus.UNVERIFIED
    try:
        return CitationVerificationStatus(status.upper())
    except ValueError:
        return CitationVerificationStatus.UNVERIFIED


def _citation_to_registry_row(citation: Citation) -> dict:
    return {
        "key": citation.citation_key,
        "status": citation.verification_status.value.lower(),
        "layers": citation.verification_layers or [],
        "metadata": {
            "title": citation.title,
            "doi": citation.doi,
            "eprint": citation.eprint,
            "authors": citation.authors,
            "journal": citation.journal,
            "year": citation.year,
        },
        "message": citation.verification_message or "",
    }


def _load_revisions(db: Session, paper_id: uuid.UUID) -> list[RevisionRecord]:
    """All suggestions of a paper, oldest first — one indexed query, no ``ai_sessions`` rows hydrated.

    ``ai_sessions`` also holds one usage row per LLM call (see ``usage_tracking.record_ai_usage``), so the
    paper → sessions → suggestions graph must never be loaded wholesale.
    """
    rows = (
        db.query(
            Suggestion.id,
            Suggestion.section_label,
            Suggestion.original_text,
            Suggestion.suggested_text,
            Suggestion.status,
            Suggestion.created_at,
        )
        .join(AiSession, Suggestion.session_id == AiSession.id)
        .filter(AiSession.paper_id == paper_id)
        .order_by(Suggestion.created_at, Suggestion.id)
        .all()
    )
    return [
        RevisionRecord(
            id=str(suggestion_id),
            section=section_label or "",
            original=original_text,
            suggestion=suggested_text,
            action=_status_to_action(status),
            created_at=created_at,
        )
        for suggestion_id, section_label, original_text, suggested_text, status, created_at in rows
    ]


def _load_citation_rows(db: Session, paper_id: uuid.UUID) -> list[dict]:
    citations = db.query(Citation).filter(Citation.paper_id == paper_id).all()
    return [_citation_to_registry_row(c) for c in citations]


def _paper_to_session(db: Session, paper: Paper, *, is_new: bool = False) -> PaperSession:
    """Build the API view of a paper with targeted queries (a brand-new paper has no children)."""
    return PaperSession(
        id=str(paper.id),
        name=paper.title,
        latex_content=paper.raw_latex,
        metadata=paper.metadata_ or {},
        citation_registry=[] if is_new else _load_citation_rows(db, paper.id),
        revision_history=[] if is_new else _load_revisions(db, paper.id),
        created_at=paper.created_at,
        updated_at=paper.updated_at,
    )


def _load_paper(db: Session, paper_id: uuid.UUID, *, light: bool = False) -> Paper | None:
    """Load only the ``papers`` row; ``light`` skips the LaTeX blob and metadata JSON."""
    query = db.query(Paper)
    if light:
        query = query.options(defer(Paper.raw_latex), defer(Paper.metadata_))
    return query.filter(Paper.id == paper_id).one_or_none()


def _ensure_ai_session(db: Session, paper_id: uuid.UUID, task: TaskType = TaskType.CHAT) -> uuid.UUID:
    """Return the id of the paper's editor session that owns suggestions, creating it if missing.

    Editor sessions are the empty placeholder rows created with the paper; usage rows written per LLM call
    carry input/output text and are never picked. The newest placeholder wins (deterministic order).
    """
    existing = (
        db.query(AiSession.id)
        .filter(
            AiSession.paper_id == paper_id,
            AiSession.user_input == "",
            AiSession.ai_output == "",
            AiSession.tokens_used == 0,
        )
        .order_by(AiSession.created_at.desc(), AiSession.id.desc())
        .limit(1)
        .scalar()
    )
    if existing is not None:
        return existing
    ai_session = AiSession(paper_id=paper_id, task_type=task)
    db.add(ai_session)
    db.flush()
    return ai_session.id


class DatabaseSessionStore:
    """PostgreSQL-backed store mapping PaperSession API → papers + related tables."""

    @retry_on_lock_timeout()
    def create(
        self,
        session_id: str | None = None,
        name: str = "Untitled",
        latex_content: str = "",
        metadata: dict | None = None,
    ) -> PaperSession:
        paper_id = _parse_uuid(session_id) if session_id else uuid.uuid4()
        with get_db() as db:
            existing = _load_paper(db, paper_id)
            if existing:
                if name:
                    existing.title = name
                if latex_content:
                    existing.raw_latex = latex_content
                if metadata is not None:
                    merged = dict(existing.metadata_ or {})
                    merged.update(metadata)
                    existing.metadata_ = merged
                existing.updated_at = _utcnow()
                _ensure_ai_session(db, existing.id)
                db.flush()
                return _paper_to_session(db, existing)

            paper = Paper(
                id=paper_id,
                title=name,
                raw_latex=latex_content,
                metadata_=metadata or {},
                status=PaperStatus.DRAFT,
            )
            db.add(paper)
            db.flush()
            _ensure_ai_session(db, paper.id)
            return _paper_to_session(db, paper, is_new=True)

    def get(self, session_id: str) -> PaperSession | None:
        with get_db() as db:
            paper = _load_paper(db, _parse_uuid(session_id))
            return _paper_to_session(db, paper) if paper else None

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
                updated = self.update(session_id, latex_content=latex_content)
                return updated or existing
            return existing
        return self.create(session_id, name, latex_content, metadata)

    @retry_on_lock_timeout()
    def update(
        self,
        session_id: str,
        name: str | None = None,
        latex_content: str | None = None,
        metadata: dict | None = None,
    ) -> PaperSession | None:
        with get_db() as db:
            paper = _load_paper(db, _parse_uuid(session_id))
            if not paper:
                return None
            if name is not None:
                paper.title = name
            if latex_content is not None:
                paper.raw_latex = latex_content
            if metadata is not None:
                merged = dict(paper.metadata_ or {})
                merged.update(metadata)
                paper.metadata_ = merged
            paper.updated_at = _utcnow()
            db.flush()
            # The row is already in memory — only the child collections need a (targeted) read.
            return _paper_to_session(db, paper)

    @retry_on_lock_timeout()
    def add_revision(
        self,
        session_id: str,
        section: str,
        original: str,
        suggestion: str,
    ) -> RevisionRecord | None:
        with get_db() as db:
            paper = _load_paper(db, _parse_uuid(session_id), light=True)
            if not paper:
                return None
            ai_session_id = _ensure_ai_session(db, paper.id, TaskType.STYLE)
            record = Suggestion(
                session_id=ai_session_id,
                suggestion_type=SuggestionType.STYLE,
                original_text=original,
                suggested_text=suggestion,
                section_label=section,
                status=SuggestionStatus.PENDING,
            )
            db.add(record)
            db.flush()
            paper.updated_at = _utcnow()
            return RevisionRecord(
                id=str(record.id),
                section=section,
                original=original,
                suggestion=suggestion,
                action="pending",
                created_at=record.created_at,
            )

    @retry_on_lock_timeout()
    def set_revision_action(self, session_id: str, revision_id: str, action: str) -> RevisionRecord | None:
        with get_db() as db:
            paper = _load_paper(db, _parse_uuid(session_id), light=True)
            if not paper:
                return None
            rev_uuid = _parse_uuid(revision_id)
            suggestion = (
                db.query(Suggestion)
                .join(AiSession, Suggestion.session_id == AiSession.id)
                .filter(Suggestion.id == rev_uuid, AiSession.paper_id == paper.id)
                .one_or_none()
            )
            if suggestion is None:
                return None
            suggestion.status = _action_to_status(action)
            suggestion.resolved_at = _utcnow()
            paper.updated_at = _utcnow()
            db.flush()
            return RevisionRecord(
                id=str(suggestion.id),
                section=suggestion.section_label or "",
                original=suggestion.original_text,
                suggestion=suggestion.suggested_text,
                action=action,
                created_at=suggestion.created_at,
            )

    @retry_on_lock_timeout()
    def set_citation_registry(self, session_id: str, registry: list[dict]) -> None:
        with get_db() as db:
            paper = _load_paper(db, _parse_uuid(session_id), light=True)
            if not paper:
                return
            paper.citations.clear()
            # The unit of work runs INSERTs before DELETEs, so flush the removals first or re-verifying
            # the same keys trips the (paper_id, citation_key) unique constraint.
            db.flush()
            for row in registry:
                key = row.get("key") or row.get("citation_key") or ""
                if not key:
                    continue
                meta = row.get("metadata") or {}
                paper.citations.append(
                    Citation(
                        paper_id=paper.id,
                        citation_key=key,
                        title=meta.get("title"),
                        doi=meta.get("doi"),
                        eprint=meta.get("eprint"),
                        authors=meta.get("authors"),
                        journal=meta.get("journal"),
                        year=meta.get("year"),
                        verification_status=_verification_status_from_api(row.get("status")),
                        verification_message=row.get("message"),
                        verification_layers=row.get("layers") or [],
                    )
                )
            paper.updated_at = _utcnow()

    @retry_on_lock_timeout()
    def set_logic_audit_report(
        self,
        session_id: str,
        report: dict,
        latex_fingerprint: str | None = None,
    ) -> None:
        with get_db() as db:
            paper = _load_paper(db, _parse_uuid(session_id))
            if not paper:
                return
            meta = dict(paper.metadata_ or {})
            audit_mode = (report.get("meta") or {}).get("audit_mode")
            key = "logic_gate_audit_report" if audit_mode == "gate" else "logic_audit_report"
            meta[key] = report
            if audit_mode == "gate" and latex_fingerprint:
                meta["logic_gate_audit_fingerprint"] = latex_fingerprint
            paper.metadata_ = meta
            paper.updated_at = _utcnow()
