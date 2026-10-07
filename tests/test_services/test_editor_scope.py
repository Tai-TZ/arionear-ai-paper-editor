from src.services.guardrails.editor_scope import (
    detect_off_topic_request,
    evaluate_editor_scope,
)


def test_blocks_general_coding_without_paper_context():
    assert detect_off_topic_request("bạn khỏe không? tôi cần code một function tính toán") == "general_coding"
    assert detect_off_topic_request("cứ code function tính toán đơn giản thôi") == "general_coding"
    assert detect_off_topic_request("viết python script download data") == "general_coding"


def test_allows_manuscript_related_code():
    assert detect_off_topic_request("thêm đoạn code Python vào phần Methods dùng listings") is None
    assert detect_off_topic_request("chèn code block vào appendix của bài báo") is None
    assert detect_off_topic_request("viết pseudocode thuật toán trong phần Methodology") is None


def test_casual_chat_not_blocked():
    assert detect_off_topic_request("chào") is None
    assert detect_off_topic_request("bạn là ai") is None


def test_refusal_has_no_llm_needed_message():
    allowed, msg = evaluate_editor_scope("code giúp tôi quicksort python", locale="vi")
    assert not allowed
    assert "EDICO" in msg
    assert "listings" in msg.lower() or "main.tex" in msg


def test_homework_blocked():
    assert detect_off_topic_request("làm bài tập python về sorting") == "general_coding"
    assert detect_off_topic_request("giúp tôi làm homework essay") == "homework"
