from __future__ import annotations

import re

from src.services.guardrails.prompt_injection import wrap_untrusted_user_text
from src.services.intent_rules import is_casual_chat
from src.services.parser.latex import find_section_for_query
from src.services.prompts import render_user_prompt

_MANUSCRIPT_TASKS = frozenset({"edit", "style", "structure", "logic", "citation", "template"})

_MANUSCRIPT_CHAT_RE = re.compile(
    r"abstract|tóm\s*tắt|introduction|giới\s*thiệu|method|phương\s*pháp|"
    r"result|kết\s*quả|discussion|thảo\s*luận|conclusion|kết\s*luận|"
    r"bài\s*báo|bản\s*thảo|manuscript|paper|section|phần|đoạn|nội\s*dung|"
    r"imrad|cấu\s*trúc|contribution|đóng\s*góp",
    re.IGNORECASE,
)


def task_needs_manuscript(task: str) -> bool:
    return task in _MANUSCRIPT_TASKS


def chat_query_needs_manuscript_context(query: str) -> bool:
    if not query.strip() or is_casual_chat(query):
        return False
    return bool(_MANUSCRIPT_CHAT_RE.search(query))


def format_conversation_history_for_router(history: list) -> str:
    """Compact recent turns for intent-router context."""
    return format_conversation_history_block(history, max_turns=6)


def format_conversation_history_block(history: list, *, max_turns: int = 4) -> str:
    lines: list[str] = []
    for turn in history[-max_turns:]:
        role = turn.role if hasattr(turn, "role") else turn.get("role")
        content = (turn.content if hasattr(turn, "content") else turn.get("content", "")).strip()
        if not content:
            continue
        label = "User" if role == "user" else "Assistant"
        lines.append(f"{label}: {content[:800]}")
    if not lines:
        return ""
    return "Recent conversation:\n" + "\n".join(lines) + "\n\n"


def prepend_conversation_history(user_content: str, history: list, *, max_turns: int = 4) -> str:
    block = format_conversation_history_block(history, max_turns=max_turns)
    return f"{block}{user_content}" if block else user_content


def build_chat_llm_messages(
    *,
    system: str,
    history: list,
    user_content: str,
) -> list:
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

    messages: list = [SystemMessage(content=system)]
    for turn in history[-6:]:
        role = turn.role if hasattr(turn, "role") else turn.get("role")
        content = (turn.content if hasattr(turn, "content") else turn.get("content", "")).strip()
        if not content:
            continue
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
    messages.append(HumanMessage(content=user_content))
    return messages


def build_chat_manuscript_excerpt(
    query: str,
    latex: str,
    sections: list[dict],
    *,
    max_chars: int = 4000,
) -> str:
    """Return a small excerpt for chat Q&A — section match, else abstract + outline."""
    if not latex.strip():
        return ""

    matched = find_section_for_query(query, sections)
    if matched and (matched.get("content") or "").strip():
        header = f"Section: {matched.get('name', '')}\n"
        body = str(matched["content"]).strip()
        return (header + body)[:max_chars]

    parts: list[str] = []
    if sections:
        names = ", ".join(s["name"] for s in sections[:12])
        parts.append(f"Outline: {names}")

    for sec in sections:
        name = str(sec.get("name", "")).lower()
        if "abstract" in name or "tóm tắt" in name:
            content = (sec.get("content") or "").strip()
            if content:
                parts.append(f"Abstract:\n{content[:2000]}")
            break

    if not parts:
        doc_start = latex.find(r"\begin{document}")
        excerpt = latex[doc_start : doc_start + max_chars] if doc_start != -1 else latex[:max_chars]
        return excerpt.strip()

    combined = "\n\n".join(parts)
    return combined[:max_chars]


def build_chat_user_content(
    query: str,
    *,
    selection: str = "",
    latex: str = "",
    sections: list[dict] | None = None,
    include_manuscript: bool = False,
) -> str:
    """Build the user message for chat mode.

    Casual chat should not receive the full manuscript excerpt — only an optional
    editor selection when the user highlighted text, or a targeted excerpt when
    the question is about manuscript content.
    """
    parts: list[str] = []
    if selection.strip():
        parts.append(f"Selected text:\n{selection[:4000]}")
    elif include_manuscript and latex.strip():
        excerpt = build_chat_manuscript_excerpt(query, latex, sections or [])
        if excerpt:
            parts.append(f"Manuscript excerpt:\n{excerpt}")

    wrapped_query = wrap_untrusted_user_text(query)
    context_block = "\n\n".join(parts)
    rendered = render_user_prompt("chat", context_block=context_block, query=wrapped_query)
    if rendered:
        return rendered
    if context_block:
        return f"{context_block}\n\nUser request:\n{wrapped_query}"
    return wrapped_query
