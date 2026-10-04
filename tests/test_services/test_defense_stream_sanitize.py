"""Tests for defense council boilerplate stripping."""

from __future__ import annotations

from src.models.schemas import DefenseConversationTurn
from src.services.defense_stream import (
    _build_turn_directive,
    _OpeningStripper,
    strip_defense_boilerplate_opening,
)


def test_strip_vietnamese_acknowledgment():
    raw = "Tôi ghi nhận điều đó. Xin bạn làm rõ phương pháp thu thập dữ liệu?"
    assert strip_defense_boilerplate_opening(raw) == "Xin bạn làm rõ phương pháp thu thập dữ liệu?"


def test_strip_english_acknowledgment():
    raw = "I acknowledge that. How do you justify the sample size?"
    assert strip_defense_boilerplate_opening(raw) == "How do you justify the sample size?"


def test_leaves_normal_opening():
    raw = "Theo phần phương pháp, tại sao bạn chọn EfficientNetV2?"
    assert strip_defense_boilerplate_opening(raw) == raw


def test_opening_stripper_removes_boilerplate_from_stream():
    stripper = _OpeningStripper()
    assert stripper.feed("Tôi ghi nh") == ""
    out = stripper.feed("ận điều đó. ")
    assert out == ""
    out = stripper.feed("Xin bạn giải thích dataset.")
    assert out == "Xin bạn giải thích dataset."


def test_turn_directive_after_author_reply():
    history = [
        DefenseConversationTurn(role="assistant", content="Tôi ghi nhận điều đó. Câu hỏi đầu?"),
        DefenseConversationTurn(role="user", content="Chúng tôi dùng bộ dữ liệu X."),
    ]
    directive = _build_turn_directive(history)
    assert "CẤM" in directive
    assert "Tôi ghi nhận điều đó" in directive
    assert "Tôi ghi nhận điều đó" in directive.split("đã dùng")[-1]


def test_defense_llm_defaults_to_gemini_flash_lite():
    from src.config import get_settings
    from src.models.schemas import DefenseRequest

    settings = get_settings()
    assert settings.defense_llm_provider == "google"
    assert settings.defense_llm_model == "gemini-3.1-flash-lite"

    req = DefenseRequest(latex_content="\\begin{document}test\\end{document}")
    assert req.llm_provider is None
    assert req.llm_model is None
