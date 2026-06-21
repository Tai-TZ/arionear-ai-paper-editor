from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

UiLanguage = Literal["en", "vi"]
PaperType = Literal["journal", "conference", "thesis", "report"]
RewriteIntensity = Literal["light", "moderate", "strong"]
IntegrityStrictness = Literal["relaxed", "standard", "strict"]
CitationStyle = Literal["ieee", "apa", "vancouver", "chicago", "nature"]
DefaultTemplate = Literal["imrad", "ieee", "acm", "springer", "blank"]
WritingLocale = Literal["en-US", "en-GB"]
LlmProviderPref = Literal["openrouter", "openai", "anthropic", "zai", "nvidia"]


class ResearcherProfileResponse(BaseModel):
    id: str
    name: str
    email: str
    affiliation: str | None = None
    department: str | None = None
    position: str | None = None
    native_language: str | None = None
    research_field: str | None = None
    orcid: str | None = None
    google_scholar_url: str | None = None
    avatar_url: str | None = None
    timezone: str = "Asia/Bangkok"
    ui_language: UiLanguage = "en"
    paper_type: PaperType = "journal"
    target_venue: str | None = None
    target_deadline: str | None = None
    default_template: DefaultTemplate = "imrad"
    citation_style: CitationStyle = "ieee"
    writing_locale: WritingLocale = "en-US"
    default_llm_provider: LlmProviderPref = "openrouter"
    default_llm_model: str | None = None
    rewrite_intensity: RewriteIntensity = "light"
    integrity_strictness: IntegrityStrictness = "standard"
    auto_compile: bool = False
    auto_save: bool = True
    synctex_highlight_ms: int = Field(default=5000, ge=1000, le=15000)
    store_drafts: bool = True
    telemetry_opt_in: bool = False
    updated_at: str | None = None


class ResearcherProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    affiliation: str | None = Field(default=None, max_length=300)
    department: str | None = Field(default=None, max_length=200)
    position: str | None = Field(default=None, max_length=120)
    native_language: str | None = Field(default=None, max_length=64)
    research_field: str | None = Field(default=None, max_length=200)
    orcid: str | None = Field(default=None, max_length=32)
    google_scholar_url: str | None = Field(default=None, max_length=500)
    avatar_url: str | None = Field(default=None, max_length=500)
    timezone: str | None = Field(default=None, max_length=64)
    ui_language: UiLanguage | None = None
    paper_type: PaperType | None = None
    target_venue: str | None = Field(default=None, max_length=300)
    target_deadline: str | None = Field(default=None, max_length=32)
    default_template: DefaultTemplate | None = None
    citation_style: CitationStyle | None = None
    writing_locale: WritingLocale | None = None
    default_llm_provider: LlmProviderPref | None = None
    default_llm_model: str | None = Field(default=None, max_length=200)
    rewrite_intensity: RewriteIntensity | None = None
    integrity_strictness: IntegrityStrictness | None = None
    auto_compile: bool | None = None
    auto_save: bool | None = None
    synctex_highlight_ms: int | None = Field(default=None, ge=1000, le=15000)
    store_drafts: bool | None = None
    telemetry_opt_in: bool | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @model_validator(mode="before")
    @classmethod
    def _empty_strings_to_none(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        cleaned: dict[str, object] = {}
        for key, value in data.items():
            if key == "name":
                cleaned[key] = value
                continue
            if isinstance(value, str) and not value.strip():
                cleaned[key] = None
            else:
                cleaned[key] = value.strip() if isinstance(value, str) else value
        return cleaned
