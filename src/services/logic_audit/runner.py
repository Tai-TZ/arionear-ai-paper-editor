from __future__ import annotations

import asyncio
import contextlib
import json
import re
import uuid
from typing import Any

from src.services.logic_audit.config import (
    logic_audit_engine_label,
    logic_audit_runtime_flags,
    resolve_logic_audit_llm,
    select_logic_targets,
    split_section_text,
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
from src.services.logic_audit.text_utils import infer_claim_text
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
                    "claim_text": infer_claim_text(line),
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
        claim = infer_claim_text(
            str(item.get("comment") or "").strip(),
            str(item.get("claim_text") or ""),
        )
        normalized.append(
            {
                "id": str(item.get("id") or uuid.uuid4()),
                "type": item.get("type") or "unclear_reasoning",
                "severity": item.get("severity") or "warning",
                "claim_text": claim,
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


def merge_section_audit_payloads(
    payloads: list[dict[str, Any]],
    section_name: str,
) -> dict[str, Any]:
    """Merge chunk-level audit payloads for one section, deduplicating issues."""
    merged: dict[str, Any] = {
        "section": section_name,
        "conflicts": [],
        "weak_claims": [],
        "consensus_notes": [],
    }
    seen: set[str] = set()
    for payload in payloads:
        for note in payload.get("consensus_notes") or []:
            key = str(note)[:120].lower()
            if key in seen:
                continue
            seen.add(key)
            merged["consensus_notes"].append(str(note))
        for item in payload.get("conflicts") or []:
            if not isinstance(item, dict):
                continue
            key = str(item.get("comment") or item.get("claim_text") or "")[:120].lower()
            if not key or key in seen:
                continue
            seen.add(key)
            merged["conflicts"].append(item)
        for weak in payload.get("weak_claims") or []:
            key = str(weak)[:120].lower()
            if not key or key in seen:
                continue
            seen.add(key)
            merged["weak_claims"].append(str(weak))
    return _cap_section_payload(merged)


def upsert_partial_section(sections: list[dict[str, Any]], section: dict[str, Any]) -> list[dict[str, Any]]:
    """Replace or append a section in a partial audit section list."""
    section_name = section.get("section")
    idx = next((i for i, item in enumerate(sections) if item.get("section") == section_name), -1)
    if idx >= 0:
        sections[idx] = section
    else:
        sections.append(section)
    return sections


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


def merge_logic_section_into_report(
    report: dict[str, Any] | None,
    section: dict[str, Any],
    *,
    mode: str | None = None,
    scope: str | None = None,
    auditing: bool = True,
) -> dict[str, Any]:
    """Merge one completed section into a logic_audit_report dict."""
    base: dict[str, Any] = dict(report) if report else {
        "sections": [],
        "cross_section_conflicts": [],
        "summary": "",
        "integrity_mode": "comment_only",
        "meta": {},
    }
    sections = list(base.get("sections") or [])
    section_name = section.get("section")
    idx = next((i for i, item in enumerate(sections) if item.get("section") == section_name), -1)
    if idx >= 0:
        sections[idx] = section
    else:
        sections.append(section)
    base["sections"] = sections
    meta = dict(base.get("meta") or {})
    if mode:
        meta["audit_mode"] = mode
    if scope:
        meta["audit_scope"] = scope
    if auditing:
        meta["auditing"] = True
    base["meta"] = meta
    return base


def build_partial_audit_result(
    sections: list[dict[str, Any]],
    *,
    timeout_sec: float | None = None,
    mode: str,
    reason: str = "timeout",
) -> dict[str, Any]:
    total = sum(
        len(sec.get("conflicts") or []) + len(sec.get("weak_claims") or [])
        for sec in sections
    )
    cancelled = reason == "cancelled"
    if cancelled:
        summary = (
            f"Logic audit đã hủy — {len(sections)} phần đã quét (comment-only)."
        )
        response = (
            f"Logic audit đã hủy — **{total}** vấn đề trong **{len(sections)}** phần đã quét.\n\n"
            "Mở tab **Logic Audit** để xem chi tiết phần đã hoàn thành."
        )
        analysis = "Logic audit partial — cancelled."
    else:
        timeout_label = int(timeout_sec or 0)
        summary = (
            f"Logic audit dừng sớm — {len(sections)} phần đã quét "
            f"(timeout {timeout_label}s, comment-only)."
        )
        response = (
            f"Logic audit dừng sớm (timeout {timeout_label}s) — **{total}** vấn đề "
            f"trong **{len(sections)}** phần đã quét.\n\n"
            "Mở tab **Logic Audit** để xem chi tiết. Thử ít section hơn hoặc chế độ Nhanh."
        )
        analysis = "Logic audit partial — stream timeout."
    report = {
        "sections": sections,
        "cross_section_conflicts": [],
        "summary": summary,
        "integrity_mode": "comment_only",
        "meta": {
            "partial": True,
            "cancelled": cancelled,
            "timeout_sec": timeout_sec,
            "audit_mode": mode,
        },
    }
    return {
        "logic_audit_report": report,
        "response": response,
        "analysis": analysis,
    }


def format_audit_failure_response(mode: str) -> str:
    from src.services.logic_audit.config import logic_audit_engine_label
    from src.services.provider_key_store import provider_has_api_key

    engine = logic_audit_engine_label(mode)
    if not provider_has_api_key("google"):
        return (
            "Logic audit cần Google AI — thêm key trong Admin → API Keys (Google) hoặc GOOGLE_API_KEY trong .env, rồi restart backend."
        )
    return (
        f"Logic audit chưa hoàn thành — timeout hoặc lỗi API ({engine}). "
        "Thử Nhanh với 1–2 section, hoặc kiểm tra quota Google AI."
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
    locale: str | None = None,
    max_sections: int = 4,
    on_progress: LogicProgressFn | None = None,
    on_reasoning: LogicReasoningFn | None = None,
    on_section_complete: LogicSectionFn | None = None,
    cancel_event: asyncio.Event | None = None,
) -> dict[str, Any]:
    """Multi-agent logic audit — comment-only, no draft mutation."""

    def _cancelled() -> bool:
        return cancel_event is not None and cancel_event.is_set()
    normalized_mode = (mode or "quick").strip().lower()
    if normalized_mode == "gate":
        from src.services.logic_audit.paper_gate_skim import run_paper_gate_skim

        ui_language = "English" if locale == "en" else "Vietnamese"
        return await run_paper_gate_skim(
            latex=latex,
            sections=sections,
            query=query,
            provider=provider,
            model=model,
            chat_provider=chat_provider,
            ui_language=ui_language,
            on_progress=on_progress,
            on_reasoning=on_reasoning,
            cancel_event=cancel_event,
        )

    flags = logic_audit_runtime_flags(mode, provider, scope=scope)
    audit_provider, audit_model = resolve_logic_audit_llm(
        mode, chat_provider or provider, scope=scope
    )
    provider = audit_provider
    model = model or audit_model
    engine_label = logic_audit_engine_label(flags["mode"], scope=flags["scope"])

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
    section_cooldown_sec = float(flags.get("section_cooldown_sec") or 0.0)
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
        engine = engine_label
        on_progress(
            "logic-plan",
            f"Logic audit · {mode_label}",
            f"{len(targets)} phần ({scope_label}) · {persona_count} persona · {engine} · {parallel}",
            "active",
        )

    async def _audit_one_section(index: int, section: dict) -> dict[str, Any] | None:
        if _cancelled():
            return None
        section_name = clean_section_display_name(str(section.get("name") or "Section"))
        full_text = str(section.get("content") or "")
        max_chunks = 3 if flags["mode"] == "deep" else 2
        chunks = split_section_text(full_text, section_char_limit, max_chunks=max_chunks)
        if not chunks:
            return None
        progress_key = f"s{index}-"
        chunk_payloads: list[dict[str, Any]] = []

        for chunk_idx, section_text in enumerate(chunks, start=1):
            if _cancelled():
                break
            chunk_detail = (
                f"~{len(section_text):,} ký tự · đoạn {chunk_idx}/{len(chunks)}".replace(",", ".")
                if len(chunks) > 1
                else f"~{len(section_text):,} ký tự".replace(",", ".")
            )
            if on_progress:
                on_progress(
                    f"logic-section-{index}",
                    f"Quét phần [{index}/{len(targets)}]: {section_name}",
                    chunk_detail,
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
                progress_key=f"{progress_key}c{chunk_idx}-",
                sequential=persona_sequential,
                cancel_event=cancel_event,
            )
            if _cancelled():
                break
            if not perspectives:
                continue

            raw = await synthesize_perspectives(
                perspectives,
                system_template=synth_system,
                user_template=synth_user,
                variables=variables,
                provider=provider,
                model=model,
                on_progress=on_progress,
                on_reasoning=on_reasoning,
                progress_key=f"{progress_key}c{chunk_idx}-",
                cancel_event=cancel_event,
            )
            if _cancelled():
                break
            payload = _extract_json_object(raw) or {}
            normalized = _normalize_section_payload(payload, section_name)
            if _section_issue_count(normalized) == 0 and _perspectives_have_substance(perspectives):
                normalized = _fallback_from_perspectives(perspectives, section_name)
            chunk_payloads.append(normalized)

        if not chunk_payloads:
            if on_progress:
                on_progress(
                    f"logic-section-{index}",
                    f"Quét phần [{index}/{len(targets)}]: {section_name}",
                    "Bỏ qua — không có phản hồi persona",
                    "done",
                )
            return None

        normalized = merge_section_audit_payloads(chunk_payloads, section_name)
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
        engine = engine_label
        on_progress(
            "logic-plan",
            f"Logic audit · {mode_label}",
            f"{len(targets)} phần ({scope_label}) · {persona_count} persona · {engine} · {parallel}",
            "done",
        )

    sem = asyncio.Semaphore(section_concurrency)

    async def _bounded(index: int, section: dict) -> tuple[int, dict[str, Any] | None]:
        if _cancelled():
            return index, None
        async with sem:
            if _cancelled():
                return index, None
            result = await _audit_one_section(index, section)
            if section_cooldown_sec > 0 and not _cancelled():
                await asyncio.sleep(section_cooldown_sec)
            return index, result

    section_tasks = [
        asyncio.create_task(_bounded(index, section))
        for index, section in enumerate(targets, start=1)
    ]
    section_results: dict[int, dict[str, Any]] = {}
    try:
        for finished in asyncio.as_completed(section_tasks):
            if _cancelled():
                for task in section_tasks:
                    if not task.done():
                        task.cancel()
                break
            try:
                result_index, result = await finished
            except asyncio.CancelledError:
                continue
            if result:
                section_results[result_index] = result
    finally:
        for task in section_tasks:
            if not task.done():
                task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await asyncio.gather(*section_tasks, return_exceptions=True)

    audit_sections = [section_results[i] for i in sorted(section_results.keys())]
    sections_skipped = max(0, len(targets) - len(section_results))

    if _cancelled():
        if audit_sections:
            return build_partial_audit_result(
                audit_sections,
                mode=flags["mode"],
                reason="cancelled",
            )
        return {
            "logic_audit_report": {},
            "response": "Logic audit đã hủy.",
            "analysis": "Logic audit cancelled.",
        }

    cross_section: list[dict[str, Any]] = []
    abstract = next((s for s in sections if str(s.get("name", "")).lower() == "abstract"), None)
    conclusion = next(
        (s for s in sections if "conclusion" in str(s.get("name", "")).lower()),
        None,
    )
    if abstract and conclusion and run_cross_section and not _cancelled():
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
                    cancel_event=cancel_event,
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
                        cancel_event=cancel_event,
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
            "response": format_audit_failure_response(flags["mode"]),
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
            "sections_skipped": sections_skipped,
            "provider": provider or "",
            "model": model or "",
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
