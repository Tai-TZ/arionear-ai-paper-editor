from __future__ import annotations

import asyncio
import json
import re
from typing import Literal

from src.config import LLMProvider, get_settings
from src.services.editor_llm import resolve_editor_aux_llm
from src.services.intent_rules import (
    _CITATION_RE,
    _LOGIC_RE,
    _RENAME_EDIT_RE,
    _STRUCTURE_RE,
    _STYLE_RE,
    _TEMPLATE_RE,
    _TITLE_EDIT_RE,
    IntentResult,
    fallback_intent,
    infer_followup_intent,
    is_casual_chat,
    looks_like_edit_followup,
)
from src.services.prompts import (
    build_router_system_prompt,
    render_user_prompt,
)

Action = Literal["edit", "style", "structure", "logic", "citation", "template", "chat"]
Scope = Literal["document", "selection"]

_VALID_ACTIONS: frozenset[str] = frozenset(
    {"edit", "style", "structure", "logic", "citation", "template", "chat"}
)
_VALID_SCOPES: frozenset[str] = frozenset({"document", "selection"})

ROUTER_LLM_TIMEOUT_SEC = 20.0

# Backward-compatible alias for tests and internal callers
_fallback_intent = fallback_intent
_is_casual_chat = is_casual_chat


def parse_intent_payload(raw: str) -> IntentResult | None:
    text = (raw or "").strip()
    if not text:
        return None

    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[^{}]*\}", text, re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None

    if not isinstance(data, dict):
        return None

    action = str(data.get("action", "chat")).lower().strip()
    scope = str(data.get("scope", "document")).lower().strip()

    if action not in _VALID_ACTIONS:
        return None
    if scope not in _VALID_SCOPES:
        scope = "document"

    return IntentResult(action=action, scope=scope)  # type: ignore[arg-type]


def _should_use_fast_intent(
    query: str,
    has_latex: bool,
    conversation_history: list | None = None,
) -> bool:
    if not has_latex:
        return True
    if is_casual_chat(query):
        return True
    if looks_like_edit_followup(query, conversation_history):
        return True
    q = query.strip().lower()
    if q.endswith("?"):
        return True
    if (
        _STYLE_RE.search(q)
        or _STRUCTURE_RE.search(q)
        or _LOGIC_RE.search(q)
        or _CITATION_RE.search(q)
        or _TEMPLATE_RE.search(q)
    ):
        return True
    if _TITLE_EDIT_RE.search(q):
        return True
    return bool(
        _RENAME_EDIT_RE.search(q)
        or re.search(r"chỉnh\s*sửa", q, re.IGNORECASE)
    )


async def classify_intent(
    query: str,
    *,
    has_latex: bool,
    has_selection: bool,
    explicit_task: str | None = None,
    provider: LLMProvider | None = None,
    model: str | None = None,
    conversation_history: list | None = None,
) -> IntentResult:
    from langchain_core.messages import HumanMessage, SystemMessage

    from src.services.chat_context import format_conversation_history_for_router
    from src.services.guardrails.prompt_injection import wrap_untrusted_user_text
    from src.services.llm import extract_llm_text, get_llm

    if explicit_task == "chat":
        return IntentResult(action="chat")

    if explicit_task and explicit_task != "chat":
        scope: Scope = (
            "selection"
            if has_selection and explicit_task in ("style", "edit")
            else "document"
        )
        return IntentResult(action=explicit_task, scope=scope)  # type: ignore[arg-type]

    followup = infer_followup_intent(
        query,
        conversation_history,
        has_selection=has_selection,
    )
    if followup:
        return followup

    settings = get_settings()
    if settings.app_env == "test":
        return fallback_intent(query, has_latex, has_selection)

    if _should_use_fast_intent(query, has_latex, conversation_history):
        return fallback_intent(query, has_latex, has_selection)

    system = build_router_system_prompt()
    if not system.strip():
        return fallback_intent(query, has_latex, has_selection)

    history_block = format_conversation_history_for_router(conversation_history or [])
    wrapped_query = wrap_untrusted_user_text(query.strip())
    context = render_user_prompt(
        "router",
        query=wrapped_query,
        has_latex=str(has_latex).lower(),
        has_selection=str(has_selection).lower(),
    )
    if not context:
        context = (
            f"User message:\n{wrapped_query}\n\n"
            f"Editor context:\n"
            f"- manuscript_open: {has_latex}\n"
            f"- text_selected: {has_selection}\n"
        )
    if history_block:
        context = history_block + context

    router_provider, router_model = resolve_editor_aux_llm()

    llm = get_llm(provider=router_provider, model=router_model, temperature=0)
    try:
        response = await asyncio.wait_for(
            llm.ainvoke(
                [
                    SystemMessage(content=system),
                    HumanMessage(content=context),
                ]
            ),
            timeout=ROUTER_LLM_TIMEOUT_SEC,
        )
    except Exception:
        return fallback_intent(query, has_latex, has_selection)

    parsed = parse_intent_payload(extract_llm_text(response))
    if parsed:
        if parsed.action in ("edit", "style", "template") and not has_latex:
            return IntentResult(action="chat")
        if parsed.scope == "selection" and not has_selection:
            return IntentResult(action=parsed.action, scope="document")
        return parsed

    return fallback_intent(query, has_latex, has_selection)
