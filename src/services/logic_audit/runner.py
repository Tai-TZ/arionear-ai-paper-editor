from __future__ import annotations

import json
import re
import uuid
from typing import Any

from src.services.logic_audit.debate import (
    load_debate_roles,
    multi_perspective_generate,
    synthesize_perspectives,
)
from src.services.logic_audit.schemas import LogicAuditReport
from src.services.prompts import format_sections_summary, get_prompt, render_user_prompt


def _extract_json_object(text: str) -> dict[str, Any] | None:
    text = (text or "").strip()
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


async def run_logic_audit(
    *,
    latex: str,
    sections: list[dict],
    query: str,
    provider: str | None,
    model: str | None,
    max_sections: int = 4,
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
    audit_sections: list[dict[str, Any]] = []
    targets = [s for s in sections if (s.get("content") or "").strip()][:max_sections]

    if not targets and latex.strip():
        targets = [{"name": "Document", "content": latex[:8000]}]

    synth_system = get_prompt("logic_synthesize", "system")
    synth_user = get_prompt("logic_synthesize", "user")

    for section in targets:
        section_name = str(section.get("name") or "Section")
        section_text = str(section.get("content") or "")[:6000]
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
        )
        if not perspectives:
            continue

        raw = await synthesize_perspectives(
            perspectives,
            system_template=synth_system,
            user_template=synth_user,
            variables=variables,
            provider=provider,
            model=model,
        )
        payload = _extract_json_object(raw) or {}
        audit_sections.append(_normalize_section_payload(payload, section_name))

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
            devil = roles.get("devil_advocate")
            if devil:
                perspectives = await multi_perspective_generate(
                    {"devil_advocate": devil},
                    cross_variables,
                    provider=provider,
                    model=model,
                )
                if perspectives.get("devil_advocate"):
                    cross_section.append(
                        {
                            "type": "abstract_vs_conclusion",
                            "description": perspectives["devil_advocate"][:800],
                            "spans": [
                                {"section": "Abstract", "text": abs_text[:300]},
                                {"section": "Conclusion", "text": con_text[:300]},
                            ],
                        }
                    )

    total_conflicts = sum(len(s.get("conflicts") or []) for s in audit_sections)
    if not audit_sections and targets:
        return {
            "logic_audit_report": {},
            "response": (
                "Logic audit chưa hoàn thành — model LLM quá chậm hoặc timeout "
                "(thường gặp với NVIDIA MiniMax M3). Thử lại hoặc chọn model nhanh hơn "
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
            "model": model or "",
        },
    )
    response_text = format_report_text(report)
    return {
        "logic_audit_report": report.model_dump(),
        "response": response_text,
        "analysis": f"Logic audit found {total_conflicts} conflict(s).",
    }
