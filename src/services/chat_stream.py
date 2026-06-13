from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import AIMessageChunk, HumanMessage, SystemMessage

from src.agents.nodes.academic_nodes import (
    CITATION_TASK_RE,
    EDIT_TASK_RE,
    FILE_EDIT_RE,
    STRUCTURE_TASK_RE,
    STYLE_TASK_RE,
    TEMPLATE_TASK_RE,
    citation_node,
    edit_node,
    prepare_style_target,
    structure_node,
    style_node,
)
from src.agents.state import AgentState
from src.config import get_settings
from src.models.schemas import ChatRequest
from src.services.llm import get_llm
from src.services.parser.latex import (
    extract_cite_keys,
    parse_latex_sections,
)
from src.services.prompts import get_prompt
from src.services.sessions import session_store
from src.services.template_latex import generate_template

AGENT_NAME = "Ario"


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _chunk_text(text: str, size: int = 1) -> list[str]:
    return [text[i : i + size] for i in range(0, len(text), size)]


def _detect_task(query: str, explicit: str | None) -> str:
    if explicit and explicit != "chat":
        return explicit
    if TEMPLATE_TASK_RE.search(query):
        return "template"
    if EDIT_TASK_RE.search(query):
        return "edit"
    if STYLE_TASK_RE.search(query):
        return "style"
    if STRUCTURE_TASK_RE.search(query):
        return "structure"
    if CITATION_TASK_RE.search(query):
        return "citation"
    return "chat"


def _parse_manuscript(latex: str, session_id: str) -> tuple[str, list[dict], list[str]]:
    if session_id:
        session = session_store.get_or_create(session_id, latex_content=latex)
        if latex:
            session_store.update(session_id, latex_content=latex)
        latex = session.latex_content or latex
    sections = parse_latex_sections(latex) if latex else []
    cite_keys = extract_cite_keys(latex) if latex else []
    return latex, sections, cite_keys


def _activity_for_task(
    task: str,
    query: str,
    sections: list[dict],
    cite_keys: list[str],
    selection: str,
    latex: str = "",
) -> str:
    if task == "template":
        return "Soạn sườn bài IMRAD (Abstract → Conclusion)"
    if task == "edit":
        return "Chỉnh sửa trực tiếp main.tex — xem diff và Accept/Reject"
    if task == "structure" and sections:
        names = ", ".join(s["name"] for s in sections[:4])
        suffix = f" (+{len(sections) - 4} nữa)" if len(sections) > 4 else ""
        return f"Rà soát cấu trúc {len(sections)} phần: {names}{suffix}"
    if task == "style":
        if selection.strip():
            words = len(selection.split())
            return f"Biên tập văn phong — đoạn đã chọn ({words} từ)"
        if FILE_EDIT_RE.search(query) or latex:
            return "Biên tập toàn bộ main.tex — xem diff và Accept/Reject"
        return "Biên tập văn phong học thuật"
    if task == "citation":
        n = len(cite_keys)
        return f"Tra cứu {n} trích dẫn qua arXiv, CrossRef, Semantic Scholar" if n else "Quét bản thảo tìm trích dẫn"
    if selection.strip():
        preview = query.strip()[:72] + ("…" if len(query) > 72 else "")
        return f"Đọc vùng chọn ({len(selection)} ký tự) — «{preview}»"
    preview = query.strip()[:96] + ("…" if len(query) > 96 else "")
    return f"«{preview}»"


async def _stream_llm_tokens(llm, messages: list) -> AsyncIterator[str]:
    async for chunk in llm.astream(messages):
        if isinstance(chunk, AIMessageChunk):
            content = chunk.content
            if isinstance(content, str) and content:
                yield content
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, str) and part:
                        yield part
                    elif isinstance(part, dict) and part.get("type") == "text":
                        text = part.get("text", "")
                        if text:
                            yield text


def _build_chat_context(query: str, selection: str, latex: str) -> str:
    parts: list[str] = []
    if selection:
        parts.append(f"Selected text:\n{selection[:4000]}")
    elif latex:
        parts.append(f"Manuscript excerpt:\n{latex[:4000]}")
    parts.append(f"User request: {query}")
    return "\n\n".join(parts)


async def stream_chat(request: ChatRequest) -> AsyncIterator[str]:
    settings = get_settings()
    provider = request.llm_provider or settings.llm_provider
    model = request.llm_model or None

    try:
        if request.session_id and request.latex_content:
            session_store.get_or_create(
                request.session_id,
                latex_content=request.latex_content,
            )
            session_store.update(request.session_id, latex_content=request.latex_content)

        latex, sections, cite_keys = _parse_manuscript(
            request.latex_content,
            request.session_id or "",
        )

        yield _sse(
            "activity",
            {
                "text": (
                    f"Đọc bản thảo — {len(sections)} phần, "
                    f"{len(cite_keys)} trích dẫn, {len(latex):,} ký tự"
                ).replace(",", ".")
            },
        )

        task = _detect_task(request.message, request.task)
        yield _sse(
            "activity",
            {"text": _activity_for_task(task, request.message, sections, cite_keys, request.selection, latex)},
        )

        state: AgentState = {
            "query": request.message,
            "task": task,  # type: ignore[arg-type]
            "session_id": request.session_id or "",
            "latex": latex,
            "selection": request.selection,
            "parsed_sections": sections,
            "citation_keys": cite_keys,
            "llm_provider": provider,
            "llm_model": model or "",
        }

        llm = get_llm(provider=provider, model=model)
        model_label = model or getattr(llm, "model_name", provider)

        done_payload: dict[str, Any] = {
            "task": task,
            "response": "",
            "analysis": "",
            "suggestion": "",
            "original_text": "",
            "diff": "",
            "integrity_flags": [],
            "citation_results": [],
            "structure_suggestions": [],
        }

        if task == "chat":
            yield _sse("activity", {"text": f"{AGENT_NAME} · {model_label}"})

            reasoning_prompt = get_prompt("reasoning", "system")
            if reasoning_prompt:
                async for delta in _stream_llm_tokens(
                    llm,
                    [
                        SystemMessage(content=reasoning_prompt),
                        HumanMessage(content=_build_chat_context(request.message, request.selection, latex)),
                    ],
                ):
                    yield _sse("reasoning", {"delta": delta})

            chat_system = get_prompt("chat", "system")
            full_response: list[str] = []
            async for delta in _stream_llm_tokens(
                llm,
                [
                    SystemMessage(content=chat_system),
                    HumanMessage(content=_build_chat_context(request.message, request.selection, latex)),
                ],
            ):
                full_response.append(delta)
                yield _sse("token", {"delta": delta})

            response_text = "".join(full_response).strip()
            done_payload["response"] = response_text
            done_payload["analysis"] = f"{AGENT_NAME} responded."

            if EDIT_TASK_RE.search(request.message):
                yield _sse("activity", {"text": "So sánh bản gốc với bản chỉnh sửa"})
                edit_result = await edit_node({**state, "task": "edit"})
                done_payload.update(edit_result)
                if edit_result.get("suggestion"):
                    done_payload["response"] = (
                        "Ario đã chỉnh sửa main.tex. Xem diff (đỏ = cũ, xanh = mới) và nhấn Accept để áp dụng."
                    )
            elif STYLE_TASK_RE.search(request.message):
                prepared = prepare_style_target(state, request.message)
                if prepared.get("original_text"):
                    yield _sse("activity", {"text": "So sánh bản gốc với bản biên tập"})
                    style_result = await style_node({**prepared, "task": "style"})
                    done_payload.update(style_result)
                    if style_result.get("suggestion"):
                        done_payload["response"] = (
                            "Ario đã biên tập bản thảo. Xem diff (đỏ = cũ, xanh = mới) và nhấn Accept để áp dụng."
                        )

        elif task == "template":
            yield _sse("activity", {"text": f"{AGENT_NAME} · dựng khung IMRAD trong main.tex"})
            template_result = await generate_template(state)
            done_payload.update(template_result)
            respond = template_result.get("response", "")
            for piece in _chunk_text(respond):
                yield _sse("token", {"delta": piece})
            done_payload["response"] = respond

        elif task == "edit":
            yield _sse("activity", {"text": f"{AGENT_NAME} · chỉnh sửa main.tex"})
            edit_result = await edit_node({**state, "task": "edit"})
            done_payload.update(edit_result)
            respond = edit_result.get("response") or ""
            if edit_result.get("suggestion"):
                respond = (
                    "Ario đã chỉnh sửa main.tex. Xem diff (đỏ = cũ, xanh = mới) và nhấn Accept để áp dụng."
                )
            elif edit_result.get("error"):
                respond = edit_result["error"]
            for piece in _chunk_text(respond):
                yield _sse("token", {"delta": piece})
            done_payload["response"] = respond

        elif task == "style":
            yield _sse("activity", {"text": f"{AGENT_NAME} · biên tập văn phong"})
            prepared = prepare_style_target(state, request.message)
            style_result = await style_node({**prepared, "task": "style"})
            done_payload.update(style_result)
            respond = style_result.get("response") or ""
            if style_result.get("suggestion"):
                respond = (
                    "Ario đã biên tập bản thảo. Xem diff (đỏ = cũ, xanh = mới) và nhấn Accept để áp dụng."
                )
            elif style_result.get("error"):
                respond = style_result["error"]
            for piece in _chunk_text(respond):
                yield _sse("token", {"delta": piece})
            done_payload["response"] = respond

        elif task == "structure":
            yield _sse("activity", {"text": f"{AGENT_NAME} · phân tích cấu trúc"})
            structure_result = await structure_node(state)
            done_payload.update(structure_result)
            respond = structure_result.get("response", "")
            for piece in _chunk_text(respond):
                yield _sse("token", {"delta": piece})
            done_payload["response"] = respond

        elif task == "citation":
            keys = cite_keys
            for i, key in enumerate(keys[:8], start=1):
                yield _sse("activity", {"text": f"Tra cứu [{i}/{len(keys)}] `{key}`"})
            if len(keys) > 8:
                yield _sse("activity", {"text": f"Tiếp tục {len(keys) - 8} trích dẫn còn lại"})
            citation_result = await citation_node(state)
            done_payload.update(citation_result)
            respond = citation_result.get("response", "")
            for piece in _chunk_text(respond):
                yield _sse("token", {"delta": piece})
            done_payload["response"] = respond

        yield _sse("done", done_payload)

    except ValueError as e:
        yield _sse("error", {"message": str(e)})
    except Exception as e:
        yield _sse("error", {"message": str(e)})
