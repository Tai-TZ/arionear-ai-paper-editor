from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PaperTemplateSummary(BaseModel):
    id: str
    slug: str
    title: str
    title_vi: str | None = None
    description: str
    description_vi: str | None = None
    author: str
    tags: list[str] = Field(default_factory=list)
    is_official: bool = False
    format: str = "ieee"
    venue: str = "journal"
    featured: bool = False
    has_preview: bool = False
    has_pdf: bool = False
    updated_at: datetime | None = None


class PaperTemplateDetail(PaperTemplateSummary):
    license: str = ""
    abstract: str = ""
    abstract_vi: str | None = None
    created_at: datetime | None = None
    preview_url: str | None = None
    pdf_url: str | None = None
    main_tex: str | None = None


class PaperTemplateListResponse(BaseModel):
    items: list[PaperTemplateSummary]
    total: int
    query: str | None = None


class PaperTemplateCreateRequest(BaseModel):
    id: str
    title: str
    title_vi: str | None = None
    description: str = ""
    description_vi: str | None = None
    abstract: str = ""
    abstract_vi: str | None = None
    author: str = "Arionear"
    license: str = "Arionear template license"
    tags: list[str] = Field(default_factory=list)
    is_official: bool = False
    format: str = "ieee"
    venue: str = "journal"
    featured: bool = False
    main_tex: str | None = None


class PaperTemplateUpdateRequest(BaseModel):
    new_id: str | None = None
    title: str | None = None
    title_vi: str | None = None
    description: str | None = None
    description_vi: str | None = None
    abstract: str | None = None
    abstract_vi: str | None = None
    author: str | None = None
    license: str | None = None
    tags: list[str] | None = None
    is_official: bool | None = None
    format: str | None = None
    venue: str | None = None
    featured: bool | None = None
    main_tex: str | None = None


class OpenTemplateResponse(BaseModel):
    paper_id: str
    name: str
    template_id: str
