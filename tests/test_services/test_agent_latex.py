"""Tests for multi-file LaTeX source resolution."""

from src.models.schemas import ChatRequest
from src.services.agent_latex import resolve_latex_sources


def test_edit_uses_active_file_content_when_not_main():
    request = ChatRequest(
        message="/edit shorten intro",
        latex_content="\\documentclass{article}\\begin{document}\\input{intro}\\end{document}",
        active_file="chapters/intro.tex",
        main_file="main.tex",
        active_file_content="\\section{Introduction}\nOld text.",
    )
    main, work, main_file, active_file = resolve_latex_sources(request, "edit")
    assert main_file == "main.tex"
    assert active_file == "chapters/intro.tex"
    assert "\\input{intro}" in main
    assert work == "\\section{Introduction}\nOld text."


def test_structure_uses_main_manuscript():
    request = ChatRequest(
        message="/structure",
        latex_content="\\documentclass{article}\\section{A}",
        active_file="chapters/intro.tex",
        main_file="main.tex",
        active_file_content="\\section{Introduction}",
    )
    _main, work, _mf, _af = resolve_latex_sources(request, "structure")
    assert work == "\\documentclass{article}\\section{A}"


def test_resolved_main_used_when_request_body_empty():
    request = ChatRequest(message="/structure", latex_content="")
    main, work, _, _ = resolve_latex_sources(
        request,
        "structure",
        resolved_main="from session",
    )
    assert main == "from session"
    assert work == "from session"


def test_resolved_active_file_from_session_cache():
    request = ChatRequest(
        message="/edit",
        task="edit",
        latex_content="",
        active_file="chapter.tex",
        active_file_content="",
        active_file_content_hash="deadbeef",
        main_file="main.tex",
    )
    main, work, _, active = resolve_latex_sources(
        request,
        "edit",
        resolved_main="main from session",
        resolved_active="chapter from cache",
    )
    assert active == "chapter.tex"
    assert work == "chapter from cache"
    assert main == "main from session"
