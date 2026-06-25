from __future__ import annotations

from src.services.prompts import render_user_prompt

_MANUSCRIPT_TASKS = frozenset({"edit", "style", "structure", "logic", "citation", "template"})


def task_needs_manuscript(task: str) -> bool:
    return task in _MANUSCRIPT_TASKS


def build_chat_user_content(
    query: str,
    *,
    selection: str = "",
    latex: str = "",
    include_manuscript: bool = False,
) -> str:
    """Build the user message for chat mode.

    Casual chat should not receive the full manuscript excerpt — only an optional
    editor selection when the user highlighted text.
    """
    parts: list[str] = []
    if selection.strip():
        parts.append(f"Selected text:\n{selection[:4000]}")
    elif include_manuscript and latex.strip():
        parts.append(f"Manuscript excerpt:\n{latex[:4000]}")

    context_block = "\n\n".join(parts)
    rendered = render_user_prompt("chat", context_block=context_block, query=query)
    if rendered:
        return rendered
    if context_block:
        return f"{context_block}\n\nUser request: {query}"
    return query
