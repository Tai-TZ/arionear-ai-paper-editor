"""Result / error types shared by the document import adapters."""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from typing import Literal

DocumentFormat = Literal["docx", "pdf"]
LatexCompilerName = Literal["auto", "pdflatex", "xelatex", "lualatex", "latex"]


class DocumentImportError(Exception):
    """A user-facing import failure.

    ``code`` is a stable identifier the frontend localises; ``message`` is the English fallback.
    """

    def __init__(self, code: str, message: str, *, status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class ImportWarning:
    code: str
    message: str
    count: int | None = None


@dataclass(frozen=True)
class ImportedFile:
    path: str
    content: str


@dataclass(frozen=True)
class ImportedAsset:
    name: str
    mime_type: str
    data: bytes

    @property
    def data_url(self) -> str:
        return f"data:{self.mime_type};base64,{base64.b64encode(self.data).decode('ascii')}"


@dataclass
class ImportedProject:
    """Same shape as the frontend Overleaf importer result (plus warnings)."""

    name: str
    main_file: str
    files: list[ImportedFile]
    assets: list[ImportedAsset] = field(default_factory=list)
    compiler: LatexCompilerName = "auto"
    warnings: list[ImportWarning] = field(default_factory=list)
    source_format: DocumentFormat = "docx"

    @property
    def main_content(self) -> str:
        for item in self.files:
            if item.path == self.main_file:
                return item.content
        return self.files[0].content if self.files else ""
