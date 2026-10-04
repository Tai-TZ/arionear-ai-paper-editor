"""Strict pydantic schemas for the JSON the LLM must return at each pipeline stage."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from src.models.peer_review_schemas import ReviewCategory

_CATEGORY_ALIASES: dict[str, str] = {
    "major": "major",
    "major_concern": "major",
    "major concern": "major",
    "major_issue": "major",
    "critical": "major",
    "minor": "minor",
    "minor_concern": "minor",
    "minor concern": "minor",
    "minor_issue": "minor",
    "editorial": "editorial",
    "typo": "editorial",
    "typos": "editorial",
    "grammar": "editorial",
    "language": "editorial",
    "formatting": "editorial",
    "style": "editorial",
    "question": "question",
    "questions": "question",
    "clarification": "question",
    "query": "question",
}


def normalize_category(value: object) -> object:
    """Map common synonyms ("Major concern", "typo", "clarification") onto the four categories."""
    if not isinstance(value, str):
        return value
    key = value.strip().lower()
    return _CATEGORY_ALIASES.get(key, _CATEGORY_ALIASES.get(key.replace("-", "_"), key))


class SplitItemPayload(BaseModel):
    reviewer: str | None = None
    quote: str = Field(..., min_length=1)
    category: ReviewCategory
    summary: str = ""

    @field_validator("category", mode="before")
    @classmethod
    def _category(cls, value: object) -> object:
        return normalize_category(value)

    @field_validator("reviewer", mode="before")
    @classmethod
    def _reviewer(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, int | float):
            return f"R{int(value)}"
        return value

    @field_validator("quote", "summary", mode="before")
    @classmethod
    def _strip(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class SplitPayload(BaseModel):
    items: list[SplitItemPayload]


class DraftItemPayload(BaseModel):
    id: str = Field(..., min_length=1)
    response: str = Field(..., min_length=1)
    proposed_change: str = ""
    section_refs: list[str] = Field(default_factory=list)

    @field_validator("id", "response", "proposed_change", mode="before")
    @classmethod
    def _strip(cls, value: object) -> object:
        if isinstance(value, int | float):
            return str(value)
        return value.strip() if isinstance(value, str) else value

    @field_validator("section_refs", mode="before")
    @classmethod
    def _refs(cls, value: object) -> object:
        if value is None:
            return []
        if isinstance(value, str):
            return [value] if value.strip() else []
        if isinstance(value, list):
            return [str(v).strip() for v in value if str(v).strip()]
        return value


class DraftPayload(BaseModel):
    responses: list[DraftItemPayload]
