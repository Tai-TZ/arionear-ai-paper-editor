from src.services.chat_context import (
    build_chat_llm_messages,
    build_chat_manuscript_excerpt,
    chat_query_needs_manuscript_context,
    format_conversation_history_for_router,
)
from src.services.intent_rules import fallback_intent, infer_followup_intent, looks_like_edit_followup
from src.services.llm_errors import friendly_llm_error
from src.services.quota_policy import QuotaExceededError, check_rate_limit, reset_rate_limit_state


def test_chat_query_needs_manuscript_context_for_section_question():
    assert chat_query_needs_manuscript_context("Abstract viết có ổn không?")
    assert not chat_query_needs_manuscript_context("chào")


def test_chat_query_skips_casual_greeting():
    assert not chat_query_needs_manuscript_context("xin chào")


def test_fallback_intent_edit_question():
    result = fallback_intent("làm sao sửa tiêu đề?", has_latex=True, has_selection=False)
    assert result.action == "edit"


def test_build_chat_manuscript_excerpt_prefers_section():
    sections = [
        {"name": "Abstract", "content": "We study efficient networks."},
        {"name": "Introduction", "content": "Deep learning is popular."},
    ]
    excerpt = build_chat_manuscript_excerpt(
        "review the abstract",
        r"\begin{document}",
        sections,
    )
    assert "efficient networks" in excerpt.lower()


def test_resolve_editor_aux_llm_prefers_configured_provider(monkeypatch):
    from src.config import get_settings
    from src.services.editor_llm import resolve_editor_aux_llm

    settings = get_settings()
    monkeypatch.setattr(settings, "zai_api_key", "test-key")
    provider, model = resolve_editor_aux_llm()
    assert provider == "zai"
    assert model == settings.zai_default_model


def test_build_chat_llm_messages_includes_history():
    history = [
        type("Turn", (), {"role": "user", "content": "Chào"})(),
        type("Turn", (), {"role": "assistant", "content": "Xin chào!"})(),
    ]
    messages = build_chat_llm_messages(
        system="You are helpful.",
        history=history,
        user_content="Tiếp theo?",
    )
    assert len(messages) == 4
    assert messages[-1].content == "Tiếp theo?"


def test_format_conversation_history_for_router():
    history = [{"role": "user", "content": "Sửa abstract"}]
    block = format_conversation_history_for_router(history)
    assert "Recent conversation" in block
    assert "Sửa abstract" in block


def test_quota_rate_limit_message_vietnamese():
    reset_rate_limit_state()
    uid = __import__("uuid").uuid4()
    for _ in range(2):
        check_rate_limit(uid, 2)
    try:
        check_rate_limit(uid, 2)
        assert False, "expected QuotaExceededError"
    except QuotaExceededError as exc:
        assert "quá nhiều yêu cầu" in str(exc).lower()


def test_friendly_llm_error_preserves_quota_message():
    err = QuotaExceededError("Bạn đã dùng hết hạn mức token hôm nay.")
    assert friendly_llm_error(err) == str(err)


def test_infer_followup_intent_short_refinement():
    history = [{"role": "assistant", "content": "Đã cập nhật — xem diff và Accept/Reject."}]
    result = infer_followup_intent("ngắn hơn nữa", history, has_selection=False)
    assert result is not None
    assert result.action == "style"


def test_infer_followup_after_user_edit_message():
    history = [
        {"role": "user", "content": "/edit sửa phần Abstract cho ngắn hơn"},
        {"role": "assistant", "content": "Đã cập nhật — xem diff."},
    ]
    assert looks_like_edit_followup("hay hơn nữa", history)
    result = infer_followup_intent("hay hơn nữa", history, has_selection=False)
    assert result is not None
    assert result.action in ("edit", "style")


def test_greeting_after_edit_is_not_edit_followup():
    history = [{"role": "assistant", "content": "Đã cập nhật main.tex — xem diff và Accept/Reject."}]
    assert not looks_like_edit_followup("chào", history)
    assert infer_followup_intent("chào", history, has_selection=False) is None
    assert fallback_intent("chào", has_latex=True, has_selection=False).action == "chat"


def test_classify_intent_greeting_after_edit_is_chat():
    import asyncio

    from src.services.intent_router import classify_intent

    history = [{"role": "assistant", "content": "Đã cập nhật main.tex — xem diff và Accept/Reject."}]
    result = asyncio.run(
        classify_intent(
            "chào",
            has_latex=True,
            has_selection=False,
            conversation_history=history,
        )
    )
    assert result.action == "chat"


def test_fallback_intent_improve_section_question():
    result = fallback_intent("Làm abstract hay hơn được không?", has_latex=True, has_selection=False)
    assert result.action in ("edit", "style")


def test_friendly_llm_error_rate_limit():
    msg = friendly_llm_error(Exception("Error code: 429 - rate_limit exceeded"))
    assert "giới hạn tốc độ" in msg.lower()


def test_friendly_llm_error_model_not_found():
    msg = friendly_llm_error(Exception("model 'foo' not found"))
    assert "model không khả dụng" in msg.lower()


def test_prepend_conversation_history():
    from src.services.chat_context import prepend_conversation_history

    out = prepend_conversation_history(
        "Current request",
        [{"role": "user", "content": "Sửa abstract"}],
    )
    assert "Recent conversation" in out
    assert "Current request" in out


def test_edit_node_blocks_vague_query():
    import asyncio

    from src.agents.nodes.academic_nodes import edit_node

    result = asyncio.run(
        edit_node(
            {
                "latex": "\\begin{document}Hello\\end{document}",
                "query": "Chỉnh sửa bản thảo",
                "selection": "",
            }
        )
    )
    assert result.get("edits") == []
    assert "nói rõ" in result.get("response", "").lower()


def test_structure_node_skips_llm_when_rule_warnings(monkeypatch):
    from src.agents.nodes.academic_nodes import structure_node
    from src.services.parser.latex import parse_latex_sections

    def _should_not_run(*_args, **_kwargs):
        raise AssertionError("LLM should not run when rule warnings exist")

    monkeypatch.setattr("src.agents.nodes.academic_nodes.get_llm", _should_not_run)

    latex = r"""
\begin{abstract}Sum\end{abstract}
\section{Introduction}Long enough introduction content here for the parser.
\section{Results}Long enough results content here for parser checks.
\section{Discussion}Long enough discussion content here for parser.
\section{Conclusion}Long enough conclusion content here for parser.
"""
    import asyncio

    result = asyncio.run(
        structure_node(
            {
                "latex": latex,
                "parsed_sections": parse_latex_sections(latex),
                "query": "check structure",
            }
        )
    )
    assert any(s.get("section") == "Methods" for s in result["structure_suggestions"])
