from src.services.intent_router import _fallback_intent


def test_fallback_intent_vietnamese_edit():
    result = _fallback_intent("Chỉnh sửa THUAN HO HAI thành NGUYEN THANH TAI", True, False)
    assert result.action == "edit"
    assert result.scope == "document"


def test_fallback_style_beats_edit_for_abstract_polish():
    query = "Chỉnh sửa lại phần Abstract để cho văn phong học thuật hơn nữa nhé"
    result = _fallback_intent(query, True, False)
    assert result.action == "style"
