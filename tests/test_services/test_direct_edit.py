from __future__ import annotations

import pytest

from src.services.direct_edit import parse_rename_instruction, try_direct_text_edit
from src.services.intent_router import classify_intent


def test_parse_rename_vietnamese():
    assert parse_rename_instruction("Đổi HO HAI THUAN thành NGUYEN VAN A") == (
        "HO HAI THUAN",
        "NGUYEN VAN A",
    )


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
async def test_classify_intent_skips_llm_for_rename():
    intent = await classify_intent(
        "Đổi HO HAI THUAN thành NGUYEN VAN A",
        has_latex=True,
        has_selection=False,
    )
    assert intent.action == "edit"
    assert intent.scope == "document"
