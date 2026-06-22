from __future__ import annotations

import asyncio
import json
import re
import uuid
from typing import Any

from src.services.llm import TOKENROUTER_MINIMAX_M3_MODEL, is_minimax_m3_provider
from src.services.logic_audit.debate import (
    LogicProgressFn,
    LogicReasoningFn,
    _strip_thinking_markup,
    load_debate_roles,
    multi_perspective_generate,
    synthesize_perspectives,
)
from src.services.logic_audit.schemas import LogicAuditReport
from src.services.prompts import format_sections_summary, get_prompt, render_user_prompt


def _extract_json_object(text: str) -> dict[str, Any] | None:
    text = _strip_thinking_markup(text or "").strip()
    if not text:
        return None
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None


def _perspectives_have_substance(perspectives: dict[str, str]) -> bool:
    return any(len(_strip_thinking_markup(text)) > 40 for text in perspectives.values())


def _fallback_from_perspectives(perspectives: dict[str, str], section_name: str) -> dict[str, Any]:
    """When synthesize JSON is empty, turn persona bullets into review items."""
    conflicts: list[dict[str, Any]] = []
    weak: list[str] = []
    seen: set[str] = set()

    for role, raw in perspectives.items():
        text = _strip_thinking_markup(raw)
        for line in text.splitlines():
            line = line.strip()
            line = re.sub(r"^[-*•]\s*", "", line)
            line = re.sub(r"^\d+[.)]\s*", "", line).strip()
            if len(line) < 20:
                continue
            key = line[:120].lower()
            if key in seen:
                continue
            seen.add(key)
            weak.append(line[:500])
            conflicts.append(
                {
                    "id": str(uuid.uuid4()),
                    "type": "unclear_reasoning",
                    "severity": "warning",
                    "claim_text": "",
                    "evidence_text": "",
                    "comment": line[:500],
                    "suggested_action": "clarify",
                    "persona_sources": [role],
                }
            )

    return {
        "section": section_name,
        "conflicts": conflicts[:20],
        "weak_claims": weak[:20],
        "consensus_notes": [],
    }


def _section_issue_count(section: dict[str, Any]) -> int:
    return len(section.get("conflicts") or []) + len(section.get("weak_claims") or [])


def _normalize_section_payload(data: dict[str, Any], section_name: str) -> dict[str, Any]:
    conflicts = data.get("conflicts") or []
    if not isinstance(conflicts, list):
        conflicts = []
    normalized: list[dict[str, Any]] = []
    for item in conflicts:
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "id": str(item.get("id") or uuid.uuid4()),
                "type": item.get("type") or "unclear_reasoning",
                "severity": item.get("severity") or "warning",
                "claim_text": str(item.get("claim_text") or "")[:500],
                "evidence_text": str(item.get("evidence_text") or "")[:500],
                "comment": str(item.get("comment") or "").strip(),
                "suggested_action": item.get("suggested_action") or "none",
                "persona_sources": item.get("persona_sources") or [],
            }
        )
    return {
        "section": section_name,
        "conflicts": normalized,
        "weak_claims": [str(x) for x in (data.get("weak_claims") or []) if x],
        "consensus_notes": [str(x) for x in (data.get("consensus_notes") or []) if x],
    }


def format_report_text(report: LogicAuditReport) -> str:
    lines: list[str] = []
    if report.summary:
        lines.append(report.summary)
        lines.append("")
    for section in report.sections:
        if not section.conflicts and not section.weak_claims:
            continue
        lines.append(f"## {section.section}")
        for conflict in section.conflicts:
            sev = conflict.severity.upper()
            lines.append(f"- [{sev}] {conflict.comment}")
            if conflict.claim_text:
                lines.append(f"  Claim: {conflict.claim_text[:200]}")
        for weak in section.weak_claims:
            lines.append(f"- [WEAK] {weak}")
        lines.append("")
    for cross in report.cross_section_conflicts:
        lines.append(f"- [CROSS] {cross.description}")
    if not lines:
        return "Không phát hiện mâu thuẫn logic rõ ràng trong phạm vi đã quét."
    return "\n".join(lines).strip()


SECTION_CONCURRENCY = 2


async def run_logic_audit(
    *,
    latex: str,
    sections: list[dict],
    query: str,
    provider: str | None,
    model: str | None,
    max_sections: int = 4,
    on_progress: LogicProgressFn | None = None,
    on_reasoning: LogicReasoningFn | None = None,
) -> dict[str, Any]:
    """Multi-agent logic audit — comment-only, no draft mutation."""
    roles = load_debate_roles()
    if not roles:
        return {
            "logic_audit_report": {},
            "response": "Logic audit chưa được cấu hình (thiếu debate_roles trong prompts).",
            "analysis": "missing debate_roles",
        }

    outline = format_sections_summary(sections)
    is_minimax = is_minimax_m3_provider(provider)
    scan_limit = max_sections if is_minimax else max_sections
    section_char_limit = 4500 if is_minimax else 6000
    persona_sequential = is_minimax
    targets = [s for s in sections if (s.get("content") or "").strip()][:scan_limit]

    if not targets and latex.strip():
        targets = [{"name": "Document", "content": latex[:8000]}]

    synth_system = get_prompt("logic_synthesize", "system")
    synth_user = get_prompt("logic_synthesize", "user")

    if on_progress:
        mode = "tuần tự" if persona_sequential else "song song"
        on_progress(
            "logic-plan",
            "Chuẩn bị logic audit",
            f"{len(targets)} phần · {len(roles)} personas · {mode}",
            "active",
        )

    async def _audit_one_section(index: int, section: dict) -> dict[str, Any] | None:
        section_name = str(section.get("name") or "Section")
        section_text = str(section.get("content") or "")[:section_char_limit]
        progress_key = f"s{index}-"
        if on_progress:
            on_progress(
                f"logic-section-{index}",
                f"Quét phần [{index}/{len(targets)}]: {section_name}",
                f"~{len(section_text):,} ký tự".replace(",", "."),
                "active",
            )
        variables = {
            "section_name": section_name,
            "section_text": section_text,
            "manuscript_outline": outline,
            "cross_section_context": outline,
            "query": query,
        }
        perspectives = await multi_perspective_generate(
            roles,
            variables,
            provider=provider,
            model=model,
            on_progress=on_progress,
            on_reasoning=on_reasoning,
            progress_key=progress_key,
            sequential=persona_sequential,
        )
        if not perspectives:
            if on_progress:
                on_progress(
                    f"logic-section-{index}",
                    f"Quét phần [{index}/{len(targets)}]: {section_name}",
                    "Bỏ qua — không có phản hồi persona",
                    "done",
                )
            return None

        raw = await synthesize_perspectives(
            perspectives,
            system_template=synth_system,
            user_template=synth_user,
            variables=variables,
            provider=provider,
            model=model,
            on_progress=on_progress,
            on_reasoning=on_reasoning,
            progress_key=progress_key,
        )
        payload = _extract_json_object(raw) or {}
        normalized = _normalize_section_payload(payload, section_name)
        if _section_issue_count(normalized) == 0 and _perspectives_have_substance(perspectives):
            normalized = _fallback_from_perspectives(perspectives, section_name)
        issue_n = _section_issue_count(normalized)
        if on_progress:
            on_progress(
                f"logic-section-{index}",
                f"Quét phần [{index}/{len(targets)}]: {section_name}",
                f"Hoàn tất · {issue_n} vấn đề",
                "done",
            )
        return normalized

    if on_progress:
        mode = "tuần tự" if persona_sequential else "song song"
        on_progress(
            "logic-plan",
            "Chuẩn bị logic audit",
            f"{len(targets)} phần · {len(roles)} personas · {mode}",
            "done",
        )

    section_concurrency = 1 if is_minimax else SECTION_CONCURRENCY
    sem = asyncio.Semaphore(section_concurrency)

    async def _bounded(index: int, section: dict) -> dict[str, Any] | None:
        async with sem:
            return await _audit_one_section(index, section)

    section_results = await asyncio.gather(
        *[_bounded(index, section) for index, section in enumerate(targets, start=1)]
    )
    audit_sections = [result for result in section_results if result]

    cross_section: list[dict[str, Any]] = []
    abstract = next((s for s in sections if str(s.get("name", "")).lower() == "abstract"), None)
    conclusion = next(
        (s for s in sections if "conclusion" in str(s.get("name", "")).lower()),
        None,
    )
    if abstract and conclusion:
        abs_text = str(abstract.get("content") or "")[:1500]
        con_text = str(conclusion.get("content") or "")[:1500]
        if abs_text and con_text:
            cross_variables = {
                "section_name": "Abstract vs Conclusion",
                "section_text": f"Abstract:\n{abs_text}\n\nConclusion:\n{con_text}",
                "manuscript_outline": outline,
                "cross_section_context": outline,
                "query": query,
            }
            if roles:
                if on_progress:
                    on_progress(
                        "logic-cross",
                        "Kiểm tra Abstract vs Conclusion",
                        "3 personas + tổng hợp",
                        "active",
                    )
                perspectives = await multi_perspective_generate(
                    roles,
                    cross_variables,
                    provider=provider,
                    model=model,
                    on_progress=on_progress,
                    on_reasoning=on_reasoning,
                    progress_key="cross-",
                    sequential=persona_sequential,
                )
                if perspectives:
                    raw = await synthesize_perspectives(
                        perspectives,
                        system_template=synth_system,
                        user_template=synth_user,
                        variables=cross_variables,
                        provider=provider,
                        model=model,
                        on_progress=on_progress,
                        on_reasoning=on_reasoning,
                        progress_key="cross-",
                    )
                    payload = _extract_json_object(raw) or {}
                    cross_payload = _normalize_section_payload(payload, "Abstract vs Conclusion")
                    if _section_issue_count(cross_payload) == 0 and _perspectives_have_substance(
                        perspectives
                    ):
                        cross_payload = _fallback_from_perspectives(
                            perspectives, "Abstract vs Conclusion"
                        )
                    for item in cross_payload.get("conflicts") or []:
                        cross_section.append(
                            {
                                "type": "abstract_vs_conclusion",
                                "description": str(item.get("comment") or "").strip(),
                                "spans": [
                                    {"section": "Abstract", "text": abs_text[:300]},
                                    {"section": "Conclusion", "text": con_text[:300]},
                                ],
                            }
                        )
                    for weak in cross_payload.get("weak_claims") or []:
                        cross_section.append(
                            {
                                "type": "abstract_vs_conclusion",
                                "description": str(weak).strip(),
                                "spans": [
                                    {"section": "Abstract", "text": abs_text[:300]},
                                    {"section": "Conclusion", "text": con_text[:300]},
                                ],
                            }
                        )
                if on_progress:
                    on_progress(
                        "logic-cross",
                        "Kiểm tra Abstract vs Conclusion",
                        f"Hoàn tất · {len(cross_section)} ghi chú",
                        "done",
                    )

    total_conflicts = sum(_section_issue_count(s) for s in audit_sections)
    total_conflicts += len(cross_section)
    if not audit_sections and targets:
        return {
            "logic_audit_report": {},
            "response": (
                "Logic audit chưa hoàn thành — model LLM quá chậm hoặc timeout "
                "(thường gặp với MiniMax M3). Thử lại hoặc chọn model nhanh hơn "
                "(Z.AI GLM / OpenRouter)."
            ),
            "analysis": "Logic audit: all persona calls failed or timed out.",
        }

    report = LogicAuditReport(
        summary=(
            f"Logic audit: {total_conflicts} vấn đề trong {len(audit_sections)} phần "
            f"(comment-only, không tự sửa bản thảo)."
        ),
        sections=audit_sections,  # type: ignore[arg-type]
        cross_section_conflicts=cross_section,  # type: ignore[arg-type]
        meta={
            "personas": list(roles.keys()),
            "sections_scanned": len(audit_sections),
            "provider": provider or "",
            "model": (model if not is_minimax else TOKENROUTER_MINIMAX_M3_MODEL) or "",
            "parallel_sections": section_concurrency,
            "persona_sequential": persona_sequential,
        },
    )
    response_text = format_report_text(report)
    return {
        "logic_audit_report": report.model_dump(),
        "response": response_text,
        "analysis": f"Logic audit found {total_conflicts} conflict(s).",
    }
