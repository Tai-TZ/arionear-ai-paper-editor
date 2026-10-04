import asyncio

import pytest

from src.agents.nodes.academic_nodes import edit_node
from src.services.edit_planner import EditPlan

SAMPLE_LATEX = r"""
\documentclass{article}
\begin{document}
\begin{abstract}
We study efficient networks for image classification.
\end{abstract}
\section{Introduction}
Deep learning has transformed computer vision research in the last decade.
\section{Methods}
We describe datasets and training procedures here.
\section{Conclusion}
We summarize findings and future work.
\end{document}
"""


@pytest.mark.asyncio
async def test_edit_node_section_produces_edits(monkeypatch):
    async def _mock_plan_edit(*_args, **_kwargs):
        return EditPlan(
            target_type="section",
            target_id="Abstract",
            operation="replace_snippet",
            label="Phần Abstract",
        )

    async def _mock_execute(*_args, **_kwargs):
        return "\\begin{abstract}\nWe present a concise abstract for efficient network classification.\n\\end{abstract}"

    monkeypatch.setattr("src.agents.nodes.academic_nodes.plan_edit", _mock_plan_edit)
    monkeypatch.setattr("src.agents.nodes.academic_nodes.execute_edit_plan", _mock_execute)

    result = await edit_node(
        {
            "latex": SAMPLE_LATEX,
            "query": "sửa Abstract cho ngắn gọn hơn",
            "selection": "",
            "session_id": "",
        }
    )

    assert result.get("edits")
    edit = result["edits"][0]
    assert edit.get("replacement_text")
    assert edit.get("section") == "Abstract"
    assert edit.get("apply_mode") == "selection"


@pytest.mark.asyncio
async def test_edit_node_title_substring_replace(monkeypatch):
    latex = "\\documentclass{article}\n\\title{Paper with EfficientNetV2}\n\\begin{document}Body\\end{document}\n"

    async def _mock_plan_edit(*_args, **_kwargs):
        return EditPlan(
            target_type="latex_command",
            target_id="title",
            operation="replace_substring",
            find="EfficientNetV2",
            replace="EfficientNetV3",
            label="Tiêu đề · \\title{...}",
        )

    monkeypatch.setattr("src.agents.nodes.academic_nodes.plan_edit", _mock_plan_edit)

    result = await edit_node(
        {
            "latex": latex,
            "query": "đổi EfficientNetV2 thành EfficientNetV3 trong tiêu đề",
            "selection": "",
        }
    )

    assert result.get("edits")
    assert "EfficientNetV3" in result["edits"][0]["replacement_text"]


def test_edit_node_blocks_vague_without_selection():
    result = asyncio.run(
        edit_node(
            {
                "latex": SAMPLE_LATEX,
                "query": "Chỉnh sửa bản thảo",
                "selection": "",
            }
        )
    )
    assert result.get("edits") == []
    assert "nói rõ" in result.get("response", "").lower()
    assert "specify what to edit" in result.get("response", "").lower()


@pytest.mark.asyncio
async def test_edit_node_validator_blocks_truncated_document(monkeypatch):
    async def _mock_plan_edit(*_args, **_kwargs):
        return EditPlan(
            target_type="document",
            operation="replace_snippet",
            label="Toàn bộ main.tex",
        )

    async def _mock_execute(*_args, **_kwargs):
        return "\\documentclass{article}"

    monkeypatch.setattr("src.agents.nodes.academic_nodes.plan_edit", _mock_plan_edit)
    monkeypatch.setattr("src.agents.nodes.academic_nodes.execute_edit_plan", _mock_execute)

    result = await edit_node(
        {
            "latex": SAMPLE_LATEX,
            "query": "sửa toàn bộ main.tex",
            "selection": "",
        }
    )

    assert result.get("edits") == []
    assert result.get("response")
    assert "chặn" in result["response"].lower() or "ngắn" in result["response"].lower()
