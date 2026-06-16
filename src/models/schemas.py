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


class CompileEnginesInfo(BaseModel):
    pdflatex: str | None = None
    xelatex: str | None = None
    lualatex: str | None = None
    latex: str | None = None
    latexmk: str | None = None
    biber: str | None = None
    bibtex: str | None = None


class CompileRequest(BaseModel):
    latex: str = Field(..., min_length=1, max_length=500_000)
    main_file: str = Field(default="main.tex", max_length=512)
    compiler: Literal["auto", "pdflatex", "xelatex", "lualatex", "latex"] = "auto"
    assets: list[CompileAssetFile] = Field(default_factory=list)


class CompileResponse(BaseModel):
    success: bool
    pdf_base64: str = ""
    log: str = ""
    error: str = ""
    engine: str = ""
    compiler: str = ""
    warning: str = ""
    synctex_base64: str = ""
    main_file: str = "main.tex"


class CompileStatusResponse(BaseModel):
    available: bool
    engine: str | None = None
    engines: CompileEnginesInfo = Field(default_factory=CompileEnginesInfo)


class SyncTeXLookupRequest(BaseModel):
    synctex_base64: str = Field(..., min_length=1)
    pdf_base64: str = Field(..., min_length=1)
    page: int = Field(..., ge=1)
    x: float = 0.0
    y: float = 0.0
    jobname: str = Field(default="main", max_length=128)
    word: str = Field(default="", max_length=256)
    context: str = Field(default="", max_length=512)
    latex: str = Field(default="", max_length=2_000_000)


class SyncTeXLookupResponse(BaseModel):
    file: str = ""
    line: int = 0
    synctex_line: int = 0
    column: int = -1
    page: int = 0
    found: bool = False


class PaperCreate(BaseModel):
    name: str = Field(default="Untitled", min_length=1, max_length=512)
    latex: str = Field(default="", max_length=500_000)
    metadata: dict = Field(default_factory=dict)


class PaperUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=512)
    latex: str | None = Field(default=None, max_length=500_000)
    metadata: dict | None = None
    assets: list[dict] = Field(default_factory=list)


class PaperSummary(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime


class PaperResponse(BaseModel):
    id: str
    name: str
    latex: str
    metadata: dict
    created_at: datetime
    updated_at: datetime

