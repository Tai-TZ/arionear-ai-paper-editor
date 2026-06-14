from src.services.guardrails.integrity import build_diff, check_integrity, extract_numbers
from src.services.parser.latex import extract_cite_keys, parse_latex_sections


def test_extract_numbers():
    assert "92.4" in extract_numbers("F1 of 92.4 on BC5CDR")
    assert "64" in extract_numbers("bottleneck dimension 64")


def test_numeric_drift_flag():
    flags = check_integrity("F1 score is 92.4.", "F1 score is 95.0.")
    codes = {f["code"] for f in flags}
    assert "numeric_drift" in codes or "numeric_removed" in codes


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
