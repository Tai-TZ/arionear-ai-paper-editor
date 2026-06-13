from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from src.config import LLMProvider


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000)
    session_id: str | None = None
    latex_content: str = Field(default="", max_length=500000)
    selection: str = Field(default="", max_length=20000)
    task: Literal["style", "structure", "logic", "citation", "chat"] | None = None
    llm_provider: LLMProvider | None = None
    llm_model: str | None = None


class IntegrityFlagSchema(BaseModel):
    code: str
    message: str
    severity: str


class ChatResponse(BaseModel):
    response: str
    analysis: str = ""
    task: str = "chat"
    suggestion: str = ""
    original_text: str = ""
    diff: str = ""
    integrity_flags: list[IntegrityFlagSchema] = Field(default_factory=list)
    citation_results: list[dict] = Field(default_factory=list)
    structure_suggestions: list[dict] = Field(default_factory=list)


class SessionCreate(BaseModel):
    id: str | None = None
    name: str = "Untitled"
    latex_content: str = ""
    metadata: dict = Field(default_factory=dict)


class SessionUpdate(BaseModel):
    name: str | None = None
    latex_content: str | None = None
    metadata: dict | None = None


class SessionResponse(BaseModel):
    id: str
    name: str
    latex_content: str
    metadata: dict
    created_at: datetime
    updated_at: datetime


class StyleEditRequest(BaseModel):
    session_id: str
    text: str = Field(..., min_length=1, max_length=20000)
    section: str = ""
    llm_provider: LLMProvider | None = None
    llm_model: str | None = None


class StyleEditResponse(BaseModel):
    original_text: str
    suggestion: str
    diff: str
    integrity_flags: list[IntegrityFlagSchema] = Field(default_factory=list)
    revision_id: str = ""


class RevisionAction(BaseModel):
    action: Literal["accepted", "rejected", "modified"]


class CitationVerifyRequest(BaseModel):
    session_id: str
    bib_content: str = ""


class CitationVerifyResponse(BaseModel):
    results: list[dict]
    summary: str


class ProviderInfo(BaseModel):
    id: str
    name: str
    default_model: str
    models: list[str]


class ProvidersResponse(BaseModel):
    default_provider: str
    providers: list[ProviderInfo]


class CompileAssetFile(BaseModel):
    name: str = Field(..., min_length=1, max_length=512)
    content_base64: str = Field(..., min_length=1, max_length=50_000_000)


class CompileRequest(BaseModel):
    latex: str = Field(..., min_length=1, max_length=500_000)
    assets: list[CompileAssetFile] = Field(default_factory=list)


class CompileResponse(BaseModel):
    success: bool
    pdf_base64: str = ""
    log: str = ""
    error: str = ""
    engine: str = ""


class CompileStatusResponse(BaseModel):
    available: bool
    engine: str | None = None
