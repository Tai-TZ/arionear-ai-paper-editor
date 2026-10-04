from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class AiDisclosurePeriod(BaseModel):
    first_interaction_at: datetime | None = None
    last_interaction_at: datetime | None = None


class AiDisclosureCounts(BaseModel):
    """Suggestion outcomes. ``accepted`` excludes ``modified`` (accepted after the author edited the diff)."""

    proposed: int = 0
    accepted: int = 0
    modified: int = 0
    rejected: int = 0
    pending: int = 0


class AiDisclosureTotals(AiDisclosureCounts):
    interactions: int = 0


class AiDisclosureTaskRow(AiDisclosureCounts):
    task: str
    interactions: int = 0


class AiDisclosureModelRow(BaseModel):
    provider: str | None = None
    provider_label: str | None = None
    model: str | None = None
    interactions: int = 0


class AiDisclosureAttribution(BaseModel):
    """How suggestions were matched to a task: exact link, time-window inference, or not at all."""

    linked: int = 0
    inferred: int = 0
    unattributed: int = 0


class AiDisclosureLocalizedText(BaseModel):
    en: str
    vi: str


class AiDisclosureReport(BaseModel):
    paper_id: str
    paper_title: str
    generated_at: datetime
    has_ai_usage: bool
    period: AiDisclosurePeriod
    totals: AiDisclosureTotals
    by_task: list[AiDisclosureTaskRow] = Field(default_factory=list)
    unattributed: AiDisclosureCounts = Field(default_factory=AiDisclosureCounts)
    models: list[AiDisclosureModelRow] = Field(default_factory=list)
    attribution: AiDisclosureAttribution = Field(default_factory=AiDisclosureAttribution)
    statement: AiDisclosureLocalizedText
    latex: AiDisclosureLocalizedText
    data_sources: list[str] = Field(default_factory=list)
