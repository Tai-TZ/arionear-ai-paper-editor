"""Word (.docx) → LaTeX adapter built on python-docx."""

from __future__ import annotations

import io
import itertools
import re
from dataclasses import dataclass, replace

from docx import Document
from docx.enum.text import WD_UNDERLINE
from docx.table import Table, _Cell
from docx.text.hyperlink import Hyperlink
from docx.text.paragraph import Paragraph
from docx.text.run import Run

from src.services.document_import.blocks import (
    Block,
    FigureBlock,
    HeadingBlock,
    ListItemBlock,
    ParagraphBlock,
    TableBlock,
    TableCell,
)
from src.services.document_import.latex_escape import collapse_whitespace, escape_latex, escape_url
from src.services.document_import.latex_writer import (
    build_project,
    extract_abstract,
    promote_first_heading_to_title,
    strip_heading_number,
)
from src.services.document_import.models import (
    DocumentImportError,
    ImportedAsset,
    ImportedProject,
    ImportWarning,
)

_NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "v": "urn:schemas-microsoft-com:vml",
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
}


def _q(prefix: str, local: str) -> str:
    return f"{{{_NS[prefix]}}}{local}"


W_P = _q("w", "p")
W_TBL = _q("w", "tbl")
W_R = _q("w", "r")
W_HYPERLINK = _q("w", "hyperlink")
W_SDT = _q("w", "sdt")
W_SDT_CONTENT = _q("w", "sdtContent")
W_CUSTOM_XML = _q("w", "customXml")
W_INS = _q("w", "ins")
W_SMART_TAG = _q("w", "smartTag")
W_FLD_SIMPLE = _q("w", "fldSimple")
W_DRAWING = _q("w", "drawing")
W_PICT = _q("w", "pict")
W_FOOTNOTE_REF = _q("w", "footnoteReference")
W_ENDNOTE_REF = _q("w", "endnoteReference")
W_TXBX_CONTENT = _q("w", "txbxContent")
W_OUTLINE_LVL = _q("w", "outlineLvl")
W_VAL = _q("w", "val")
W_ABSTRACT_NUM = _q("w", "abstractNum")
W_ABSTRACT_NUM_ID = _q("w", "abstractNumId")
W_LVL = _q("w", "lvl")
W_ILVL = _q("w", "ilvl")
W_NUM_FMT = _q("w", "numFmt")
M_OMATH = _q("m", "oMath")
M_OMATH_PARA = _q("m", "oMathPara")
MC_FALLBACK = _q("mc", "Fallback")
A_BLIP = _q("a", "blip")
V_IMAGEDATA = _q("v", "imagedata")
WP_EXTENT = _q("wp", "extent")
R_EMBED = _q("r", "embed")
R_ID = _q("r", "id")

_CONTAINER_TAGS = frozenset({W_INS, W_SMART_TAG, W_FLD_SIMPLE, W_CUSTOM_XML, W_SDT, W_SDT_CONTENT})

EMU_PER_INCH = 914_400
# \textwidth of the generated 11pt article is ~5in.
TEXT_WIDTH_INCHES = 5.0
DEFAULT_FIGURE_WIDTH = 0.8

EQUATION_PLACEHOLDER = r"\textbf{[equation omitted]}"

_HEADING_STYLE_RE = re.compile(r"^heading\s*(\d)$")
_LIST_STYLE_RE = re.compile(r"^list\s+(bullet|number|paragraph)(?:\s+(\d))?$")
_CAPTION_TEXT_RE = re.compile(r"^\s*(?:figure|fig\.?|table|hình|bảng)\s*\d+(?:\.\d+)*\s*[:.\-–—]?\s*", re.IGNORECASE)

_CONTENT_TYPE_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/pjpeg": "jpg",
    "image/gif": "gif",
    "image/bmp": "bmp",
    "image/x-bmp": "bmp",
    "image/tiff": "tiff",
    "image/webp": "webp",
    "image/x-emf": "emf",
    "image/emf": "emf",
    "image/x-wmf": "wmf",
    "image/wmf": "wmf",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
}
_PASSTHROUGH_MIME = {"png": "image/png", "jpg": "image/jpeg", "pdf": "application/pdf"}
_CONVERTIBLE_EXT = frozenset({"gif", "bmp", "tif", "tiff", "webp"})


@dataclass(frozen=True)
class _Segment:
    text: str = ""
    bold: bool = False
    italic: bool = False
    underline: bool = False
    superscript: bool = False
    subscript: bool = False
    href: str | None = None
    raw: str | None = None  # pre-rendered LaTeX

    def format_key(self) -> tuple:
        return (self.bold, self.italic, self.underline, self.superscript, self.subscript, self.href)


@dataclass
class _Caption:
    latex: str
    plain: str
    strict: bool  # paragraph uses Word's Caption style


def _trim_segments(segments: list[_Segment]) -> list[_Segment]:
    items = [s for s in segments if s.raw is not None or s.text]
    while items and items[0].raw is None:
        text = items[0].text.lstrip()
        if text:
            items[0] = replace(items[0], text=text)
            break
        items.pop(0)
    while items and items[-1].raw is None:
        text = items[-1].text.rstrip()
        if text:
            items[-1] = replace(items[-1], text=text)
            break
        items.pop()
    return items


def _render_segment(segment: _Segment, allow_breaks: bool) -> str:
    if segment.raw is not None:
        return segment.raw
    lines = re.split(r"\n+", segment.text)
    separator = r"\newline " if allow_breaks else " "
    escaped = separator.join(escape_latex(line) for line in lines)
    core = escaped.strip()
    if not core:
        return " " if escaped else ""
    lead = " " if escaped[:1].isspace() else ""
    trail = " " if escaped[-1:].isspace() else ""
    if segment.superscript:
        core = f"\\textsuperscript{{{core}}}"
    elif segment.subscript:
        core = f"\\textsubscript{{{core}}}"
    if segment.underline:
        core = f"\\underline{{{core}}}"
    if segment.italic:
        core = f"\\textit{{{core}}}"
    if segment.bold:
        core = f"\\textbf{{{core}}}"
    return f"{lead}{core}{trail}"


def render_segments(segments: list[_Segment], *, allow_breaks: bool = True) -> str:
    merged: list[_Segment] = []
    for segment in _trim_segments(segments):
        previous = merged[-1] if merged else None
        if (
            previous is not None
            and previous.raw is None
            and segment.raw is None
            and previous.format_key() == segment.format_key()
        ):
            merged[-1] = replace(previous, text=previous.text + segment.text)
        else:
            merged.append(segment)
    parts: list[str] = []
    for href, group in itertools.groupby(merged, key=lambda s: s.href):
        inner = "".join(_render_segment(s, allow_breaks) for s in group)
        if href and inner.strip():
            parts.append(f"\\href{{{escape_url(href)}}}{{{inner.strip()}}}")
        else:
            parts.append(inner)
    return re.sub(r" {2,}", " ", "".join(parts)).strip()


def _normalize_image(content_type: str, partname_ext: str, blob: bytes) -> tuple[str, str, bytes] | None:
    """Return ``(extension, mime, bytes)`` usable by pdflatex/xelatex, or ``None`` when unsupported."""
    ext = _CONTENT_TYPE_EXT.get((content_type or "").lower()) or (partname_ext or "").lower().lstrip(".")
    if ext == "jpeg":
        ext = "jpg"
    if ext in _PASSTHROUGH_MIME:
        return ext, _PASSTHROUGH_MIME[ext], blob
    if ext in _CONVERTIBLE_EXT:
        try:
            from PIL import Image

            with Image.open(io.BytesIO(blob)) as image:
                converted = image if image.mode in ("RGB", "RGBA", "L", "LA", "P") else image.convert("RGBA")
                out = io.BytesIO()
                converted.save(out, format="PNG")
            return "png", "image/png", out.getvalue()
        except Exception:
            return None
    return None


def _has_ancestor(element, tag: str) -> bool:
    parent = element.getparent()
    while parent is not None:
        if parent.tag == tag:
            return True
        parent = parent.getparent()
    return False


def _style_chain(paragraph: Paragraph) -> list:
    styles = []
    try:
        style = paragraph.style
    except Exception:
        return styles
    while style is not None and len(styles) < 8:
        styles.append(style)
        style = style.base_style
    return styles


class _DocxConverter:
    def __init__(self, document) -> None:
        self.document = document
        self.title: str | None = None
        self.assets: list[ImportedAsset] = []
        self._image_paths: dict[str, str | None] = {}
        self._numbering = None
        self._numbering_loaded = False
        self.counts: dict[str, int] = {
            "equations": 0,
            "footnotes": 0,
            "images_unsupported": 0,
            "graphics": 0,
            "table_images": 0,
        }

    # ── Body traversal ────────────────────────────────────────────────────────

    def convert(self) -> list[Block | _Caption]:
        body = self.document.element.body
        items: list[Block | _Caption] = []
        for kind, element in self._iter_body(body):
            if kind == "p":
                items.extend(self._convert_paragraph(Paragraph(element, self.document._body)))
            else:
                block = self._convert_table(Table(element, self.document._body))
                if block is not None:
                    items.append(block)
        self.counts["graphics"] += sum(1 for _ in body.iter(W_TXBX_CONTENT))
        return items

    def _iter_body(self, element):
        for child in element:
            if child.tag == W_P:
                yield "p", child
            elif child.tag == W_TBL:
                yield "tbl", child
            elif child.tag in (W_SDT, W_SDT_CONTENT, W_CUSTOM_XML):
                yield from self._iter_body(child)

    # ── Paragraphs ────────────────────────────────────────────────────────────

    def _paragraph_content(
        self, paragraph: Paragraph, *, collect_images: bool = True
    ) -> tuple[list[_Segment], list[tuple[str, float]]]:
        segments: list[_Segment] = []
        images: list[tuple[str, float]] = []
        self._walk(paragraph, paragraph._p, segments, images, None, collect_images)
        return segments, images

    def _walk(self, paragraph, element, segments, images, href, collect_images) -> None:
        for child in element:
            tag = child.tag
            if tag == W_R:
                self._collect_run(Run(child, paragraph), segments, images, href, collect_images)
            elif tag == W_HYPERLINK:
                url = None
                try:
                    url = Hyperlink(child, paragraph).url or None
                except Exception:
                    url = None
                self._walk(paragraph, child, segments, images, url or href, collect_images)
            elif tag in (M_OMATH, M_OMATH_PARA):
                self.counts["equations"] += 1
                segments.append(_Segment(raw=f" {EQUATION_PLACEHOLDER} "))
            elif tag in _CONTAINER_TAGS:
                self._walk(paragraph, child, segments, images, href, collect_images)

    def _collect_run(self, run: Run, segments, images, href, collect_images) -> None:
        element = run._r
        for graphic in element.iter(W_DRAWING, W_PICT):
            if _has_ancestor(graphic, MC_FALLBACK):
                continue
            if not collect_images:
                self.counts["table_images"] += 1
                continue
            images.extend(self._collect_graphic(graphic))
        self.counts["footnotes"] += sum(1 for _ in element.iter(W_FOOTNOTE_REF, W_ENDNOTE_REF))
        text = run.text
        if not text:
            return
        style_name = ""
        if element.style:  # only resolve the character style when the run names one (avoids a lookup per run)
            try:
                style_name = (run.style.name or "").lower() if run.style is not None else ""
            except Exception:
                style_name = ""
        underline = run.underline
        font = run.font
        segments.append(
            _Segment(
                text=text,
                bold=bool(run.bold) or style_name == "strong",
                italic=bool(run.italic) or style_name == "emphasis",
                underline=underline is True or (underline not in (None, False) and underline != WD_UNDERLINE.NONE),
                superscript=bool(font.superscript),
                subscript=bool(font.subscript),
                href=href,
            )
        )

    def _collect_graphic(self, graphic) -> list[tuple[str, float]]:
        width = DEFAULT_FIGURE_WIDTH
        extent = next(graphic.iter(WP_EXTENT), None)
        if extent is not None:
            try:
                inches = int(extent.get("cx", "0")) / EMU_PER_INCH
                if inches > 0:
                    width = round(min(1.0, inches / TEXT_WIDTH_INCHES), 2)
            except ValueError:
                pass
        found: list[tuple[str, float]] = []
        rel_ids = [blip.get(R_EMBED) for blip in graphic.iter(A_BLIP)]
        rel_ids += [data.get(R_ID) for data in graphic.iter(V_IMAGEDATA)]
        for rel_id in rel_ids:
            if not rel_id:
                continue
            path = self._register_image(rel_id)
            if path:
                found.append((path, width))
        if not rel_ids:
            self.counts["graphics"] += 1  # charts, SmartArt, shapes
        return found

    def _register_image(self, rel_id: str) -> str | None:
        try:
            part = self.document.part.related_parts[rel_id]
        except KeyError:
            self.counts["images_unsupported"] += 1
            return None
        key = str(part.partname)
        if key in self._image_paths:
            return self._image_paths[key]
        normalized = _normalize_image(part.content_type, part.partname.ext, part.blob)
        if normalized is None:
            self.counts["images_unsupported"] += 1
            self._image_paths[key] = None
            return None
        ext, mime, data = normalized
        path = f"figures/image{len(self.assets) + 1}.{ext}"
        self.assets.append(ImportedAsset(name=path, mime_type=mime, data=data))
        self._image_paths[key] = path
        return path

    def _heading_level(self, paragraph: Paragraph, styles: list) -> int | None:
        for style in styles:
            match = _HEADING_STYLE_RE.match((style.name or "").strip().lower())
            if match:
                return max(1, int(match.group(1)))
        candidates = [paragraph._p.pPr] + [style.element.pPr for style in styles]
        for ppr in candidates:
            if ppr is None:
                continue
            outline = ppr.find(W_OUTLINE_LVL)
            if outline is not None:
                try:
                    value = int(outline.get(W_VAL, "9"))
                except ValueError:
                    continue
                return value + 1 if 0 <= value < 9 else None
        return None

    def _numbering_root(self):
        if not self._numbering_loaded:
            self._numbering_loaded = True
            try:
                self._numbering = self.document.part.numbering_part.element
            except Exception:
                self._numbering = None
        return self._numbering

    def _numbering_is_ordered(self, num_id: int, ilvl: int) -> bool | None:
        root = self._numbering_root()
        if root is None:
            return None
        try:
            abstract_id = root.num_having_numId(num_id).abstractNumId.val
        except Exception:
            return None
        for abstract in root.iter(W_ABSTRACT_NUM):
            if abstract.get(W_ABSTRACT_NUM_ID) != str(abstract_id):
                continue
            formats: dict[int, str] = {}
            for lvl in abstract.iter(W_LVL):
                fmt = lvl.find(W_NUM_FMT)
                try:
                    formats[int(lvl.get(W_ILVL, "0"))] = fmt.get(W_VAL, "") if fmt is not None else ""
                except ValueError:
                    continue
            # Undefined deeper levels inherit the closest defined level above them.
            defined = [level for level in formats if level <= ilvl]
            if not defined:
                return None
            return formats[max(defined)] not in ("bullet", "none", "")
        return None

    def _list_info(self, paragraph: Paragraph, styles: list) -> tuple[bool, int] | None:
        num_id: int | None = None
        ilvl: int | None = None
        ppr = paragraph._p.pPr
        if ppr is not None and ppr.numPr is not None:
            num_pr = ppr.numPr
            num_id = num_pr.numId.val if num_pr.numId is not None else None
            ilvl = num_pr.ilvl.val if num_pr.ilvl is not None else None
            if num_id == 0:
                return None  # numbering explicitly removed
        if num_id is None:
            for style in styles:
                style_ppr = style.element.pPr
                if style_ppr is not None and style_ppr.numPr is not None and style_ppr.numPr.numId is not None:
                    num_id = style_ppr.numPr.numId.val
                    if ilvl is None and style_ppr.numPr.ilvl is not None:
                        ilvl = style_ppr.numPr.ilvl.val
                    break
        style_match = None
        for style in styles:
            style_match = _LIST_STYLE_RE.match((style.name or "").strip().lower())
            if style_match:
                break
        if not num_id and style_match is None:
            return None
        level = ilvl or 0
        if style_match and style_match.group(2):
            level = max(level, int(style_match.group(2)) - 1)
        ordered = self._numbering_is_ordered(num_id, ilvl or 0) if num_id else None
        if ordered is None:
            ordered = bool(style_match and style_match.group(1) == "number")
        return ordered, level

    def _convert_paragraph(self, paragraph: Paragraph) -> list[Block | _Caption]:
        segments, images = self._paragraph_content(paragraph)
        plain = collapse_whitespace("".join(s.text for s in segments if s.raw is None))
        figures: list[Block | _Caption] = [FigureBlock(path=path, width=width) for path, width in images]
        styles = _style_chain(paragraph)
        style_names = [(style.name or "").strip().lower() for style in styles]

        if plain and "title" in style_names:
            if self.title is None:
                self.title = plain
                return figures
            return [HeadingBlock(level=1, latex=escape_latex(plain), plain=plain), *figures]

        heading_level = self._heading_level(paragraph, styles) if plain else None
        if heading_level is not None:
            text = strip_heading_number(plain)
            return [HeadingBlock(level=min(heading_level, 4), latex=escape_latex(text), plain=plain), *figures]

        is_caption_style = "caption" in style_names
        if plain and (is_caption_style or (_CAPTION_TEXT_RE.match(plain) and len(plain) < 400)):
            caption_text = _CAPTION_TEXT_RE.sub("", plain, count=1).strip() or plain
            caption = _Caption(latex=escape_latex(caption_text), plain=plain, strict=is_caption_style)
            return [*figures, caption] if figures else [caption]

        latex = render_segments(segments)
        blocks: list[Block | _Caption] = []
        if latex:
            list_info = self._list_info(paragraph, styles)
            if list_info is not None:
                ordered, level = list_info
                blocks.append(ListItemBlock(ordered=ordered, level=level, latex=latex))
            else:
                blocks.append(ParagraphBlock(latex=latex, plain=plain))
        blocks.extend(figures)
        return blocks

    # ── Tables ────────────────────────────────────────────────────────────────

    def _cell_latex(self, cell: _Cell) -> str:
        parts: list[str] = []
        for paragraph in cell.paragraphs:
            segments, _images = self._paragraph_content(paragraph, collect_images=False)
            rendered = render_segments(segments, allow_breaks=False)
            if rendered:
                parts.append(rendered)
        return " ".join(parts)

    def _convert_table(self, table: Table) -> TableBlock | None:
        rows: list[list[TableCell]] = []
        previous_tcs: list = []
        for row in table.rows:
            cells = list(row.cells)
            tcs = [cell._tc for cell in cells]
            out_row: list[TableCell] = []
            index = 0
            while index < len(cells):
                tc = tcs[index]
                span = 1
                while index + span < len(cells) and tcs[index + span] is tc:
                    span += 1
                continues_above = index < len(previous_tcs) and previous_tcs[index] is tc
                latex = "" if continues_above else self._cell_latex(cells[index])
                out_row.append(TableCell(latex=latex, span=span))
                index += span
            rows.append(out_row)
            previous_tcs = tcs
        if not any(cell.latex for row in rows for cell in row):
            return None
        return TableBlock(rows=rows)


def _attach_captions(items: list[Block | _Caption]) -> list[Block]:
    out: list[Block] = []
    for index, item in enumerate(items):
        if not isinstance(item, _Caption):
            out.append(item)
            continue
        previous = out[-1] if out else None
        following = items[index + 1] if index + 1 < len(items) else None
        is_table_caption = bool(re.match(r"^\s*(?:table|bảng)\b", item.plain, re.IGNORECASE))
        if isinstance(following, TableBlock) and following.caption is None and (is_table_caption or item.strict):
            following.caption = item.latex
        elif isinstance(previous, FigureBlock) and previous.caption is None and not is_table_caption:
            previous.caption = item.latex
        elif isinstance(previous, TableBlock) and previous.caption is None and is_table_caption:
            previous.caption = item.latex
        elif isinstance(following, FigureBlock) and following.caption is None and not is_table_caption:
            following.caption = item.latex
        else:
            out.append(ParagraphBlock(latex=escape_latex(item.plain), plain=item.plain))
    return out


_WARNING_MESSAGES = {
    "equations": (
        "docx_equations_skipped",
        "{n} Word equation(s) could not be converted; look for [equation omitted].",
    ),
    "footnotes": ("docx_footnotes_skipped", "{n} footnote/endnote reference(s) were dropped."),
    "images_unsupported": (
        "docx_images_unsupported",
        "{n} image(s) use a format LaTeX cannot include (e.g. EMF/WMF) and were skipped.",
    ),
    "graphics": ("docx_graphics_skipped", "{n} chart(s), shape(s) or text box(es) were skipped."),
    "table_images": ("docx_table_images_skipped", "{n} image(s) inside tables were skipped."),
}


def convert_docx(data: bytes, filename: str) -> ImportedProject:
    try:
        document = Document(io.BytesIO(data))
    except Exception as exc:
        raise DocumentImportError(
            "docx_invalid",
            "The Word document could not be opened. It may be corrupt or password-protected.",
        ) from exc

    converter = _DocxConverter(document)
    blocks = _attach_captions(converter.convert())
    title = converter.title
    if title is None:
        title, blocks = promote_first_heading_to_title(blocks)
    if title is None:
        core_title = collapse_whitespace(document.core_properties.title or "")
        title = core_title or None
    blocks = extract_abstract(blocks)

    warnings: list[ImportWarning] = []
    for key, (code, template) in _WARNING_MESSAGES.items():
        count = converter.counts.get(key, 0)
        if count:
            warnings.append(ImportWarning(code=code, message=template.format(n=count), count=count))
    if not blocks:
        warnings.append(ImportWarning(code="empty_document", message="No text content was found in the document."))

    return build_project(
        blocks=blocks,
        title_plain=title,
        filename=filename,
        source_format="docx",
        assets=converter.assets,
        warnings=warnings,
    )
