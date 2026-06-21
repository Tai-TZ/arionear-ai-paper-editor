from __future__ import annotations

import asyncio
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from src.services.llm import get_llm
from src.services.llm_policy import resolve_llm_temperature
from src.services.prompts import render_template

logger = logging.getLogger(__name__)

PERSONA_TIMEOUT_DEFAULT_SEC = 30.0
PERSONA_TIMEOUT_NVIDIA_SEC = 120.0
SYNTH_TIMEOUT_NVIDIA_SEC = 120.0


def _persona_timeout_sec(provider: str | None) -> float:
    if provider == "nvidia":
        return PERSONA_TIMEOUT_NVIDIA_SEC
    return PERSONA_TIMEOUT_DEFAULT_SEC


def _run_personas_sequentially(provider: str | None) -> bool:
    """Reasoning models (NVIDIA MiniMax M3) are slow and rate-limited when parallel."""
    return provider == "nvidia"


async def _invoke_persona(
    role_name: str,
    role_prompts: dict[str, str],
    variables: dict[str, str],
    *,
    provider: str | None,
    model: str | None,
) -> tuple[str, str]:
    """Run one debate persona; returns (role_name, response_text)."""
    system = render_template(role_prompts.get("system", ""), **variables)
    user = render_template(role_prompts.get("user", ""), **variables)
    llm = get_llm(
        provider=provider,  # type: ignore[arg-type]
        model=model,
        temperature=resolve_llm_temperature(0.2),
    )
    timeout = _persona_timeout_sec(provider)
    try:
        response = await asyncio.wait_for(
            llm.ainvoke(
                [
                    SystemMessage(content=system),
                    HumanMessage(content=user),
                ]
            ),
            timeout=timeout,
        )
        text = str(response.content or "").strip()
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
) -> dict[str, str]:
    """Parallel persona calls — adapted from ARC _multi_perspective_generate."""
    if not roles:
        return {}

    if _run_personas_sequentially(provider):
        out: dict[str, str] = {}
        for name, prompts in roles.items():
            role_name, text = await _invoke_persona(
                name, prompts, variables, provider=provider, model=model
            )
            if text.strip():
                out[role_name] = text
        return out

    tasks = [
        _invoke_persona(name, prompts, variables, provider=provider, model=model)
        for name, prompts in roles.items()
    ]
    pairs = await asyncio.gather(*tasks)
    return {name: text for name, text in pairs if text.strip()}


async def synthesize_perspectives(
    perspectives: dict[str, str],
    *,
    system_template: str,
    user_template: str,
    variables: dict[str, str],
    provider: str | None,
    model: str | None,
) -> str:
    """Merge persona outputs — adapted from ARC _synthesize_perspectives."""
    parts = [f"### {role}\n{text}" for role, text in perspectives.items()]
    merged_vars = {
        **variables,
        "perspectives": "\n\n---\n\n".join(parts),
    }
    system = render_template(system_template, **merged_vars)
    user = render_template(user_template, **merged_vars)
    llm = get_llm(
        provider=provider,  # type: ignore[arg-type]
        model=model,
        temperature=resolve_llm_temperature(0.1),
    )
    timeout = SYNTH_TIMEOUT_NVIDIA_SEC if provider == "nvidia" else None
    try:
        coro = llm.ainvoke(
            [
                SystemMessage(content=system),
                HumanMessage(content=user),
            ]
        )
        if timeout:
            response = await asyncio.wait_for(coro, timeout=timeout)
        else:
            response = await coro
    except Exception as exc:
        detail = str(exc).strip() or type(exc).__name__
        logger.warning(
            "Logic audit synthesize failed (%s): %s",
            type(exc).__name__,
            detail,
        )
        return ""
    return str(response.content or "").strip()


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
