"""PDF → LaTeX adapter built on pdfplumber.

Text-only and lossy by design: images, tables and equations are not reconstructed. Extraction
(pdfplumber → ``PdfWord``) is kept separate from layout analysis so the heuristics are pure,
unit-testable functions over plain dataclasses.
"""

from __future__ import annotations

import io
import math
import re
import statistics
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from src.services.document_import.blocks import Block, HeadingBlock, ListItemBlock, ParagraphBlock
from src.services.document_import.latex_escape import collapse_whitespace, escape_latex
from src.services.document_import.latex_writer import (
    build_project,
    extract_abstract,
    has_abstract_prefix,
    strip_heading_number,
)
from src.services.document_import.models import DocumentImportError, ImportedProject, ImportWarning

MAX_PDF_PAGES = 120
HEADING_SIZE_RATIO = 1.15
PDF_X_TOLERANCE = 1.5
# Running headers/footers live in the top/bottom bands of the page. The folio can sit as high as ~84%
# of the page (LaTeX on A4), so the top-most / bottom-most row of every page is checked as well.
MARGIN_FRACTION = 0.1

_LIGATURES = {"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st"}
_CID_RE = re.compile(r"\(cid:\d+\)")
_PAGE_NUMBER_RE = re.compile(
    r"^\s*(?:page|trang)?\s*[-–—]?\s*(?:\d{1,4}|[ivxlcdm]{1,7})\s*[-–—]?\s*(?:(?:/|of|trên)\s*\d{1,4})?\s*$",
    re.IGNORECASE,
)
_NUMBERED_RE = re.compile(r"^(?P<num>\d{1,2}(?:\.\d{1,2}){0,2})\.?\s+(?P<title>\S.*)$")
_ROMAN_RE = re.compile(r"^(?P<num>[IVX]{1,5})\.\s+(?P<title>\S.*)$")
_LETTER_RE = re.compile(r"^(?P<num>[A-H])\.\s+(?P<title>\S.*)$")
_CAPTION_RE = re.compile(r"^\s*(?:figure|fig\.|table|hình|bảng)\s*\d+", re.IGNORECASE)
# U+F0B7 / U+F0A7 are the Symbol/Wingdings bullets Word writes into exported PDFs.
_BULLET_RE = re.compile(r"^\s*[•▪◦●■‣*–-]\s+(?=\S)")
_ORDERED_MARKER_RE = re.compile(r"^\s*(?:\d{1,2}[.)]|\(\d{1,2}\)|\(?[a-z]\))\s+(?=\S)")
_KNOWN_SECTIONS = frozenset(
    {
        "abstract",
        "introduction",
        "related work",
        "background",
        "method",
        "methods",
        "methodology",
        "materials and methods",
        "experiments",
        "results",
        "discussion",
        "conclusion",
        "conclusions",
        "references",
        "bibliography",
        "acknowledgment",
        "acknowledgments",
        "acknowledgement",
        "acknowledgements",
        "appendix",
        "tóm tắt",
        "giới thiệu",
        "phương pháp",
        "kết quả",
        "thảo luận",
        "kết luận",
        "tài liệu tham khảo",
    }
)


@dataclass(frozen=True)
class PdfWord:
    text: str
    x0: float
    x1: float
    top: float
    bottom: float
    size: float
    bold: bool = False


@dataclass
class PdfLine:
    page: int
    text: str
    x0: float
    x1: float
    top: float
    bottom: float
    size: float
    bold: bool = False
    column: int = 0  # 0 = single column / full width, 1 = left, 2 = right
    page_height: float = 792.0

    @property
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def word_count(self) -> int:
        return len(self.text.split())


@dataclass
class PdfExtraction:
    lines: list[PdfLine] = field(default_factory=list)
    page_count: int = 0
    pages_read: int = 0
    metadata_title: str | None = None
    unmapped_glyphs: int = 0


# ── Line layout (pure) ───────────────────────────────────────────────────────


def normalize_pdf_text(text: str) -> tuple[str, int]:
    """NFC-normalise, expand ligatures and drop undecodable ``(cid:N)`` glyphs."""
    cleaned, removed = _CID_RE.subn("", text)
    cleaned = unicodedata.normalize("NFC", cleaned)
    for ligature, replacement in _LIGATURES.items():
        cleaned = cleaned.replace(ligature, replacement)
    return cleaned, removed


def group_words_into_lines(words: list[PdfWord]) -> list[list[PdfWord]]:
    """Cluster words whose vertical extents overlap (superscripts stay on their line)."""
    lines: list[list[PdfWord]] = []
    anchors: list[PdfWord] = []  # tallest word of each line
    for word in sorted(words, key=lambda w: (round(w.top, 1), w.x0)):
        if lines:
            anchor = anchors[-1]
            overlap = min(anchor.bottom, word.bottom) - max(anchor.top, word.top)
            height = max(0.1, min(anchor.bottom - anchor.top, word.bottom - word.top))
            if overlap / height >= 0.5:
                lines[-1].append(word)
                if word.size > anchor.size:
                    anchors[-1] = word
                continue
        lines.append([word])
        anchors.append(word)
    return [sorted(line, key=lambda w: w.x0) for line in lines]


def _make_line(words: list[PdfWord], page: int, column: int, page_height: float) -> PdfLine:
    parts: list[str] = []
    previous: PdfWord | None = None
    for word in words:
        if previous is not None and word.x0 - previous.x1 > 0.15 * max(previous.size, 1.0):
            parts.append(" ")
        parts.append(word.text)
        previous = word
    weights = Counter()
    for word in words:
        weights[round(word.size * 2) / 2] += len(word.text)
    size = weights.most_common(1)[0][0] if weights else 0.0
    return PdfLine(
        page=page,
        text=collapse_whitespace("".join(parts)),
        x0=min(w.x0 for w in words),
        x1=max(w.x1 for w in words),
        top=min(w.top for w in words),
        bottom=max(w.bottom for w in words),
        size=size,
        bold=all(w.bold for w in words),
        column=column,
        page_height=page_height,
    )


def detect_gutter(words: list[PdfWord], page_width: float, line_count: int | None = None) -> float | None:
    """Return the x position separating two text columns, or ``None`` for single-column pages."""
    if len(words) < 30 or page_width <= 0:
        return None
    start, end = int(page_width * 0.3), int(page_width * 0.7)
    # counts[x] = number of words crossing the vertical line at x (difference array, O(words + width)).
    diff = [0] * (end - start + 2)
    for word in words:
        low = max(start, math.floor(word.x0) + 1)
        high = min(end, math.ceil(word.x1) - 1)
        if low <= high:
            diff[low - start] += 1
            diff[high - start + 1] -= 1
    counts: list[tuple[int, int]] = []
    running = 0
    for offset in range(end - start + 1):
        running += diff[offset]
        counts.append((start + offset, running))
    minimum = min(count for _, count in counts)
    # +1 tolerance: a centred folio or a lone word sitting in the gutter must not hide it.
    ceiling = minimum + 1
    best_run: tuple[int, int] = (0, -1)
    run_start: int | None = None
    for x, count in [*counts, (end + 1, ceiling + 1)]:
        if count <= ceiling:
            if run_start is None:
                run_start = x
        elif run_start is not None:
            if x - run_start > best_run[1] - best_run[0] + 1:
                best_run = (run_start, x - 1)
            run_start = None
    if best_run[1] - best_run[0] + 1 < 6:
        return None
    gutter = (best_run[0] + best_run[1]) / 2
    left = sum(1 for w in words if w.x1 <= gutter)
    right = sum(1 for w in words if w.x0 >= gutter)
    if min(left, right) < 0.2 * len(words):
        return None
    line_estimate = line_count if line_count is not None else len(group_words_into_lines(words))
    if minimum > max(2, 0.2 * line_estimate):
        return None
    return gutter


def layout_page_lines(words: list[PdfWord], page_width: float, page_height: float, page: int) -> list[PdfLine]:
    """Group a page's words into lines in reading order (handles two-column layouts)."""
    words = [w for w in words if w.text.strip()]
    if not words:
        return []
    raw_lines = group_words_into_lines(words)
    gutter = detect_gutter(words, page_width, len(raw_lines))
    if gutter is None:
        return [_make_line(line, page, 0, page_height) for line in raw_lines]

    spanning: list[PdfLine] = []
    split_rows: list[tuple[list[PdfWord], list[PdfWord], list[PdfWord]]] = []
    for line_words in raw_lines:
        if any(w.x0 < gutter < w.x1 for w in line_words):
            spanning.append(_make_line(line_words, page, 0, page_height))
            continue
        left_words = [w for w in line_words if w.x1 <= gutter]
        right_words = [w for w in line_words if w.x0 >= gutter]
        if left_words and right_words:
            gap = min(w.x0 for w in right_words) - max(w.x1 for w in left_words)
            # An ordinary word space (well under the font size) means one full-width line, not two columns.
            if gap < 0.6 * statistics.median(w.size for w in line_words):
                spanning.append(_make_line(line_words, page, 0, page_height))
                continue
        split_rows.append((line_words, left_words, right_words))

    # Column edges = the most common left/right x of each column's lines. A row split by the gutter whose
    # parts touch none of these edges is centred front matter (e.g. side-by-side author names), not columns.
    def edge(values: list[float]) -> float | None:
        return Counter(round(v) for v in values).most_common(1)[0][0] if values else None

    left_x0 = edge([min(w.x0 for w in lw) for _, lw, _ in split_rows if lw])
    left_x1 = edge([max(w.x1 for w in lw) for _, lw, _ in split_rows if lw])
    right_x0 = edge([min(w.x0 for w in rw) for _, _, rw in split_rows if rw])
    right_x1 = edge([max(w.x1 for w in rw) for _, _, rw in split_rows if rw])

    def column_like(words: list[PdfWord], x0_edge: float | None, x1_edge: float | None) -> bool:
        x0, x1 = min(w.x0 for w in words), max(w.x1 for w in words)
        return (x0_edge is not None and abs(x0 - x0_edge) <= 3) or (x1_edge is not None and abs(x1 - x1_edge) <= 3)

    left: list[PdfLine] = []
    right: list[PdfLine] = []
    for line_words, left_words, right_words in split_rows:
        if (
            left_words
            and right_words
            and not column_like(left_words, left_x0, left_x1)
            and not column_like(right_words, right_x0, right_x1)
        ):
            spanning.append(_make_line(line_words, page, 0, page_height))
            continue
        if left_words:
            left.append(_make_line(left_words, page, 1, page_height))
        if right_words:
            right.append(_make_line(right_words, page, 2, page_height))

    ordered: list[PdfLine] = []
    remaining_left = sorted(left, key=lambda line: line.top)
    remaining_right = sorted(right, key=lambda line: line.top)
    for span in sorted(spanning, key=lambda line: line.top):
        ordered.extend(line for line in remaining_left if line.top < span.top)
        ordered.extend(line for line in remaining_right if line.top < span.top)
        remaining_left = [line for line in remaining_left if line.top >= span.top]
        remaining_right = [line for line in remaining_right if line.top >= span.top]
        ordered.append(span)
    ordered.extend(remaining_left)
    ordered.extend(remaining_right)
    return ordered


# ── Analysis (pure) ──────────────────────────────────────────────────────────


def _furniture_key(text: str) -> str:
    return collapse_whitespace(re.sub(r"\d+", "#", text.lower()))


def _in_margin(line: PdfLine) -> bool:
    return line.top < MARGIN_FRACTION * line.page_height or line.bottom > (1 - MARGIN_FRACTION) * line.page_height


def _furniture_rows(lines: list[PdfLine]) -> list[tuple[int, list[int], str]]:
    """Visual rows that may hold page furniture: the top-most / bottom-most row of each page, or rows in
    the margin bands. Returns ``(page, line indices, row text)``; a row joins lines split across columns."""
    by_page: dict[int, list[int]] = defaultdict(list)
    for index, line in enumerate(lines):
        by_page[line.page].append(index)
    rows_out: list[tuple[int, list[int], str]] = []
    for page, indices in by_page.items():
        min_top = min(lines[i].top for i in indices)
        max_bottom = max(lines[i].bottom for i in indices)
        rows: list[list[int]] = []
        for index in sorted(indices, key=lambda i: lines[i].top):
            if rows and abs(lines[index].top - lines[rows[-1][0]].top) < 2.0:
                rows[-1].append(index)
            else:
                rows.append([index])
        for row in rows:
            extreme = any(lines[i].top <= min_top + 1 or lines[i].bottom >= max_bottom - 1 for i in row)
            if not extreme and not any(_in_margin(lines[i]) for i in row):
                continue
            row.sort(key=lambda i: lines[i].x0)
            rows_out.append((page, row, " ".join(lines[i].text for i in row)))
    return rows_out


def remove_page_furniture(lines: list[PdfLine], page_count: int) -> list[PdfLine]:
    """Drop page numbers and running headers/footers repeated across pages."""
    rows = _furniture_rows(lines)
    pages_by_key: dict[str, set[int]] = defaultdict(set)
    for page, row, text in rows:
        pages_by_key[_furniture_key(text)].add(page)
        for index in row:
            pages_by_key[_furniture_key(lines[index].text)].add(page)
    threshold = max(2, math.ceil(page_count * 0.5)) if page_count >= 2 else math.inf

    def is_furniture(text: str) -> bool:
        return bool(_PAGE_NUMBER_RE.match(text)) or len(pages_by_key[_furniture_key(text)]) >= threshold

    drop: set[int] = set()
    for _page, row, text in rows:
        if is_furniture(text):
            drop.update(row)
        else:
            drop.update(index for index in row if is_furniture(lines[index].text))
    return [line for index, line in enumerate(lines) if index not in drop]


def dominant_font_size(lines: list[PdfLine]) -> float:
    weights: Counter[float] = Counter()
    for line in lines:
        if line.size > 0:
            weights[line.size] += len(line.text)
    if not weights:
        return 10.0
    # Most text wins; on a tie the smaller size is the body (titles and headings are larger).
    return max(weights.items(), key=lambda item: (item[1], -item[0]))[0]


def _section_label(text: str) -> str:
    return collapse_whitespace(strip_heading_number(text)).strip(" :.—–-").lower()


def detect_title(lines: list[PdfLine], body_size: float) -> list[int]:
    """Indices of the title lines: the largest text near the top of the first page."""
    if not lines:
        return []
    first_page = lines[0].page
    window = [(i, line) for i, line in enumerate(lines[:15]) if line.page == first_page]
    candidates = [
        (i, line)
        for i, line in window
        if line.size >= body_size * HEADING_SIZE_RATIO
        and not _NUMBERED_RE.match(line.text)
        and _section_label(line.text) not in _KNOWN_SECTIONS
    ]
    if not candidates:
        return []
    max_size = max(line.size for _, line in candidates)
    start = next(i for i, line in candidates if abs(line.size - max_size) < 0.5)
    indices = [start]
    for i in range(start + 1, min(len(lines), start + 4)):
        line, previous = lines[i], lines[indices[-1]]
        if line.page != previous.page or abs(line.size - max_size) >= 0.5:
            break
        if line.top - previous.bottom > 1.5 * max_size:
            break
        indices.append(i)
    return indices


def _heading_shape_ok(text: str) -> bool:
    words = text.split()
    if not words or len(words) > 16 or len(text) > 150:
        return False
    if not any(char.isalpha() for char in text):
        return False
    if text.endswith((",", ";", "-")):
        return False
    return not _CAPTION_RE.match(text)


def _is_all_caps(text: str) -> bool:
    letters = [char for char in text if char.isalpha()]
    return len(letters) >= 3 and all(char.isupper() for char in letters)


def _starts_upper(text: str) -> bool:
    first = next((char for char in text if char.isalpha()), "")
    return first.isupper()


@dataclass(frozen=True)
class HeadingCandidate:
    kind: str  # "numbered" | "size" | "caps"
    level: int
    size: float


def classify_headings(
    lines: list[PdfLine], body_size: float, *, has_front_matter: bool = False
) -> dict[int, HeadingCandidate]:
    """Heuristically decide which lines are headings (numbered, larger font, or ALL CAPS).

    ``has_front_matter``: a title was detected, so lines before the first real section on the first page
    are author/affiliation lines and never size-based headings.
    """
    found: dict[int, HeadingCandidate] = {}
    seen_roman = False
    for index, line in enumerate(lines):
        text = line.text.strip()
        if not _heading_shape_ok(text):
            continue
        larger = line.size >= body_size * HEADING_SIZE_RATIO
        emphasized = larger or line.bold
        ends_with_period = text.endswith(".")
        known = _section_label(text) in _KNOWN_SECTIONS

        numbered = _NUMBERED_RE.match(text)
        if numbered and _starts_upper(numbered.group("title")) and len(numbered.group("title").split()) <= 12:
            # "1. Short item" is usually a list item; only accept it when the line stands out typographically.
            multi_level = "." in numbered.group("num")
            if emphasized or (multi_level and line.word_count <= 6 and not ends_with_period):
                level = min(3, numbered.group("num").count(".") + 1)
                found[index] = HeadingCandidate("numbered", level, line.size)
                continue
        roman = _ROMAN_RE.match(text)
        if roman and (emphasized or _is_all_caps(roman.group("title"))) and len(roman.group("title").split()) <= 12:
            seen_roman = True
            found[index] = HeadingCandidate("numbered", 1, line.size)
            continue
        letter = _LETTER_RE.match(text)
        if letter and seen_roman and _starts_upper(letter.group("title")) and not ends_with_period:
            if len(letter.group("title").split()) <= 12:
                found[index] = HeadingCandidate("numbered", 2, line.size)
                continue
        if larger and (not ends_with_period or known):
            found[index] = HeadingCandidate("size", 0, line.size)
            continue
        if _is_all_caps(text) and line.word_count <= 8 and (not ends_with_period or known):
            found[index] = HeadingCandidate("caps", 1, line.size)
            continue
        if line.bold and known:
            found[index] = HeadingCandidate("caps", 1, line.size)

    if has_front_matter and lines:
        # Author / affiliation lines between the title and the first real section are often set in a
        # larger font; they are not headings.
        first_page = lines[0].page
        for index, line in enumerate(lines):
            candidate = found.get(index)
            strong = candidate is not None and candidate.kind != "size"
            if strong or line.page != first_page or _section_label(line.text) in _KNOWN_SECTIONS:
                break
            if has_abstract_prefix(line.text):
                break
            if candidate is not None:
                del found[index]

    size_levels = sorted({c.size for c in found.values() if c.kind == "size"}, reverse=True)
    for index, candidate in list(found.items()):
        if candidate.kind == "size":
            level = min(3, size_levels.index(candidate.size) + 1)
            found[index] = HeadingCandidate("size", level, candidate.size)
    return found


def join_lines(texts: list[str]) -> str:
    """Join wrapped lines, removing end-of-line hyphenation ("algo-" + "rithm" → "algorithm")."""
    out = ""
    for raw in texts:
        text = raw.strip()
        if not text:
            continue
        if not out:
            out = text
        elif out.endswith("­"):
            out = out[:-1] + text
        elif out.endswith("-") and len(out) >= 2 and out[-2].isalpha():
            # "algo-" + "rithm" → "algorithm"; "COVID-" + "19" / "state-" + "Of" keep the real hyphen.
            out = out[:-1] + text if text[0].islower() else out + text
        else:
            out = f"{out} {text}"
    return out


def _line_spacing(lines: list[PdfLine], body_size: float) -> float:
    deltas = [
        current.top - previous.top
        for previous, current in zip(lines, lines[1:], strict=False)
        if current.page == previous.page
        and current.column == previous.column
        and 0 < current.top - previous.top < 3 * body_size
    ]
    return statistics.median(deltas) if deltas else body_size * 1.2


def _typical_width(lines: list[PdfLine]) -> float:
    widths = [line.width for line in lines if len(line.text) > 30]
    if not widths:
        widths = [line.width for line in lines] or [1.0]
    return statistics.median(widths)


@dataclass(frozen=True)
class _FlowMetrics:
    spacing: float
    typical_width: float
    body_size: float
    left_edges: dict[tuple[int, int], int]  # (page, column) → most common line start x


def _left_edges(lines: list[PdfLine]) -> dict[tuple[int, int], int]:
    groups: dict[tuple[int, int], list[int]] = defaultdict(list)
    for line in lines:
        groups[(line.page, line.column)].append(round(line.x0))
    return {key: Counter(values).most_common(1)[0][0] for key, values in groups.items()}


def _starts_new_paragraph(previous: PdfLine, line: PdfLine, metrics: _FlowMetrics) -> bool:
    if _BULLET_RE.match(line.text) or _ORDERED_MARKER_RE.match(line.text) or _CAPTION_RE.match(line.text):
        return True
    same_flow = line.page == previous.page and line.column == previous.column and line.top > previous.top
    if same_flow and line.top - previous.top > metrics.spacing * 1.45:
        return True
    # First-line indent, measured against the column's left edge so it also works across column/page breaks.
    size = metrics.body_size
    indent = line.x0 - metrics.left_edges.get((line.page, line.column), round(line.x0))
    previous_indent = previous.x0 - metrics.left_edges.get((previous.page, previous.column), round(previous.x0))
    if size * 0.8 <= indent <= size * 6 and previous_indent < size * 0.8:
        return True
    return previous.text.rstrip().endswith((".", "!", "?", ":")) and previous.width < metrics.typical_width * 0.75


def build_pdf_blocks(lines: list[PdfLine], page_count: int) -> tuple[str | None, list[Block], int]:
    """Return ``(title, blocks, heading_count)`` for extracted lines."""
    lines = [line for line in remove_page_furniture(lines, page_count) if line.text.strip()]
    if not lines:
        return None, [], 0
    body_size = dominant_font_size(lines)
    title_indices = set(detect_title(lines, body_size))
    title = " ".join(lines[i].text for i in sorted(title_indices)) or None
    content = [line for i, line in enumerate(lines) if i not in title_indices]
    headings = classify_headings(content, body_size, has_front_matter=bool(title_indices))
    body_lines = [line for i, line in enumerate(content) if i not in headings]
    metrics = _FlowMetrics(
        spacing=_line_spacing(content, body_size),
        typical_width=_typical_width(body_lines),
        body_size=body_size,
        left_edges=_left_edges(body_lines),
    )

    blocks: list[Block] = []
    paragraph: list[PdfLine] = []
    previous_heading: tuple[int, HeadingCandidate] | None = None

    def flush() -> None:
        if paragraph:
            text = join_lines([line.text for line in paragraph])
            bullet = _BULLET_RE.match(text)
            ordered = None if bullet else _ORDERED_MARKER_RE.match(text)
            if bullet or ordered:
                marker = bullet or ordered
                blocks.append(ListItemBlock(ordered=bool(ordered), level=0, latex=escape_latex(text[marker.end() :])))
            elif text:
                blocks.append(ParagraphBlock(latex=escape_latex(text), plain=text))
            paragraph.clear()

    for index, line in enumerate(content):
        candidate = headings.get(index)
        if candidate is not None:
            flush()
            last = blocks[-1] if blocks else None
            if (
                candidate.kind == "size"
                and previous_heading is not None
                and previous_heading[0] == index - 1
                and previous_heading[1].kind == "size"
                and previous_heading[1].size == candidate.size
                and isinstance(last, HeadingBlock)
                and line.top - content[index - 1].bottom < 1.5 * line.size
            ):
                merged = f"{last.plain} {line.text}"
                blocks[-1] = HeadingBlock(
                    level=last.level, latex=escape_latex(strip_heading_number(merged)), plain=merged
                )
            else:
                blocks.append(
                    HeadingBlock(
                        level=candidate.level, latex=escape_latex(strip_heading_number(line.text)), plain=line.text
                    )
                )
            previous_heading = (index, candidate)
            continue
        if paragraph and _starts_new_paragraph(paragraph[-1], line, metrics):
            flush()
        paragraph.append(line)
    flush()

    blocks = extract_abstract(blocks)  # an "Abstract" heading is folded into the abstract environment
    heading_count = sum(1 for block in blocks if isinstance(block, HeadingBlock))
    return title, blocks, heading_count


# ── pdfplumber extraction ────────────────────────────────────────────────────


def _is_bold_font(fontname: object) -> bool:
    name = str(fontname or "").lower()
    return any(token in name for token in ("bold", "black", "heavy", "semibold", ",b"))


def _clean_metadata_title(value: object) -> str | None:
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="ignore")
    if not isinstance(value, str):
        return None
    title = collapse_whitespace(value.replace("\x00", ""))
    title = re.sub(r"^microsoft\s+(?:word|powerpoint)\s*-\s*", "", title, flags=re.IGNORECASE)
    if not title or title.lower() in {"untitled", "title"}:
        return None
    if re.search(r"\.(?:docx?|tex|dvi|pdf|pptx?|odt|rtf)$", title, re.IGNORECASE):
        return None
    return title


def _pdf_error(exc: Exception) -> DocumentImportError:
    text = f"{exc!r} {exc.__cause__!r}".lower()
    if "password" in text or "encrypt" in text:
        return DocumentImportError("pdf_encrypted", "The PDF is password-protected. Remove the password and try again.")
    return DocumentImportError("pdf_invalid", "The PDF could not be read. It may be corrupt.")


def extract_pdf(data: bytes, *, max_pages: int = MAX_PDF_PAGES) -> PdfExtraction:
    import pdfplumber

    try:
        pdf = pdfplumber.open(io.BytesIO(data))
    except Exception as exc:
        raise _pdf_error(exc) from exc

    result = PdfExtraction()
    with pdf:
        try:
            pages = pdf.pages
            result.page_count = len(pages)
            result.metadata_title = _clean_metadata_title((pdf.metadata or {}).get("Title"))
            for index, page in enumerate(pages[:max_pages]):
                # x_tolerance below the default 3pt: tightly justified columns squeeze inter-word
                # spaces to ~2pt and would otherwise glue words together.
                raw_words = page.extract_words(
                    x_tolerance=PDF_X_TOLERANCE, extra_attrs=["size", "fontname"], keep_blank_chars=False
                )
                words: list[PdfWord] = []
                for raw in raw_words:
                    if not raw.get("upright", True):
                        continue  # rotated margin text (e.g. arXiv stamps)
                    text, removed = normalize_pdf_text(str(raw.get("text", "")))
                    result.unmapped_glyphs += removed
                    if not text.strip():
                        continue
                    words.append(
                        PdfWord(
                            text=text,
                            x0=float(raw["x0"]),
                            x1=float(raw["x1"]),
                            top=float(raw["top"]),
                            bottom=float(raw["bottom"]),
                            size=float(raw.get("size") or 0.0),
                            bold=_is_bold_font(raw.get("fontname")),
                        )
                    )
                result.lines.extend(layout_page_lines(words, float(page.width), float(page.height), index))
                result.pages_read = index + 1
                page.close()
        except DocumentImportError:
            raise
        except Exception as exc:
            raise _pdf_error(exc) from exc
    return result


def convert_pdf(data: bytes, filename: str) -> ImportedProject:
    extraction = extract_pdf(data)
    title, blocks, heading_count = build_pdf_blocks(extraction.lines, extraction.pages_read)
    if not blocks and not title:
        raise DocumentImportError(
            "pdf_no_text",
            "No extractable text was found. Scanned PDFs need OCR, which is not supported.",
        )

    warnings = [
        ImportWarning(
            code="pdf_text_only",
            message=(
                "PDF import is text-only and lossy: images, tables, equations and the original layout are not "
                "preserved. Review the converted text carefully."
            ),
        )
    ]
    if extraction.page_count > extraction.pages_read:
        warnings.append(
            ImportWarning(
                code="pdf_pages_truncated",
                message=f"Only the first {extraction.pages_read} of {extraction.page_count} pages were imported.",
                count=extraction.page_count,
            )
        )
    if heading_count == 0:
        warnings.append(
            ImportWarning(
                code="pdf_no_headings",
                message="No headings were detected; the text was imported as plain paragraphs.",
            )
        )
    if extraction.unmapped_glyphs:
        warnings.append(
            ImportWarning(
                code="pdf_unmapped_glyphs",
                message=f"{extraction.unmapped_glyphs} character(s) could not be decoded and were removed.",
                count=extraction.unmapped_glyphs,
            )
        )

    return build_project(
        blocks=blocks,
        title_plain=title or extraction.metadata_title,
        filename=filename,
        source_format="pdf",
        assets=[],
        warnings=warnings,
    )
