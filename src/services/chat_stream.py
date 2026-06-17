from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any, TypeVar

from langchain_core.messages import AIMessageChunk, HumanMessage, SystemMessage

from src.agents.nodes.academic_nodes import (
    citation_node,
    edit_node,
    prepare_edit_target,
    prepare_style_target,
    structure_node,
    style_node,
)
from src.agents.state import AgentState
from src.config import get_settings
from src.models.schemas import ChatRequest
from src.services.chat_telemetry import ChatRunTracker
from src.services.intent_router import classify_intent
from src.services.llm import get_llm
from src.services.llm_errors import friendly_llm_error
from src.services.parser.latex import (
    extract_cite_keys,
    parse_latex_sections,
)
from src.services.prompts import build_system_prompt, render_user_prompt
from src.services.sessions import session_store
from src.services.template_latex import generate_template

AGENT_NAME = "Ario"
EDIT_DONE_MSG = "Đã cập nhật main.tex — xem diff và Accept/Reject."
STYLE_DONE_MSG = "Đã biên tập — xem diff và Accept/Reject."

_TASK_LABELS: dict[str, str] = {
    "style": "Biên tập văn phong",
    "edit": "Chỉnh sửa LaTeX",
    "structure": "Phân tích cấu trúc",
    "citation": "Kiểm tra trích dẫn",
    "template": "Dựng khung IMRAD",
    "chat": "Trả lời câu hỏi",
}

T = TypeVar("T")


_KEEPALIVE_SSE = ": keepalive\n\n"


async def flush_sse_stream(source: AsyncIterator[str]) -> AsyncIterator[str]:
    """Yield each SSE chunk immediately (avoid proxy / ASGI buffering)."""
    async for chunk in source:
        yield chunk
        await asyncio.sleep(0)


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _state_payload(
    step_id: str,
    label: str,
    *,
    status: str = "active",
    detail: str = "",
    task: str = "",
    section: str = "",
    elapsed_sec: float | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "step_id": step_id,
        "status": status,
        "label": label,
        "detail": detail,
    }
    if task:
        payload["task"] = task
    if section:
        payload["section"] = section
    if elapsed_sec is not None:
        payload["elapsed_sec"] = elapsed_sec
    return payload


def _emit_state(
    step_id: str,
    label: str,
    *,
    status: str = "active",
    detail: str = "",
    task: str = "",
    section: str = "",
    elapsed_sec: float | None = None,
) -> tuple[str, str]:
    payload = _state_payload(
        step_id,
        label,
        status=status,
        detail=detail,
        task=task,
        section=section,
        elapsed_sec=elapsed_sec,
    )
    activity = label if not detail else f"{label} — {detail}"
    return _sse("state", payload), _sse("activity", {"text": activity})


def _task_label(task: str) -> str:
    return _TASK_LABELS.get(task, task)


def _scope_detail(prepared: dict[str, Any]) -> tuple[str, str]:
    """Return (section_name, human detail) for the editing scope."""
    section = str(prepared.get("section") or "").strip()
    text = str(prepared.get("original_text") or "")
    word_count = len(text.split())
    apply_mode = prepared.get("apply_mode", "document")
    if section:
        return section, f"Phần {section} · ~{word_count:,} từ".replace(",", ".")
    if apply_mode == "document":
        return "", f"Toàn bộ main.tex · ~{word_count:,} từ".replace(",", ".")
    return "", f"Đoạn đã chọn · ~{word_count:,} từ".replace(",", ".")


async def _monitor_long_task(
    coro: Awaitable[T],
    on_tick: Callable[[float], tuple[str, str]],
    *,
    interval: float = 2.0,
) -> AsyncIterator[str | T]:
    """Yield SSE strings on heartbeat; final yield is the coroutine result."""
    task = asyncio.create_task(coro)
    started = time.perf_counter()
    while True:
        try:
            result = await asyncio.wait_for(asyncio.shield(task), timeout=interval)
            yield result
            return
        except TimeoutError:
            elapsed = round(time.perf_counter() - started, 1)
            state_evt, act_evt = on_tick(elapsed)
            yield state_evt
            yield act_evt
            yield _KEEPALIVE_SSE


def _chunk_text(text: str, size: int = 1) -> list[str]:
    return [text[i : i + size] for i in range(0, len(text), size)]


def _merge_agent_into_done(done_payload: dict[str, Any], result: dict[str, Any]) -> None:
    for key in (
        "analysis",
        "suggestion",
        "original_text",
        "diff",
        "integrity_flags",
        "citation_results",
        "structure_suggestions",
    ):
        if key in result:
            done_payload[key] = result[key]
    if result.get("apply_mode"):
        done_payload["apply_mode"] = result["apply_mode"]
    revision_id = (result.get("metadata") or {}).get("revision_id")
    if revision_id:
        done_payload["revision_id"] = revision_id


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
    sections: list[dict],
    cite_keys: list[str],
    selection: str,
) -> str:
    if task == "template":
        return "Dựng khung IMRAD trong main.tex"
    if task == "edit":
        return "Sửa trực tiếp main.tex"
    if task == "structure" and sections:
        names = ", ".join(s["name"] for s in sections[:4])
        suffix = f" (+{len(sections) - 4} nữa)" if len(sections) > 4 else ""
        return f"Phân tích cấu trúc — {len(sections)} phần: {names}{suffix}"
    if task == "style":
        if selection.strip():
            return f"Biên tập đoạn đã chọn ({len(selection.split())} từ)"
        return "Biên tập main.tex"
    if task == "citation":
        n = len(cite_keys)
        return f"Tra cứu {n} trích dẫn" if n else "Quét trích dẫn trong bản thảo"
    return "Trả lời câu hỏi"


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


async def _stream_chat_tokens(llm, messages: list) -> AsyncIterator[tuple[str, str]]:
    """Yield ('reasoning'|'token', delta) for chat streams (Z.AI thinking mode)."""
    async for chunk in llm.astream(messages):
        if not isinstance(chunk, AIMessageChunk):
            continue

        reasoning = chunk.additional_kwargs.get("reasoning_content")
        if isinstance(reasoning, str) and reasoning:
            yield "reasoning", reasoning

        content = chunk.content
        if isinstance(content, str) and content:
            yield "token", content
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, str) and part:
                    yield "token", part
                elif isinstance(part, dict) and part.get("type") == "text":
                    text = part.get("text", "")
                    if text:
                        yield "token", text


def _build_chat_context(query: str, selection: str, latex: str) -> str:
    parts: list[str] = []
    if selection:
        parts.append(f"Selected text:\n{selection[:4000]}")
    elif latex:
        parts.append(f"Manuscript excerpt:\n{latex[:4000]}")
    context_block = "\n\n".join(parts)
    rendered = render_user_prompt("chat", context_block=context_block, query=query)
    if rendered:
        return rendered
    if context_block:
        return f"{context_block}\n\nUser request: {query}"
    return query


async def stream_chat(request: ChatRequest) -> AsyncIterator[str]:
    settings = get_settings()
    provider = request.llm_provider or settings.llm_provider
    model = request.llm_model or None
    tracker = ChatRunTracker(
        session_id=request.session_id,
        provider=provider,
        model=model,
        message_preview=request.message,
    )

    try:
        await tracker.stage("request_received")

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
        has_latex = bool(latex.strip())
        has_selection = bool((request.selection or "").strip())

        trace = await tracker.stage(
            "manuscript_parsed",
            sections=len(sections),
            citations=len(cite_keys),
            latex_chars=len(latex),
        )
        yield _sse("trace", trace)

        parse_detail = (
            f"{len(sections)} phần · {len(cite_keys)} trích dẫn · "
            f"{len(latex):,} ký tự"
        ).replace(",", ".")
        state_evt, act_evt = _emit_state(
            "parse",
            "Đọc bản thảo",
            status="done",
            detail=parse_detail,
        )
        yield state_evt
        yield act_evt

        state_evt, act_evt = _emit_state(
            "intent",
            "Phân tích yêu cầu",
            status="active",
            detail="Đang xác định tác vụ…",
        )
        yield state_evt
        yield act_evt

        intent = await classify_intent(
            request.message,
            has_latex=has_latex,
            has_selection=has_selection,
            explicit_task=request.task,
            provider=provider,
            model=model,
        )
        task = intent.action
        tracker.task = task

        trace = await tracker.stage("intent_classified", intent=task, scope=intent.scope)
        yield _sse("trace", trace)

        intent_detail = f"{_task_label(task)} · phạm vi {intent.scope}"
        state_evt, act_evt = _emit_state(
            "intent",
            "Đã xác định ý định",
            status="done",
            detail=intent_detail,
            task=task,
        )
        yield state_evt
        yield act_evt

        yield _sse("activity", {"text": _activity_for_task(task, sections, cite_keys, request.selection)})

        settings = get_settings()
        strictness = request.integrity_strictness or settings.integrity_strictness

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
            "apply_mode": intent.scope,
            "integrity_strictness": strictness,
        }

        get_llm(provider=provider, model=model)

        done_payload: dict[str, Any] = {
            "task": task,
            "response": "",
            "analysis": "",
            "suggestion": "",
            "original_text": "",
            "diff": "",
            "revision_id": "",
            "apply_mode": None,
            "integrity_flags": [],
            "citation_results": [],
            "structure_suggestions": [],
        }

        if task == "chat":
            chat_system = build_system_prompt("chat")
            full_response: list[str] = []
            chat_llm = get_llm(
                provider=provider,
                model=model,
                thinking=True if provider == "zai" else None,
            )
            state_evt, act_evt = _emit_state(
                "llm",
                "Đang trả lời",
                status="active",
                detail="Khởi động LLM…",
                task=task,
            )
            yield state_evt
            yield act_evt
            trace = await tracker.stage("llm_stream_start", task=task)
            yield _sse("trace", trace)
            first_token = True
            async for kind, delta in _stream_chat_tokens(
                chat_llm,
                [
                    SystemMessage(content=chat_system),
                    HumanMessage(content=_build_chat_context(request.message, request.selection, latex)),
                ],
            ):
                if first_token and kind == "token":
                    trace = await tracker.stage("llm_first_token", task=task)
                    yield _sse("trace", trace)
                    first_token = False
                if kind == "reasoning":
                    yield _sse("reasoning", {"delta": delta})
                else:
                    full_response.append(delta)
                    yield _sse("token", {"delta": delta})
            done_payload["response"] = "".join(full_response).strip()
            state_evt, act_evt = _emit_state(
                "llm",
                "Hoàn tất trả lời",
                status="done",
                task=task,
            )
            yield state_evt
            yield act_evt

        elif task == "template":
            trace = await tracker.stage("agent_start", task=task)
            yield _sse("trace", trace)
            template_result = await generate_template(state)
            _merge_agent_into_done(done_payload, template_result)
            respond = template_result.get("response") or EDIT_DONE_MSG
            yield _sse("token", {"delta": respond})
            done_payload["response"] = respond

        elif task == "edit":
            trace = await tracker.stage("agent_start", task=task)
            yield _sse("trace", trace)
            prepared = prepare_edit_target(state, request.message)
            section, scope_detail = _scope_detail(prepared)
            state_evt, act_evt = _emit_state(
                "scope",
                "Xác định phạm vi chỉnh sửa",
                status="done",
                detail=scope_detail,
                task=task,
                section=section,
            )
            yield state_evt
            yield act_evt

            def _edit_tick(elapsed: float) -> tuple[str, str]:
                return _emit_state(
                    "llm",
                    "Đang chỉnh sửa LaTeX",
                    status="active",
                    detail=f"LLM đang xử lý · {elapsed:.0f}s",
                    task=task,
                    section=section,
                    elapsed_sec=elapsed,
                )

            edit_result = None
            async for event in _monitor_long_task(
                edit_node({**prepared, "task": "edit"}),
                _edit_tick,
            ):
                if isinstance(event, str):
                    yield event
                else:
                    edit_result = event

            edit_result = edit_result or {}
            state_evt, act_evt = _emit_state(
                "llm",
                "Hoàn tất chỉnh sửa",
                status="done",
                task=task,
                section=section,
            )
            yield state_evt
            yield act_evt
            _merge_agent_into_done(done_payload, edit_result)
            if edit_result.get("suggestion"):
                respond = EDIT_DONE_MSG
            else:
                respond = edit_result.get("error") or edit_result.get("response") or "Không có thay đổi."
            yield _sse("token", {"delta": respond})
            done_payload["response"] = respond

        elif task == "style":
            trace = await tracker.stage("agent_start", task=task)
            yield _sse("trace", trace)
            prepared = prepare_style_target(state, request.message)
            section, scope_detail = _scope_detail(prepared)
            state_evt, act_evt = _emit_state(
                "scope",
                "Xác định phạm vi biên tập",
                status="done",
                detail=scope_detail,
                task=task,
                section=section,
            )
            yield state_evt
            yield act_evt

            def _style_tick(elapsed: float) -> tuple[str, str]:
                label = "Đang biên tập văn phong"
                if section:
                    label = f"Đang biên tập {section}"
                return _emit_state(
                    "llm",
                    label,
                    status="active",
                    detail=f"LLM đang xử lý · {elapsed:.0f}s",
                    task=task,
                    section=section,
                    elapsed_sec=elapsed,
                )

            state_evt, act_evt = _emit_state(
                "llm",
                f"Đang biên tập {section}" if section else "Đang biên tập văn phong",
                status="active",
                detail="Khởi động LLM…",
                task=task,
                section=section,
            )
            yield state_evt
            yield act_evt

            style_result = None
            async for event in _monitor_long_task(
                style_node({**prepared, "task": "style"}),
                _style_tick,
            ):
                if isinstance(event, str):
                    yield event
                else:
                    style_result = event

            style_result = style_result or {}

            flags = style_result.get("integrity_flags") or []
            blocking = [f for f in flags if f.get("severity") == "error"]
            integrity_detail = (
                f"{len(blocking)} vấn đề cần xem lại"
                if blocking
                else "Không phát hiện thay đổi số liệu"
            )
            state_evt, act_evt = _emit_state(
                "integrity",
                "Kiểm tra integrity guard",
                status="done",
                detail=integrity_detail,
                task=task,
                section=section,
            )
            yield state_evt
            yield act_evt

            state_evt, act_evt = _emit_state(
                "llm",
                "Hoàn tất biên tập",
                status="done",
                task=task,
                section=section,
            )
            yield state_evt
            yield act_evt
            _merge_agent_into_done(done_payload, style_result)
            if style_result.get("suggestion"):
                respond = STYLE_DONE_MSG
            else:
                respond = style_result.get("error") or style_result.get("response") or "Không có thay đổi."
            yield _sse("token", {"delta": respond})
            done_payload["response"] = respond

        elif task == "structure":
            trace = await tracker.stage("agent_start", task=task)
            yield _sse("trace", trace)
            names = ", ".join(s["name"] for s in sections[:5])
            if len(sections) > 5:
                names += f" (+{len(sections) - 5})"
            state_evt, act_evt = _emit_state(
                "scope",
                "Quét cấu trúc IMRAD",
                status="active",
                detail=names or "Không có section",
                task=task,
            )
            yield state_evt
            yield act_evt
            structure_result = await structure_node(state)
            state_evt, act_evt = _emit_state(
                "scope",
                "Hoàn tất phân tích cấu trúc",
                status="done",
                detail=f"{len(structure_result.get('structure_suggestions') or [])} gợi ý",
                task=task,
            )
            yield state_evt
            yield act_evt
            _merge_agent_into_done(done_payload, structure_result)
            respond = structure_result.get("response", "")
            for piece in _chunk_text(respond):
                yield _sse("token", {"delta": piece})
            done_payload["response"] = respond

        elif task == "citation":
            trace = await tracker.stage("agent_start", task=task)
            yield _sse("trace", trace)
            keys = cite_keys
            state_evt, act_evt = _emit_state(
                "scope",
                "Quét trích dẫn",
                status="active",
                detail=f"{len(keys)} cite key",
                task=task,
            )
            yield state_evt
            yield act_evt
            for i, key in enumerate(keys[:8], start=1):
                state_evt, act_evt = _emit_state(
                    "llm",
                    f"Tra cứu trích dẫn [{i}/{len(keys)}]",
                    status="active",
                    detail=f"`{key}`",
                    task=task,
                )
                yield state_evt
                yield act_evt
            citation_result = await citation_node(state)
            verified = sum(
                1 for r in (citation_result.get("citation_results") or [])
                if r.get("status") == "verified"
            )
            state_evt, act_evt = _emit_state(
                "scope",
                "Hoàn tất kiểm tra trích dẫn",
                status="done",
                detail=f"{verified}/{len(keys)} xác minh",
                task=task,
            )
            yield state_evt
            yield act_evt
            _merge_agent_into_done(done_payload, citation_result)
            respond = citation_result.get("response", "")
            for piece in _chunk_text(respond):
                yield _sse("token", {"delta": piece})
            done_payload["response"] = respond

        state_evt, act_evt = _emit_state(
            "finalize",
            "Hoàn tất",
            status="done",
            task=task,
        )
        yield state_evt
        yield act_evt

        trace = await tracker.stage("response_ready", has_suggestion=bool(done_payload.get("suggestion")))
        yield _sse("trace", trace)
        done_payload["run_id"] = tracker.run_id
        done_payload["total_ms"] = trace.get("total_ms")
        yield _sse("done", done_payload)
        await tracker.complete(
            success=True,
            has_suggestion=bool(done_payload.get("suggestion")),
            response_chars=len(done_payload.get("response") or ""),
        )

    except ValueError as e:
        message = friendly_llm_error(e)
        await tracker.fail(message)
        yield _sse("error", {"message": message})
    except Exception as e:
        message = friendly_llm_error(e)
        await tracker.fail(message)
        yield _sse("error", {"message": message})
