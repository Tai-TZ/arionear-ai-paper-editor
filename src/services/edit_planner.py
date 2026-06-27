from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from typing import Literal

from src.config import LLMProvider, get_settings, normalize_llm_provider
from src.services.latex_outline import ManuscriptOutline
from src.services.parser.latex import find_section_for_query
from src.services.prompts import build_system_prompt, render_user_prompt

TargetType = Literal["latex_command", "section", "selection", "substring", "document"]
Operation = Literal["replace_body", "replace_substring", "replace_snippet"]

PLANNER_TIMEOUT_SEC = 20.0

_TITLE_HINTS = re.compile(
    r"tiêu đề|title|đề\s*tài|tên\s*(?:đề\s*)?tài|paper\s*title|project\s*title",
    re.IGNORECASE,
)
_AUTHOR_HINTS = re.compile(
    r"tác\s*giả|author|đổi\s+tên\s+(?:tác\s*giả|người)|thay\s+author",
    re.IGNORECASE,
)
_DOCUMENT_HINTS = re.compile(
    r"toàn\s*bộ|cả\s*bài|whole\s*document|entire\s*(file|document|manuscript)|main\.tex",
    re.IGNORECASE,
)
_MODEL_RE = re.compile(r"efficientnet\s*v?\s*(\d+)", re.IGNORECASE)


@dataclass(frozen=True)
class EditPlan:
    target_type: TargetType
    target_id: str = ""
    operation: Operation = "replace_snippet"
    find: str = ""
    replace: str = ""
    new_body: str = ""
    confidence: float = 1.0
    label: str = ""

    def scope_label(self) -> str:
        if self.label:
            return self.label
        if self.target_type == "latex_command":
            return f"Tiêu đề · \\{self.target_id}{{...}}" if self.target_id == "title" else (
                f"\\{self.target_id}{{...}}"
            )
        if self.target_type == "section" and self.target_id:
            return f"Phần {self.target_id}"
        if self.target_type == "selection":
            return "Đoạn đã chọn"
        if self.target_type == "document":
            return "Toàn bộ main.tex"
        return "Phạm vi chỉnh sửa"


def _normalize_model(text: str) -> str:
    return re.sub(
        r"efficientnet\s*v?\s*(\d+)",
        lambda m: f"EfficientNetV{m.group(1)}",
        text,
        flags=re.IGNORECASE,
    )


def _model_in_query(query: str) -> str | None:
    match = _MODEL_RE.search(query)
    if not match:
        return None
    return _normalize_model(match.group(0))


def parse_edit_plan_payload(raw: str) -> EditPlan | None:
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

    target_type = str(data.get("target_type", "")).strip().lower()
    if target_type not in {"latex_command", "section", "selection", "substring", "document"}:
        return None

    operation = str(data.get("operation", "replace_snippet")).strip().lower()
    if operation not in {"replace_body", "replace_substring", "replace_snippet"}:
        operation = "replace_snippet"

    confidence = data.get("confidence", 1.0)
    try:
        confidence_f = float(confidence)
    except (TypeError, ValueError):
        confidence_f = 0.5

    return EditPlan(
        target_type=target_type,  # type: ignore[arg-type]
        target_id=str(data.get("target_id", "")).strip(),
        operation=operation,  # type: ignore[arg-type]
        find=str(data.get("find", "")).strip(),
        replace=str(data.get("replace", "")).strip(),
        new_body=str(data.get("new_body", "")).strip(),
        confidence=confidence_f,
        label=str(data.get("label", "")).strip(),
    )


def infer_edit_plan_rules(
    query: str,
    outline: ManuscriptOutline,
    *,
    has_selection: bool,
) -> EditPlan | None:
    if has_selection:
        return EditPlan(
            target_type="selection",
            operation="replace_snippet",
            confidence=1.0,
            label="Đoạn đã chọn",
        )

    if _DOCUMENT_HINTS.search(query):
        return EditPlan(
            target_type="document",
            operation="replace_snippet",
            confidence=0.9,
            label="Toàn bộ main.tex",
        )

    # Title / đề tài — highest priority; never fall through to document.
    if _TITLE_HINTS.search(query):
        title_cmd = outline.get_command("title")
        new_model = _model_in_query(query)
        if title_cmd and new_model:
            old_model_match = _MODEL_RE.search(title_cmd.preview) or _MODEL_RE.search(
                title_cmd.full_text
            )
            if old_model_match:
                return EditPlan(
                    target_type="latex_command",
                    target_id="title",
                    operation="replace_substring",
                    find=_normalize_model(old_model_match.group(0)),
                    replace=new_model,
                    confidence=0.99,
                    label="Tiêu đề · \\title{...}",
                )
        if title_cmd:
            return EditPlan(
                target_type="latex_command",
                target_id="title",
                operation="replace_snippet",
                confidence=0.95,
                label="Tiêu đề · \\title{...}",
            )
        # Outline missed \\title — still target title command in source.
        return EditPlan(
            target_type="latex_command",
            target_id="title",
            operation="replace_snippet",
            confidence=0.9,
            label="Tiêu đề · \\title{...}",
        )

    author_cmd = outline.get_command("author")
    if author_cmd and _AUTHOR_HINTS.search(query):
        return EditPlan(
            target_type="latex_command",
            target_id="author",
            operation="replace_snippet",
            confidence=0.85,
            label="Tác giả · \\author{...}",
        )

    # rename patterns: đổi X thành Y / từ X sang Y
    rename = re.search(
        r"(?:đổi|thay|sửa|chỉnh|replace|change)\s+(.+?)\s+(?:thành|sang|bằng|with|to)\s+(.+)",
        query,
        re.IGNORECASE,
    )
    if rename:
        old_text = rename.group(1).strip()
        new_text = rename.group(2).strip()
        if old_text and new_text and len(old_text) < 80:
            return EditPlan(
                target_type="substring",
                operation="replace_substring",
                find=old_text,
                replace=new_text,
                confidence=0.8,
                label=f"Thay '{old_text[:40]}'",
            )

    section_dicts = [
        {"name": sec.name, "content": sec.preview, "kind": sec.kind}
        for sec in outline.sections
    ]
    matched = find_section_for_query(query, section_dicts)
    if matched:
        return EditPlan(
            target_type="section",
            target_id=str(matched.get("name", "")),
            operation="replace_snippet",
            confidence=0.8,
            label=f"Phần {matched.get('name', '')}",
        )

    return None


async def plan_edit(
    query: str,
    outline: ManuscriptOutline,
    *,
    has_selection: bool,
    provider: LLMProvider | None = None,
    model: str | None = None,
) -> EditPlan:
    from langchain_core.messages import HumanMessage, SystemMessage

    from src.services.llm import get_llm

    ruled = infer_edit_plan_rules(query, outline, has_selection=has_selection)
    if ruled and (ruled.target_type != "document" or ruled.confidence >= 0.9):
        return ruled

    settings = get_settings()
    if settings.app_env == "test":
        return ruled or EditPlan(
            target_type="latex_command",
            target_id="title",
            operation="replace_snippet",
            confidence=0.5,
            label="Tiêu đề · \\title{...}",
        )

    system = build_system_prompt("edit_planner")
    if not system.strip():
        return ruled or EditPlan(
            target_type="document",
            operation="replace_snippet",
            confidence=0.3,
        )

    context = render_user_prompt(
        "edit_planner",
        query=query.strip(),
        has_selection=str(has_selection).lower(),
        outline=outline.to_planner_json(),
    )
    if not context:
        context = (
            f"User request:\n{query.strip()}\n\n"
            f"text_selected: {has_selection}\n\n"
            f"Manuscript outline:\n{outline.to_planner_json()}"
        )

    router_provider = normalize_llm_provider(provider or settings.llm_provider) or settings.llm_provider
    planner_model = model
    if router_provider == "openrouter":
        planner_model = settings.openrouter_logic_audit_quick_model

    llm = get_llm(provider=router_provider, model=planner_model, temperature=0)
    try:
        response = await asyncio.wait_for(
            llm.ainvoke(
                [
                    SystemMessage(content=system),
                    HumanMessage(content=context),
                ]
            ),
            timeout=PLANNER_TIMEOUT_SEC,
        )
    except Exception:
        return ruled or EditPlan(
            target_type="document",
            operation="replace_snippet",
            confidence=0.3,
        )

    parsed = parse_edit_plan_payload(str(response.content or ""))
    if parsed and parsed.confidence >= 0.5:
        if _TITLE_HINTS.search(query) and parsed.target_type == "document":
            return ruled or EditPlan(
                target_type="latex_command",
                target_id="title",
                operation="replace_snippet",
                confidence=0.9,
                label="Tiêu đề · \\title{...}",
            )
        if not parsed.label:
            return EditPlan(
                target_type=parsed.target_type,
                target_id=parsed.target_id,
                operation=parsed.operation,
                find=parsed.find,
                replace=parsed.replace,
                new_body=parsed.new_body,
                confidence=parsed.confidence,
                label=parsed.scope_label(),
            )
        return parsed

    return ruled or EditPlan(
        target_type="latex_command",
        target_id="title",
        operation="replace_snippet",
        confidence=0.5,
        label="Tiêu đề · \\title{...}",
    )
