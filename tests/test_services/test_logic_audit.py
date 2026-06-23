from src.services.intent_router import _fallback_intent
from src.services.logic_audit.debate import _strip_thinking_markup, load_debate_roles
from src.services.logic_audit.runner import (
    _cap_section_payload,
    _extract_json_object,
    _fallback_from_perspectives,
    format_chat_summary,
    format_report_text,
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
        "conflicts": [
            {"id": str(i), "severity": "info", "comment": f"info {i}"} for i in range(20)
        ],
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
