from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ConflictType = Literal[
    "claim_evidence_mismatch",
    "internal_contradiction",
    "unsupported_claim",
    "missing_citation",
    "unclear_reasoning",
]
Severity = Literal["critical", "warning", "info"]
SuggestedAction = Literal["clarify", "add_citation", "revise_claim", "none"]


class LogicConflictItem(BaseModel):
    id: str
    type: ConflictType
    severity: Severity = "warning"
    claim_text: str = ""
    evidence_text: str = ""
    comment: str
    suggested_action: SuggestedAction = "none"
    persona_sources: list[str] = Field(default_factory=list)


class LogicSectionReport(BaseModel):
    section: str
    conflicts: list[LogicConflictItem] = Field(default_factory=list)
    weak_claims: list[str] = Field(default_factory=list)
    consensus_notes: list[str] = Field(default_factory=list)


class CrossSectionConflict(BaseModel):
    type: str
    description: str
    spans: list[dict[str, str]] = Field(default_factory=list)


class LogicAuditReport(BaseModel):
    summary: str = ""
    integrity_mode: str = "comment_only"
    sections: list[LogicSectionReport] = Field(default_factory=list)
    cross_section_conflicts: list[CrossSectionConflict] = Field(default_factory=list)
    meta: dict = Field(default_factory=dict)
