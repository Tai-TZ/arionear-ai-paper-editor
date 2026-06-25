from __future__ import annotations

import asyncio
import json
import re
import uuid
from typing import Any

from src.services.llm import TOKENROUTER_MINIMAX_M3_MODEL, is_minimax_m3_provider
from src.services.logic_audit.config import (
    logic_audit_runtime_flags,
    resolve_logic_audit_llm,
    select_logic_targets,
)
from src.services.logic_audit.debate import (
    LogicProgressFn,
    LogicReasoningFn,
    LogicSectionFn,
    _strip_thinking_markup,
    load_combined_logic_role,
    load_debate_roles,
    multi_perspective_generate,
    synthesize_perspectives,
)
from src.services.logic_audit.language import clean_section_display_name, resolve_audit_language
from src.services.logic_audit.schemas import LogicAuditReport
from src.services.prompts import format_sections_summary, get_prompt


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


def _section_issue_count(section: dict[str, Any] | Any) -> int:
    if isinstance(section, dict):
        conflicts = section.get("conflicts") or []
        weak = section.get("weak_claims") or []
    else:
        conflicts = getattr(section, "conflicts", None) or []
        weak = getattr(section, "weak_claims", None) or []
    return len(conflicts) + len(weak)


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



MAX_CONFLICTS_PER_SECTION = 12
MAX_WEAK_PER_SECTION = 5
MAX_CROSS_CONFLICTS = 8

_SEVERITY_RANK = {"critical": 0, "warning": 1, "info": 2}


def _cap_section_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Keep the highest-severity items so UI and LLM output stay bounded."""
    conflicts = list(data.get("conflicts") or [])
    conflicts.sort(
        key=lambda item: (
            _SEVERITY_RANK.get(str(item.get("severity") or "warning"), 9),
            -len(str(item.get("comment") or "")),
        )
    )
    weak = [str(x) for x in (data.get("weak_claims") or []) if x][:MAX_WEAK_PER_SECTION]
    return {
        **data,
        "conflicts": conflicts[:MAX_CONFLICTS_PER_SECTION],
        "weak_claims": weak,
    }


def format_chat_summary(report: LogicAuditReport) -> str:
    """Short chat message — full detail lives in logic_audit_report for the side panel."""
    section_count = len(report.sections)
    total = sum(_section_issue_count(s) for s in report.sections)
    total += len(report.cross_section_conflicts or [])
    if total == 0:
        return (
            "Logic audit hoàn tất — không phát hiện mâu thuẫn logic rõ ràng "
            "trong phạm vi đã quét. Xem tab **Logic Audit** để biết chi tiết."
        )
    return (
        f"Logic audit hoàn tất — **{total}** vấn đề trong **{section_count}** phần "
        f"(comment-only, không tự sửa bản thảo).\n\n"
        "Mở tab **Logic Audit** bên phải để xem danh sách theo từng section."
    )


async def run_logic_audit(
    *,
    latex: str,
    sections: list[dict],
    query: str,
    provider: str | None,
    model: str | None,
    mode: str = "quick",
    scope: str = "selected",
    section_filter: list[str] | None = None,
    chat_provider: str | None = None,
    max_sections: int = 4,
    on_progress: LogicProgressFn | None = None,
    on_reasoning: LogicReasoningFn | None = None,
    on_section_complete: LogicSectionFn | None = None,
) -> dict[str, Any]:
    """Multi-agent logic audit — comment-only, no draft mutation."""
    normalized_mode = (mode or "quick").strip().lower()
    if normalized_mode == "gate":
        from src.services.logic_audit.paper_gate_skim import run_paper_gate_skim

        return await run_paper_gate_skim(
            latex=latex,
            sections=sections,
            query=query,
            provider=provider,
            model=model,
            chat_provider=chat_provider,
            ui_language="Vietnamese",
            on_progress=on_progress,
            on_reasoning=on_reasoning,
        )

    flags = logic_audit_runtime_flags(mode, provider, scope=scope)
    audit_provider, audit_model = resolve_logic_audit_llm(mode, chat_provider or provider)
    provider = audit_provider
    model = model or audit_model
    is_minimax = is_minimax_m3_provider(provider)

    if flags["use_combined_persona"]:
        roles = load_combined_logic_role() or load_debate_roles()
    else:
        roles = load_debate_roles()
    if not roles:
        return {
            "logic_audit_report": {},
            "response": "Logic audit chưa được cấu hình (thiếu debate_roles trong prompts).",
            "analysis": "missing debate_roles",
        }

    outline = format_sections_summary(sections)
    audit_language = resolve_audit_language(query)
    persona_sequential = flags["persona_sequential"]
    section_char_limit = flags["section_char_limit"]
    section_concurrency = flags["section_concurrency"]
    run_cross_section = flags["run_cross_section"]
    targets = select_logic_targets(
        sections,
        mode=mode,
        scope=scope,
        section_filter=section_filter,
        max_sections=flags["max_sections"],
    )

    if not targets and latex.strip():
        cap = section_char_limit if flags["mode"] == "deep" else 6000
        targets = [{"name": "Document", "content": latex[:cap]}]

    synth_system = get_prompt("logic_synthesize", "system")
    synth_user = get_prompt("logic_synthesize", "user")

    mode_label = "Quick" if flags["mode"] == "quick" else "Deep"
    scope_label = "toàn bộ" if flags.get("scope") == "full" else "đã chọn"
    persona_count = len(roles)
    if on_progress:
        parallel = "tuần tự" if persona_sequential else "song song"
        engine = "MiniMax M3" if is_minimax else "fast scan"
        on_progress(
            "logic-plan",
            f"Logic audit · {mode_label}",
            f"{len(targets)} phần ({scope_label}) · {persona_count} persona · {engine} · {parallel}",
            "active",
        )

    async def _audit_one_section(index: int, section: dict) -> dict[str, Any] | None:
        section_name = clean_section_display_name(str(section.get("name") or "Section"))
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
            "audit_language": audit_language,
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
        normalized = _cap_section_payload(normalized)
        issue_n = _section_issue_count(normalized)
        if on_progress:
            on_progress(
                f"logic-section-{index}",
                f"Quét phần [{index}/{len(targets)}]: {section_name}",
                f"Hoàn tất · {issue_n} vấn đề",
                "done",
            )
        if on_section_complete and normalized:
            on_section_complete(normalized)
        return normalized

    if on_progress:
        parallel = "tuần tự" if persona_sequential else "song song"
        engine = "MiniMax M3" if is_minimax else "fast scan"
        on_progress(
            "logic-plan",
            f"Logic audit · {mode_label}",
            f"{len(targets)} phần ({scope_label}) · {persona_count} persona · {engine} · {parallel}",
            "done",
        )

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
    if abstract and conclusion and run_cross_section:
        abs_text = str(abstract.get("content") or "")[:1500]
        con_text = str(conclusion.get("content") or "")[:1500]
        if abs_text and con_text:
            cross_variables = {
                "section_name": "Abstract vs Conclusion",
                "section_text": f"Abstract:\n{abs_text}\n\nConclusion:\n{con_text}",
                "manuscript_outline": outline,
                "cross_section_context": outline,
                "query": query,
                "audit_language": audit_language,
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
                    cross_section = cross_section[:MAX_CROSS_CONFLICTS]
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
            "audit_mode": flags["mode"],
            "audit_scope": flags.get("scope", "selected"),
            "audit_language": audit_language,
        },
    )
    response_text = format_chat_summary(report)
    return {
        "logic_audit_report": report.model_dump(),
        "response": response_text,
        "analysis": f"Logic audit found {total_conflicts} conflict(s).",
    }
