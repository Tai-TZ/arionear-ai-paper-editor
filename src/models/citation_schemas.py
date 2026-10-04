"""Schemas for Citation Layer 4 — LLM relevance (does the cited source support the claim?)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.config import LLMProvider

RELEVANCE_MAX_KEYS_PER_REQUEST = 15

RelevanceVerdict = Literal["supports", "partial", "unrelated", "insufficient_info"]
# Why a verdict was produced — lets the UI explain `insufficient_info` without inventing text.
RelevanceReason = Literal["judged", "not_cited", "no_abstract", "llm_error", "invalid_output"]


class CitationRelevanceRequest(BaseModel):
    session_id: str
    # Cite keys to check (typically the verified ones). Empty → every cite key in the manuscript.
    # Only the first RELEVANCE_MAX_KEYS_PER_REQUEST unique keys are judged; the rest are reported as skipped.
    keys: list[str] = Field(default_factory=list, max_length=500)
    bib_content: str = Field(default="", max_length=2_000_000)
    # Live editor source; falls back to the session's stored LaTeX when empty. Never persisted here.
    latex_content: str = Field(default="", max_length=500_000)
    locale: Literal["vi", "en"] | None = None
    llm_provider: LLMProvider | None = None

    @field_validator("keys", mode="before")
    @classmethod
    def _clean_keys(cls, value: object) -> object:
        if not isinstance(value, list):
            return value
        cleaned: list[str] = []
        for item in value:
            key = str(item or "").strip()[:200]
            if key and key not in cleaned:
                cleaned.append(key)
        return cleaned


class RelevanceLLMOutput(BaseModel):
    """Strict shape the LLM must return; anything else is treated as `insufficient_info`."""

    model_config = ConfigDict(extra="ignore")

    verdict: RelevanceVerdict
    rationale: str = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0)

    @field_validator("rationale")
    @classmethod
    def _trim_rationale(cls, value: str) -> str:
        text = " ".join(value.split())
        if not text:
            raise ValueError("rationale must not be blank")
        return text[:400]


class CitationRelevanceItem(BaseModel):
    key: str
    verdict: RelevanceVerdict
    reason: RelevanceReason
    rationale: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    claim_snippets: list[str] = Field(default_factory=list)
    source_title: str = ""
    source: Literal["openalex", "semantic_scholar", ""] = ""


class CitationRelevanceResponse(BaseModel):
    results: list[CitationRelevanceItem]
    summary: str
    skipped_keys: list[str] = Field(default_factory=list)
    max_keys: int = RELEVANCE_MAX_KEYS_PER_REQUEST
