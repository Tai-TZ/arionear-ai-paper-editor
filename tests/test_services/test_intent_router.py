from src.services.chat_stream import _preview_edit_scope
from src.services.intent_router import _fallback_intent


def test_fallback_intent_vietnamese_edit():
    result = _fallback_intent("Chỉnh sửa THUAN HO HAI thành NGUYEN THANH TAI", True, False)
    assert result.action == "edit"
    assert result.scope == "document"


def test_fallback_intent_doi_tu_sang():
    result = _fallback_intent(
        "Đổi đề tài từ EfficientNetV2 sang V3 giúp tôi nhé",
        True,
        False,
    )
    assert result.action == "edit"
    assert result.scope == "selection"


def test_fallback_intent_title_edit():
    result = _fallback_intent(
        "Sửa tiêu đề bài báo thành model EfficietNetV3 nhé",
        True,
        False,
    )
    assert result.action == "edit"
    assert result.scope == "selection"


def test_fallback_style_beats_edit_for_abstract_polish():
    query = "Chỉnh sửa lại phần Abstract để cho văn phong học thuật hơn nữa nhé"
    result = _fallback_intent(query, True, False)
    assert result.action == "style"


def test_fallback_intent_shorten_introduction_section():
    result = _fallback_intent(
        "giúp tôi rút gọn phần introduction nhé, trông nó khá dài",
        True,
        False,
    )
    assert result.action == "edit"
    assert result.scope == "document"


def test_fallback_intent_help_me_shorten_english():
    result = _fallback_intent("help me shorten the introduction section", True, False)
    assert result.action == "edit"
    assert result.scope == "document"


def test_preview_edit_scope_for_title():
    latex = "\\title{Vietnamese herbariums Species Classification with EfficientNetV2}\n"
    _, detail = _preview_edit_scope(
        "Sửa tiêu đề bài báo thành model EfficientNetV3 nhé",
        latex,
    )
    assert "title" in detail.lower() or "Tiêu đề" in detail
    assert "Toàn bộ main.tex" not in detail
