from src.services.guardrails.integrity import check_integrity
from src.services.guardrails.output_sanitize import clamp_selection_replacement
from src.services.latex_outline import build_manuscript_outline, find_section_span

INTRO_TEX = r"""
\section{\textbf{Introduction}}
Plants are important in Vietnam.
Many species need classification.

\subsection{Existing Works}
Prior art here.
\section{Methods}
We use CNNs.
"""


def test_find_section_span_textbf_introduction_excludes_header():
    span = find_section_span(INTRO_TEX, "introduction")
    assert span is not None
    start, end, content = span
    assert r"\section{\textbf{Introduction}}" not in content
    assert "Plants are important" in content
    assert content.strip().startswith("Plants are important")


def test_find_section_span_matches_introduction_alias():
    span = find_section_span(INTRO_TEX, r"\textbf{Introduction}")
    assert span is not None
    _, _, content = span
    assert r"\section" not in content
    assert "Plants are important" in content


def test_build_manuscript_outline_normalizes_section_name():
    outline = build_manuscript_outline(INTRO_TEX)
    names = [sec.name for sec in outline.sections if sec.kind == "section"]
    assert "introduction" in names


def test_integrity_ignores_section_outline_numbers():
    original = "Plants are important in Vietnam."
    suggestion = (
        "Plants matter in Vietnam. "
        "This paper is organized as follows: Section 2 reviews related work, "
        "Section 3 describes methods, Section 4 presents results, and Section 5 concludes."
    )
    flags = check_integrity(original, suggestion, strictness="strict", scope="selection")
    assert not any(f.get("severity") == "error" for f in flags)


def test_clamp_strips_leaked_section_command():
    original = "Body text only."
    suggestion = r"\section{\textbf{Introduction}}\nShorter body."
    out = clamp_selection_replacement(original, suggestion)
    assert r"\section" not in out
    assert "Shorter body" in out
