from src.services.guardrails.integrity import (
    build_diff,
    check_integrity,
    extract_numbers,
)
from src.services.parser.latex import extract_cite_keys, parse_latex_sections


def test_extract_numbers():
    assert "92.4" in extract_numbers("F1 of 92.4 on BC5CDR")
    assert "64" in extract_numbers("bottleneck dimension 64")


def test_numeric_drift_flag():
    flags = check_integrity("F1 score is 92.4.", "F1 score is 95.0.", scope="selection")
    codes = {f["code"] for f in flags}
    assert "numeric_drift" in codes or "numeric_removed" in codes
    assert not any(f["severity"] == "error" for f in flags)


def test_document_edit_warns_on_numeric_drift():
    original = r"\documentclass{article}\begin{document}Accuracy 92.4\end{document}"
    suggestion = r"\documentclass{article}\begin{document}Accuracy 95.0\end{document}"
    flags = check_integrity(original, suggestion, strictness="standard", scope="document")
    assert any(f.get("code") == "numeric_drift" for f in flags)
    assert not any(f.get("severity") == "error" for f in flags)


def test_build_diff():
    diff = build_diff("hello world", "hello academic world")
    assert "original" in diff or "---" in diff


def test_parse_sections():
    latex = r"\begin{abstract}Summary here\end{abstract}\section{Introduction}Intro text."
    sections = parse_latex_sections(latex)
    names = [s["name"] for s in sections]
    assert "Abstract" in names
    assert "Introduction" in names


def test_extract_cite_keys():
    latex = r"Prior work \cite{smith2020,jones2021} shows results."
    keys = extract_cite_keys(latex)
    assert keys == ["smith2020", "jones2021"]


def test_parse_intent_json():
    from src.services.intent_router import parse_intent_payload

    result = parse_intent_payload('{"action":"edit","scope":"document"}')
    assert result is not None
    assert result.action == "edit"
    assert result.scope == "document"


def test_imrad_template_adds_missing_sections():
    from src.services.template_latex import build_imrad_template

    minimal = r"\documentclass{article}\begin{document}\section{Introduction}Hi\end{document}"
    result = build_imrad_template(minimal)
    assert "\\begin{abstract}" in result
    assert "\\section{Methods}" in result
    assert "\\section{Results}" in result
    assert "\\section{Discussion}" in result
    assert "\\section{Conclusion}" in result
    assert "Hi" in result


def test_analyze_structure_flags_missing_methods():
    from src.services.parser.latex import analyze_structure, parse_latex_sections

    latex = r"""
\begin{abstract}Summary\end{abstract}
\section{Introduction}Intro text here with enough content to avoid length warning.
\section{Results}Results text here with enough content to avoid length warning.
\section{Discussion}Discussion text here with enough content.
\section{Conclusion}Conclusion text here with enough content.
"""
    sections = parse_latex_sections(latex)
    suggestions = analyze_structure(sections)
    missing = [s for s in suggestions if s.get("type") == "missing"]
    assert any(s.get("section") == "Methods" for s in missing)
