from __future__ import annotations

import json
import re

from langchain_core.messages import HumanMessage, SystemMessage

from src.agents.state import AgentState
from src.config import get_settings
from src.services.citations.verifier import verify_citations
from src.services.guardrails.integrity import build_diff, check_integrity, has_blocking_flags
from src.services.llm import get_llm
from src.services.parser.latex import (
    analyze_structure,
    extract_bib_content,
    extract_cite_keys,
    parse_bib_entries,
    parse_latex_sections,
)
from src.services.prompts import get_prompt
from src.services.sessions import session_store

STYLE_TASK_RE = re.compile(
    r"(cải thiện|improve|style|grammar|văn phong|ngữ pháp|rewrite|chỉnh sửa|polish)",
    re.IGNORECASE,
)
STRUCTURE_TASK_RE = re.compile(
    r"(cấu trúc|structure|section|outline|bố cục|imrad)",
    re.IGNORECASE,
)
CITATION_TASK_RE = re.compile(
    r"(citation|trích dẫn|reference|bibliography|verify)",
    re.IGNORECASE,
)
TEMPLATE_TASK_RE = re.compile(
    r"(sườn|khung bài|khung\s|template|skeleton|bài mẫu|mẫu bài|soạn sườn|tạo sườn|làm sườn|framework|imrad template|outline bài)",
    re.IGNORECASE,
)


def _provider(state: AgentState):
    return state.get("llm_provider") or None


def _model(state: AgentState):
    return state.get("llm_model") or None


async def route_node(state: AgentState) -> dict:
    task = state.get("task", "chat")
    query = state.get("query", "")

    if not task or task == "chat":
        if TEMPLATE_TASK_RE.search(query):
            task = "template"
        elif STYLE_TASK_RE.search(query):
            task = "style"
        elif STRUCTURE_TASK_RE.search(query):
            task = "structure"
        elif CITATION_TASK_RE.search(query):
            task = "citation"

    return {"task": task}


async def parse_node(state: AgentState) -> dict:
    latex = state.get("latex", "")
    session_id = state.get("session_id", "")

    if session_id:
        session = session_store.get_or_create(session_id, latex_content=latex)
        if latex:
            session_store.update(session_id, latex_content=latex)
        latex = session.latex_content or latex

    sections = parse_latex_sections(latex) if latex else []
    cite_keys = extract_cite_keys(latex) if latex else []
    bib = extract_bib_content(latex, state.get("bib_content", ""))

    selection = state.get("selection", "").strip()
    original_text = selection or state.get("original_text", "")

    if state.get("task") == "style" and not original_text and sections:
        for sec in sections:
            if sec.get("content"):
                original_text = sec["content"][:2000]
                break

    return {
        "latex": latex,
        "parsed_sections": sections,
        "citation_keys": cite_keys,
        "bib_content": bib,
        "original_text": original_text,
    }


async def style_node(state: AgentState) -> dict:
    original = state.get("original_text", "").strip()
    if not original:
        return {"error": "No text selected or provided for style editing."}

    settings = get_settings()
    system = get_prompt("style", "system")
    llm = get_llm(provider=_provider(state), model=_model(state), temperature=0.2)

    suggestion = ""
    flags: list[dict] = []
    max_retries = settings.max_style_retries

    for attempt in range(max_retries + 1):
        extra = ""
        if attempt > 0 and flags:
            extra = (
                "\n\nPrevious attempt failed integrity checks: "
                + "; ".join(f["message"] for f in flags)
                + ". Try again with minimal changes."
            )
        messages = [
            SystemMessage(content=system + extra),
            HumanMessage(content=f"Revise this academic text:\n\n{original}"),
        ]
        response = await llm.ainvoke(messages)
        suggestion = (response.content or "").strip()
        flags = check_integrity(
            original,
            suggestion,
            semantic_threshold=settings.semantic_similarity_threshold,
        )
        if not has_blocking_flags(flags):
            break

    diff = build_diff(original, suggestion) if suggestion else ""
    metadata: dict = {}

    session_id = state.get("session_id", "")
    if session_id and suggestion and not has_blocking_flags(flags):
        record = session_store.add_revision(
            session_id,
            state.get("section", ""),
            original,
            suggestion,
        )
        if record:
            metadata["revision_id"] = record.id

    if has_blocking_flags(flags):
        return {
            "original_text": original,
            "suggestion": "",
            "diff": "",
            "integrity_flags": flags,
            "response": "Không thể đưa ra gợi ý an toàn — phát hiện thay đổi số liệu hoặc nội dung không được phép.",
            "metadata": metadata,
        }

    return {
        "original_text": original,
        "suggestion": suggestion,
        "diff": diff,
        "integrity_flags": flags,
        "analysis": "Style enhancement completed.",
        "apply_mode": "selection",
        "metadata": metadata,
    }


async def integrity_node(state: AgentState) -> dict:
    original = state.get("original_text", "")
    suggestion = state.get("suggestion", "")
    if not suggestion:
        return {}

    settings = get_settings()
    flags = check_integrity(
        original,
        suggestion,
        semantic_threshold=settings.semantic_similarity_threshold,
    )
    existing = state.get("integrity_flags", [])
    merged = existing + [f for f in flags if f not in existing]
    return {"integrity_flags": merged}


async def citation_node(state: AgentState) -> dict:
    latex = state.get("latex", "")
    bib = extract_bib_content(latex, state.get("bib_content", ""))
    cite_keys = extract_cite_keys(latex)
    bib_entries = parse_bib_entries(bib)

    entries = []
    for key in cite_keys:
        entries.append(
            bib_entries.get(
                key,
                {"key": key, "title": "", "doi": "", "eprint": "", "raw": ""},
            )
        )

    if not entries:
        return {
            "citation_results": [],
            "response": "Không tìm thấy trích dẫn trong bản thảo.",
        }

    settings = get_settings()
    results = await verify_citations(
        entries,
        semantic_scholar_api_key=settings.semantic_scholar_api_key,
    )
    verified = sum(1 for r in results if r.get("status") == "verified")
    summary = f"Đã xác minh {verified}/{len(results)} trích dẫn."

    session_id = state.get("session_id", "")
    if session_id:
        session = session_store.get(session_id)
        if session:
            session.citation_registry = results

    return {
        "citation_results": results,
        "response": summary,
        "analysis": summary,
    }


async def structure_node(state: AgentState) -> dict:
    sections = state.get("parsed_sections") or []
    if not sections and state.get("latex"):
        sections = parse_latex_sections(state["latex"])

    rule_suggestions = analyze_structure(sections)
    llm_suggestions: list[dict] = []

    if sections:
        system = get_prompt("structure", "system")
        llm = get_llm(provider=_provider(state), model=_model(state), temperature=0.2)
        section_summary = json.dumps(
            [{"name": s["name"], "length": len(s.get("content", ""))} for s in sections],
            ensure_ascii=False,
        )
        try:
            response = await llm.ainvoke(
                [
                    SystemMessage(content=system),
                    HumanMessage(content=f"Manuscript sections:\n{section_summary}"),
                ]
            )
            content = (response.content or "").strip()
            if content.startswith("["):
                llm_suggestions = json.loads(content)
        except (json.JSONDecodeError, Exception):
            pass

    all_suggestions = rule_suggestions + llm_suggestions
    lines = [
        f"- [{s.get('severity', 'info').upper()}] {s.get('section', '')}: {s.get('message', '')}"
        for s in all_suggestions
    ]
    response_text = (
        "Gợi ý cấu trúc:\n" + "\n".join(lines)
        if lines
        else "Cấu trúc bài báo trông ổn — không có gợi ý bổ sung."
    )

    return {
        "structure_suggestions": all_suggestions,
        "response": response_text,
        "analysis": f"Found {len(all_suggestions)} structure suggestions.",
    }


async def chat_node(state: AgentState) -> dict:
    query = state.get("query", "")
    selection = state.get("selection", "")
    latex = state.get("latex", "")
    system = get_prompt("chat", "system")

    context_parts = []
    if selection:
        context_parts.append(f"Selected text:\n{selection[:4000]}")
    elif latex:
        context_parts.append(f"Manuscript excerpt:\n{latex[:4000]}")

    user_content = query
    if context_parts:
        user_content = "\n\n".join(context_parts) + f"\n\nUser request: {query}"

    llm = get_llm(provider=_provider(state), model=_model(state))
    response = await llm.ainvoke(
        [
            SystemMessage(content=system),
            HumanMessage(content=user_content),
        ]
    )
    text = (response.content or "").strip()

    result: dict = {
        "response": text,
        "analysis": "Chat response generated.",
    }

    if STYLE_TASK_RE.search(query) and selection:
        style_result = await style_node({**state, "original_text": selection, "task": "style"})
        result.update(style_result)
        if style_result.get("suggestion"):
            result["response"] = (
                f"{text}\n\n---\nGợi ý chỉnh sửa:\n{style_result['suggestion']}"
            )

    return result


async def respond_node(state: AgentState) -> dict:
    if state.get("response"):
        return {}

    error = state.get("error")
    if error:
        return {"response": f"Lỗi: {error}"}

    task = state.get("task", "chat")
    if task == "style" and state.get("suggestion"):
        flags = state.get("integrity_flags", [])
        flag_note = ""
        if flags:
            flag_note = "\n\n⚠️ " + "; ".join(f["message"] for f in flags)
        return {
            "response": (
                f"Đề xuất cải thiện văn phong (xem diff bên dưới, Accept/Reject để áp dụng):"
                f"{flag_note}"
            )
        }

    if task == "citation" and state.get("citation_results") is not None:
        return {"response": state.get("response", "Citation check complete.")}

    if task == "structure":
        return {"response": state.get("response", "Structure analysis complete.")}

    return {"response": state.get("analysis", "Done.")}
