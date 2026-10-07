from src.services.intent_router import _fallback_intent
from src.services.parser.latex import find_section_for_query, parse_latex_sections
from src.services.prompts import build_system_prompt, get_prompt


def test_paper_ide_prompt_exists():
    core = get_prompt("paper_ide", "system")
    assert "Paper IDE" in core or "EDICO" in core
    assert "Dico" in core


def test_build_system_prompt_composes_core_and_task():
    combined = build_system_prompt("chat")
    assert "Dico" in combined
    assert "TASK:" in combined or "Conversational" in combined


def test_fallback_intent_style_abstract():
    query = "Viết lại văn phong theo hướng học thuật hơn cho phần Abstract"
    result = _fallback_intent(query, True, False)
    assert result.action == "style"


def test_find_section_for_abstract_query():
    latex = r"\begin{abstract}Old abstract text.\end{abstract}\section{Introduction}Hi"
    sections = parse_latex_sections(latex)
    matched = find_section_for_query("chỉnh phần Abstract cho học thuật hơn", sections)
    assert matched is not None
    assert matched["name"] == "Abstract"
