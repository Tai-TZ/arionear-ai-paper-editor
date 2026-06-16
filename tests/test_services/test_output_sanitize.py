from src.services.guardrails.output_sanitize import looks_like_chatty_output, sanitize_style_output

ORIGINAL = (
    "Medical research in Vietnam is saved documents. "
    "In addition to that, the research on medicinal plant classification is still limited."
)

MESSY = r"""\begin{abstract}
Tôi đã cải thiện văn phong học thuật cho phần Abstract.

### Abstract (Đã chỉnh sửa)
> "Medical research in Vietnam relies on existing documentation. Furthermore, studies on medicinal plant classification remain limited."

### Các thay đổi chính (Key Improvements):
- Thay "saved documents" bằng "existing documentation"
- Bạn có thể copy đoạn trên vào main.tex
"""


def test_detects_chatty_output():
    assert looks_like_chatty_output(MESSY)


def test_sanitize_abstract_extracts_prose_only():
    result = sanitize_style_output(
        ORIGINAL,
        MESSY,
        section="Abstract",
        apply_mode="selection",
    )
    assert "###" not in result
    assert "Các thay đổi" not in result
    assert "Tôi đã" not in result
    assert "Medical research" in result
    assert "existing documentation" in result or "saved documents" in result
