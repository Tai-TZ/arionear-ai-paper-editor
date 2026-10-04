import pytest

from src.services.document_import import DocumentImportError, convert_document
from src.services.document_import.blocks import AbstractBlock, HeadingBlock, ListItemBlock, ParagraphBlock
from src.services.document_import.pdf_adapter import (
    PdfLine,
    PdfWord,
    build_pdf_blocks,
    classify_headings,
    detect_gutter,
    join_lines,
    layout_page_lines,
    normalize_pdf_text,
    remove_page_furniture,
)
from tests.test_document_import.builders import PdfText, build_pdf

# ── Pure helpers ─────────────────────────────────────────────────────────────


def _line(text, top, *, page=0, size=10.0, bold=False, x0=72.0, x1=None, column=0, height=792.0):
    return PdfLine(
        page=page,
        text=text,
        x0=x0,
        x1=x1 if x1 is not None else x0 + 5.0 * len(text),
        top=top,
        bottom=top + size,
        size=size,
        bold=bold,
        column=column,
        page_height=height,
    )


def test_join_lines_dehyphenates_only_lowercase_continuations():
    assert join_lines(["the algo-", "rithm works"]) == "the algorithm works"
    assert join_lines(["state-", "Of-the-art"]) == "state-Of-the-art"
    assert join_lines(["co\u00ad", "operate"]) == "cooperate"
    assert join_lines(["one", "", "two"]) == "one two"


def test_normalize_pdf_text_expands_ligatures_and_drops_cid_glyphs():
    assert normalize_pdf_text("ﬁrst (cid:12)eﬀect") == ("first effect", 1)
    assert normalize_pdf_text("Vie\u0302\u0323t")[0] == "Việt"


def test_remove_page_furniture_drops_repeated_headers_and_page_numbers():
    lines = []
    for page in range(3):
        lines += [
            _line("Journal of Tests, Vol. 3", 30, page=page),
            _line(f"Body text on page {page}.", 300, page=page),
            _line(str(page + 1), 700, page=page),
        ]
    kept = remove_page_furniture(lines, 3)
    assert [line.text for line in kept] == ["Body text on page 0.", "Body text on page 1.", "Body text on page 2."]


def test_remove_page_furniture_keeps_unique_margin_text():
    lines = [_line("A Unique Title", 40), _line("Body.", 300), _line("Body 2.", 300, page=1)]
    assert len(remove_page_furniture(lines, 2)) == 3


def test_classify_headings_numbered_size_caps_and_roman():
    lines = [
        _line("1 Introduction", 100, bold=True, size=12),
        _line("2.1 Data Collection", 120),  # multi-level number, short line
        _line("RELATED WORK", 140),
        _line("Large Unnumbered Heading", 160, size=14),
        _line("1. Short list item", 180),  # single-level number, plain text: a list item, not a heading
        _line("This is a regular sentence that ends with a period.", 200),
        _line("Figure 2: Not a heading", 220, bold=True),
    ]
    found = classify_headings(lines, 10.0)
    assert found[0].level == 1 and found[0].kind == "numbered"
    assert found[1].level == 2
    assert found[2].kind == "caps" and found[2].level == 1
    assert found[3].kind == "size"
    assert 4 not in found and 5 not in found and 6 not in found

    ieee = [_line("I. INTRODUCTION", 100), _line("A. Background Theory", 120), _line("A. Smith", 140, page=1)]
    found = classify_headings(ieee, 10.0)
    assert found[0].level == 1 and found[1].level == 2


def test_build_blocks_paragraphs_headings_abstract_and_lists():
    lines = [
        _line("Learning to Import Papers", 60, size=20),
        _line("Jane Doe, University of Somewhere", 90, size=12),  # front matter, not a heading
        _line("Abstract", 120, bold=True),
        _line("We convert PDFs into LaTeX.", 135, x1=300),
        _line("1 Introduction", 170, size=12, bold=True),
        _line("Modern parsers use many algo-", 190, x1=540),
        _line("rithms to recover structure and they", 202, x1=540),
        _line("work well in practice.", 214, x1=250),
        _line("A second paragraph starts after a gap and", 240, x1=540),
        _line("continues here.", 252, x1=200),
        _line("• first point", 270, x1=200),
        _line("• second point", 282, x1=200),
    ]
    title, blocks, heading_count = build_pdf_blocks(lines, 1)
    assert title == "Learning to Import Papers"
    assert heading_count == 1
    assert isinstance(blocks[0], ParagraphBlock) and blocks[0].plain.startswith("Jane Doe")
    assert isinstance(blocks[1], AbstractBlock) and blocks[1].paragraphs == ["We convert PDFs into LaTeX."]
    assert isinstance(blocks[2], HeadingBlock) and blocks[2].latex == "Introduction"
    assert blocks[3].plain == "Modern parsers use many algorithms to recover structure and they work well in practice."
    assert blocks[4].plain == "A second paragraph starts after a gap and continues here."
    assert [b.latex for b in blocks[5:]] == ["first point", "second point"]
    assert all(isinstance(b, ListItemBlock) and not b.ordered for b in blocks[5:])


def _column_words(x0: float, x1: float, top: float, text: str) -> list[PdfWord]:
    words = text.split()
    step = (x1 - x0) / len(words)
    return [
        PdfWord(text=word, x0=x0 + i * step, x1=x0 + (i + 1) * step - 3, top=top, bottom=top + 10, size=10)
        for i, word in enumerate(words)
    ]


def test_two_column_page_is_read_column_by_column():
    words = [PdfWord("Two Column Title Spanning Both", 150, 460, 60, 76, 16)]
    for row in range(12):
        top = 120 + row * 12
        words += _column_words(72, 300, top, f"left{row} alpha beta gamma delta")
        words += _column_words(312, 540, top, f"right{row} alpha beta gamma delta")
    assert detect_gutter(words, 612) is not None

    lines = layout_page_lines(words, 612, 792, 0)
    texts = [line.text for line in lines]
    assert texts[0] == "Two Column Title Spanning Both"
    assert [t.split()[0] for t in texts[1:13]] == [f"left{i}" for i in range(12)]
    assert [t.split()[0] for t in texts[13:]] == [f"right{i}" for i in range(12)]
    assert {line.column for line in lines[1:13]} == {1}


def test_single_column_page_has_no_gutter():
    words = []
    for row in range(40):
        words += _column_words(72, 540, 100 + row * 12, "one two three four five six seven eight nine ten eleven")
    assert detect_gutter(words, 612) is None


# ── End-to-end with a generated PDF ──────────────────────────────────────────


def _sample_pdf() -> bytes:
    header = PdfText("Preprint - Do not distribute", y=30, size=8)
    page_one = [
        header,
        PdfText("A Study of Import Quality", y=80, size=20, x=150),
        PdfText("Jane Doe, University of Somewhere", y=110, size=12, x=200),
        PdfText("Abstract", y=150, bold=True),
        PdfText("We measure conversion quality for 50% & more of cases.", y=166),
        PdfText("1 Introduction", y=200, size=12, bold=True),
        PdfText("Document conversion relies on robust algo-", y=222),
        PdfText("rithms that recover headings and paragraphs from", y=234),
        PdfText("plain text lines.", y=246),
        PdfText("A second paragraph follows after a larger gap.", y=272),
        PdfText("2.1 Methods", y=300, size=11, bold=True),
        PdfText("We used a small corpus.", y=320),
        PdfText("RESULTS", y=350),
        PdfText("Accuracy was high.", y=370),
        PdfText("1", y=750, x=300),
    ]
    page_two = [
        header,
        PdfText("2 Discussion", y=100, size=12, bold=True),
        PdfText("The approach generalizes to other formats.", y=122),
        PdfText("2", y=750, x=300),
    ]
    return build_pdf([page_one, page_two])


def test_pdf_end_to_end_headings_paragraphs_and_cleanup():
    project = convert_document(_sample_pdf(), "quality-study.pdf")
    tex = project.main_content
    body = tex.split(r"\maketitle", 1)[1]

    assert project.source_format == "pdf"
    assert project.assets == []
    assert project.name == "A Study of Import Quality"
    assert r"\title{A Study of Import Quality}" in tex
    assert "\\begin{abstract}\nWe measure conversion quality for 50\\% \\& more of cases.\n\\end{abstract}" in body
    assert r"\section{Introduction}" in body
    assert r"\subsection{Methods}" in body
    assert r"\section{RESULTS}" in body
    assert r"\section{Discussion}" in body
    assert (
        "Document conversion relies on robust algorithms that recover headings and paragraphs from plain text lines."
        in body
    )
    assert "plain text lines.\n\nA second paragraph follows after a larger gap." in body
    assert "Jane Doe, University of Somewhere" in body
    assert r"\section{Jane" not in body
    assert "Preprint" not in tex
    assert "\n1\n" not in body and "\n2\n" not in body
    assert (
        body.index(r"\section{Introduction}")
        < body.index(r"\subsection{Methods}")
        < body.index(r"\section{Discussion}")
    )

    codes = [warning.code for warning in project.warnings]
    assert codes == ["pdf_text_only"]
    assert "% - PDF import is text-only and lossy" in tex


def test_pdf_without_headings_warns():
    pdf = build_pdf([[PdfText("Just one plain sentence of body text.", y=100)]])
    project = convert_document(pdf, "plain.pdf")
    assert {w.code for w in project.warnings} == {"pdf_text_only", "pdf_no_headings"}
    assert "Just one plain sentence of body text." in project.main_content
    assert project.name == "plain"


def test_pdf_without_text_is_rejected():
    with pytest.raises(DocumentImportError) as info:
        convert_document(build_pdf([[]]), "scan.pdf")
    assert info.value.code == "pdf_no_text"
    assert info.value.status_code == 422


def test_corrupt_pdf_is_rejected():
    with pytest.raises(DocumentImportError) as info:
        convert_document(b"%PDF-1.4\nthis is not a real pdf body", "broken.pdf")
    assert info.value.code in {"pdf_invalid", "pdf_no_text"}
