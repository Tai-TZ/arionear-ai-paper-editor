"""Turn the intermediate block list into a minimal, compilable LaTeX project."""

from __future__ import annotations

import re
from pathlib import PurePath

from src.services.document_import.blocks import (
    AbstractBlock,
    Block,
    CommentBlock,
    FigureBlock,
    HeadingBlock,
    ListItemBlock,
    ParagraphBlock,
    TableBlock,
)
from src.services.document_import.latex_escape import collapse_whitespace, escape_latex, needs_unicode_engine
from src.services.document_import.models import (
    DocumentFormat,
    ImportedAsset,
    ImportedFile,
    ImportedProject,
    ImportWarning,
)

MAIN_FILE = "main.tex"
MAX_LIST_DEPTH = 4
MAX_PROJECT_NAME_CHARS = 120

_SECTION_COMMANDS = {1: "section", 2: "subsection", 3: "subsubsection", 4: "paragraph"}

_HEADING_NUMBER_RE = re.compile(r"^\s*(?:\d{1,2}(?:\.\d{1,2}){0,3}\.?|[IVX]{1,5}\.|[A-H]\.)\s+(?=\S)")
_ABSTRACT_LABELS = frozenset({"abstract", "tóm tắt", "summary"})
_ABSTRACT_PREFIX_RE = re.compile(r"^\s*(?:abstract|tóm tắt)\s*[—–:.\-]+\s*(?=\S)", re.IGNORECASE)
_KEYWORDS_RE = re.compile(r"^\s*(?:keywords?|key\s+words|index\s+terms|từ\s+khóa|từ\s+khoá)\b", re.IGNORECASE)
_NOT_TITLE_HEADINGS = frozenset(
    {
        "abstract",
        "tóm tắt",
        "introduction",
        "giới thiệu",
        "background",
        "methods",
        "methodology",
        "results",
        "discussion",
        "conclusion",
        "conclusions",
        "references",
        "tài liệu tham khảo",
    }
)

_UNICODE_PREAMBLE = "\\usepackage{fontspec}\n\\setmainfont{Latin Modern Roman}\n"
_PDFLATEX_PREAMBLE = "\\usepackage[T1]{fontenc}\n\\usepackage{lmodern}\n"
_COMMON_PREAMBLE = (
    "\\usepackage{amsmath,amssymb}\n\\usepackage{graphicx}\n\\usepackage{booktabs}\n\\usepackage{hyperref}\n"
)


def strip_heading_number(text: str) -> str:
    """Drop manual numbering ("1.2 Methods", "II. RESULTS") — LaTeX numbers sections itself."""
    stripped = _HEADING_NUMBER_RE.sub("", text, count=1).strip()
    return stripped or text.strip()


def normalized_label(text: str) -> str:
    return collapse_whitespace(text).strip(" :.—–-").lower()


def is_abstract_label(text: str) -> bool:
    return normalized_label(strip_heading_number(text)) in _ABSTRACT_LABELS


def has_abstract_prefix(text: str) -> bool:
    """ "Abstract" alone, or an inline "Abstract— …" / "Abstract: …" opener."""
    return is_abstract_label(text) or bool(_ABSTRACT_PREFIX_RE.match(text))


def extract_abstract(blocks: list[Block]) -> list[Block]:
    """Fold the first "Abstract" heading/paragraph (and its body) into an ``AbstractBlock``."""
    out: list[Block] = []
    abstract: AbstractBlock | None = None
    collecting = False
    for block in blocks:
        if collecting and abstract is not None:
            if isinstance(block, ParagraphBlock) and not _KEYWORDS_RE.match(block.plain):
                abstract.paragraphs.append(block.latex)
                continue
            collecting = False
        if abstract is None and isinstance(block, HeadingBlock | ParagraphBlock):
            if is_abstract_label(block.plain):
                abstract = AbstractBlock()
                out.append(abstract)
                collecting = True
                continue
            if isinstance(block, ParagraphBlock):
                match = _ABSTRACT_PREFIX_RE.match(block.plain)
                if match:
                    # "Abstract— …" / "Abstract: …" is a single-paragraph abstract.
                    abstract = AbstractBlock([escape_latex(block.plain[match.end() :].strip())])
                    out.append(abstract)
                    continue
        out.append(block)
    return [b for b in out if not (isinstance(b, AbstractBlock) and not b.paragraphs)]


def promote_first_heading_to_title(blocks: list[Block]) -> tuple[str | None, list[Block]]:
    """Use the first block as the title when it is a heading that does not name a standard section."""
    for index, block in enumerate(blocks):
        if isinstance(block, CommentBlock):
            continue
        if isinstance(block, HeadingBlock):
            label = normalized_label(strip_heading_number(block.plain))
            if label and label not in _NOT_TITLE_HEADINGS:
                return block.plain, blocks[:index] + blocks[index + 1 :]
        return None, blocks
    return None, blocks


def _protect_item_text(latex: str) -> str:
    # "\item [x]" would be parsed as an optional label.
    return "{}" + latex if latex.startswith("[") else latex


def _render_list_item(block: ListItemBlock, stack: list[bool], lines: list[str]) -> None:
    target_depth = max(1, min(block.level + 1, len(stack) + 1, MAX_LIST_DEPTH))
    while len(stack) > target_depth:
        lines.append(f"\\end{{{'enumerate' if stack.pop() else 'itemize'}}}")
    if len(stack) == target_depth and stack[-1] != block.ordered:
        lines.append(f"\\end{{{'enumerate' if stack.pop() else 'itemize'}}}")
    while len(stack) < target_depth:
        stack.append(block.ordered)
        lines.append(f"\\begin{{{'enumerate' if block.ordered else 'itemize'}}}")
    lines.append(f"\\item {_protect_item_text(block.latex)}")


def _close_lists(stack: list[bool], lines: list[str]) -> None:
    closed = False
    while stack:
        lines.append(f"\\end{{{'enumerate' if stack.pop() else 'itemize'}}}")
        closed = True
    if closed:
        lines.append("")


def _width_arg(fraction: float) -> str:
    fraction = max(0.05, min(1.0, fraction))
    if fraction >= 0.995:
        return "\\linewidth"
    return f"{fraction:.2f}\\linewidth"


def render_table(block: TableBlock) -> str:
    rows = [row for row in block.rows if row]
    if not rows:
        return ""
    ncols = max(sum(max(1, cell.span) for cell in row) for row in rows)
    long_text = any(len(cell.latex) > 40 for row in rows for cell in row)
    col_width = 0.9 / ncols
    col_spec = "".join(f"p{{{_width_arg(col_width)}}}" if long_text else "l" for _ in range(ncols))

    lines = ["\\begin{table}[htbp]", "\\centering"]
    if block.caption:
        lines.append(f"\\caption{{{block.caption}}}")
    lines.append(f"\\begin{{tabular}}{{{col_spec}}}")
    lines.append("\\toprule")
    for index, row in enumerate(rows):
        rendered: list[str] = []
        used = 0
        for cell in row:
            if used >= ncols:
                break
            span = max(1, min(cell.span, ncols - used))
            if span > 1:
                spec = f"p{{{_width_arg(col_width * span)}}}" if long_text else "l"
                rendered.append(f"\\multicolumn{{{span}}}{{{spec}}}{{{cell.latex}}}")
            else:
                rendered.append(cell.latex)
            used += span
        rendered.extend("" for _ in range(ncols - used))
        lines.append(" & ".join(rendered) + " \\\\")
        if index == 0 and len(rows) > 1:
            lines.append("\\midrule")
    lines.append("\\bottomrule")
    lines.append("\\end{tabular}")
    lines.append("\\end{table}")
    return "\n".join(lines)


def render_figure(block: FigureBlock) -> str:
    lines = [
        "\\begin{figure}[htbp]",
        "\\centering",
        f"\\includegraphics[width={_width_arg(block.width)}]{{{block.path}}}",
    ]
    if block.caption:
        lines.append(f"\\caption{{{block.caption}}}")
    lines.append("\\end{figure}")
    return "\n".join(lines)


def render_blocks(blocks: list[Block]) -> str:
    lines: list[str] = []
    list_stack: list[bool] = []
    for block in blocks:
        if isinstance(block, ListItemBlock):
            _render_list_item(block, list_stack, lines)
            continue
        _close_lists(list_stack, lines)
        if isinstance(block, HeadingBlock):
            command = _SECTION_COMMANDS.get(max(1, min(block.level, 4)), "section")
            lines.extend([f"\\{command}{{{block.latex}}}", ""])
        elif isinstance(block, ParagraphBlock):
            if block.latex.strip():
                lines.extend([block.latex, ""])
        elif isinstance(block, AbstractBlock):
            lines.append("\\begin{abstract}")
            lines.append("\n\n".join(block.paragraphs))
            lines.extend(["\\end{abstract}", ""])
        elif isinstance(block, TableBlock):
            rendered = render_table(block)
            if rendered:
                lines.extend([rendered, ""])
        elif isinstance(block, FigureBlock):
            lines.extend([render_figure(block), ""])
        elif isinstance(block, CommentBlock):
            lines.extend(f"% {line}".rstrip() for line in block.text.splitlines() or [""])
            lines.append("")
    _close_lists(list_stack, lines)
    return "\n".join(lines).strip() + "\n"


def _comment_safe(text: str) -> str:
    return collapse_whitespace(text)


def render_document(
    *,
    title_latex: str,
    body: str,
    source_name: str,
    notes: list[str],
) -> tuple[str, bool]:
    """Return ``(main_tex, uses_unicode_engine)``."""
    unicode_engine = needs_unicode_engine(title_latex) or needs_unicode_engine(body)
    header = [f"% Converted from {_comment_safe(source_name)} by Proofline document import."]
    if notes:
        header.append("% Import notes:")
        header.extend(f"% - {_comment_safe(note)}" for note in notes)
    parts = [
        "\n".join(header),
        "\\documentclass[11pt]{article}",
        (_UNICODE_PREAMBLE if unicode_engine else _PDFLATEX_PREAMBLE) + _COMMON_PREAMBLE,
        f"\\title{{{title_latex}}}\n\\author{{}}\n\\date{{}}\n",
        "\\begin{document}\n\\maketitle\n",
        body.rstrip() + "\n",
        "\\end{document}\n",
    ]
    return "\n".join(parts), unicode_engine


def fallback_name(filename: str) -> str:
    stem = PurePath(filename.replace("\\", "/")).stem if filename else ""
    stem = collapse_whitespace(re.sub(r"[_]+", " ", stem))
    return stem or "Imported document"


def project_name(title_plain: str | None, filename: str) -> str:
    name = collapse_whitespace(title_plain or "")
    if not name:
        name = fallback_name(filename)
    if len(name) > MAX_PROJECT_NAME_CHARS:
        name = name[: MAX_PROJECT_NAME_CHARS - 1].rstrip() + "…"
    return name


def build_project(
    *,
    blocks: list[Block],
    title_plain: str | None,
    filename: str,
    source_format: DocumentFormat,
    assets: list[ImportedAsset],
    warnings: list[ImportWarning],
) -> ImportedProject:
    name = project_name(title_plain, filename)
    title_latex = escape_latex(collapse_whitespace(title_plain or "")) or escape_latex(fallback_name(filename))
    body = render_blocks(blocks)
    tex, unicode_engine = render_document(
        title_latex=title_latex,
        body=body,
        source_name=PurePath(filename.replace("\\", "/")).name or f"document.{source_format}",
        notes=[warning.message for warning in warnings],
    )
    return ImportedProject(
        name=name,
        main_file=MAIN_FILE,
        files=[ImportedFile(path=MAIN_FILE, content=tex)],
        assets=assets,
        compiler="xelatex" if unicode_engine else "auto",
        warnings=warnings,
        source_format=source_format,
    )
