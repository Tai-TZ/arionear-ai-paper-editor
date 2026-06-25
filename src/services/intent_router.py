from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage

from src.config import LLMProvider, get_settings, normalize_llm_provider
from src.services.llm import get_llm, is_reasoning_model
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

_STYLE_RE = re.compile(
    r"văn\s*phong|viết\s*lại|polish|tone|học\s*thuật|academic|paraphrase|chỉnh\s*lý|làm\s*mượt|rewrite",
    re.IGNORECASE,
)
_RENAME_EDIT_RE = re.compile(
    r"đổi\s+.+\s+thành|đổi\s+.+\s+sang|đổi\s+.+\s+từ\s+.+\s+sang|"
    r"thay\s+.+\s+bằng|sửa\s+.+\s+thành|chỉnh\s+.+\s+thành|"
    r"replace\s+.+\s+with|change\s+.+\s+to",
    re.IGNORECASE,
)
_STRUCTURE_RE = re.compile(
    r"cấu\s*trúc|structure|outline|dàn\s*bài|dan\s*bai|imrad|khung\s*bài|review\s*structure",
    re.IGNORECASE,
)
_LOGIC_RE = re.compile(
    r"kiểm\s*tra\s*logic|logic\s*check|consistency|mâu\s*thuẫn|contradiction|"
    r"logic\s*audit|nhất\s*quán|weak\s*claim|lỗ\s*hổng\s*lập\s*luận",
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
_GREETING_CHAT_RE = re.compile(
    r"^(?:hi|hello|hey|chào|xin\s*chào|hú|hí|yo|"
    r"thanks|thank\s+you|cảm\s*ơn|ok|okay|oke)[\s!.?]*$",
    re.IGNORECASE,
)
_CONVERSATIONAL_CHAT_RE = re.compile(
    r"bạn\s+là\s+ai|ban\s+la\s+ai|who\s+are\s+you|"
    r"what(?:'s|\s+is)\s+your\s+name|tên\s+bạn\s+là\s+gì|"
    r"what\s+can\s+you\s+do|bạn\s+làm\s+được\s+gì|giúp\s+đỡ|help\s+me",
    re.IGNORECASE,
)
ROUTER_LLM_TIMEOUT_SEC = 20.0


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


def _is_casual_chat(query: str) -> bool:
    q = query.strip()
    if not q:
        return True
    if _GREETING_CHAT_RE.match(q):
        return True
    return _CONVERSATIONAL_CHAT_RE.search(q) is not None


def _fallback_intent(query: str, has_latex: bool, has_selection: bool) -> IntentResult:
    q = query.strip().lower()
    if not has_latex:
        return IntentResult(action="chat")

    if _is_casual_chat(query):
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

    if _LOGIC_RE.search(q):
        return IntentResult(action="logic")

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
    if _is_casual_chat(query):
        return True
    q = query.strip().lower()
    if q.endswith("?"):
        return True
    if _STYLE_RE.search(q) or _STRUCTURE_RE.search(q) or _LOGIC_RE.search(q) or _CITATION_RE.search(q) or _TEMPLATE_RE.search(q):
        return True
    return bool(
        re.search(
            r"đổi\s+.+\s+thành|đổi\s+.+\s+sang|đổi\s+.+\s+từ\s+.+\s+sang|"
            r"thay\s+.+\s+bằng|sửa\s+.+\s+thành|chỉnh\s+.+\s+thành",
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
    if explicit_task == "chat":
        return IntentResult(action="chat")

    if explicit_task and explicit_task != "chat":
        scope: Scope = (
            "selection"
            if has_selection and explicit_task in ("style", "edit")
            else "document"
        )
        return IntentResult(action=explicit_task, scope=scope)  # type: ignore[arg-type]

    settings = get_settings()
    if settings.app_env == "test":
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

    router_provider = normalize_llm_provider(provider or settings.llm_provider) or settings.llm_provider
    router_model = model
    if router_provider == "openrouter" and (not model or is_reasoning_model(model)):
        router_model = settings.openrouter_logic_audit_quick_model

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
        return _fallback_intent(query, has_latex, has_selection)

    parsed = parse_intent_payload(str(response.content or ""))
    if parsed:
        if parsed.action in ("edit", "style", "template") and not has_latex:
            return IntentResult(action="chat")
        if parsed.scope == "selection" and not has_selection:
            return IntentResult(action=parsed.action, scope="document")
        return parsed

    return _fallback_intent(query, has_latex, has_selection)
