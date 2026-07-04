from __future__ import annotations

import asyncio
import contextlib
import json
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any, TypeVar

from langchain_core.messages import AIMessageChunk

from src.agents.nodes.academic_nodes import (
    citation_node,
    edit_node,
    prepare_edit_target,
    prepare_style_target,
    structure_node,
    style_node,
)
from src.agents.state import AgentState
from src.config import get_settings, normalize_llm_provider
from src.models.schemas import ChatRequest
from src.services.agent_latex import resolve_latex_sources
from src.services.chat_context import (
    build_chat_llm_messages,
    build_chat_user_content,
    chat_query_needs_manuscript_context,
    task_needs_manuscript,
)
from src.services.chat_telemetry import ChatRunTracker
from src.services.edit_executor import preview_edit_scope as resolve_preview_edit_scope
from src.services.guardrails.prompt_injection import (
    injection_refusal,
    looks_like_system_prompt_leak,
)
from src.services.guardrails.request_guard import evaluate_user_request
from src.services.intent_router import classify_intent
from src.services.intent_rules import IntentResult
from src.services.llm import REASONING_MODEL_TEMPERATURE, get_llm, is_reasoning_model
from src.services.llm_errors import friendly_llm_error, looks_like_provider_error
from src.services.llm_policy import resolve_llm_temperature
from src.services.parser.latex import (
    extract_cite_keys,
    parse_latex_sections,
)
from src.services.prompts import build_system_prompt
from src.services.quota_policy import QuotaExceededError, enforce_llm_quota_for_paper
from src.services.sessions import session_store
from src.services.slash_commands import parse_slash_command
from src.services.stream_i18n import (
    parse_detail as format_parse_detail,
)
from src.services.stream_i18n import (
    resolve_locale,
    state_label,
    task_label,
)
from src.services.stream_i18n import (
    scope_detail as i18n_scope_detail,
)
from src.services.template_latex import generate_template

AGENT_NAME = "Ario"
EDIT_DONE_MSG = "Đã cập nhật main.tex — xem diff và Accept/Reject."
STYLE_DONE_MSG = "Đã biên tập — xem diff và Accept/Reject."

_AGENT_RESPONSE_VI: dict[str, str] = {
    "No LaTeX source available to edit.": "Chưa có nội dung LaTeX để chỉnh sửa.",
    "No edit instruction provided.": "Chưa có hướng dẫn chỉnh sửa.",
    "Could not resolve edit scope.": "Không xác định được phạm vi chỉnh sửa trong bản thảo.",
}

_TASK_LABELS_EN: dict[str, str] = {
    "style": "Style edit",
    "edit": "LaTeX edit",
    "structure": "Structure analysis",
    "logic": "Logic check",
    "citation": "Citation check",
    "template": "IMRAD template",
    "chat": "Chat reply",
}

_TASK_LABELS: dict[str, str] = {
    "style": "Biên tập văn phong",
    "edit": "Chỉnh sửa LaTeX",
    "structure": "Phân tích cấu trúc",
    "logic": "Kiểm tra logic",
    "citation": "Kiểm tra trích dẫn",
    "template": "Dựng khung IMRAD",
    "chat": "Trả lời câu hỏi",
}

T = TypeVar("T")

AGENT_TASK_TIMEOUT_SEC = 90.0


_logic_audit_busy: set[str] = set()
_logic_audit_busy_guard = asyncio.Lock()


async def _acquire_logic_audit_slot(session_id: str) -> bool:
    async with _logic_audit_busy_guard:
        if session_id in _logic_audit_busy:
            return False
        _logic_audit_busy.add(session_id)
        return True


async def _release_logic_audit_slot(session_id: str) -> None:
    async with _logic_audit_busy_guard:
        _logic_audit_busy.discard(session_id)


class AgentTaskTimeoutError(Exception):
    def __init__(self, task: str, timeout_sec: float) -> None:
        self.task = task
        self.timeout_sec = timeout_sec
        super().__init__(task)


def _agent_timeout_message(task: str, timeout_sec: float) -> str:
    label = _TASK_LABELS.get(task, task)
    label_en = _TASK_LABELS_EN.get(task, task)
    sec = int(timeout_sec)
    return (
        f"{label} quá thời gian ({sec}s). "
        "Thử lại với đoạn ngắn hơn, đổi model nhanh hơn, hoặc thu hẹp phạm vi (một section / vùng chọn).\n"
        f"{label_en} timed out ({sec}s). "
        "Retry with a shorter scope, a faster model, or a single section / selection."
    )


_KEEPALIVE_SSE = ": keepalive\n\n"
# Many proxies buffer until ~4KB; initial padding forces early flush to the browser.
_SSE_FLUSH_PAD = ": " + (" " * 2048) + "\n\n"


async def flush_sse_stream(source: AsyncIterator[str]) -> AsyncIterator[bytes]:
    """Yield each SSE chunk immediately (avoid proxy / ASGI buffering)."""
    first = True
    async for chunk in source:
        if first:
            yield _SSE_FLUSH_PAD.encode("utf-8")
            first = False
        payload = chunk.encode("utf-8") if isinstance(chunk, str) else chunk
        yield payload
        # Vite / nginx often buffer sub-4KB bodies; pad small events so fetch/XHR flush.
        if isinstance(chunk, str) and len(payload) < 2048:
            yield _SSE_FLUSH_PAD.encode("utf-8")
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


def _localize_agent_response(msg: str) -> str:
    stripped = (msg or "").strip()
    if not stripped:
        return stripped
    return _AGENT_RESPONSE_VI.get(stripped, stripped)


def _scope_detail(
    prepared: dict[str, Any],
    *,
    locale: str = "vi",
    active_file: str = "main.tex",
    main_file: str = "main.tex",
) -> tuple[str, str]:
    """Return (section_name, human detail) for the editing scope."""
    return i18n_scope_detail(
        resolve_locale(locale),
        prepared,
        active_file=active_file,
        main_file=main_file,
    )


def _preview_edit_scope(query: str, latex: str, selection: str = "") -> tuple[str, str]:
    """Resolve human scope label before running the full edit pipeline."""
    return resolve_preview_edit_scope(query, latex, selection=selection)


async def _monitor_long_task(
    coro: Awaitable[T],
    on_tick: Callable[[float], tuple[str, str]],
    *,
    interval: float = 2.0,
    timeout_sec: float | None = None,
    timeout_task: str = "",
    cancel_event: asyncio.Event | None = None,
) -> AsyncIterator[str | T]:
    """Yield SSE strings on heartbeat; final yield is the coroutine result."""
    task = asyncio.create_task(coro)
    started = time.perf_counter()
    while True:
        if cancel_event is not None and cancel_event.is_set():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            return
        elapsed = time.perf_counter() - started
        if timeout_sec is not None and elapsed >= timeout_sec:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            raise AgentTaskTimeoutError(timeout_task or "agent", timeout_sec)
        if task.done():
            exc = task.exception()
            if exc is not None:
                raise exc
            yield task.result()
            return
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=interval)
        except TimeoutError:
            elapsed_round = round(elapsed, 1)
            state_evt, act_evt = on_tick(elapsed_round)
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
        "edits",
        "citation_results",
        "structure_suggestions",
        "logic_audit_report",
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
    if task == "logic":
        n = len(sections)
        return f"Logic audit — {n} phần" if n else "Logic audit — toàn bản thảo"
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


async def _stream_chat_tokens_from_chunk(
    chunk: AIMessageChunk,
) -> AsyncIterator[tuple[str, str]]:
    if not isinstance(chunk, AIMessageChunk):
        return
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


async def _stream_chat_tokens(
    llm, messages: list
) -> AsyncIterator[tuple[str, str]]:
    """Yield ('reasoning'|'token', delta) for chat streams (Z.AI thinking mode)."""
    async for chunk in llm.astream(messages):
        async for item in _stream_chat_tokens_from_chunk(chunk):
            yield item


def _usage_from_chunk(chunk: AIMessageChunk) -> int | None:
    usage = getattr(chunk, "usage_metadata", None) or {}
    if isinstance(usage, dict):
        total = usage.get("total_tokens")
        if total:
            return int(total)
        input_tok = usage.get("input_tokens")
        output_tok = usage.get("output_tokens")
        if input_tok is not None and output_tok is not None:
            return int(input_tok) + int(output_tok)
    response_meta = getattr(chunk, "response_metadata", None) or {}
    if isinstance(response_meta, dict):
        token_usage = response_meta.get("token_usage") or response_meta.get("usage")
        if isinstance(token_usage, dict):
            total = token_usage.get("total_tokens")
            if total:
                return int(total)
    return None


def _resolve_raw_latex(latex: str, session_id: str) -> str:
    if session_id:
        session = session_store.get_or_create(session_id, latex_content=latex or None)
        if latex:
            session_store.update(session_id, latex_content=latex)
        return session.latex_content or latex
    return latex


def _content_hash(content: str) -> str:
    """djb2 hex — must match frontend contentFingerprint."""
    hash_val = 5381
    for ch in content:
        hash_val = ((hash_val * 33) ^ ord(ch)) & 0xFFFFFFFF
    return format(hash_val, "x")


def _cache_active_file_content(
    session_id: str,
    active_file: str,
    content: str,
    content_hash: str | None,
) -> None:
    if not session_id or not active_file or not content.strip():
        return
    session = session_store.get(session_id)
    if not session:
        return
    meta = dict(session.metadata or {})
    active_files = dict(meta.get("active_files") or {})
    active_files[active_file] = {
        "content": content,
        "hash": content_hash or _content_hash(content),
    }
    meta["active_files"] = active_files
    session_store.update(session_id, metadata=meta)


def _resolve_active_file_content(
    request: ChatRequest,
    session_id: str,
    resolved_main: str,
) -> str:
    inline = (request.active_file_content or "").strip()
    if inline:
        return inline
    main_file = (request.main_file or "main.tex").strip() or "main.tex"
    active_file = (request.active_file or main_file).strip() or main_file
    if active_file == main_file:
        return resolved_main
    if not session_id:
        return ""
    session = session_store.get(session_id)
    if not session:
        return ""
    active_files = (session.metadata or {}).get("active_files") or {}
    entry = active_files.get(active_file)
    if not entry:
        return ""
    stored_hash = entry.get("hash")
    if request.active_file_content_hash and stored_hash != request.active_file_content_hash:
        return ""
    return str(entry.get("content") or "")


async def stream_chat(
    request: ChatRequest,
    *,
    cancel_event: asyncio.Event | None = None,
) -> AsyncIterator[str]:
    def _cancelled() -> bool:
        return cancel_event is not None and cancel_event.is_set()

    settings = get_settings()
    provider = normalize_llm_provider(request.llm_provider or settings.llm_provider) or settings.llm_provider
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
            if request.latex_content_hash:
                session = session_store.get(request.session_id)
                if session:
                    meta = dict(session.metadata or {})
                    meta["latex_content_hash"] = request.latex_content_hash
                    session_store.update(request.session_id, metadata=meta)

        try:
            enforce_llm_quota_for_paper(request.session_id)
        except QuotaExceededError as exc:
            message = str(exc)
            await tracker.fail(message)
            yield _sse("error", {"message": message})
            return

        chat_temperature = (
            resolve_llm_temperature()
            if not is_reasoning_model(model or settings.openrouter_default_model)
            else REASONING_MODEL_TEMPERATURE
        )
        session_id = request.session_id or ""
        ui_locale = resolve_locale(request.locale)
        raw_latex = _resolve_raw_latex(request.latex_content, session_id)
        resolved_active = _resolve_active_file_content(request, session_id, raw_latex)
        if request.session_id and (request.active_file_content or "").strip():
            active_path = (request.active_file or request.main_file or "main.tex").strip() or "main.tex"
            _cache_active_file_content(
                request.session_id,
                active_path,
                request.active_file_content,
                request.active_file_content_hash,
            )
        has_latex = bool(raw_latex.strip())
        has_selection = bool((request.selection or "").strip())

        state_evt, act_evt = _emit_state(
            "intent",
            state_label(ui_locale, "intent_analyze"),
            status="active",
            detail=state_label(ui_locale, "intent_detail_active"),
        )
        yield state_evt
        yield act_evt

        slash_task, effective_message = parse_slash_command(request.message)
        explicit_task = request.task or slash_task

        guard_allowed, guard_refusal = evaluate_user_request(
            effective_message,
            locale=request.locale,
            history=request.conversation_history,
        )
        request_blocked = not guard_allowed

        if request_blocked:
            task = "chat"
            intent = IntentResult(action="chat", scope="document")
        else:
            intent = await classify_intent(
                effective_message,
                has_latex=has_latex,
                has_selection=has_selection,
                explicit_task=explicit_task,
                provider=provider,
                model=model,
                conversation_history=request.conversation_history,
            )
            task = intent.action
        tracker.task = task
        main_latex, work_latex, main_file, active_file = resolve_latex_sources(
            request,
            task,
            resolved_main=raw_latex,
            resolved_active=resolved_active,
        )

        trace = await tracker.stage(
            "intent_classified",
            intent=task,
            scope=intent.scope,
            blocked=request_blocked,
        )
        yield _sse("trace", trace)

        preview_latex = work_latex if task in ("edit", "style") and work_latex.strip() else raw_latex
        if request_blocked:
            intent_detail = state_label(ui_locale, "request_guard_blocked")
        elif task == "edit":
            _, scope_preview = _preview_edit_scope(
                effective_message,
                preview_latex,
                request.selection or "",
            )
            intent_detail = f"{task_label(ui_locale, task)} · {scope_preview}"
        else:
            scope_word = state_label(ui_locale, "scope_suffix")
            intent_detail = f"{task_label(ui_locale, task)} · {scope_word} {intent.scope}"
        state_evt, act_evt = _emit_state(
            "intent",
            state_label(ui_locale, "intent_done"),
            status="done",
            detail=intent_detail,
            task=task,
        )
        yield state_evt
        yield act_evt

        latex = raw_latex
        sections: list[dict] = []
        cite_keys: list[str] = []
        if not request_blocked and task_needs_manuscript(task):
            if task in ("edit", "style"):
                latex = work_latex
                sections = parse_latex_sections(work_latex) if work_latex else []
                cite_keys = extract_cite_keys(main_latex) if main_latex else []
            else:
                latex, sections, cite_keys = _parse_manuscript(main_latex, session_id)
            trace = await tracker.stage(
                "manuscript_parsed",
                sections=len(sections),
                citations=len(cite_keys),
                latex_chars=len(latex),
            )
            yield _sse("trace", trace)

            parse_detail_str = format_parse_detail(ui_locale, len(sections), len(cite_keys), len(latex))
            state_evt, act_evt = _emit_state(
                "parse",
                state_label(ui_locale, "parse_done"),
                status="done",
                detail=parse_detail_str,
            )
            yield state_evt
            yield act_evt

        if not request_blocked:
            yield _sse("activity", {"text": _activity_for_task(task, sections, cite_keys, request.selection)})

        settings = get_settings()
        strictness = request.integrity_strictness or settings.integrity_strictness

        apply_mode: str = intent.scope
        state: AgentState
        if request_blocked:
            state = {
                "query": effective_message,
                "task": "chat",  # type: ignore[arg-type]
                "session_id": request.session_id or "",
                "latex": latex,
                "main_latex": main_latex,
                "selection": request.selection or "",
                "parsed_sections": [],
                "citation_keys": [],
                "llm_provider": provider,
                "llm_model": model or "",
                "apply_mode": "document",
                "integrity_strictness": strictness,
                "active_file": active_file,
                "main_file": main_file,
                "conversation_history": [
                    {"role": t.role, "content": t.content} for t in request.conversation_history
                ],
            }
        else:
            if has_selection:
                apply_mode = "selection"
            elif task == "edit" and preview_latex.strip():
                preview_prepared = prepare_edit_target(
                    {
                        "query": effective_message,
                        "latex": preview_latex,
                        "selection": request.selection or "",
                        "parsed_sections": [],
                        "apply_mode": intent.scope,
                        "selection_start": request.selection_start,
                        "selection_end": request.selection_end,
                    },
                    effective_message,
                )
                preview_mode = preview_prepared.get("apply_mode")
                if preview_mode == "selection":
                    apply_mode = "selection"

            state = {
                "query": effective_message,
                "task": task,  # type: ignore[arg-type]
                "session_id": request.session_id or "",
                "latex": latex,
                "main_latex": main_latex,
                "selection": request.selection,
                "parsed_sections": sections,
                "citation_keys": cite_keys,
                "llm_provider": provider,
                "llm_model": model or "",
                "apply_mode": apply_mode,
                "integrity_strictness": strictness,
                "active_file": active_file,
                "main_file": main_file,
                "conversation_history": [
                    {"role": t.role, "content": t.content} for t in request.conversation_history
                ],
            }
            if request.selection_start is not None:
                state["selection_start"] = request.selection_start
            if request.selection_end is not None:
                state["selection_end"] = request.selection_end

            get_llm(provider=provider, model=model, temperature=chat_temperature)

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
            "logic_audit_report": {},
        }

        if request_blocked:
            trace = await tracker.stage("request_guard", task=task, blocked=True)
            yield _sse("trace", trace)
            state_evt, act_evt = _emit_state(
                "llm",
                "Hoàn tất trả lời",
                status="done",
                task=task,
            )
            yield state_evt
            yield act_evt
            yield _sse("token", {"delta": guard_refusal})
            done_payload["response"] = guard_refusal

        elif task == "chat":
            chat_system = build_system_prompt("chat")
            full_response: list[str] = []
            chat_llm = get_llm(
                provider=provider,
                model=model,
                thinking=False if provider == "zai" else None,
                temperature=chat_temperature,
            )
            chat_sections: list[dict] = []
            if has_latex:
                chat_sections = parse_latex_sections(raw_latex) if raw_latex else []
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
            provider_tokens: int | None = None
            user_content = build_chat_user_content(
                request.message,
                selection=request.selection or "",
                latex=latex,
                sections=chat_sections,
                include_manuscript=chat_query_needs_manuscript_context(
                    effective_message
                ),
            )
            messages = build_chat_llm_messages(
                system=chat_system,
                history=request.conversation_history,
                user_content=user_content,
            )
            try:
                async for chunk in chat_llm.astream(messages):
                    if _cancelled():
                        return
                    if isinstance(chunk, AIMessageChunk):
                        reported = _usage_from_chunk(chunk)
                        if reported:
                            provider_tokens = reported
                    async for kind, delta in _stream_chat_tokens_from_chunk(chunk):
                        if first_token and kind == "token":
                            trace = await tracker.stage("llm_first_token", task=task)
                            yield _sse("trace", trace)
                            first_token = False
                        if kind == "reasoning":
                            yield _sse("reasoning", {"delta": delta})
                        else:
                            full_response.append(delta)
                            combined = "".join(full_response)
                            if looks_like_provider_error(combined):
                                message = friendly_llm_error(Exception(combined))
                                await tracker.fail(message)
                                yield _sse("error", {"message": message})
                                return
                            yield _sse("token", {"delta": delta})
            except Exception as exc:
                message = friendly_llm_error(exc)
                await tracker.fail(message)
                yield _sse("error", {"message": message})
                return
            response_text = "".join(full_response).strip()
            if looks_like_system_prompt_leak(response_text):
                response_text = injection_refusal(request.locale)
            done_payload["response"] = response_text
            done_payload["_provider_tokens"] = provider_tokens
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
            section, scope_detail = _scope_detail(
                prepared,
                locale=request.locale or "vi",
                active_file=active_file,
                main_file=main_file,
            )
            state_evt, act_evt = _emit_state(
                "scope",
                state_label(ui_locale, "scope_edit"),
                status="done",
                detail=scope_detail,
                task=task,
                section=section,
            )
            yield state_evt
            yield act_evt

            state_evt, act_evt = _emit_state(
                "plan",
                state_label(ui_locale, "plan_edit"),
                status="active",
                detail=scope_detail,
                task=task,
                section=section,
            )
            yield state_evt
            yield act_evt

            def _edit_tick(elapsed: float) -> tuple[str, str]:
                return _emit_state(
                    "llm",
                    state_label(ui_locale, "llm_edit_active"),
                    status="active",
                    detail=f"{state_label(ui_locale, 'llm_processing')} · {elapsed:.0f}s",
                    task=task,
                    section=section,
                    elapsed_sec=elapsed,
                )

            edit_result = None
            try:
                async for event in _monitor_long_task(
                    edit_node({**prepared, "task": "edit"}),
                    _edit_tick,
                    timeout_sec=AGENT_TASK_TIMEOUT_SEC,
                    timeout_task="edit",
                    cancel_event=cancel_event,
                ):
                    if isinstance(event, str):
                        yield event
                    else:
                        edit_result = event
            except AgentTaskTimeoutError as exc:
                message = _agent_timeout_message(exc.task, exc.timeout_sec)
                await tracker.fail(message)
                yield _sse("error", {"message": message})
                return

            edit_result = edit_result or {}
            state_evt, act_evt = _emit_state(
                "llm",
                state_label(ui_locale, "llm_edit_done"),
                status="done",
                task=task,
                section=section,
            )
            yield state_evt
            yield act_evt
            _merge_agent_into_done(done_payload, edit_result)
            edit_done = (
                "Updated — review the diff and Accept/Reject."
                if ui_locale == "en"
                else EDIT_DONE_MSG
            )
            if edit_result.get("suggestion"):
                respond = edit_done
            else:
                respond = _localize_agent_response(
                    edit_result.get("error")
                    or edit_result.get("response")
                    or "Không có thay đổi."
                )
            for piece in _chunk_text(respond, size=12):
                yield _sse("token", {"delta": piece})
            done_payload["response"] = respond

        elif task == "style":
            trace = await tracker.stage("agent_start", task=task)
            yield _sse("trace", trace)
            prepared = prepare_style_target(state, request.message)
            section, scope_detail = _scope_detail(
                prepared,
                locale=request.locale or "vi",
                active_file=active_file,
                main_file=main_file,
            )
            state_evt, act_evt = _emit_state(
                "scope",
                state_label(ui_locale, "scope_style"),
                status="done",
                detail=scope_detail,
                task=task,
                section=section,
            )
            yield state_evt
            yield act_evt

            state_evt, act_evt = _emit_state(
                "plan",
                state_label(ui_locale, "plan_style"),
                status="active",
                detail=scope_detail,
                task=task,
                section=section,
            )
            yield state_evt
            yield act_evt

            def _style_tick(elapsed: float) -> tuple[str, str]:
                label = state_label(ui_locale, "llm_style_active")
                if section:
                    label = f"{label} · {section}"
                return _emit_state(
                    "llm",
                    label,
                    status="active",
                    detail=f"{state_label(ui_locale, 'llm_processing')} · {elapsed:.0f}s",
                    task=task,
                    section=section,
                    elapsed_sec=elapsed,
                )

            style_boot = state_label(ui_locale, "llm_style_active")
            if section:
                style_boot = f"{style_boot} · {section}"
            state_evt, act_evt = _emit_state(
                "llm",
                style_boot,
                status="active",
                detail=state_label(ui_locale, "llm_boot"),
                task=task,
                section=section,
            )
            yield state_evt
            yield act_evt

            style_result = None
            try:
                async for event in _monitor_long_task(
                    style_node({**prepared, "task": "style"}),
                    _style_tick,
                    timeout_sec=AGENT_TASK_TIMEOUT_SEC,
                    timeout_task="style",
                    cancel_event=cancel_event,
                ):
                    if isinstance(event, str):
                        yield event
                    else:
                        style_result = event
            except AgentTaskTimeoutError as exc:
                message = _agent_timeout_message(exc.task, exc.timeout_sec)
                await tracker.fail(message)
                yield _sse("error", {"message": message})
                return

            style_result = style_result or {}

            flags = style_result.get("integrity_flags") or []
            blocking = [f for f in flags if f.get("severity") == "error"]
            integrity_detail = (
                f"{len(blocking)} {state_label(ui_locale, 'integrity_blocking')}"
                if blocking
                else state_label(ui_locale, "integrity_ok")
            )
            state_evt, act_evt = _emit_state(
                "integrity",
                state_label(ui_locale, "integrity_done"),
                status="done",
                detail=integrity_detail,
                task=task,
                section=section,
            )
            yield state_evt
            yield act_evt

            state_evt, act_evt = _emit_state(
                "llm",
                state_label(ui_locale, "llm_style_done"),
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
                respond = _localize_agent_response(
                    style_result.get("error")
                    or style_result.get("response")
                    or "Không có thay đổi."
                )
            for piece in _chunk_text(respond, size=12):
                yield _sse("token", {"delta": piece})
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
            structure_result = None

            def _structure_tick(elapsed: float) -> tuple[str, str]:
                return _emit_state(
                    "scope",
                    "Đang phân tích cấu trúc IMRAD",
                    status="active",
                    detail=f"Đang xử lý · {elapsed:.0f}s",
                    task=task,
                )

            try:
                async for event in _monitor_long_task(
                    structure_node(state),
                    _structure_tick,
                    timeout_sec=AGENT_TASK_TIMEOUT_SEC,
                    timeout_task="structure",
                    cancel_event=cancel_event,
                ):
                    if isinstance(event, str):
                        yield event
                    else:
                        structure_result = event
            except AgentTaskTimeoutError as exc:
                message = _agent_timeout_message(exc.task, exc.timeout_sec)
                await tracker.fail(message)
                yield _sse("error", {"message": message})
                return

            structure_result = structure_result or {}
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

        elif task == "logic":
            session_key = (request.session_id or "").strip()
            if session_key and not await _acquire_logic_audit_slot(session_key):
                busy_msg = (
                    "Một logic audit khác đang chạy trên dự án này "
                    "(panel hoặc chấm điểm). Hủy hoặc đợi xong rồi thử lại."
                )
                await tracker.fail(busy_msg)
                yield _sse("error", {"message": busy_msg})
                return
            try:
                trace = await tracker.stage("agent_start", task=task)
                yield _sse("trace", trace)
                names = ", ".join(s["name"] for s in sections[:4]) if sections else "document"
                state_evt, act_evt = _emit_state(
                    "logic-start",
                    "Logic audit — multi-agent",
                    status="active",
                    detail=names,
                    task=task,
                )
                yield state_evt
                yield act_evt

                progress_queue: asyncio.Queue[tuple[str, ...]] = asyncio.Queue()
                partial_sections: list[dict[str, Any]] = []
                partial_report: dict[str, Any] | None = None

                def _logic_progress(
                    step_id: str, label: str, detail: str, status: str
                ) -> None:
                    progress_queue.put_nowait(("state", step_id, label, detail, status))

                def _logic_reasoning(delta: str) -> None:
                    if delta:
                        progress_queue.put_nowait(("reasoning", delta))

                def _logic_section(section: dict[str, Any]) -> None:
                    progress_queue.put_nowait(("logic_section", section))

                async def _run_logic_audit() -> dict[str, Any]:
                    from src.services.logic_audit.runner import run_logic_audit

                    return await run_logic_audit(
                        latex=latex,
                        sections=sections,
                        query=effective_message,
                        provider=provider,
                        model=model,
                        mode=request.logic_audit_mode or "quick",
                        scope=request.logic_audit_scope or "selected",
                        section_filter=request.logic_audit_sections,
                        chat_provider=provider,
                        on_progress=_logic_progress,
                        on_reasoning=_logic_reasoning,
                        on_section_complete=_logic_section,
                        cancel_event=cancel_event,
                    )

                audit_task = asyncio.create_task(_run_logic_audit())
                logic_started = time.perf_counter()
                logic_mode = request.logic_audit_mode or "quick"
                logic_scope = request.logic_audit_scope or "selected"
                from src.services.logic_audit.config import (
                    compute_logic_audit_timeout_sec,
                    logic_audit_runtime_flags,
                    select_logic_targets,
                )
                from src.services.logic_audit.runner import (
                    build_partial_audit_result,
                    merge_logic_section_into_report,
                    upsert_partial_section,
                )

                logic_flags = logic_audit_runtime_flags(logic_mode, provider, scope=logic_scope)
                logic_targets = select_logic_targets(
                    sections,
                    mode=logic_mode,
                    scope=logic_scope,
                    section_filter=request.logic_audit_sections,
                    max_sections=logic_flags["max_sections"],
                )
                logic_timeout = compute_logic_audit_timeout_sec(
                    logic_mode,
                    logic_scope,
                    len(logic_targets) if logic_targets else 1,
                    run_cross_section=logic_flags["run_cross_section"],
                    targets=logic_targets,
                    section_char_limit=logic_flags["section_char_limit"],
                    section_concurrency=logic_flags["section_concurrency"],
                )
                logic_result: dict[str, Any] | None = None
                persist_pending_report: dict[str, Any] | None = None
                persist_after = 0.0
                persist_debounce = get_settings().logic_audit_persist_debounce_sec
                while logic_result is None:
                    if (
                        persist_pending_report
                        and persist_debounce > 0
                        and time.perf_counter() >= persist_after
                    ):
                        if request.session_id:
                            session_store.set_logic_audit_report(
                                request.session_id,
                                persist_pending_report,
                            )
                        persist_pending_report = None
                        persist_after = 0.0
                    elif (
                        persist_pending_report
                        and persist_debounce <= 0
                        and request.session_id
                    ):
                        session_store.set_logic_audit_report(
                            request.session_id,
                            persist_pending_report,
                        )
                        persist_pending_report = None
                    if _cancelled():
                        audit_task.cancel()
                        with contextlib.suppress(asyncio.CancelledError):
                            await audit_task
                        if partial_sections:
                            logic_result = build_partial_audit_result(
                                partial_sections,
                                mode=logic_mode,
                                reason="cancelled",
                            )
                            break
                        return
                    elapsed_total = time.perf_counter() - logic_started
                    if elapsed_total >= logic_timeout:
                        audit_task.cancel()
                        with contextlib.suppress(asyncio.CancelledError):
                            await audit_task
                        if partial_sections:
                            logic_result = build_partial_audit_result(
                                partial_sections,
                                timeout_sec=logic_timeout,
                                mode=logic_mode,
                            )
                            break
                        message = _agent_timeout_message("logic", logic_timeout)
                        await tracker.fail(message)
                        yield _sse("error", {"message": message})
                        return
                    if audit_task.done() and progress_queue.empty():
                        logic_result = await audit_task
                        break
                    try:
                        item = await asyncio.wait_for(progress_queue.get(), timeout=2.0)
                        kind = item[0]
                        if kind == "reasoning":
                            continue
                        if kind == "logic_section":
                            section_payload = item[1]
                            if isinstance(section_payload, dict):
                                upsert_partial_section(partial_sections, section_payload)
                                partial_report = merge_logic_section_into_report(
                                    partial_report,
                                    section_payload,
                                    mode=logic_mode,
                                    scope=logic_scope,
                                )
                                if request.session_id and partial_report:
                                    if persist_debounce > 0:
                                        persist_pending_report = partial_report
                                        persist_after = (
                                            time.perf_counter() + persist_debounce
                                        )
                                    else:
                                        session_store.set_logic_audit_report(
                                            request.session_id,
                                            partial_report,
                                        )
                            yield _sse("logic_section", {"section": item[1]})
                            continue
                        _, step_id, label, detail, status = item
                        state_evt, act_evt = _emit_state(
                            step_id,
                            label,
                            status=status,
                            detail=detail,
                            task=task,
                        )
                        yield state_evt
                        yield act_evt
                    except TimeoutError:
                        if audit_task.done():
                            logic_result = audit_task.result()
                            break
                        elapsed = round(time.perf_counter() - logic_started, 0)
                        state_evt, _ = _emit_state(
                            "logic-heartbeat",
                            "Đang chờ model LLM",
                            status="active",
                            detail=f"{elapsed:.0f}s",
                            task=task,
                            elapsed_sec=elapsed,
                        )
                        yield state_evt
                        yield _KEEPALIVE_SSE

                logic_result = logic_result or {}
                if persist_pending_report and request.session_id:
                    session_store.set_logic_audit_report(
                        request.session_id,
                        persist_pending_report,
                    )
                    persist_pending_report = None
                conflict_count = sum(
                    len(sec.get("conflicts") or [])
                    for sec in (logic_result.get("logic_audit_report") or {}).get("sections") or []
                )
                state_evt, act_evt = _emit_state(
                    "scope",
                    "Hoàn tất logic audit",
                    status="done",
                    detail=f"{conflict_count} vấn đề (comment-only)",
                    task=task,
                )
                yield state_evt
                yield act_evt
                _merge_agent_into_done(done_payload, logic_result)
                respond = logic_result.get("response", "")
                done_payload["response"] = respond
                if request.session_id:
                    report = logic_result.get("logic_audit_report")
                    if isinstance(report, dict) and report:
                        session_store.set_logic_audit_report(request.session_id, report)
            finally:
                if session_key:
                    await _release_logic_audit_slot(session_key)

        elif task == "citation":
            trace = await tracker.stage("agent_start", task=task)
            yield _sse("trace", trace)
            keys = cite_keys
            state_evt, act_evt = _emit_state(
                "scope",
                "Quét trích dẫn",
                status="done",
                detail=f"{len(keys)} cite key",
                task=task,
            )
            yield state_evt
            yield act_evt

            def _citation_tick(elapsed: float) -> tuple[str, str]:
                return _emit_state(
                    "llm",
                    "Đang kiểm tra trích dẫn",
                    status="active",
                    detail=f"Tra cứu metadata · {elapsed:.0f}s",
                    task=task,
                    elapsed_sec=elapsed,
                )

            citation_result = None
            try:
                async for event in _monitor_long_task(
                    citation_node(state),
                    _citation_tick,
                    timeout_sec=AGENT_TASK_TIMEOUT_SEC,
                    timeout_task="citation",
                    cancel_event=cancel_event,
                ):
                    if isinstance(event, str):
                        yield event
                    else:
                        citation_result = event
            except AgentTaskTimeoutError as exc:
                message = _agent_timeout_message(exc.task, exc.timeout_sec)
                await tracker.fail(message)
                yield _sse("error", {"message": message})
                return

            citation_result = citation_result or {}
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

        if request.session_id:
            from src.services.usage_tracking import record_ai_usage

            input_text = "\n".join(
                part for part in (request.message, request.selection, request.latex_content[:4000]) if part
            )
            output_text = done_payload.get("response") or ""
            provider_tokens = done_payload.pop("_provider_tokens", None)
            record_ai_usage(
                paper_id=request.session_id,
                task_type=task,
                user_input=input_text,
                ai_output=output_text,
                tokens_used=provider_tokens,
                llm_provider=provider,
                llm_model=model or "",
            )

        await tracker.complete(
            success=True,
            has_suggestion=bool(done_payload.get("suggestion")),
            response_chars=len(done_payload.get("response") or ""),
        )

    except QuotaExceededError as e:
        message = str(e)
        await tracker.fail(message)
        yield _sse("error", {"message": message})
    except ValueError as e:
        message = friendly_llm_error(e)
        await tracker.fail(message)
        yield _sse("error", {"message": message})
    except Exception as e:
        message = friendly_llm_error(e)
        await tracker.fail(message)
        yield _sse("error", {"message": message})
