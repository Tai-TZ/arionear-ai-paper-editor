from src.services.edit_executor import (
    apply_plan_to_snippet,
    resolve_edit_plan,
    validate_proposed_edit,
)
from src.services.edit_planner import infer_edit_plan_rules
from src.services.latex_outline import build_manuscript_outline


def test_infer_title_plan_for_de_tai():
    latex = (
        "\\documentclass{article}\n"
        "\\title{Vietnamese herbariums Species Classification with EfficientNetV2}\n"
        "\\author{Anh Hoang Tuan}\n"
        "\\begin{document}\n"
        "Body\n"
        "\\end{document}\n"
    )
    outline = build_manuscript_outline(latex)
    plan = infer_edit_plan_rules(
        "Đổi tên đề tài để sử dụng model EfficientNetV3 nhé",
        outline,
        has_selection=False,
    )
    assert plan is not None
    assert plan.target_type == "latex_command"
    assert plan.target_id == "title"
    assert plan.operation == "replace_substring"
    assert plan.replace == "EfficientNetV3"


def test_resolve_title_block_only():
    latex = (
        "\\title{Vietnamese herbariums Species Classification with EfficientNetV2}\n"
        "\\author{Anh Hoang Tuan and Others}\n"
    )
    outline = build_manuscript_outline(latex)
    plan = infer_edit_plan_rules(
        "Đổi tên đề tài để sử dụng model EfficientNetV3 nhé",
        outline,
        has_selection=False,
    )
    assert plan is not None
    resolved = resolve_edit_plan(latex, plan)
    assert resolved is not None
    assert resolved.start < resolved.end
    assert "\\title{" in resolved.original_text
    assert "\\author{" not in resolved.original_text
    assert resolved.apply_mode == "selection"


def test_apply_substring_on_title_block():
    latex = "\\title{Paper with EfficientNetV2}\n"
    outline = build_manuscript_outline(latex)
    plan = infer_edit_plan_rules(
        "Đổi tên đề tài để sử dụng model EfficientNetV3 nhé",
        outline,
        has_selection=False,
    )
    assert plan is not None
    resolved = resolve_edit_plan(latex, plan)
    assert resolved is not None
    updated = apply_plan_to_snippet(plan, resolved.original_text)
    assert updated is not None
    assert "EfficientNetV3" in updated
    assert "EfficientNetV2" not in updated


def test_validator_blocks_document_scope_for_title_query():
    latex = "\\title{EfficientNetV2}\n" + ("x" * 5000)
    outline = build_manuscript_outline(latex)
    plan = infer_edit_plan_rules("sửa tiêu đề", outline, has_selection=False)
    assert plan is not None
    plan = type(plan)(
        target_type="document",
        operation=plan.operation,
        confidence=plan.confidence,
    )
    resolved = resolve_edit_plan(latex, plan)
    assert resolved is not None
    err = validate_proposed_edit(
        latex,
        plan,
        resolved,
        "new",
        query="sửa tiêu đề thành V3",
    )
    assert err is not None
