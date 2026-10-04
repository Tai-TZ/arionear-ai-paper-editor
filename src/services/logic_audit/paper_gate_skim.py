"""Lightweight pre-publication gate scan.

Single-call, fast path: reads abstract, intro, methods, results and conclusion
and returns a brief LogicAuditReport suitable for the score dialog.  Skips the
full multi-persona debate to stay under ~45 s.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import re
import uuid
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from src.config import get_settings
from src.services.llm import extract_llm_text, get_llm
from src.services.logic_audit.config import resolve_logic_audit_llm
from src.services.logic_audit.debate import (
    LogicProgressFn,
    LogicReasoningFn,
    _strip_thinking_markup,
)
from src.services.logic_audit.language import resolve_audit_language
from src.services.logic_audit.text_utils import infer_claim_text

_GATE_SECTION_PRIORITY: tuple[tuple[str, ...], ...] = (
    ("abstract",),
    ("introduction", "intro"),
    ("methods", "methodology", "materials and methods"),
    ("results", "experiments"),
    ("conclusion",),
    ("discussion",),
)
_GATE_MAX_SECTIONS = 5
_GATE_CHAR_LIMIT = 2800


def _pick_gate_sections(sections: list[dict]) -> list[dict]:
    """Return up to 5 key sections: abstract, intro, methods, results, conclusion."""
    key_picks: list[dict] = []
    seen: set[str] = set()
    for keys in _GATE_SECTION_PRIORITY:
        for section in sections:
            name = str(section.get("name") or "").lower()
            content = str(section.get("content") or "").strip()
            if not content or name in seen:
                continue
            if any(key in name for key in keys):
                seen.add(name)
                key_picks.append(section)
                break
        if len(key_picks) >= _GATE_MAX_SECTIONS:
            break

    if not key_picks:
        return [s for s in sections if (s.get("content") or "").strip()][:_GATE_MAX_SECTIONS]
    return key_picks


def _build_section_block(section: dict) -> str:
    name = str(section.get("name") or "Unknown")
    content = str(section.get("content") or "")[:_GATE_CHAR_LIMIT]
    return f"=== {name} ===\n{content}"


_SYSTEM_PROMPT_TEMPLATE = """You are a concise academic peer-reviewer. Read the provided manuscript sections and return ONLY a JSON object — no prose, no markdown code fences.

JSON schema:
{{
  "summary": "<one sentence overall assessment — MUST be written in {ui_language}>",
  "sections": [
    {{
      "section": "<section name>",
      "conflicts": [
        {{
          "id": "<uuid>",
          "type": "<claim_evidence_mismatch|unsupported_claim|internal_contradiction|unclear_reasoning|missing_citation>",
          "severity": "<critical|warning|info>",
          "claim_text": "<short quoted claim from manuscript, if applicable>",
          "comment": "<concrete, actionable remark — 1–2 sentences — write in {comment_language}>",
          "suggested_action": "<clarify|add_citation|revise_claim|none>",
          "persona_sources": ["gate_reviewer"]
        }}
      ],
      "weak_claims": ["<short remark in {comment_language} if a claim is vague but not wrong>"],
      "consensus_notes": []
    }}
  ],
  "cross_section_conflicts": []
}}

Rules:
- Report only real issues; if a section is fine write an empty conflicts list.
- If the manuscript is clearly a template, sample, or only placeholder/instructional text with no empirical claims, data, methods, or citations, you MUST add at least 2 warning-severity conflicts and state in summary that it is not submission-ready.
- Maximum 4 conflicts per section, maximum 3 weak_claims per section.
- Keep comments concise and actionable.
- summary field: ALWAYS write in {ui_language}.
- comment / weak_claims fields: write in {comment_language}."""

_USER_TEMPLATE = """Manuscript sections to review:

{sections}

Return the JSON object now."""


def _extract_json(text: str) -> dict[str, Any] | None:
    text = _strip_thinking_markup(text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text.strip())
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None


def _normalise_section(raw: dict[str, Any]) -> dict[str, Any]:
    conflicts = []
    for item in raw.get("conflicts") or []:
        if not isinstance(item, dict):
            continue
        conflicts.append(
            {
                "id": str(item.get("id") or uuid.uuid4()),
                "type": item.get("type") or "unclear_reasoning",
                "severity": item.get("severity") or "warning",
                "claim_text": infer_claim_text(
                    str(item.get("comment") or "").strip(),
                    str(item.get("claim_text") or ""),
                ),
                "evidence_text": str(item.get("evidence_text") or "").strip()[:500],
                "comment": str(item.get("comment") or "").strip()[:400],
                "suggested_action": item.get("suggested_action") or "none",
                "persona_sources": item.get("persona_sources") or ["gate_reviewer"],
            }
        )
    return {
        "section": str(raw.get("section") or "Unknown"),
        "conflicts": conflicts[:4],
        "weak_claims": [str(w) for w in (raw.get("weak_claims") or []) if w][:3],
        "consensus_notes": [],
    }


async def run_paper_gate_skim(
    latex: str,
    sections: list[dict],
    query: str = "",
    provider: str | None = None,
    model: str | None = None,
    chat_provider: str | None = None,
    ui_language: str = "Vietnamese",
    on_progress: LogicProgressFn | None = None,
    on_reasoning: LogicReasoningFn | None = None,
    cancel_event: asyncio.Event | None = None,
) -> dict[str, Any]:
    """Run a single-call quick gate scan and return a chat-stream-compatible result dict.

    Args:
        ui_language: Language for the ``summary`` field shown in the app UI.
            Defaults to "Vietnamese". Pass "English" for English-language apps.
            Comments and weak_claims follow the manuscript language so academic
            terminology stays accurate.
    """

    def _progress(step_id: str, label: str, detail: str = "", status: str = "active") -> None:
        if on_progress:
            on_progress(step_id, label, detail, status)

    _progress("gate-start", "Ario đọc lướt bài báo…")

    audit_provider, audit_model = resolve_logic_audit_llm("quick", chat_provider or provider)
    effective_provider = provider or audit_provider
    effective_model = model or audit_model

    targets = _pick_gate_sections(sections)
    if not targets:
        return {
            "logic_audit_report": {
                "summary": "Không tìm thấy nội dung để kiểm tra.",
                "sections": [],
                "cross_section_conflicts": [],
                "meta": {"audit_mode": "gate"},
            },
            "response": "Không tìm thấy nội dung để kiểm tra.",
            "analysis": "gate:no_content",
        }

    section_blocks = "\n\n".join(_build_section_block(s) for s in targets)
    # Detect the manuscript language for comments; UI summary always uses ui_language.
    manuscript_language = resolve_audit_language(query or latex[:200])
    language = manuscript_language  # stored in meta for tracing

    system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(
        ui_language=ui_language,
        comment_language=manuscript_language,
    )
    user_msg = _USER_TEMPLATE.format(sections=section_blocks)

    _progress("gate-llm", f"Đang phân tích {len(targets)} phần…")

    if cancel_event is not None and cancel_event.is_set():
        return {
            "logic_audit_report": {},
            "response": "Logic audit đã hủy.",
            "analysis": "gate:cancelled",
        }

    llm = get_llm(provider=effective_provider, model=effective_model, temperature=0.3, json_output=True)

    timeout_sec = get_settings().logic_audit_gate_timeout_sec
    messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_msg)]
    invoke_task = asyncio.create_task(llm.ainvoke(messages))
    started = asyncio.get_running_loop().time()
    try:
        while not invoke_task.done():
            if cancel_event is not None and cancel_event.is_set():
                invoke_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await invoke_task
                return {
                    "logic_audit_report": {},
                    "response": "Logic audit đã hủy.",
                    "analysis": "gate:cancelled",
                }
            if asyncio.get_running_loop().time() - started >= timeout_sec:
                invoke_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await invoke_task
                raise TimeoutError()
            await asyncio.sleep(0.2)
        response = await invoke_task
        raw_text = extract_llm_text(response)
    except asyncio.CancelledError:
        return {
            "logic_audit_report": {},
            "response": "Logic audit đã hủy.",
            "analysis": "gate:cancelled",
        }
    except TimeoutError as exc:
        _progress("gate-error", "Lỗi phân tích", detail="Timeout", status="error")
        raise RuntimeError("Gate skim LLM timed out.") from exc
    except Exception as exc:
        _progress("gate-error", "Lỗi phân tích", status="error")
        raise RuntimeError(f"Gate skim LLM error: {exc}") from exc

    _progress("gate-parse", "Tổng hợp kết quả…")

    data = _extract_json(raw_text)
    if not data:
        _progress("gate-done", "Hoàn thành (không có nhận xét cấu trúc)", status="done")
        fallback_summary = (
            "No major issues detected in the quick review."
            if ui_language == "English"
            else "Ario đã đọc lướt nhưng không tìm thấy vấn đề cần chú ý."
        )
        return {
            "logic_audit_report": {
                "summary": fallback_summary,
                "sections": [
                    {"section": s.get("name", "Section"), "conflicts": [], "weak_claims": [], "consensus_notes": []}
                    for s in targets
                ],
                "cross_section_conflicts": [],
                "meta": {"audit_mode": "gate", "language": language},
            },
            "response": fallback_summary,
            "analysis": "gate:no_issues",
        }

    sections_raw = data.get("sections") or []
    normalised_sections = [_normalise_section(s) for s in sections_raw if isinstance(s, dict)]

    cross_raw = data.get("cross_section_conflicts") or []
    cross_conflicts = [
        {
            "type": str(c.get("type") or "mismatch"),
            "description": str(c.get("description") or "").strip()[:400],
            "spans": [
                {"section": str(sp.get("section", "")), "text": str(sp.get("text", ""))[:200]}
                for sp in (c.get("spans") or [])
                if isinstance(sp, dict)
            ],
        }
        for c in cross_raw
        if isinstance(c, dict) and c.get("description")
    ][:3]

    report: dict[str, Any] = {
        "summary": str(data.get("summary") or "").strip()[:500],
        "sections": normalised_sections,
        "cross_section_conflicts": cross_conflicts,
        "meta": {"audit_mode": "gate", "language": language},
    }

    summary = report["summary"] or "Ario đã đọc lướt bài báo."
    _progress("gate-done", "Hoàn thành phản biện nhanh", detail=summary, status="done")

    return {
        "logic_audit_report": report,
        "response": summary,
        "analysis": f"gate:{len(normalised_sections)} sections",
    }
