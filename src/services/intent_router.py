from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage

from src.config import LLMProvider
from src.services.llm import get_llm
from src.services.prompts import (
    build_router_system_prompt,
    render_user_prompt,
)

Action = Literal["edit", "style", "structure", "citation", "template", "chat"]
Scope = Literal["document", "selection"]

_VALID_ACTIONS: frozenset[str] = frozenset(
    {"edit", "style", "structure", "citation", "template", "chat"}
)
_VALID_SCOPES: frozenset[str] = frozenset({"document", "selection"})

_STYLE_RE = re.compile(
    r"văn\s*phong|viết\s*lại|polish|tone|học\s*thuật|academic|paraphrase|chỉnh\s*lý|làm\s*mượt|rewrite",
    re.IGNORECASE,
)
_RENAME_EDIT_RE = re.compile(
    r"đổi\s+.+\s+thành|thay\s+.+\s+bằng|sửa\s+.+\s+thành|chỉnh\s+.+\s+thành|"
    r"replace\s+.+\s+with|change\s+.+\s+to",
    re.IGNORECASE,
)
_STRUCTURE_RE = re.compile(
    r"cấu\s*trúc|structure|outline|dàn\s*bài|dan\s*bai|imrad|khung\s*bài|review\s*structure",
    re.IGNORECASE,
)
_CITATION_RE = re.compile(
    r"trích\s*dẫn|citation|bibliography|reference|thư\s*mục\s*phụ\s*lục",
    re.IGNORECASE,
)
_TEMPLATE_RE = re.compile(
    r"khung\s*imrad|tạo\s*khung|dựng\s*khung|template|skeleton",
    re.IGNORECASE,
)


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

    # Style polish first — "chỉnh sửa Abstract cho học thuật hơn" is style, not full-file edit.
    if _STYLE_RE.search(q):
        return IntentResult(action="style", scope="selection" if has_selection else "document")

    if _RENAME_EDIT_RE.search(q):
        return IntentResult(action="edit", scope="selection" if has_selection else "document")

    if re.search(r"chỉnh\s*sửa", q, re.IGNORECASE):
        return IntentResult(action="edit", scope="selection" if has_selection else "document")

    if _CITATION_RE.search(q):
        return IntentResult(action="citation")

    if _TEMPLATE_RE.search(q):
        return IntentResult(action="template")

    if _STRUCTURE_RE.search(q):
        return IntentResult(action="structure")

    if q.endswith("?"):
        return IntentResult(action="chat")

    if has_selection:
        return IntentResult(action="style", scope="selection")

    return IntentResult(action="chat")


def _should_use_fast_intent(query: str, has_latex: bool) -> bool:
    if not has_latex:
        return True
    q = query.strip().lower()
    if q.endswith("?"):
        return True
    if _STYLE_RE.search(q) or _STRUCTURE_RE.search(q) or _CITATION_RE.search(q) or _TEMPLATE_RE.search(q):
        return True
    return bool(
        re.search(
            r"đổi\s+.+\s+thành|thay\s+.+\s+bằng|sửa\s+.+\s+thành|chỉnh\s+.+\s+thành",
            q,
            re.IGNORECASE,
        )
        or re.search(r"replace\s+.+\s+with|change\s+.+\s+to", q, re.IGNORECASE)
        or (_STYLE_RE.search(q) is not None)
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
) -> IntentResult:
    if explicit_task and explicit_task != "chat":
        scope: Scope = (
            "selection"
            if has_selection and explicit_task in ("style", "edit")
            else "document"
        )
        return IntentResult(action=explicit_task, scope=scope)  # type: ignore[arg-type]

    from src.config import get_settings

    if get_settings().app_env == "test":
        return _fallback_intent(query, has_latex, has_selection)

    if _should_use_fast_intent(query, has_latex):
        return _fallback_intent(query, has_latex, has_selection)

    system = build_router_system_prompt()
    if not system.strip():
        return _fallback_intent(query, has_latex, has_selection)

    context = render_user_prompt(
        "router",
        query=query.strip(),
        has_latex=str(has_latex).lower(),
        has_selection=str(has_selection).lower(),
    )
    if not context:
        context = (
            f"User message:\n{query.strip()}\n\n"
            f"Editor context:\n"
            f"- manuscript_open: {has_latex}\n"
            f"- text_selected: {has_selection}\n"
        )

    llm = get_llm(provider=provider, model=model, temperature=0)
    try:
        response = await llm.ainvoke(
            [
                SystemMessage(content=system),
                HumanMessage(content=context),
            ]
        )
    except Exception:
        return _fallback_intent(query, has_latex, has_selection)

    parsed = parse_intent_payload(str(response.content or ""))
    if parsed:
        if parsed.action in ("edit", "style", "template") and not has_latex:
            return IntentResult(action="chat")
        if parsed.scope == "selection" and not has_selection:
            return IntentResult(action=parsed.action, scope="document")
        return parsed

    return _fallback_intent(query, has_latex, has_selection)
