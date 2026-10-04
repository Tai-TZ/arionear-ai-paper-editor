"""Gate 3 eval metrics — kept in sync with eval/scripts/run_gate3_eval.py."""

from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def test_gate3_intent_routing_meets_baseline():
    from src.services.intent_rules import fallback_intent

    cases = json.loads((REPO / "eval" / "datasets" / "gate3_intent_cases.json").read_text(encoding="utf-8"))
    baselines = json.loads((REPO / "eval" / "baselines.json").read_text(encoding="utf-8"))
    passed = 0
    for case in cases:
        intent = fallback_intent(case["query"], case.get("has_latex", True), False)
        if intent.action == case["expected_action"]:
            passed += 1
    accuracy = passed / len(cases)
    assert accuracy >= baselines["intent_routing_accuracy"]["baseline"]


def test_gate3_edit_scope_meets_baseline():
    from src.services.edit_planner import infer_edit_plan_rules
    from src.services.latex_outline import build_manuscript_outline

    baselines = json.loads((REPO / "eval" / "baselines.json").read_text(encoding="utf-8"))
    latex = "\\title{Paper with EfficientNetV2}\n"
    outline = build_manuscript_outline(latex)
    queries = [
        "Đổi tên đề tài để sử dụng model EfficientNetV3 nhé",
        "Sửa tiêu đề bài báo thành model EfficientNetV3 nhé",
    ]
    ok = 0
    for q in queries:
        plan = infer_edit_plan_rules(q, outline, has_selection=False)
        if plan and plan.target_type == "latex_command" and plan.target_id == "title":
            ok += 1
    accuracy = ok / len(queries)
    assert accuracy >= baselines["edit_scope_accuracy"]["baseline"]


def test_gate3_numeric_drift_detected():
    from src.services.guardrails.integrity import check_integrity

    flags = check_integrity("F1 is 92.4.", "F1 is 95.0.", scope="selection")
    codes = {f["code"] for f in flags}
    assert "numeric_drift" in codes or "numeric_removed" in codes


def test_gate3_title_document_scope_blocked():
    from src.services.edit_executor import resolve_edit_plan, validate_proposed_edit
    from src.services.edit_planner import EditPlan, infer_edit_plan_rules
    from src.services.latex_outline import build_manuscript_outline

    latex = "\\title{EfficientNetV2}\n" + ("x" * 2000)
    outline = build_manuscript_outline(latex)
    plan = infer_edit_plan_rules("sửa tiêu đề", outline, has_selection=False)
    assert plan is not None
    plan = EditPlan(target_type="document", operation=plan.operation, confidence=plan.confidence)
    resolved = resolve_edit_plan(latex, plan)
    assert resolved is not None
    err = validate_proposed_edit(latex, plan, resolved, "x", query="sửa tiêu đề")
    assert err is not None
