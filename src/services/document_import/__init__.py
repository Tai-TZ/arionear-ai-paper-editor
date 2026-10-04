"""Convert Word (.docx) and PDF documents into a LaTeX project (``main.tex`` + figure assets).

One adapter per format; both emit the same intermediate blocks rendered by ``latex_writer``.
"""

from __future__ import annotations

from src.services.document_import.models import (
    DocumentFormat,
    DocumentImportError,
    ImportedAsset,
    ImportedFile,
    ImportedProject,
    ImportWarning,
)
from src.services.document_import.validation import (
    MAX_IMPORT_BYTES,
    SUPPORTED_EXTENSIONS,
    ensure_size,
    format_from_filename,
    validate_document,
)


def convert_document(data: bytes, filename: str, fmt: DocumentFormat | None = None) -> ImportedProject:
    """Validate and convert an uploaded document. Raises ``DocumentImportError`` on failure."""
    detected = validate_document(filename, data)
    if fmt is not None and fmt != detected:
        raise DocumentImportError("content_mismatch", "The file content does not match its extension.", status_code=400)
    if detected == "docx":
        from src.services.document_import.docx_adapter import convert_docx

        return convert_docx(data, filename)
    from src.services.document_import.pdf_adapter import convert_pdf

    return convert_pdf(data, filename)


__all__ = [
    "MAX_IMPORT_BYTES",
    "SUPPORTED_EXTENSIONS",
    "DocumentFormat",
    "DocumentImportError",
    "ImportWarning",
    "ImportedAsset",
    "ImportedFile",
    "ImportedProject",
    "convert_document",
    "ensure_size",
    "format_from_filename",
    "validate_document",
]
