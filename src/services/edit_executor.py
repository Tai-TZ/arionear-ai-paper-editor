from __future__ import annotations

import re
import uuid
from dataclasses import dataclass

from langchain_core.messages import HumanMessage, SystemMessage

from src.services.edit_planner import EditPlan, infer_edit_plan_rules
from src.services.chat_context import prepend_conversation_history
from src.services.guardrails.output_sanitize import clamp_selection_replacement
from src.services.latex_outline import (
    build_manuscript_outline,
    find_latex_command_block,
    find_section_span,
)
from src.services.llm import get_llm, resolve_heavy_edit_model
from src.services.llm_policy import resolve_llm_temperature
from src.services.prompts import build_system_prompt, render_user_prompt

_METADATA_LABELS = {
    "title": "Tiêu đề · \\title{...}",
    "author": "Tác giả · \\author{...}",
    "abstract": "Abstract · \\begin{abstract}",
}


@dataclass(frozen=True)
class ResolvedEdit:
    start: int
    end: int
    original_text: str
    section: str
    apply_mode: str
    label: str


def resolve_edit_plan(
    latex: str,
    plan: EditPlan,
    *,
    selection: str = "",
    selection_start: int | None = None,
    selection_end: int | None = None,
) -> ResolvedEdit | None:
    label = plan.scope_label()

    if plan.target_type == "selection":
        if (
            selection_start is not None
            and selection_end is not None
            and selection_end > selection_start
            and selection_end <= len(latex)
        ):
            snippet = latex[selection_start:selection_end]
            return ResolvedEdit(
                selection_start,
                selection_end,
                snippet,
                section="selection",
                apply_mode="selection",
                label="Đoạn đã chọn",
            )
        if selection and selection in latex:
            idx = latex.index(selection)
            return ResolvedEdit(
                idx,
                idx + len(selection),
                selection,
                section="selection",
                apply_mode="selection",
                label="Đoạn đã chọn",
            )
        return None

    if plan.target_type == "latex_command" and plan.target_id:
        block = find_latex_command_block(latex, plan.target_id)
        if block:
            full, _, start, end = block
            section = plan.target_id.lower()
            return ResolvedEdit(
                start,
                end,
                full,
                section=section,
                apply_mode="selection",
                label=_METADATA_LABELS.get(section, label),
            )
        return None

    if plan.target_type == "section" and plan.target_id:
        span = find_section_span(latex, plan.target_id)
        if span:
            start, end, content = span
            return ResolvedEdit(
                start,
                end,
                content,
                section=plan.target_id,
                apply_mode="selection",
                label=f"Phần {plan.target_id}",
            )
        return None

    if plan.target_type == "substring" and plan.find:
        lower_latex = latex.lower()
        lower_find = plan.find.lower()
        idx = lower_latex.find(lower_find)
        if idx >= 0:
            end = idx + len(plan.find)
            return ResolvedEdit(
                idx,
                end,
                latex[idx:end],
                section="",
                apply_mode="selection",
                label=label or f"Thay '{plan.find[:40]}'",
            )
        return None

    if plan.target_type == "document":
        return ResolvedEdit(
            0,
            len(latex),
            latex,
            section="",
            apply_mode="document",
            label="Toàn bộ main.tex",
        )

    return None


def _apply_substring(original: str, find: str, replace: str) -> str | None:
    if not find or not replace:
        return None
    if find in original:
        return original.replace(find, replace, 1)
    lower_orig = original.lower()
    lower_find = find.lower()
    if lower_find in lower_orig:
        idx = lower_orig.index(lower_find)
        return original[:idx] + replace + original[idx + len(find) :]
    return None


def _rebuild_command(command: str, inner: str, original_block: str) -> str:
    optional = re.match(
        rf"(\\{re.escape(command)}(?:\s*\[[^\]]*\])?)\s*{{)",
        original_block,
        re.IGNORECASE | re.DOTALL,
    )
    if optional:
        return f"{optional.group(1)}{inner}}}"
    return f"\\{command}{{{inner}}}"


def apply_plan_to_snippet(plan: EditPlan, original: str) -> str | None:
    if plan.operation == "replace_substring":
        applied = _apply_substring(original, plan.find, plan.replace)
        if applied is not None:
            return applied

    if plan.operation == "replace_body" and plan.new_body:
        if plan.target_type == "latex_command" and plan.target_id:
            block = re.match(
                rf"(\\{re.escape(plan.target_id)}(?:\s*\[[^\]]*\])?)\s*{{)(.*)(}}\s*)$",
                original,
                re.IGNORECASE | re.DOTALL,
            )
            if block:
                return f"{block.group(1)}{plan.new_body}{block.group(3)}"
        return plan.new_body

    return None


def _validate_latex_document_structure(original: str, replacement: str) -> str | None:
    """Block replacements that would corrupt a full .tex manuscript."""
    orig = original.strip()
    repl = replacement.strip()
    if not repl:
        return "Kết quả chỉnh sửa trống — đã chặn."

    orig_has_begin = bool(re.search(r"\\begin\{document\}", orig, re.IGNORECASE))
    repl_has_begin = bool(re.search(r"\\begin\{document\}", repl, re.IGNORECASE))
    if orig_has_begin and not repl_has_begin:
        return "Bản thảo sau chỉnh sửa thiếu \\begin{document} — đã chặn."

    if orig_has_begin:
        if len(re.findall(r"\\end\{document\}", repl, re.IGNORECASE)) != 1:
            return "Cấu trúc \\end{document} không hợp lệ — đã chặn."
        begin_match = re.search(r"\\begin\{document\}", repl, re.IGNORECASE)
        if begin_match:
            tail = repl[begin_match.end() :]
            if re.search(r"\\documentclass\b", tail, re.IGNORECASE):
                return "\\documentclass nằm sau \\begin{document} — đã chặn."
        if len(re.findall(r"\\documentclass\b", repl, re.IGNORECASE)) > 1:
            return "Nhiều lệnh \\documentclass — đã chặn."

    min_len = max(80, int(len(orig) * 0.45))
    if len(repl) < min_len:
        return (
            "Kết quả chỉnh sửa quá ngắn so với bản gốc — có thể bị cắt mất nội dung. "
            "Hãy thu hẹp phạm vi (một section hoặc đoạn đã chọn)."
        )

    return None


def validate_proposed_edit(
    latex: str,
    plan: EditPlan,
    resolved: ResolvedEdit,
    replacement: str,
    *,
    query: str = "",
) -> str | None:
    if not replacement or replacement == resolved.original_text:
        return "Không phát hiện thay đổi nào trong bản thảo."

    span_ratio = (resolved.end - resolved.start) / max(len(latex), 1)
    if plan.target_type == "latex_command" and span_ratio > 0.6:
        return "Phạm vi chỉnh sửa quá rộng cho một lệnh LaTeX."

    if plan.target_type != "document":
        leaked = "\\documentclass" in replacement or "\\begin{document}" in replacement
        if leaked:
            return "Model trả về nội dung ngoài phạm vi — đã chặn."

    if plan.target_type == "latex_command" and resolved.end - resolved.start > 4000:
        return "Khối lệnh LaTeX quá lớn — cần thu hẹp phạm vi."

    if (
        query
        and re.search(r"tiêu đề|title|đề\s*tài", query, re.IGNORECASE)
        and plan.target_type == "document"
        and span_ratio > 0.2
    ):
        return "Yêu cầu liên quan tiêu đề nhưng phạm vi là cả file — đã chặn."

    if resolved.apply_mode == "document" or plan.target_type == "document":
        structural = _validate_latex_document_structure(latex, replacement)
        if structural:
            return structural

    return None


async def execute_edit_plan(
    query: str,
    latex: str,
    plan: EditPlan,
    resolved: ResolvedEdit,
    *,
    provider: str | None,
    model: str | None,
    conversation_history: list | None = None,
) -> str:
    deterministic = apply_plan_to_snippet(plan, resolved.original_text)
    if deterministic and deterministic != resolved.original_text:
        return deterministic

    edit_model = resolve_heavy_edit_model(
        model,
        text_chars=len(resolved.original_text),
        apply_mode=resolved.apply_mode,
    )
    llm = get_llm(
        provider=provider,
        model=edit_model,
        temperature=resolve_llm_temperature(0.1),
    )
    system = build_system_prompt("edit")
    user_content = render_user_prompt(
        "edit",
        query=query,
        original_text=resolved.original_text,
    ) or (
        f"Edit request: {query}\n\n"
        f"Replace ONLY this LaTeX snippet (return the revised snippet only):\n---\n"
        f"{resolved.original_text}\n---"
    )
    user_content = prepend_conversation_history(user_content, conversation_history or [])
    response = await llm.ainvoke(
        [
            SystemMessage(content=system),
            HumanMessage(content=user_content),
        ]
    )
    raw = (response.content or "").strip()
    suggestion = clamp_selection_replacement(
        resolved.original_text,
        raw,
        apply_mode=resolved.apply_mode,
        query=query,
    )
    return suggestion


def preview_edit_scope(
    query: str,
    latex: str,
    *,
    selection: str = "",
) -> tuple[str, str]:
    outline = build_manuscript_outline(latex)
    plan = infer_edit_plan_rules(query, outline, has_selection=bool(selection.strip()))
    if not plan:
        return "", "Toàn bộ main.tex"
    resolved = resolve_edit_plan(latex, plan, selection=selection)
    if resolved:
        return resolved.section, resolved.label
    return "", plan.scope_label()


def build_edit_payload(
    resolved: ResolvedEdit,
    replacement: str,
    *,
    description: str = "Proposed edit",
    file: str = "main.tex",
) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "file": file or "main.tex",
        "section": resolved.section,
        "apply_mode": resolved.apply_mode,
        "original_text": resolved.original_text,
        "replacement_text": replacement,
        "description": description,
        "selection_start": resolved.start,
        "selection_end": resolved.end,
    }


# Late import removed — infer_edit_plan_rules imported at top

