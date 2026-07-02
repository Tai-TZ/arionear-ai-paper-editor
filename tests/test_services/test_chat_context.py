from src.services.chat_context import build_chat_user_content, task_needs_manuscript
from src.services.guardrails.prompt_injection import wrap_untrusted_user_text
from src.services.intent_router import _fallback_intent, _is_casual_chat


def test_task_needs_manuscript():
    assert task_needs_manuscript("edit")
    assert task_needs_manuscript("style")
    assert not task_needs_manuscript("chat")


def test_build_chat_user_content_omits_manuscript_by_default():
    latex = "\\documentclass{article}" + "x" * 5000
    content = build_chat_user_content("hello", latex=latex)
    assert content == wrap_untrusted_user_text("hello")
    assert "Manuscript excerpt" not in content


def test_build_chat_user_content_includes_selection():
    content = build_chat_user_content(
        "explain this",
        selection="Selected paragraph",
        latex="full doc",
    )
    assert "Selected text:" in content
    assert "Selected paragraph" in content
    assert "Manuscript excerpt" not in content


def test_build_chat_user_content_can_include_manuscript():
    content = build_chat_user_content(
        "summarize",
        latex="\\begin{document}body\\end{document}",
        include_manuscript=True,
    )
    assert "Manuscript excerpt:" in content


def test_is_casual_chat_greetings():
    assert _is_casual_chat("hello")
    assert _is_casual_chat("hú")
    assert _is_casual_chat("chào")
    assert _is_casual_chat("bạn là ai")
    assert not _is_casual_chat("chỉnh sửa abstract cho học thuật hơn")


def test_fallback_intent_greeting_with_manuscript_open():
    result = _fallback_intent("hello", True, False)
    assert result.action == "chat"

    result = _fallback_intent("hú", True, False)
    assert result.action == "chat"

    result = _fallback_intent("bạn là ai", True, False)
    assert result.action == "chat"
