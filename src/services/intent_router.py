from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage

from src.config import LLMProvider
from src.services.llm import get_llm
from src.services.prompts import get_prompt

Action = Literal["edit", "style", "structure", "citation", "template", "chat"]
Scope = Literal["document", "selection"]

_VALID_ACTIONS: frozenset[str] = frozenset(
    {"edit", "style", "structure", "citation", "template", "chat"}
)
_VALID_SCOPES: frozenset[str] = frozenset({"document", "selection"})


@dataclass(frozen=True)
class IntentResult:
    action: Action
    scope: Scope = "document"


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


def _fallback_intent(query: str, has_latex: bool, has_selection: bool) -> IntentResult:
    q = query.strip().lower()
    if not has_latex:
        return IntentResult(action="chat")

    if q.endswith("?"):
        return IntentResult(action="chat")

    if has_selection:
        return IntentResult(action="edit", scope="selection")

    return IntentResult(action="edit", scope="document")


async def classify_intent(
    query: str,
    *,
    has_latex: bool,
    has_selection: bool,
    explicit_task: str | None = None,
    provider: LLMProvider | None = None,
    model: str | None = None,
) -> IntentResult:
    if explicit_task and explicit_task != "chat":
        scope: Scope = "selection" if has_selection and explicit_task == "style" else "document"
        return IntentResult(action=explicit_task, scope=scope)  # type: ignore[arg-type]

    system = get_prompt("router", "system")
    if not system:
        return _fallback_intent(query, has_latex, has_selection)

    context = (
        f"User message:\n{query.strip()}\n\n"
        f"Editor context:\n"
        f"- manuscript_open: {has_latex}\n"
        f"- text_selected: {has_selection}\n"
    )

    llm = get_llm(provider=provider, model=model, temperature=0)
    response = await llm.ainvoke(
        [
            SystemMessage(content=system),
            HumanMessage(content=context),
        ]
    )
    parsed = parse_intent_payload(str(response.content or ""))
    if parsed:
        if parsed.action in ("edit", "style", "template") and not has_latex:
            return IntentResult(action="chat")
        if parsed.scope == "selection" and not has_selection:
            return IntentResult(action=parsed.action, scope="document")
        return parsed

    return _fallback_intent(query, has_latex, has_selection)
