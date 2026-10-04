"""Request/response models for the peer-review response assistant (POST /review/respond)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from src.config import LLMProvider, normalize_llm_provider

ReviewCategory = Literal["major", "minor", "editorial", "question"]
ReviewTone = Literal["courteous", "formal", "concise", "confident"]
LetterLanguage = Literal["en", "vi"]
PeerReviewWarning = Literal[
    "comments_truncated",
    "manuscript_truncated",
    "items_capped",
    "split_fallback",
    "draft_partial",
]

# Hard request limit (422 above it). The pipeline additionally soft-truncates what reaches the LLM.
PEER_REVIEW_COMMENTS_MAX_LENGTH = 100_000


class PeerReviewRequest(BaseModel):
    comments: str = Field(..., min_length=1, max_length=PEER_REVIEW_COMMENTS_MAX_LENGTH)
    latex_content: str = Field(default="", max_length=500_000)
    session_id: str | None = None
    locale: Literal["vi", "en"] | None = None
    tone: ReviewTone | None = None
    llm_provider: LLMProvider | None = None
    llm_model: str | None = None

    @field_validator("comments", mode="before")
    @classmethod
    def _strip_comments(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("llm_provider", mode="before")
    @classmethod
    def _normalize_provider(cls, value: object) -> object | None:
        if value == "":
            return None
        if isinstance(value, str):
            return normalize_llm_provider(value)
        return value

    @field_validator("llm_model", "session_id", "tone", "locale", mode="before")
    @classmethod
    def _empty_to_none(cls, value: object) -> object | None:
        if value == "":
            return None
        return value


class PeerReviewItem(BaseModel):
    id: str
    reviewer: str | None = None
    category: ReviewCategory
    quote: str
    quote_verified: bool = True
    summary: str = ""
    response: str = ""
    proposed_change: str = ""
    section_refs: list[str] = Field(default_factory=list)
    needs_author_input: bool = False
    unverified_numbers: list[str] = Field(default_factory=list)
    draft_failed: bool = False


class PeerReviewResponse(BaseModel):
    items: list[PeerReviewItem] = Field(default_factory=list)
    reviewers: list[str] = Field(default_factory=list)
    letter_language: LetterLanguage = "en"
    warnings: list[PeerReviewWarning] = Field(default_factory=list)
    omitted_item_count: int = 0
    provider: str = ""
    model: str = ""
