import pytest

from src.services.document_import.blocks import (
    AbstractBlock,
    FigureBlock,
    HeadingBlock,
    ListItemBlock,
    ParagraphBlock,
    TableBlock,
    TableCell,
)
from src.services.document_import.latex_escape import escape_latex, escape_url, needs_unicode_engine
from src.services.document_import.latex_writer import (
    extract_abstract,
    promote_first_heading_to_title,
    render_blocks,
    render_document,
    strip_heading_number,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("\\", r"\textbackslash{}"),
        ("&", r"\&"),
        ("%", r"\%"),
        ("$", r"\$"),
        ("#", r"\#"),
        ("_", r"\_"),
        ("{", r"\{"),
        ("}", r"\}"),
        ("~", r"\textasciitilde{}"),
        ("^", r"\textasciicircum{}"),
    ],
)
def test_escape_each_special_character(raw, expected):
    assert escape_latex(raw) == expected


def test_escape_is_single_pass_and_never_double_escapes():
    assert escape_latex(r"\textbf{x}") == r"\textbackslash{}textbf\{x\}"
    assert escape_latex("50% of $5 & #1_a") == r"50\% of \$5 \& \#1\_a"
    assert escape_latex("a^b~c") == r"a\textasciicircum{}b\textasciitilde{}c"


def test_escape_normalises_unicode_for_pdflatex():
    assert escape_latex("α ≤ β") == r"\ensuremath{\alpha} \ensuremath{\leq} \ensuremath{\beta}"
    assert escape_latex("ﬁnal value") == "final~value"
    assert escape_latex("zero​width\x07") == "zerowidth"
    assert escape_latex("line\nbreak\ttab") == "line break tab"
    assert escape_latex("") == ""


def test_escape_url_escapes_hyperref_specials():
    assert escape_url("https://x.org/a%20b#frag") == r"https://x.org/a\%20b\#frag"


def test_needs_unicode_engine_detects_vietnamese_but_not_latin1():
    assert needs_unicode_engine("Phương pháp nghiên cứu")
    assert not needs_unicode_engine("Café — “quoted” résumé…")


def test_strip_heading_number():
    assert strip_heading_number("1. Introduction") == "Introduction"
    assert strip_heading_number("2.1 Methods") == "Methods"
    assert strip_heading_number("IV. RESULTS") == "RESULTS"
    assert strip_heading_number("2020") == "2020"


def test_render_nested_and_mixed_lists_are_balanced():
    body = render_blocks(
        [
            ListItemBlock(ordered=False, level=0, latex="a"),
            ListItemBlock(ordered=False, level=2, latex="deep"),  # skipped level clamps to one deeper
            ListItemBlock(ordered=True, level=0, latex="[1] first"),
            ParagraphBlock(latex="after", plain="after"),
        ]
    )
    assert body.count(r"\begin{itemize}") == body.count(r"\end{itemize}") == 2
    assert body.count(r"\begin{enumerate}") == body.count(r"\end{enumerate}") == 1
    assert r"\item {}[1] first" in body  # protected against being read as an optional label
    assert body.index(r"\end{enumerate}") < body.index("after")


def test_render_table_with_span_caption_and_booktabs():
    table = TableBlock(
        rows=[[TableCell("A"), TableCell("B")], [TableCell("wide", span=2)], [TableCell("x")]],
        caption="Results",
    )
    body = render_blocks([table])
    assert r"\caption{Results}" in body
    assert r"\begin{tabular}{ll}" in body
    assert r"\toprule" in body and r"\midrule" in body and r"\bottomrule" in body
    assert r"\multicolumn{2}{l}{wide} \\" in body
    assert "x &  \\\\" in body  # short rows are padded


def test_render_figure_width():
    body = render_blocks([FigureBlock(path="figures/image1.png", width=1.0, caption="Cap")])
    assert r"\includegraphics[width=\linewidth]{figures/image1.png}" in body
    assert r"\caption{Cap}" in body


def test_extract_abstract_from_heading_and_inline_prefix():
    blocks = extract_abstract(
        [
            HeadingBlock(level=1, latex="Abstract", plain="Abstract"),
            ParagraphBlock(latex="We study X.", plain="We study X."),
            ParagraphBlock(latex="Keywords: a, b", plain="Keywords: a, b"),
            HeadingBlock(level=1, latex="Intro", plain="Intro"),
        ]
    )
    assert isinstance(blocks[0], AbstractBlock) and blocks[0].paragraphs == ["We study X."]
    assert isinstance(blocks[1], ParagraphBlock) and blocks[1].plain.startswith("Keywords")

    inline = extract_abstract([ParagraphBlock(latex="x", plain="Abstract—We show 100% gains.")])
    assert isinstance(inline[0], AbstractBlock)
    assert inline[0].paragraphs == [r"We show 100\% gains."]


def test_promote_first_heading_to_title_skips_standard_sections():
    title, rest = promote_first_heading_to_title([HeadingBlock(1, "Graph Nets", "Graph Nets")])
    assert title == "Graph Nets" and rest == []
    title, rest = promote_first_heading_to_title([HeadingBlock(1, "Introduction", "1 Introduction")])
    assert title is None and len(rest) == 1


def test_render_document_preamble_switches_engine_for_unicode():
    tex, unicode_engine = render_document(title_latex="T", body="Hello\n", source_name="a.docx", notes=["n1"])
    assert not unicode_engine
    assert tex.startswith("% Converted from a.docx")
    assert "% - n1" in tex
    for package in ("graphicx", "booktabs", "hyperref", "amsmath"):
        assert package in tex
    assert r"\documentclass[11pt]{article}" in tex
    assert r"\maketitle" in tex and tex.rstrip().endswith(r"\end{document}")

    tex, unicode_engine = render_document(title_latex="Tóm tắt", body="Xin chào\n", source_name="v.docx", notes=[])
    assert unicode_engine
    assert r"\usepackage{fontspec}" in tex
