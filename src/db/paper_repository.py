from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session, joinedload

from src.db.engine import get_db
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


def _paper_to_session(paper: Paper) -> PaperSession:
    revisions: list[RevisionRecord] = []
    for ai_session in paper.ai_sessions:
        for suggestion in ai_session.suggestions:
            revisions.append(
                RevisionRecord(
                    id=str(suggestion.id),
                    section=suggestion.section_label or "",
                    original=suggestion.original_text,
                    suggestion=suggestion.suggested_text,
                    action=_status_to_action(suggestion.status),
                    created_at=suggestion.created_at,
                )
            )

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


def _load_paper(db: Session, paper_id: uuid.UUID) -> Paper | None:
    return (
        db.query(Paper)
        .options(
            joinedload(Paper.citations),
            joinedload(Paper.ai_sessions).joinedload(AiSession.suggestions),
        )
        .filter(Paper.id == paper_id)
        .one_or_none()
    )


def _ensure_ai_session(db: Session, paper: Paper, task: TaskType = TaskType.CHAT) -> AiSession:
    if paper.ai_sessions:
        return paper.ai_sessions[-1]
    ai_session = AiSession(paper_id=paper.id, task_type=task)
    db.add(ai_session)
    db.flush()
    paper.ai_sessions.append(ai_session)
    return ai_session


class DatabaseSessionStore:
    """PostgreSQL-backed store mapping PaperSession API → papers + related tables."""

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
                    existing.metadata_ = metadata
                existing.updated_at = _utcnow()
                _ensure_ai_session(db, existing)
                db.flush()
                return _paper_to_session(_load_paper(db, paper_id) or existing)

            paper = Paper(
                id=paper_id,
                title=name,
                raw_latex=latex_content,
                metadata_=metadata or {},
                status=PaperStatus.DRAFT,
            )
            db.add(paper)
            db.flush()
            _ensure_ai_session(db, paper)
            return _paper_to_session(_load_paper(db, paper.id) or paper)

    def get(self, session_id: str) -> PaperSession | None:
        with get_db() as db:
            paper = _load_paper(db, _parse_uuid(session_id))
            return _paper_to_session(paper) if paper else None

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
                paper.metadata_ = metadata
            paper.updated_at = _utcnow()
            db.flush()
            return _paper_to_session(_load_paper(db, paper.id) or paper)

    def add_revision(
        self,
        session_id: str,
        section: str,
        original: str,
        suggestion: str,
    ) -> RevisionRecord | None:
        with get_db() as db:
            paper = _load_paper(db, _parse_uuid(session_id))
            if not paper:
                return None
            ai_session = _ensure_ai_session(db, paper, TaskType.STYLE)
            record = Suggestion(
                session_id=ai_session.id,
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

    def set_revision_action(
        self, session_id: str, revision_id: str, action: str
    ) -> RevisionRecord | None:
        with get_db() as db:
            paper = _load_paper(db, _parse_uuid(session_id))
            if not paper:
                return None
            rev_uuid = _parse_uuid(revision_id)
            for ai_session in paper.ai_sessions:
                for suggestion in ai_session.suggestions:
                    if suggestion.id == rev_uuid:
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
            return None

    def set_citation_registry(self, session_id: str, registry: list[dict]) -> None:
        with get_db() as db:
            paper = _load_paper(db, _parse_uuid(session_id))
            if not paper:
                return
            paper.citations.clear()
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

    def set_logic_audit_report(self, session_id: str, report: dict) -> None:
        with get_db() as db:
            paper = _load_paper(db, _parse_uuid(session_id))
            if not paper:
                return
            meta = dict(paper.metadata_ or {})
            meta["logic_audit_report"] = report
            paper.metadata_ = meta
            paper.updated_at = _utcnow()
