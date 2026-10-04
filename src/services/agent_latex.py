"""Resolve which LaTeX source the agent should read/edit for a chat request."""

from __future__ import annotations

from src.models.schemas import ChatRequest

_EDIT_STYLE_TASKS = frozenset({"edit", "style"})


def resolve_latex_sources(
    request: ChatRequest,
    task: str,
    *,
    resolved_main: str | None = None,
    resolved_active: str | None = None,
) -> tuple[str, str, str, str]:
    """
    Return (main_latex, work_latex, main_file, active_file).

    * main_latex — root manuscript (structure, citations, chat context)
    * work_latex — file content used for edit/style resolution
    """
    main_file = (request.main_file or "main.tex").strip() or "main.tex"
    active_file = (request.active_file or main_file).strip() or main_file
    main_latex = resolved_main if resolved_main is not None else (request.latex_content or "")
    active_latex = resolved_active if resolved_active is not None else (request.active_file_content or "").strip()
    if not active_latex or active_file == main_file:
        active_latex = main_latex

    if task in _EDIT_STYLE_TASKS:
        work_latex = active_latex
    else:
        work_latex = main_latex

    return main_latex, work_latex, main_file, active_file
