from __future__ import annotations

import json
import re
import uuid

from langchain_core.messages import HumanMessage, SystemMessage

from src.agents.state import AgentState
from src.config import get_settings
from src.services.citations.verifier import verify_citations
from src.services.direct_edit import try_direct_text_edit
from src.services.guardrails.integrity import (
    build_diff,
    check_integrity,
    has_blocking_flags,
)
from src.services.guardrails.output_sanitize import (
    clamp_selection_replacement,
    looks_like_chatty_output,
    sanitize_style_output,
)
from src.services.llm import get_llm, resolve_heavy_edit_model
from src.services.llm_policy import resolve_llm_temperature
from src.services.parser.latex import (
    analyze_structure,
    extract_bib_content,
    extract_cite_keys,
    find_section_for_query,
    parse_bib_entries,
    parse_latex_sections,
)
from src.services.chat_context import build_chat_user_content
from src.services.prompts import (
    build_system_prompt,
    format_sections_summary,
    render_user_prompt,
)
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


def _integrity_opts(state: AgentState) -> dict:
    settings = get_settings()
    strictness = state.get("integrity_strictness") or settings.integrity_strictness
    scope = state.get("apply_mode")
    if scope not in ("document", "selection"):
        scope = None
    return {
        "strictness": strictness,
        "scope": scope,
        "semantic_threshold": settings.semantic_similarity_threshold,
    }


def prepare_style_target(state: AgentState, query: str = "") -> dict:
    """Pick text to edit and apply_mode (selection vs full document)."""
    selection = (state.get("selection") or "").strip()
    latex = (state.get("latex") or "").strip()
    query = query or state.get("query", "")
    scope = state.get("apply_mode") or "document"
    sections = state.get("parsed_sections") or []

    if selection:
        return {
            **state,
            "original_text": selection,
            "apply_mode": "selection",
        }

    matched = find_section_for_query(query, sections)
    if matched and (matched.get("content") or "").strip():
        return {
            **state,
            "original_text": matched["content"].strip(),
            "apply_mode": "selection",
            "section": matched.get("name", ""),
        }

    use_full_document = scope == "document" or _FILE_SCOPE_RE.search(query) or (not selection and bool(latex))

    if latex and use_full_document:
        return {
            **state,
            "original_text": latex,
            "apply_mode": "document",
        }

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


def _normalize_suggestion(
    original: str,
    suggestion: str,
    *,
    section: str = "",
    apply_mode: str = "selection",
) -> str:
    """Strip LLM commentary and coerce output to the requested scope."""
    return sanitize_style_output(
        original,
        _strip_code_fences(suggestion),
        section=section,
        apply_mode=apply_mode,
    )


def prepare_edit_target(state: AgentState, query: str = "") -> dict:
    """Target for explicit edits — prefer editor selection, then section, then document."""
    selection = (state.get("selection") or "").strip()
    if selection:
        return {
            **state,
            "original_text": selection,
            "apply_mode": "selection",
        }

    query = query or state.get("query", "")
    latex = (state.get("latex") or "").strip()
    sections = state.get("parsed_sections") or []

    if _FILE_SCOPE_RE.search(query):
        if latex:
            return {**state, "original_text": latex, "apply_mode": "document"}
        return prepare_style_target(state, query)

    matched = find_section_for_query(query, sections)
    if matched and (matched.get("content") or "").strip():
        return {
            **state,
            "original_text": matched["content"].strip(),
            "apply_mode": "selection",
            "section": matched.get("name", ""),
        }

    if latex:
        return {**state, "original_text": latex, "apply_mode": "document"}
    return prepare_style_target(state, query)


async def edit_node(state: AgentState) -> dict:
    query = state.get("query", "").strip()
    prepared = prepare_edit_target(state, query)
    original = (prepared.get("original_text") or "").strip()
    if not original:
        return {"error": "No LaTeX source available to edit."}
    if not query:
        return {"error": "No edit instruction provided."}

    direct = try_direct_text_edit(query, original)
    if direct is not None and direct != original:
        suggestion = direct
        flags = check_integrity(
            original,
            suggestion,
            **_integrity_opts(prepared),
        )
        diff = build_diff(original, suggestion)
        metadata: dict = {}
        session_id = prepared.get("session_id", "")
        if session_id and not has_blocking_flags(flags):
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
                "suggestion": suggestion,
                "diff": diff,
                "integrity_flags": flags,
                "edits": [
                    {
                        "id": str(uuid.uuid4()),
                        "file": "main.tex",
                        "section": prepared.get("section", ""),
                        "apply_mode": prepared.get("apply_mode", "document"),
                        "original_text": original,
                        "replacement_text": suggestion,
                        "description": "Proposed edit (review required)",
                    }
                ],
                "response": "Có cảnh báo integrity nghiêm trọng — xem diff và quyết định Accept/Reject.",
                "apply_mode": prepared.get("apply_mode", "document"),
                "metadata": metadata,
            }
        return {
            "original_text": original,
            "suggestion": suggestion,
            "diff": diff,
            "integrity_flags": flags,
            "edits": [
                {
                    "id": str(uuid.uuid4()),
                    "file": "main.tex",
                    "section": prepared.get("section", ""),
                    "apply_mode": prepared.get("apply_mode", "document"),
                    "original_text": original,
                    "replacement_text": suggestion,
                    "description": "Proposed edit",
                }
            ],
            "analysis": "Direct text replace (no LLM).",
            "apply_mode": prepared.get("apply_mode", "document"),
            "metadata": metadata,
        }

    system = build_system_prompt("edit")
    edit_model = resolve_heavy_edit_model(
        _model(prepared),
        text_chars=len(original),
        apply_mode=str(prepared.get("apply_mode", "document")),
    )
    llm = get_llm(provider=_provider(prepared), model=edit_model, temperature=resolve_llm_temperature(0.1))

    user_content = render_user_prompt(
        "edit",
        query=query,
        original_text=original,
    ) or (
        f"Edit request: {query}\n\n"
        f"Replace ONLY this LaTeX snippet (return the revised snippet only):\n---\n{original}\n---"
    )

    messages = [
        SystemMessage(content=system),
        HumanMessage(content=user_content),
    ]
    response = await llm.ainvoke(messages)
    suggestion = _normalize_suggestion(
        original,
        (response.content or "").strip(),
        section=str(prepared.get("section", "")),
        apply_mode=str(prepared.get("apply_mode", "document")),
    )
    suggestion = clamp_selection_replacement(
        original,
        suggestion,
        apply_mode=str(prepared.get("apply_mode", "selection")),
        query=query,
    )

    flags = check_integrity(
        original,
        suggestion,
        **_integrity_opts(prepared),
    )
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
            "suggestion": suggestion,
            "diff": diff,
            "integrity_flags": flags,
            "edits": [
                {
                    "id": str(uuid.uuid4()),
                    "file": "main.tex",
                    "section": prepared.get("section", ""),
                    "apply_mode": prepared.get("apply_mode", "document"),
                    "original_text": original,
                    "replacement_text": suggestion,
                    "description": "Proposed edit (review required)",
                }
            ],
            "response": "Có cảnh báo integrity nghiêm trọng — xem diff và quyết định Accept/Reject.",
            "apply_mode": prepared.get("apply_mode", "document"),
            "metadata": metadata,
        }

    if not suggestion or suggestion == original:
        return {
            "original_text": original,
            "suggestion": "",
            "diff": "",
            "integrity_flags": flags,
            "edits": [],
            "response": "Không phát hiện thay đổi nào trong bản thảo.",
            "analysis": "No edit applied.",
            "metadata": metadata,
        }

    return {
        "original_text": original,
        "suggestion": suggestion,
        "diff": diff,
        "integrity_flags": flags,
        "edits": [
            {
                "id": str(uuid.uuid4()),
                "file": "main.tex",
                "section": prepared.get("section", ""),
                "apply_mode": prepared.get("apply_mode", "document"),
                "original_text": original,
                "replacement_text": suggestion,
                "description": "Proposed edit",
            }
        ],
        "analysis": "LaTeX edit completed.",
        "apply_mode": prepared.get("apply_mode", "document"),
        "metadata": metadata,
    }


async def style_node(state: AgentState) -> dict:
    query = (state.get("query") or "").strip()
    prepared = prepare_style_target(state, query)
    original = (prepared.get("original_text") or "").strip()
    apply_mode = prepared.get("apply_mode", "selection")
    if not original:
        return {"error": "No text selected or provided for style editing."}

    settings = get_settings()
    section_label = prepared.get("section", "")
    system = build_system_prompt("style")
    style_model = resolve_heavy_edit_model(
        _model(prepared),
        text_chars=len(original),
        apply_mode=str(apply_mode),
    )
    llm = get_llm(provider=_provider(prepared), model=style_model, temperature=resolve_llm_temperature(0.2))

    suggestion = ""
    flags: list[dict] = []
    max_retries = settings.max_style_retries

    section_hint = f"Section: {section_label}\n" if section_label else ""
    scope_note = (
        "OUTPUT: Return ONLY the revised section text — no markdown, no headings, "
        "no bullet lists, no explanations. Plain paste-ready text only.\n\n"
    )
    user_content = render_user_prompt(
        "style",
        query=query or "Revise for clearer academic tone.",
        section_hint=section_hint,
        original_text=original,
    )
    if not user_content:
        user_content = (
            f"User request:\n{query or 'Revise for clearer academic tone.'}\n\n"
            f"{scope_note}{section_hint}Text to revise:\n\n{original}"
        )
    elif scope_note not in user_content:
        user_content = f"{scope_note}{user_content}"

    for attempt in range(max_retries + 1):
        extra = ""
        if attempt > 0 and flags:
            if any(f.get("code") == "chatty_output" for f in flags):
                extra = (
                    "\n\nREJECTED: Your output had markdown or commentary. "
                    "Return ONLY the revised paragraph — no # headers, no > quotes, "
                    "no bullet lists, no Vietnamese explanations."
                )
            else:
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
        suggestion = _normalize_suggestion(
            original,
            (response.content or "").strip(),
            section=str(section_label),
            apply_mode=str(apply_mode),
        )
        suggestion = clamp_selection_replacement(
            original,
            suggestion,
            apply_mode=str(apply_mode),
            query=query,
        )
        if looks_like_chatty_output(suggestion) and attempt < max_retries:
            flags = [{"code": "chatty_output", "message": "retry", "severity": "warning"}]
            continue
        flags = check_integrity(
            original,
            suggestion,
            **_integrity_opts(prepared),
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
            "suggestion": suggestion,
            "diff": diff,
            "integrity_flags": flags,
            "edits": [
                {
                    "id": str(uuid.uuid4()),
                    "file": "main.tex",
                    "section": prepared.get("section", ""),
                    "apply_mode": apply_mode,
                    "original_text": original,
                    "replacement_text": suggestion,
                    "description": "Proposed style edit (review required)",
                }
            ],
            "response": "Có cảnh báo integrity nghiêm trọng — xem diff và quyết định Accept/Reject.",
            "metadata": metadata,
        }

    return {
        "original_text": original,
        "suggestion": suggestion,
        "diff": diff,
        "integrity_flags": flags,
        "edits": [
            {
                "id": str(uuid.uuid4()),
                "file": "main.tex",
                "section": prepared.get("section", ""),
                "apply_mode": apply_mode,
                "original_text": original,
                "replacement_text": suggestion,
                "description": "Proposed style edit",
            }
        ],
        "analysis": "Style enhancement completed.",
        "apply_mode": apply_mode,
        "metadata": metadata,
    }


async def integrity_node(state: AgentState) -> dict:
    original = state.get("original_text", "")
    suggestion = state.get("suggestion", "")
    if not suggestion:
        return {}

    flags = check_integrity(
        original,
        suggestion,
        **_integrity_opts(state),
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
        session_store.set_citation_registry(session_id, results)

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
        system = build_system_prompt("structure")
        llm = get_llm(provider=_provider(state), model=_model(state), temperature=resolve_llm_temperature(0.2))
        section_summary = format_sections_summary(sections)
        user_content = render_user_prompt(
            "structure",
            sections_summary=section_summary,
            query=state.get("query", ""),
        ) or f"Manuscript sections:\n{section_summary}"
        try:
            response = await llm.ainvoke(
                [
                    SystemMessage(content=system),
                    HumanMessage(content=user_content),
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


async def logic_node(state: AgentState) -> dict:
    from src.services.logic_audit.runner import run_logic_audit

    sections = state.get("parsed_sections") or []
    latex = state.get("latex") or ""
    if not sections and latex:
        sections = parse_latex_sections(latex)

    result = await run_logic_audit(
        latex=latex,
        sections=sections,
        query=state.get("query", ""),
        provider=state.get("llm_provider"),
        model=state.get("llm_model"),
    )
    session_id = state.get("session_id", "")
    report = result.get("logic_audit_report")
    if session_id and isinstance(report, dict) and report:
        session_store.set_logic_audit_report(session_id, report)
    return result


async def chat_node(state: AgentState) -> dict:
    query = state.get("query", "")
    selection = state.get("selection", "")
    latex = state.get("latex", "")
    system = build_system_prompt("chat")

    user_content = build_chat_user_content(
        query,
        selection=selection,
        latex=latex,
        include_manuscript=False,
    )

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
