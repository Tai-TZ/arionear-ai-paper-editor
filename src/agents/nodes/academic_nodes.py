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

# Kept for prepare_style_target fallback when router scope is missing
_FILE_SCOPE_RE = re.compile(
    r"(toàn\s*bộ|cả\s*bài|main\.tex|whole\s*document|entire\s*(file|document|manuscript))",
    re.IGNORECASE,
)


def _provider(state: AgentState):
    return state.get("llm_provider") or None


def _model(state: AgentState):
    return state.get("llm_model") or None


def prepare_style_target(state: AgentState, query: str = "") -> dict:
    """Pick text to edit and apply_mode (selection vs full document)."""
    selection = (state.get("selection") or "").strip()
    latex = (state.get("latex") or "").strip()
    query = query or state.get("query", "")
    scope = state.get("apply_mode") or "document"
    use_full_document = scope == "document" or _FILE_SCOPE_RE.search(query) or (not selection and bool(latex))

    if selection and scope == "selection":
        return {
            **state,
            "original_text": selection,
            "apply_mode": "selection",
        }

    if latex and use_full_document:
        return {
            **state,
            "original_text": latex,
            "apply_mode": "document",
        }

    sections = state.get("parsed_sections") or []
    for sec in sections:
        content = (sec.get("content") or "").strip()
        if content:
            return {
                **state,
                "original_text": content[:8000],
                "apply_mode": "selection",
                "section": sec.get("name", ""),
            }

    return state


async def route_node(state: AgentState) -> dict:
    from src.services.intent_router import classify_intent

    task = state.get("task", "chat")
    query = state.get("query", "")

    if task and task != "chat":
        return {"task": task}

    intent = await classify_intent(
        query,
        has_latex=bool((state.get("latex") or "").strip()),
        has_selection=bool((state.get("selection") or "").strip()),
        explicit_task=task if task != "chat" else None,
        provider=_provider(state),
        model=_model(state),
    )
    return {"task": intent.action, "apply_mode": intent.scope}


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

    if state.get("task") in ("style", "edit") and not original_text and sections:
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


def _strip_code_fences(text: str) -> str:
    text = text.strip()
    fence = re.match(r"^```(?:latex|tex)?\s*\n(.*)\n```\s*$", text, re.DOTALL | re.IGNORECASE)
    if fence:
        return fence.group(1).strip()
    return text


def prepare_edit_target(state: AgentState) -> dict:
    """Full-document target for explicit edit requests."""
    latex = (state.get("latex") or "").strip()
    if latex:
        return {**state, "original_text": latex, "apply_mode": "document"}
    return prepare_style_target(state, state.get("query", ""))


async def edit_node(state: AgentState) -> dict:
    prepared = prepare_edit_target(state)
    original = (prepared.get("original_text") or "").strip()
    query = state.get("query", "").strip()
    if not original:
        return {"error": "No LaTeX source available to edit."}
    if not query:
        return {"error": "No edit instruction provided."}

    system = get_prompt("edit", "system")
    llm = get_llm(provider=_provider(prepared), model=_model(prepared), temperature=0.1)

    messages = [
        SystemMessage(content=system),
        HumanMessage(
            content=(
                f"Edit request:\n{query}\n\n"
                f"LaTeX source:\n{original}"
            )
        ),
    ]
    response = await llm.ainvoke(messages)
    suggestion = _strip_code_fences((response.content or "").strip())

    flags = check_integrity(original, suggestion, semantic_threshold=0)
    diff = build_diff(original, suggestion) if suggestion else ""
    metadata: dict = {}

    session_id = prepared.get("session_id", "")
    if session_id and suggestion and not has_blocking_flags(flags):
        record = session_store.add_revision(
            session_id,
            prepared.get("section", ""),
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
            "response": "Không thể áp dụng chỉnh sửa an toàn — phát hiện thay đổi số liệu không được phép.",
            "metadata": metadata,
        }

    if not suggestion or suggestion == original:
        return {
            "original_text": original,
            "suggestion": "",
            "diff": "",
            "integrity_flags": flags,
            "response": "Không phát hiện thay đổi nào trong bản thảo.",
            "analysis": "No edit applied.",
            "metadata": metadata,
        }

    return {
        "original_text": original,
        "suggestion": suggestion,
        "diff": diff,
        "integrity_flags": flags,
        "analysis": "LaTeX edit completed.",
        "apply_mode": "document",
        "metadata": metadata,
    }


async def style_node(state: AgentState) -> dict:
    prepared = prepare_style_target(state)
    original = (prepared.get("original_text") or "").strip()
    apply_mode = prepared.get("apply_mode", "selection")
    if not original:
        return {"error": "No text selected or provided for style editing."}

    settings = get_settings()
    system = get_prompt("style", "system")
    llm = get_llm(provider=_provider(prepared), model=_model(prepared), temperature=0.2)

    suggestion = ""
    flags: list[dict] = []
    max_retries = settings.max_style_retries

    if apply_mode == "document":
        user_content = (
            "Revise this LaTeX manuscript to be more professional and polished. "
            "Preserve all LaTeX commands, environments, labels, and structure:\n\n"
            f"{original}"
        )
    else:
        user_content = f"Revise this academic text:\n\n{original}"

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
            HumanMessage(content=user_content),
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

    session_id = prepared.get("session_id", "")
    if session_id and suggestion and not has_blocking_flags(flags):
        record = session_store.add_revision(
            session_id,
            prepared.get("section", ""),
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
        "apply_mode": apply_mode,
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

    return {
        "response": text,
        "analysis": "Chat response generated.",
    }


async def respond_node(state: AgentState) -> dict:
    if state.get("response"):
        return {}

    error = state.get("error")
    if error:
        return {"response": f"Lỗi: {error}"}

    task = state.get("task", "chat")
    if task in ("style", "edit") and state.get("suggestion"):
        flags = state.get("integrity_flags", [])
        flag_note = ""
        if flags:
            flag_note = "\n\n⚠️ " + "; ".join(f["message"] for f in flags)
        label = "chỉnh sửa" if task == "edit" else "cải thiện văn phong"
        return {
            "response": (
                f"Đề xuất {label} (xem diff bên dưới, Accept/Reject để áp dụng):"
                f"{flag_note}"
            )
        }

    if task == "citation" and state.get("citation_results") is not None:
        return {"response": state.get("response", "Citation check complete.")}

    if task == "structure":
        return {"response": state.get("response", "Structure analysis complete.")}

    return {"response": state.get("analysis", "Done.")}
