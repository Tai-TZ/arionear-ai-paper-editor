from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


# ─── Enums (mirror Prisma) ───────────────────────────────────────────────────


class UserRole(enum.StrEnum):
    RESEARCHER = "RESEARCHER"
    ADMIN = "ADMIN"


class UserTier(enum.StrEnum):
    FREE = "FREE"
    PRO = "PRO"


class PaperStatus(enum.StrEnum):
    DRAFT = "DRAFT"
    IN_REVIEW = "IN_REVIEW"
    SUBMITTED = "SUBMITTED"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class SectionType(enum.StrEnum):
    ABSTRACT = "ABSTRACT"
    INTRODUCTION = "INTRODUCTION"
    METHODS = "METHODS"
    RESULTS = "RESULTS"
    DISCUSSION = "DISCUSSION"
    CONCLUSION = "CONCLUSION"
    REFERENCES = "REFERENCES"
    CUSTOM = "CUSTOM"
    FULL_DOCUMENT = "FULL_DOCUMENT"


class TaskType(enum.StrEnum):
    STYLE = "STYLE"
    STRUCTURE = "STRUCTURE"
    LOGIC = "LOGIC"
    CITATION = "CITATION"
    TEMPLATE = "TEMPLATE"
    CHAT = "CHAT"


class SuggestionType(enum.StrEnum):
    STYLE = "STYLE"
    GRAMMAR = "GRAMMAR"
    STRUCTURE = "STRUCTURE"
    CITATION = "CITATION"
    LOGIC = "LOGIC"
    GENERAL = "GENERAL"


class SuggestionStatus(enum.StrEnum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    MODIFIED = "MODIFIED"


class CitationType(enum.StrEnum):
    JOURNAL = "JOURNAL"
    CONFERENCE = "CONFERENCE"
    BOOK = "BOOK"
    PREPRINT = "PREPRINT"
    WEB = "WEB"
    OTHER = "OTHER"


class CitationVerificationStatus(enum.StrEnum):
    VERIFIED = "VERIFIED"
    PARTIAL = "PARTIAL"
    UNVERIFIED = "UNVERIFIED"
    NOT_FOUND = "NOT_FOUND"
    ERROR = "ERROR"


class ReviewSeverity(enum.StrEnum):
    CRITICAL = "CRITICAL"
    MAJOR = "MAJOR"
    MINOR = "MINOR"
    SUGGESTION = "SUGGESTION"


class ReviewCategory(enum.StrEnum):
    METHODOLOGY = "METHODOLOGY"
    CLARITY = "CLARITY"
    NOVELTY = "NOVELTY"
    CITATION = "CITATION"
    LANGUAGE = "LANGUAGE"
    OTHER = "OTHER"


class ResponseStatus(enum.StrEnum):
    DRAFT = "DRAFT"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"


class AuditActionType(enum.StrEnum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    ACCEPT_SUGGESTION = "ACCEPT_SUGGESTION"
    REJECT_SUGGESTION = "REJECT_SUGGESTION"
    VERIFY_CITATION = "VERIFY_CITATION"
    CHAT = "CHAT"


JsonType = JSON().with_variant(JSONB(), "postgresql")


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


# ─── Models ──────────────────────────────────────────────────────────────────


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    institution: Mapped[str | None] = mapped_column(String(255))
    native_language: Mapped[str | None] = mapped_column(String(64))
    research_field: Mapped[str | None] = mapped_column(String(128))
    profile_settings: Mapped[dict] = mapped_column(JsonType, default=dict)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", native_enum=False),
        default=UserRole.RESEARCHER,
    )
    password_hash: Mapped[str | None] = mapped_column(String(255))
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    papers: Mapped[list[Paper]] = relationship(back_populates="user")
    ai_sessions: Mapped[list[AiSession]] = relationship(back_populates="user")
    audit_logs: Mapped[list[AuditLog]] = relationship(back_populates="user")
    password_reset_tokens: Mapped[list[PasswordResetToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    subscription: Mapped[UserSubscription | None] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )


class UserSubscription(Base):
    __tablename__ = "user_subscriptions"
    __table_args__ = (Index("ix_user_subscriptions_user_id", "user_id"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    tier: Mapped[UserTier] = mapped_column(
        Enum(UserTier, name="user_tier", native_enum=False),
        default=UserTier.FREE,
    )
    defense_turns_used: Mapped[int] = mapped_column(Integer, default=0)
    turns_reset_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    upgraded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    user: Mapped[User] = relationship(back_populates="subscription")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    __table_args__ = (Index("ix_password_reset_tokens_user_id", "user_id"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    user: Mapped[User] = relationship(back_populates="password_reset_tokens")


class SignupVerification(Base):
    __tablename__ = "signup_verifications"
    __table_args__ = (Index("ix_signup_verifications_email", "email"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    institution: Mapped[str | None] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Paper(Base):
    __tablename__ = "papers"
    __table_args__ = (Index("ix_papers_user_id", "user_id"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(512), default="Untitled")
    status: Mapped[PaperStatus] = mapped_column(
        Enum(PaperStatus, name="paper_status", native_enum=False),
        default=PaperStatus.DRAFT,
    )
    target_journal: Mapped[str | None] = mapped_column(String(255))
    citation_style: Mapped[str | None] = mapped_column(String(64))
    language_level: Mapped[str | None] = mapped_column(String(64))
    raw_latex: Mapped[str] = mapped_column(Text, default="")
    metadata_: Mapped[dict] = mapped_column("metadata", JsonType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    user: Mapped[User | None] = relationship(back_populates="papers")
    sections: Mapped[list[PaperSection]] = relationship(
        back_populates="paper", cascade="all, delete-orphan"
    )
    ai_sessions: Mapped[list[AiSession]] = relationship(
        back_populates="paper", cascade="all, delete-orphan"
    )
    citations: Mapped[list[Citation]] = relationship(
        back_populates="paper", cascade="all, delete-orphan"
    )
    reviewer_comments: Mapped[list[ReviewerComment]] = relationship(
        back_populates="paper", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list[AuditLog]] = relationship(back_populates="paper")


class PaperSection(Base):
    __tablename__ = "paper_sections"
    __table_args__ = (Index("ix_paper_sections_paper_id", "paper_id"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("papers.id", ondelete="CASCADE"), nullable=False
    )
    section_type: Mapped[SectionType] = mapped_column(
        Enum(SectionType, name="section_type", native_enum=False),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    original_content: Mapped[str] = mapped_column(Text, default="")
    current_content: Mapped[str] = mapped_column(Text, default="")
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    paper: Mapped[Paper] = relationship(back_populates="sections")
    ai_sessions: Mapped[list[AiSession]] = relationship(back_populates="section")
    suggestions: Mapped[list[Suggestion]] = relationship(back_populates="section")
    citation_usages: Mapped[list[CitationUsage]] = relationship(
        back_populates="section", cascade="all, delete-orphan"
    )


class AiSession(Base):
    __tablename__ = "ai_sessions"
    __table_args__ = (
        Index("ix_ai_sessions_paper_id", "paper_id"),
        Index("ix_ai_sessions_section_id", "section_id"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("papers.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("paper_sections.id", ondelete="SET NULL")
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    task_type: Mapped[TaskType] = mapped_column(
        Enum(TaskType, name="task_type", native_enum=False), nullable=False
    )
    user_input: Mapped[str] = mapped_column(Text, default="")
    ai_output: Mapped[str] = mapped_column(Text, default="")
    metadata_: Mapped[dict] = mapped_column("metadata", JsonType, default=dict)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    confidence_score: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    paper: Mapped[Paper] = relationship(back_populates="ai_sessions")
    section: Mapped[PaperSection | None] = relationship(back_populates="ai_sessions")
    user: Mapped[User | None] = relationship(back_populates="ai_sessions")
    suggestions: Mapped[list[Suggestion]] = relationship(
        back_populates="ai_session", cascade="all, delete-orphan"
    )
    response_suggestions: Mapped[list[ResponseSuggestion]] = relationship(
        back_populates="ai_session", cascade="all, delete-orphan"
    )


class Suggestion(Base):
    __tablename__ = "suggestions"
    __table_args__ = (Index("ix_suggestions_session_id", "session_id"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ai_sessions.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("paper_sections.id", ondelete="SET NULL")
    )
    suggestion_type: Mapped[SuggestionType] = mapped_column(
        Enum(SuggestionType, name="suggestion_type", native_enum=False),
        default=SuggestionType.STYLE,
    )
    original_text: Mapped[str] = mapped_column(Text, nullable=False)
    suggested_text: Mapped[str] = mapped_column(Text, nullable=False)
    section_label: Mapped[str | None] = mapped_column(String(128))
    explanation: Mapped[str | None] = mapped_column(Text)
    diff: Mapped[str | None] = mapped_column(Text)
    status: Mapped[SuggestionStatus] = mapped_column(
        Enum(SuggestionStatus, name="suggestion_status", native_enum=False),
        default=SuggestionStatus.PENDING,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    ai_session: Mapped[AiSession] = relationship(back_populates="suggestions")
    section: Mapped[PaperSection | None] = relationship(back_populates="suggestions")


class Citation(Base):
    __tablename__ = "citations"
    __table_args__ = (
        UniqueConstraint("paper_id", "citation_key", name="uq_citations_paper_key"),
        Index("ix_citations_paper_id", "paper_id"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("papers.id", ondelete="CASCADE"), nullable=False
    )
    citation_key: Mapped[str] = mapped_column(String(255), nullable=False)
    citation_type: Mapped[CitationType] = mapped_column(
        Enum(CitationType, name="citation_type", native_enum=False),
        default=CitationType.OTHER,
    )
    authors: Mapped[str | None] = mapped_column(String(1024))
    title: Mapped[str | None] = mapped_column(String(1024))
    journal: Mapped[str | None] = mapped_column(String(512))
    year: Mapped[int | None] = mapped_column(Integer)
    doi: Mapped[str | None] = mapped_column(String(255))
    eprint: Mapped[str | None] = mapped_column(String(128))
    raw_text: Mapped[str | None] = mapped_column(Text)
    formatted_styles: Mapped[dict] = mapped_column(JsonType, default=dict)
    verification_status: Mapped[CitationVerificationStatus] = mapped_column(
        Enum(CitationVerificationStatus, name="citation_verification_status", native_enum=False),
        default=CitationVerificationStatus.UNVERIFIED,
    )
    verification_message: Mapped[str | None] = mapped_column(Text)
    verification_layers: Mapped[list] = mapped_column(JsonType, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    paper: Mapped[Paper] = relationship(back_populates="citations")
    usages: Mapped[list[CitationUsage]] = relationship(
        back_populates="citation", cascade="all, delete-orphan"
    )


class CitationUsage(Base):
    __tablename__ = "citation_usages"
    __table_args__ = (
        Index("ix_citation_usages_citation_id", "citation_id"),
        Index("ix_citation_usages_section_id", "section_id"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    citation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("citations.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("paper_sections.id", ondelete="CASCADE"), nullable=False
    )
    position_start: Mapped[int] = mapped_column(Integer, nullable=False)
    position_end: Mapped[int] = mapped_column(Integer, nullable=False)
    context_snippet: Mapped[str] = mapped_column(Text, nullable=False)

    citation: Mapped[Citation] = relationship(back_populates="usages")
    section: Mapped[PaperSection] = relationship(back_populates="citation_usages")


class ReviewerComment(Base):
    __tablename__ = "reviewer_comments"
    __table_args__ = (Index("ix_reviewer_comments_paper_id", "paper_id"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("papers.id", ondelete="CASCADE"), nullable=False
    )
    reviewer_label: Mapped[str] = mapped_column(String(64), nullable=False)
    comment_text: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[ReviewSeverity] = mapped_column(
        Enum(ReviewSeverity, name="review_severity", native_enum=False), nullable=False
    )
    category: Mapped[ReviewCategory] = mapped_column(
        Enum(ReviewCategory, name="review_category", native_enum=False), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    paper: Mapped[Paper] = relationship(back_populates="reviewer_comments")
    response_suggestions: Mapped[list[ResponseSuggestion]] = relationship(
        back_populates="comment", cascade="all, delete-orphan"
    )


class ResponseSuggestion(Base):
    __tablename__ = "response_suggestions"
    __table_args__ = (Index("ix_response_suggestions_comment_id", "comment_id"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    comment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reviewer_comments.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ai_sessions.id", ondelete="CASCADE"), nullable=False
    )
    suggested_response: Mapped[str] = mapped_column(Text, nullable=False)
    revision_note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ResponseStatus] = mapped_column(
        Enum(ResponseStatus, name="response_status", native_enum=False),
        default=ResponseStatus.DRAFT,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    comment: Mapped[ReviewerComment] = relationship(back_populates="response_suggestions")
    ai_session: Mapped[AiSession] = relationship(back_populates="response_suggestions")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_paper_id", "paper_id"),
        Index("ix_audit_logs_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    paper_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("papers.id", ondelete="SET NULL")
    )
    action_type: Mapped[AuditActionType] = mapped_column(
        Enum(AuditActionType, name="audit_action_type", native_enum=False), nullable=False
    )
    before_state: Mapped[dict | None] = mapped_column(JsonType)
    after_state: Mapped[dict | None] = mapped_column(JsonType)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    user: Mapped[User | None] = relationship(back_populates="audit_logs")
    paper: Mapped[Paper | None] = relationship(back_populates="audit_logs")


class PlatformProviderKey(Base):
    __tablename__ = "platform_provider_keys"
    __table_args__ = (
        UniqueConstraint("provider", "priority", name="uq_platform_provider_keys_provider_priority"),
        Index("ix_platform_provider_keys_provider", "provider"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    label: Mapped[str | None] = mapped_column(String(64))
    key_ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    key_hint: Mapped[str] = mapped_column(String(32), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
