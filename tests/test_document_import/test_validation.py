import io
import zipfile

import pytest

from src.services.document_import import DocumentImportError, convert_document
from src.services.document_import.validation import (
    MAX_IMPORT_BYTES,
    format_from_filename,
    sniff_format,
    validate_document,
)
from tests.test_document_import.builders import PdfText, build_pdf


def _zip(entries: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    return out.getvalue()


def _error(fn, *args) -> DocumentImportError:
    with pytest.raises(DocumentImportError) as info:
        fn(*args)
    return info.value


def test_format_from_filename_accepts_docx_and_pdf_case_insensitive():
    assert format_from_filename("paper.DOCX") == "docx"
    assert format_from_filename("dir\\paper.pdf") == "pdf"


@pytest.mark.parametrize(
    ("name", "code"), [("paper.doc", "legacy_doc"), ("notes.txt", "unsupported_type"), ("", "unsupported_type")]
)
def test_format_from_filename_rejects_other_types(name, code):
    error = _error(format_from_filename, name)
    assert error.code == code
    assert error.status_code == 415


def test_sniff_format():
    assert sniff_format(b"%PDF-1.7\n...") == "pdf"
    assert sniff_format(b"\n\n%PDF-1.4") == "pdf"
    assert sniff_format(b"PK\x03\x04rest") == "docx"
    assert sniff_format(b"hello") is None


def test_validate_rejects_extension_content_mismatch():
    pdf = build_pdf([[PdfText("Hello", y=100)]])
    error = _error(validate_document, "fake.docx", pdf)
    assert (error.code, error.status_code) == ("content_mismatch", 400)
    error = _error(validate_document, "fake.pdf", b"PK\x03\x04not really")
    assert (error.code, error.status_code) == ("content_mismatch", 400)


def test_validate_rejects_zip_that_is_not_a_word_document():
    error = _error(validate_document, "archive.docx", _zip({"main.tex": b"\\documentclass{article}"}))
    assert (error.code, error.status_code) == ("content_mismatch", 400)


def test_validate_rejects_empty_and_oversized_files():
    assert _error(validate_document, "a.pdf", b"").code == "empty_file"
    oversized = b"%PDF-1.4\n" + b"0" * MAX_IMPORT_BYTES
    error = _error(validate_document, "a.pdf", oversized)
    assert (error.code, error.status_code) == ("file_too_large", 413)


def test_validate_flags_password_protected_docx():
    ole = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 64
    error = _error(validate_document, "secret.docx", ole)
    assert (error.code, error.status_code) == ("docx_protected", 400)


def test_corrupt_docx_container_fails_conversion_cleanly():
    data = _zip({"[Content_Types].xml": b"<Types/>", "word/document.xml": b"not xml"})
    error = _error(convert_document, data, "broken.docx")
    assert error.code == "docx_invalid"
    assert error.status_code == 422
