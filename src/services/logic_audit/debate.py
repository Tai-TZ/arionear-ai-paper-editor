from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import Callable
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from src.services.llm import (
    MINIMAX_M3_TEMPERATURE,
    extract_llm_stream_deltas,
    get_llm,
    is_minimax_m3_provider,
    resolve_tokenrouter_model,
)
from src.services.llm_policy import resolve_llm_temperature
from src.services.prompts import render_template

logger = logging.getLogger(__name__)

LogicProgressFn = Callable[[str, str, str, str], None]
LogicReasoningFn = Callable[[str], None]

PERSONA_LABELS: dict[str, str] = {
    "novice_reader": "Độc giả mới",
    "critical_reviewer": "Reviewer khắt khe",
    "devil_advocate": "Devil's advocate",
}

PERSONA_TIMEOUT_DEFAULT_SEC = 30.0
PERSONA_TIMEOUT_MINIMAX_SEC = 180.0
SYNTH_TIMEOUT_MINIMAX_SEC = 180.0


def _persona_timeout_sec(provider: str | None) -> float:
    if is_minimax_m3_provider(provider):
        return PERSONA_TIMEOUT_MINIMAX_SEC
    return PERSONA_TIMEOUT_DEFAULT_SEC


def _resolve_llm_temperature(provider: str | None, task_temp: float) -> float:
    if is_minimax_m3_provider(provider):
        return MINIMAX_M3_TEMPERATURE
    return resolve_llm_temperature(task_temp)


def _resolve_model(provider: str | None, model: str | None) -> str | None:
    if is_minimax_m3_provider(provider):
        return resolve_tokenrouter_model(model)
    return model


def _report(
    on_progress: LogicProgressFn | None,
    step_id: str,
    label: str,
    *,
    detail: str = "",
    status: str = "active",
) -> None:
    if on_progress:
        on_progress(step_id, label, detail, status)


def _strip_thinking_markup(text: str) -> str:
    if not text:
        return ""
    cleaned = text
    tag_pairs = (
        ("redacted_thinking", "redacted_thinking"),
        ("redacted_reasoning", "redacted_reasoning"),
        ("reasoning", "reasoning"),
        ("think", "think"),
    )
    for open_tag, close_tag in tag_pairs:
        pattern = rf"<{open_tag}>[\s\S]*?</{close_tag}>"
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def _extract_bullet_answer(reasoning: str) -> str:
    """Pull bullet observations from reasoning tail — never return raw chain-of-thought."""
    lines = reasoning.splitlines()
    bullet_lines: list[str] = []
    for line in reversed(lines):
        stripped = line.strip()
        if not stripped:
            if bullet_lines:
                break
            continue
        if re.match(r"^[-*•]|^\d+[.)]\s", stripped):
            bullet_lines.insert(0, stripped)
        elif bullet_lines:
            break
    if bullet_lines:
        return "\n".join(bullet_lines)
    paragraphs = [p.strip() for p in reasoning.split("\n\n") if p.strip()]
    if paragraphs:
        last = paragraphs[-1]
        if re.search(r"^[-*•]", last, re.MULTILINE) and len(last) <= 3000:
            return last
    return ""


def _resolve_llm_response_text(
    content: str,
    reasoning: str,
    *,
    prefer_json: bool = False,
) -> str:
    """Prefer visible content; recover structured output from reasoning without leaking CoT."""
    cleaned_content = _strip_thinking_markup(content).strip()
    if cleaned_content:
        return cleaned_content

    cleaned_reasoning = _strip_thinking_markup(reasoning).strip()
    if not cleaned_reasoning:
        return ""

    if prefer_json:
        match = re.search(r"\{[\s\S]*\}", cleaned_reasoning)
        if match:
            return match.group(0)

    return _extract_bullet_answer(cleaned_reasoning)


async def _stream_llm_text(
    llm: BaseChatModel,
    messages: list,
    *,
    provider: str | None,
    timeout: float | None,
    on_reasoning: LogicReasoningFn | None = None,
    prefer_json: bool = False,
) -> str:
    content_parts: list[str] = []
    reasoning_parts: list[str] = []

    async def _consume() -> None:
        async for chunk in llm.astream(messages):
            content_delta, reasoning_delta = extract_llm_stream_deltas(chunk)
            if reasoning_delta:
                reasoning_parts.append(reasoning_delta)
                if on_reasoning:
                    on_reasoning(reasoning_delta)
            if content_delta:
                content_parts.append(content_delta)

    if timeout:
        await asyncio.wait_for(_consume(), timeout=timeout)
    else:
        await _consume()

    return _resolve_llm_response_text(
        "".join(content_parts),
        "".join(reasoning_parts),
        prefer_json=prefer_json,
    )


async def _invoke_persona(
    role_name: str,
    role_prompts: dict[str, str],
    variables: dict[str, str],
    *,
    llm: BaseChatModel,
    provider: str | None,
    on_reasoning: LogicReasoningFn | None = None,
) -> tuple[str, str]:
    """Run one debate persona; returns (role_name, response_text)."""
    system = render_template(role_prompts.get("system", ""), **variables)
    user = render_template(role_prompts.get("user", ""), **variables)
    timeout = _persona_timeout_sec(provider)
    messages = [SystemMessage(content=system), HumanMessage(content=user)]
    try:
        text = await _stream_llm_text(
            llm,
            messages,
            provider=provider,
            timeout=timeout,
            on_reasoning=on_reasoning,
        )
        return role_name, text
    except Exception as exc:
        detail = str(exc).strip() or type(exc).__name__
        logger.warning(
            "Logic audit persona '%s' failed after %.0fs (%s): %s",
            role_name,
            timeout,
            type(exc).__name__,
            detail,
        )
        return role_name, ""


async def multi_perspective_generate(
    roles: dict[str, dict[str, str]],
    variables: dict[str, str],
    *,
    provider: str | None,
    model: str | None,
    on_progress: LogicProgressFn | None = None,
    on_reasoning: LogicReasoningFn | None = None,
    progress_key: str = "",
    sequential: bool = False,
) -> dict[str, str]:
    """Run debate personas; sequential mode avoids rate limits and improves depth on reasoning models."""
    if not roles:
        return {}

    effective_model = _resolve_model(provider, model)
    llm = get_llm(
        provider=provider,  # type: ignore[arg-type]
        model=effective_model,
        temperature=_resolve_llm_temperature(provider, 0.2),
    )
    section_name = variables.get("section_name", "")

    async def run_one(name: str, step_id: str, persona_label: str, prompts: dict[str, str]):
        _report(
            on_progress,
            step_id,
            f"Persona: {persona_label}",
            detail=section_name,
            status="active",
        )
        role_name, text = await _invoke_persona(
            name,
            prompts,
            variables,
            llm=llm,
            provider=provider,
            on_reasoning=on_reasoning,
        )
        _report(
            on_progress,
            step_id,
            f"Persona: {persona_label}",
            detail=f"Hoàn tất · {section_name}" if text.strip() else f"Không có kết quả · {section_name}",
            status="done",
        )
        return role_name, text

    results: dict[str, str] = {}
    items = [
        (
            name,
            f"{progress_key}persona-{name}" if progress_key else f"persona-{name}",
            PERSONA_LABELS.get(name, name),
            prompts,
        )
        for name, prompts in roles.items()
    ]

    if sequential:
        for name, step_id, persona_label, prompts in items:
            role_name, text = await run_one(name, step_id, persona_label, prompts)
            if text.strip():
                results[role_name] = text
    else:
        pairs = await asyncio.gather(
            *[run_one(name, step_id, persona_label, prompts) for name, step_id, persona_label, prompts in items]
        )
        results = {name: text for name, text in pairs if text.strip()}

    return results


async def synthesize_perspectives(
    perspectives: dict[str, str],
    *,
    system_template: str,
    user_template: str,
    variables: dict[str, str],
    provider: str | None,
    model: str | None,
    on_progress: LogicProgressFn | None = None,
    on_reasoning: LogicReasoningFn | None = None,
    progress_key: str = "",
) -> str:
    """Merge persona outputs — adapted from ARC _synthesize_perspectives."""
    section_name = variables.get("section_name", "")
    step_id = f"{progress_key}synthesize" if progress_key else "synthesize"
    _report(
        on_progress,
        step_id,
        "Tổng hợp JSON",
        detail=section_name,
        status="active",
    )
    parts = [f"### {role}\n{text}" for role, text in perspectives.items()]
    merged_vars = {
        **variables,
        "perspectives": "\n\n---\n\n".join(parts),
    }
    system = render_template(system_template, **merged_vars)
    user = render_template(user_template, **merged_vars)
    llm = get_llm(
        provider=provider,  # type: ignore[arg-type]
        model=_resolve_model(provider, model),
        temperature=_resolve_llm_temperature(provider, 0.1),
    )
    timeout = SYNTH_TIMEOUT_MINIMAX_SEC if is_minimax_m3_provider(provider) else None
    messages = [SystemMessage(content=system), HumanMessage(content=user)]
    try:
        text = await _stream_llm_text(
            llm,
            messages,
            provider=provider,
            timeout=timeout,
            on_reasoning=on_reasoning,
            prefer_json=True,
        )
    except Exception as exc:
        detail = str(exc).strip() or type(exc).__name__
        logger.warning(
            "Logic audit synthesize failed (%s): %s",
            type(exc).__name__,
            detail,
        )
        _report(on_progress, step_id, "Tổng hợp JSON", detail="Thất bại", status="done")
        return ""
    _report(
        on_progress,
        step_id,
        "Tổng hợp JSON",
        detail=f"Hoàn tất · {section_name}",
        status="done",
    )
    return text


def load_debate_roles() -> dict[str, dict[str, str]]:
    from src.services.prompts import load_prompts

    raw = load_prompts().get("debate_roles", {})
    if not isinstance(raw, dict):
        return {}
    roles: dict[str, dict[str, str]] = {}
    for name, spec in raw.items():
        if isinstance(spec, dict):
            roles[str(name)] = {
                "system": str(spec.get("system", "")),
                "user": str(spec.get("user", "")),
            }
    return roles


def load_combined_logic_role() -> dict[str, dict[str, str]]:
    from src.services.prompts import load_prompts

    raw = load_prompts().get("logic_combined_role", {})
    if not isinstance(raw, dict):
        return {}
    system = str(raw.get("system", "")).strip()
    user = str(raw.get("user", "")).strip()
    if not system or not user:
        return {}
    return {
        "combined_reviewer": {
            "system": system,
            "user": user,
        }
    }
