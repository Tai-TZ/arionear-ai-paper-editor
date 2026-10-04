import pytest

from src.services.intent_router import _fallback_intent
from src.services.logic_audit.debate import _strip_thinking_markup, load_debate_roles
from src.services.logic_audit.runner import (
    _cap_section_payload,
    _extract_json_object,
    _fallback_from_perspectives,
    build_partial_audit_result,
    format_chat_summary,
    format_report_text,
    merge_logic_section_into_report,
    merge_section_audit_payloads,
    upsert_partial_section,
)
from src.services.logic_audit.schemas import (
    LogicAuditReport,
    LogicConflictItem,
    LogicSectionReport,
)


def test_fallback_intent_logic_vietnamese():
    result = _fallback_intent("Kiểm tra logic bài báo này", True, False)
    assert result.action == "logic"


def test_fallback_intent_logic_english():
    result = _fallback_intent("Run a logic audit on consistency", True, False)
    assert result.action == "logic"


def test_load_debate_roles_has_three_personas():
    roles = load_debate_roles()
    assert "novice_reader" in roles
    assert "critical_reviewer" in roles
    assert "devil_advocate" in roles


def test_extract_json_object_from_fenced_block():
    raw = '```json\n{"conflicts": [], "weak_claims": ["x"]}\n```'
    data = _extract_json_object(raw)
    assert data is not None
    assert data.get("weak_claims") == ["x"]


def test_format_report_text_empty():
    report = LogicAuditReport(summary="", sections=[])
    assert "Không phát hiện" in format_report_text(report)


def test_format_report_text_with_conflict():
    report = LogicAuditReport(
        summary="Found issues",
        sections=[
            LogicSectionReport(
                section="Introduction",
                conflicts=[
                    LogicConflictItem(
                        id="1",
                        type="unclear_reasoning",
                        severity="warning",
                        comment="Claim lacks support",
                        claim_text="We prove X",
                    )
                ],
            )
        ],
    )
    text = format_report_text(report)
    assert "Introduction" in text
    assert "Claim lacks support" in text


def test_strip_thinking_markup():
    raw = "<think>internal chain</think>\n- Claim A lacks evidence"
    assert _strip_thinking_markup(raw) == "- Claim A lacks evidence"


def test_fallback_from_perspectives_creates_issues():
    perspectives = {
        "novice_reader": "- The accuracy claim is not compared to baselines in this section.",
        "critical_reviewer": "- Methods section does not justify the preprocessing pipeline.",
    }
    payload = _fallback_from_perspectives(perspectives, "Abstract")
    assert len(payload["conflicts"]) == 2
    assert payload["conflicts"][0]["comment"].startswith("-") is False


def test_cap_section_payload_limits_issues():
    payload = {
        "section": "Intro",
        "conflicts": [{"id": str(i), "severity": "info", "comment": f"info {i}"} for i in range(20)],
        "weak_claims": [f"weak {i}" for i in range(10)],
        "consensus_notes": [],
    }
    capped = _cap_section_payload(payload)
    assert len(capped["conflicts"]) <= 12
    assert capped["conflicts"][0]["severity"] == "info"
    assert len(capped["weak_claims"]) <= 5


def test_format_chat_summary_short():
    report = LogicAuditReport(
        summary="x",
        sections=[
            LogicSectionReport(
                section="Abstract",
                conflicts=[
                    LogicConflictItem(
                        id="1",
                        type="unclear_reasoning",
                        severity="warning",
                        comment="A",
                    )
                ],
            )
        ],
    )
    text = format_chat_summary(report)
    assert "Logic Audit" in text
    assert len(text) < 400
    assert "comment-only" in text


def test_merge_logic_section_into_report_replaces_same_section():
    section = {"section": "Abstract", "conflicts": [], "weak_claims": ["a"]}
    merged = merge_logic_section_into_report(None, section)
    assert len(merged["sections"]) == 1
    updated = merge_logic_section_into_report(merged, {**section, "weak_claims": ["b"]})
    assert updated["sections"][0]["weak_claims"] == ["b"]


def test_build_partial_audit_result():
    result = build_partial_audit_result(
        [{"section": "Intro", "conflicts": [], "weak_claims": ["x"]}],
        timeout_sec=240,
        mode="quick",
    )
    assert result["logic_audit_report"]["meta"]["partial"] is True
    assert result["logic_audit_report"]["meta"]["cancelled"] is False
    assert "240" in result["response"]


def test_build_partial_audit_result_cancelled():
    result = build_partial_audit_result(
        [{"section": "Intro", "conflicts": [], "weak_claims": ["x"]}],
        mode="quick",
        reason="cancelled",
    )
    assert result["logic_audit_report"]["meta"]["partial"] is True
    assert result["logic_audit_report"]["meta"]["cancelled"] is True
    assert "hủy" in result["response"].lower()


@pytest.mark.asyncio
async def test_run_logic_audit_mocked_llm(monkeypatch):
    from src.services.logic_audit.runner import run_logic_audit

    async def fake_multi(*_args, **_kwargs):
        return {"novice_reader": "- The claim lacks baseline comparison."}

    async def fake_synth(*_args, **_kwargs):
        return (
            '{"section": "Introduction", "conflicts": [], '
            '"weak_claims": ["Baseline comparison missing"], "consensus_notes": []}'
        )

    monkeypatch.setattr(
        "src.services.logic_audit.runner.multi_perspective_generate",
        fake_multi,
    )
    monkeypatch.setattr(
        "src.services.logic_audit.runner.synthesize_perspectives",
        fake_synth,
    )
    monkeypatch.setattr(
        "src.services.logic_audit.runner.resolve_logic_audit_llm",
        lambda mode, _chat, *, scope="selected": ("google", "gemini-2.5-flash"),
    )

    result = await run_logic_audit(
        latex="\\section{Introduction}\nWe claim state of the art.",
        sections=[{"name": "Introduction", "content": "We claim state of the art."}],
        query="logic audit",
        provider="google",
        model="gemini-2.5-flash",
        mode="quick",
        scope="selected",
        section_filter=["Introduction"],
    )
    report = result.get("logic_audit_report") or {}
    assert report.get("sections")
    assert report["sections"][0]["section"] == "Introduction"
    assert "Baseline comparison missing" in (report["sections"][0].get("weak_claims") or [])


def test_merge_section_audit_payloads_deduplicates():
    merged = merge_section_audit_payloads(
        [
            {
                "section": "Intro",
                "conflicts": [{"id": "1", "comment": "Issue A", "severity": "warning"}],
                "weak_claims": ["weak one"],
            },
            {
                "section": "Intro",
                "conflicts": [{"id": "2", "comment": "Issue A", "severity": "info"}],
                "weak_claims": ["weak one", "weak two"],
            },
        ],
        "Intro",
    )
    assert len(merged["conflicts"]) == 1
    assert len(merged["weak_claims"]) == 2


def test_normalize_section_payload_infers_claim_text():
    from src.services.logic_audit.runner import _normalize_section_payload

    payload = _normalize_section_payload(
        {
            "conflicts": [
                {
                    "comment": 'Unsupported claim: "accuracy exceeds all prior work"',
                    "severity": "warning",
                }
            ]
        },
        "Introduction",
    )
    assert "accuracy exceeds" in payload["conflicts"][0]["claim_text"]


def test_merge_logic_section_into_report_sets_meta():
    merged = merge_logic_section_into_report(
        None,
        {"section": "Introduction", "conflicts": [], "weak_claims": []},
        mode="quick",
        scope="selected",
    )
    assert merged["meta"]["audit_mode"] == "quick"
    assert merged["meta"]["audit_scope"] == "selected"
    assert merged["meta"]["auditing"] is True


def test_upsert_partial_section_replaces_same_name():
    sections = [{"section": "Abstract", "conflicts": []}]
    upsert_partial_section(sections, {"section": "Abstract", "weak_claims": ["x"]})
    assert len(sections) == 1
    assert sections[0]["weak_claims"] == ["x"]
    upsert_partial_section(sections, {"section": "Intro", "conflicts": []})
    assert len(sections) == 2
