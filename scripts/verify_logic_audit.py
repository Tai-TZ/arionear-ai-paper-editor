"""Lightweight verification for logic_audit (no pytest/langchain import chain)."""
from __future__ import annotations

import re
import sys


def main() -> int:
    from src.services.logic_audit.runner import _extract_json_object, format_report_text
    from src.services.logic_audit.schemas import (
        LogicAuditReport,
        LogicConflictItem,
        LogicSectionReport,
    )

    raw = '```json\n{"conflicts": [], "weak_claims": ["x"]}\n```'
    data = _extract_json_object(raw)
    assert data is not None and data.get("weak_claims") == ["x"]

    empty = LogicAuditReport(summary="", sections=[])
    assert "Không phát hiện" in format_report_text(empty)

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
    assert "Introduction" in text and "Claim lacks support" in text

    # Intent regex (inline — avoids importing intent_router / langchain)
    logic_re = re.compile(
        r"kiểm\s*tra\s*logic|logic\s*check|consistency|mâu\s*thuẫn|contradiction|"
        r"logic\s*audit|nhất\s*quán|weak\s*claim|lỗ\s*hổng\s*lập\s*luận",
        re.IGNORECASE,
    )
    assert logic_re.search("Kiểm tra logic bài báo này")
    assert logic_re.search("Run a logic audit on consistency")

    from src.services.logic_audit.debate import load_debate_roles

    roles = load_debate_roles()
    for name in ("novice_reader", "critical_reviewer", "devil_advocate"):
        assert name in roles, f"missing persona {name}"

    print("verify_logic_audit: ALL OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
