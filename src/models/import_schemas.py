"""Response models for document import (camelCase to match the frontend project import shape)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from src.services.document_import import ImportedProject


class ImportedFileResponse(BaseModel):
    path: str
    content: str


class ImportedAssetResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    mime_type: str = Field(alias="mimeType")
    data_url: str = Field(alias="dataUrl")


class ImportWarningResponse(BaseModel):
    code: str
    message: str
    count: int | None = None


class DocumentImportResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    main_file: str = Field(alias="mainFile")
    files: list[ImportedFileResponse]
    assets: list[ImportedAssetResponse] = Field(default_factory=list)
    compiler: str = "auto"
    warnings: list[ImportWarningResponse] = Field(default_factory=list)
    source_format: str = Field(alias="sourceFormat")

    @classmethod
    def from_project(cls, project: ImportedProject) -> DocumentImportResponse:
        return cls(
            name=project.name,
            main_file=project.main_file,
            files=[ImportedFileResponse(path=f.path, content=f.content) for f in project.files],
            assets=[
                ImportedAssetResponse(name=a.name, mime_type=a.mime_type, data_url=a.data_url) for a in project.assets
            ],
            compiler=project.compiler,
            warnings=[ImportWarningResponse(code=w.code, message=w.message, count=w.count) for w in project.warnings],
            source_format=project.source_format,
        )
