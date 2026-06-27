from __future__ import annotations

import pytest

from src.services.direct_edit import (
    parse_rename_instruction,
    try_direct_text_edit,
    try_metadata_scoped_edit,
)
from src.services.intent_router import classify_intent


def test_parse_rename_vietnamese():
    assert parse_rename_instruction("Đổi HO HAI THUAN thành NGUYEN VAN A") == (
        "HO HAI THUAN",
        "NGUYEN VAN A",
    )


def test_parse_rename_tu_sang():
    assert parse_rename_instruction("Đổi đề tài từ EfficientNetV2 sang V3 giúp tôi nhé") == (
        "EfficientNetV2",
        "V3",
    )


def test_title_edit_scoped():
    latex = (
        "\\documentclass{article}\n"
        "\\title{Vietnamese herbariums Species Classification with EfficientNetV2}\n"
        "\\begin{document}\n"
        "Body\n"
        "\\end{document}\n"
    )
    result = try_metadata_scoped_edit(
        "Sửa tiêu đề bài báo thành model EfficietNetV3 nhé",
        latex,
    )
    assert result is not None
    original, replacement, full = result
    assert "EfficientNetV2" in original
    assert "EfficientNetV3" in replacement
    assert "EfficientNetV3" in full
    assert "EfficientNetV2" not in full
    assert "\\begin{document}" in full


def test_direct_edit_name_permutation():
    latex = r"\author{Anh Hoang Tuan and Thuan Ho Hai and Nhut Nguyen Minh}"
    result = try_direct_text_edit("Đổi HO HAI THUAN thành NGUYEN VAN A", latex)
    assert result is not None
    assert "NGUYEN VAN A" in result
    assert "Thuan Ho Hai" not in result


def test_direct_edit_selection_replace_vietnamese():
    latex = r"NGUYEN NGUYEN TRONG\\"
    result = try_direct_text_edit("Đổi thành NGUYEN VAN A", latex)
    assert result == r"NGUYEN VAN A\\"


def test_direct_edit_selection_replace_english():
    latex = r"\title{Old Title}"
    result = try_direct_text_edit("change to New Title", latex)
    assert result == r"\title{New Title}"


@pytest.mark.asyncio
async def test_classify_intent_skips_llm_for_rename(monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    intent = await classify_intent(
        "Đổi HO HAI THUAN thành NGUYEN VAN A",
        has_latex=True,
        has_selection=False,
    )
    assert intent.action == "edit"
    assert intent.scope == "document"
