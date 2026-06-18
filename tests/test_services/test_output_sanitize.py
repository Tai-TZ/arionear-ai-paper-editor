from src.services.guardrails.output_sanitize import clamp_selection_replacement

TITLE = r"\title{Vietnamese herbariums Species Classification with EfficientNetV2}"

PREAMBLE_LEAK = r"""\documentclass[conference]{IEEEtran}
\usepackage{graphicx}
\usepackage{array}
\usepackage{url}
\title{Vietnamese herbariums Species Classification with EfficientNetV3}"""


def test_clamp_selection_strips_document_preamble_leak():
    result = clamp_selection_replacement(
        TITLE,
        PREAMBLE_LEAK,
        apply_mode="selection",
        query="change EfficientNetV2 to EfficientNetV3",
    )
    assert "\\documentclass" not in result
    assert result.startswith(r"\title{")
    assert "EfficientNetV3" in result


def test_clamp_selection_keeps_small_valid_edit():
    edited = TITLE.replace("EfficientNetV2", "EfficientNetV3")
    result = clamp_selection_replacement(TITLE, edited, apply_mode="selection")
    assert result == edited
