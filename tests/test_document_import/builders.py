"""Programmatic fixtures for document import tests (no binary files checked in)."""

from __future__ import annotations

import io
from dataclasses import dataclass

from docx.document import Document as DocxDocument


def docx_bytes(document: DocxDocument) -> bytes:
    out = io.BytesIO()
    document.save(out)
    return out.getvalue()


def image_bytes(fmt: str = "PNG", color: str = "red", size: tuple[int, int] = (16, 8)) -> bytes:
    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, fmt)
    return out.getvalue()


@dataclass(frozen=True)
class PdfText:
    """One line of text: ``y`` is measured from the top of the page (like pdfplumber's ``top``)."""

    text: str
    y: float
    size: float = 10.0
    x: float = 72.0
    bold: bool = False


def _pdf_string(text: str) -> bytes:
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return b"(" + escaped.encode("cp1252") + b")"


def build_pdf(pages: list[list[PdfText]], *, width: float = 612, height: float = 792) -> bytes:
    """Write a minimal, valid PDF using the standard Helvetica fonts (metrics built into pdfminer)."""
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    catalog = add(b"")  # placeholder, filled once the page tree id is known
    pages_id = add(b"")
    regular = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    bold = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")

    page_ids: list[int] = []
    for items in pages:
        stream = b"".join(
            b"BT /%s %.1f Tf %.2f %.2f Td %s Tj ET\n"
            % (b"F2" if item.bold else b"F1", item.size, item.x, height - item.y - item.size, _pdf_string(item.text))
            for item in items
        )
        content = add(b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream))
        page_ids.append(
            add(
                b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %d %d] "
                b"/Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> /Contents %d 0 R >>"
                % (pages_id, width, height, regular, bold, content)
            )
        )

    objects[catalog - 1] = b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id
    kids = b" ".join(b"%d 0 R" % page_id for page_id in page_ids)
    objects[pages_id - 1] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (kids, len(page_ids))

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets: list[int] = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (number, body)
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, catalog, xref)
    return bytes(out)
