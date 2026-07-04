from src.services.logic_audit.config import split_section_text
from src.services.logic_audit.text_utils import infer_claim_text, split_section_text_subsection_aware
from src.services.parser.latex import parse_latex_sections


def test_infer_claim_text_from_quotes():
    claim = infer_claim_text('The claim "state of the art on ImageNet" lacks evidence.')
    assert "state of the art" in claim


def test_infer_claim_text_preserves_existing():
    assert infer_claim_text("ignored", "existing claim text here") == "existing claim text here"


def test_split_section_text_at_subsection():
    body = (
        "Intro paragraph.\n"
        "\\subsection{Dataset}\n"
        "Dataset details here with enough text.\n"
        "\\subsection{Model}\n"
        "Model architecture description."
    )
    chunks = split_section_text_subsection_aware(body, 120, max_chunks=2)
    assert len(chunks) >= 1
    assert any("Dataset" in chunk or "Model" in chunk for chunk in chunks)


def test_parse_latex_sections_collects_subsections():
    latex = (
        "\\begin{abstract}Short abstract.\\end{abstract}\n"
        "\\section{Introduction}\n"
        "Intro body.\n"
        "\\subsection{Motivation}\n"
        "Why this matters.\n"
        "\\section{Conclusion}\n"
        "We conclude.\n"
    )
    sections = parse_latex_sections(latex)
    intro = next(s for s in sections if s["name"] == "Introduction")
    assert intro["subsections"] == ["Motivation"]


def test_split_section_text_wrapper():
    text = "a" * 5000
    chunks = split_section_text(text, 2000, max_chunks=2)
    assert len(chunks) == 2
