"""Upload validation: extension, size and content signature checks."""

from __future__ import annotations

import io
import zipfile
from pathlib import PurePath

from src.services.document_import.models import DocumentFormat, DocumentImportError

MAX_IMPORT_BYTES = 15 * 1024 * 1024
# DOCX is a ZIP container — bound the inflated size so a small upload cannot expand into gigabytes.
MAX_DOCX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024
MAX_DOCX_ENTRIES = 5000

SUPPORTED_EXTENSIONS: dict[str, DocumentFormat] = {".docx": "docx", ".pdf": "pdf"}

_ZIP_MAGIC = b"PK\x03\x04"
_PDF_MAGIC = b"%PDF-"
_OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


def format_from_filename(filename: str | None) -> DocumentFormat:
    suffix = PurePath((filename or "").replace("\\", "/")).suffix.lower()
    fmt = SUPPORTED_EXTENSIONS.get(suffix)
    if fmt is not None:
        return fmt
    if suffix == ".doc":
        raise DocumentImportError(
            "legacy_doc",
            "Legacy .doc files are not supported. Save the document as .docx in Word and try again.",
            status_code=415,
        )
    raise DocumentImportError(
        "unsupported_type",
        "Unsupported file type. Upload a Word (.docx) or PDF (.pdf) file.",
        status_code=415,
    )


def ensure_size(size: int, limit: int = MAX_IMPORT_BYTES) -> None:
    if size > limit:
        raise DocumentImportError(
            "file_too_large",
            f"File is too large. The limit is {limit // (1024 * 1024)} MB.",
            status_code=413,
        )


def sniff_format(data: bytes) -> DocumentFormat | None:
    """Identify the container from its magic bytes (``None`` when unknown)."""
    if data.startswith(_ZIP_MAGIC):
        return "docx"
    # The PDF spec allows junk before the header as long as it sits within the first 1024 bytes.
    if _PDF_MAGIC in data[:1024]:
        return "pdf"
    return None


def _validate_docx_container(data: bytes) -> None:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            infos = archive.infolist()
            names = {info.filename for info in infos}
            if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                raise DocumentImportError(
                    "content_mismatch",
                    "The file is not a valid Word document (.docx).",
                    status_code=400,
                )
            if len(infos) > MAX_DOCX_ENTRIES or sum(info.file_size for info in infos) > MAX_DOCX_UNCOMPRESSED_BYTES:
                raise DocumentImportError(
                    "file_too_large",
                    "The Word document expands to more data than the import limit allows.",
                    status_code=413,
                )
    except zipfile.BadZipFile as exc:
        raise DocumentImportError(
            "content_mismatch",
            "The file is not a valid Word document (.docx).",
            status_code=400,
        ) from exc


def validate_document(filename: str | None, data: bytes) -> DocumentFormat:
    """Validate extension AND content signature; return the detected format."""
    expected = format_from_filename(filename)
    if not data:
        raise DocumentImportError("empty_file", "The uploaded file is empty.", status_code=400)
    ensure_size(len(data))
    actual = sniff_format(data)
    if expected == "docx" and data.startswith(_OLE_MAGIC):
        # Password-protected .docx files (and renamed legacy .doc files) are OLE compound documents.
        raise DocumentImportError(
            "docx_protected",
            "This Word file is password-protected or in the legacy .doc format. "
            "Remove the password or save it as .docx, then try again.",
            status_code=400,
        )
    if actual != expected:
        label = "Word document (.docx)" if expected == "docx" else "PDF"
        raise DocumentImportError(
            "content_mismatch",
            f"The file content does not match its extension — it is not a valid {label}.",
            status_code=400,
        )
    if expected == "docx":
        _validate_docx_container(data)
    return expected
