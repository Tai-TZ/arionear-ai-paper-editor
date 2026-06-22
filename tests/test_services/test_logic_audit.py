from src.services.intent_router import _fallback_intent
from src.services.logic_audit.debate import _strip_thinking_markup, load_debate_roles
from src.services.logic_audit.schemas import (
    LogicAuditReport,
    LogicConflictItem,
    LogicSectionReport,
)
from src.services.logic_audit.runner import (
    _extract_json_object,
    _fallback_from_perspectives,
    format_report_text,
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
