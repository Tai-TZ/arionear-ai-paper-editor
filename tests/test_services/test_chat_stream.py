from __future__ import annotations

import asyncio
import json

import pytest

from src.models.schemas import ChatRequest
from src.services.chat_stream import (
    AGENT_TASK_TIMEOUT_SEC,
    AgentTaskTimeoutError,
    _agent_timeout_message,
    _localize_agent_response,
    _merge_agent_into_done,
    _monitor_long_task,
    _scope_detail,
    stream_chat,
)
from src.services.intent_rules import IntentResult
from src.services.quota_policy import QuotaExceededError


def _parse_sse(chunks: list[str]) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for chunk in chunks:
        if chunk.startswith(":"):
            continue
        for block in chunk.split("\n\n"):
            block = block.strip()
            if not block:
                continue
            event_type: str | None = None
            data: dict | None = None
            for line in block.split("\n"):
                if line.startswith("event: "):
                    event_type = line[7:].strip()
                elif line.startswith("data: "):
                    data = json.loads(line[6:])
            if event_type and data is not None:
                events.append((event_type, data))
    return events


async def _collect_stream(request: ChatRequest) -> list[tuple[str, dict]]:
    chunks: list[str] = []
    async for chunk in stream_chat(request):
        chunks.append(chunk)
    return _parse_sse(chunks)


def test_merge_agent_includes_revision_id():
    done: dict = {"revision_id": "", "suggestion": ""}
    _merge_agent_into_done(
        done,
        {
            "suggestion": "polished text",
            "original_text": "raw text",
            "apply_mode": "selection",
            "metadata": {"revision_id": "rev-abc-123"},
        },
    )
    assert done["revision_id"] == "rev-abc-123"
    assert done["apply_mode"] == "selection"
    assert done["suggestion"] == "polished text"


def test_localize_agent_response_maps_edit_errors():
    assert "LaTeX" in _localize_agent_response("No LaTeX source available to edit.")
    assert _localize_agent_response("Custom message") == "Custom message"


def test_scope_detail_for_metadata_title():
    section, detail = _scope_detail(
        {
            "section": "title",
            "original_text": "My Paper",
            "apply_mode": "document",
        }
    )
    assert section == "title"
    assert "\\title" in detail


@pytest.mark.asyncio
async def test_stream_structure_emits_done(monkeypatch):
    async def _mock_classify_intent(*_args, **_kwargs):
        return IntentResult(action="structure")

    async def _mock_structure_node(_state):
        return {
            "structure_suggestions": [
                {"section": "Methods", "severity": "warning", "message": "Thiếu Methods"}
            ],
            "response": "Gợi ý cấu trúc:\n- [WARNING] Methods: Thiếu Methods",
        }

    monkeypatch.setattr("src.services.chat_stream.classify_intent", _mock_classify_intent)
    monkeypatch.setattr("src.services.chat_stream.structure_node", _mock_structure_node)
    monkeypatch.setattr(
        "src.services.chat_stream.enforce_llm_quota_for_paper",
        lambda *_args, **_kwargs: None,
    )

    latex = r"""
\begin{abstract}Sum\end{abstract}
\section{Introduction}Long enough introduction content here for the parser.
"""
    request = ChatRequest(
        message="/structure",
        session_id="test-session",
        latex_content=latex,
        task="structure",
    )
    events = await _collect_stream(request)
    event_types = [name for name, _ in events]
    assert "done" in event_types
    done = next(data for name, data in events if name == "done")
    assert done["task"] == "structure"
    assert any(s.get("section") == "Methods" for s in done.get("structure_suggestions", []))


@pytest.mark.asyncio
async def test_stream_quota_error_emits_error(monkeypatch):
    def _raise_quota(*_args, **_kwargs):
        raise QuotaExceededError("Đã dùng hết lượt AI hôm nay.")

    monkeypatch.setattr("src.services.chat_stream.enforce_llm_quota_for_paper", _raise_quota)

    request = ChatRequest(message="hello", session_id="quota-test")
    events = await _collect_stream(request)
    error = next((data for name, data in events if name == "error"), None)
    assert error is not None
    assert "hết lượt" in error["message"].lower()


@pytest.mark.asyncio
async def test_stream_scope_guard_blocks_before_manuscript_parse(monkeypatch):
    classify_called = False

    async def _mock_classify(*_args, **_kwargs):
        nonlocal classify_called
        classify_called = True
        return IntentResult(action="edit")

    monkeypatch.setattr("src.services.chat_stream.classify_intent", _mock_classify)
    monkeypatch.setattr(
        "src.services.chat_stream.enforce_llm_quota_for_paper",
        lambda *_args, **_kwargs: None,
    )

    latex = r"\begin{document}body\end{document}"
    request = ChatRequest(
        message="code python function sort",
        session_id="guard-early-test",
        latex_content=latex,
    )
    events = await _collect_stream(request)
    assert not classify_called
    parse_states = [
        data for name, data in events if name == "state" and data.get("step_id") == "parse"
    ]
    assert parse_states == []
    done = next(data for name, data in events if name == "done")
    assert done["task"] == "chat"
    assert "ARIONEAR" in done["response"]


@pytest.mark.asyncio
async def test_stream_edit_vague_query_returns_guidance(monkeypatch):
    async def _mock_classify_intent(*_args, **_kwargs):
        return IntentResult(action="edit")

    async def _mock_edit_node(_state):
        return {
            "edits": [],
            "response": (
                "Hãy nói rõ phần cần sửa — ví dụ: «sửa Abstract», «đổi tiêu đề», "
                "«viết lại phần Methods». Hoặc bôi đen đoạn trong editor rồi gửi /edit."
            ),
        }

    monkeypatch.setattr("src.services.chat_stream.classify_intent", _mock_classify_intent)
    monkeypatch.setattr("src.services.chat_stream.edit_node", _mock_edit_node)
    monkeypatch.setattr(
        "src.services.chat_stream.enforce_llm_quota_for_paper",
        lambda *_args, **_kwargs: None,
    )

    request = ChatRequest(message="/edit", task="edit", latex_content="\\begin{document}x\\end{document}")
    events = await _collect_stream(request)
    done = next(data for name, data in events if name == "done")
    assert "nói rõ" in done["response"].lower()
    assert not done.get("edits")


@pytest.mark.asyncio
async def test_stream_edit_no_latex_returns_vietnamese(monkeypatch):
    async def _mock_classify_intent(*_args, **_kwargs):
        return IntentResult(action="edit")

    async def _mock_edit_node(_state):
        return {"error": "No LaTeX source available to edit."}

    monkeypatch.setattr("src.services.chat_stream.classify_intent", _mock_classify_intent)
    monkeypatch.setattr("src.services.chat_stream.edit_node", _mock_edit_node)
    monkeypatch.setattr("src.services.chat_stream.prepare_edit_target", lambda state, _msg: state)
    monkeypatch.setattr(
        "src.services.chat_stream.enforce_llm_quota_for_paper",
        lambda *_args, **_kwargs: None,
    )

    request = ChatRequest(message="/edit sửa abstract", task="edit", latex_content="")
    events = await _collect_stream(request)
    done = next(data for name, data in events if name == "done")
    assert "LaTeX" in done["response"]


@pytest.mark.asyncio
async def test_agent_timeout_message_mentions_task():
    msg = _agent_timeout_message("edit", AGENT_TASK_TIMEOUT_SEC)
    assert "chỉnh sửa" in msg.lower()
    assert "90" in msg


@pytest.mark.asyncio
async def test_monitor_long_task_raises_on_timeout():
    async def _slow():
        await asyncio.sleep(5)
        return {"ok": True}

    with pytest.raises(AgentTaskTimeoutError):
        async for _event in _monitor_long_task(
            _slow(),
            lambda _e: ("", ""),
            interval=0.05,
            timeout_sec=0.15,
            timeout_task="edit",
        ):
            pass


@pytest.mark.asyncio
async def test_stream_edit_timeout_emits_error(monkeypatch):
    async def _mock_classify_intent(*_args, **_kwargs):
        return IntentResult(action="edit")

    async def _slow_edit(_state):
        await asyncio.sleep(10)
        return {}

    monkeypatch.setattr("src.services.chat_stream.classify_intent", _mock_classify_intent)
    monkeypatch.setattr("src.services.chat_stream.edit_node", _slow_edit)
    monkeypatch.setattr("src.services.chat_stream.prepare_edit_target", lambda state, _msg: state)
    monkeypatch.setattr(
        "src.services.chat_stream.enforce_llm_quota_for_paper",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr("src.services.chat_stream.AGENT_TASK_TIMEOUT_SEC", 0.2)

    request = ChatRequest(
        message="/edit sửa abstract",
        task="edit",
        latex_content="\\begin{document}\\section{A}Text\\end{document}",
    )
    events = await _collect_stream(request)
    error = next((data for name, data in events if name == "error"), None)
    assert error is not None
    assert "chỉnh sửa" in error["message"].lower()
    assert "timed out" in error["message"].lower()


@pytest.mark.asyncio
async def test_stream_logic_audit_timeout_emits_error(monkeypatch):
    async def _slow_logic_audit(**_kwargs):
        await asyncio.sleep(10)
        return {"response": "done", "logic_audit_report": {"sections": []}}

    monkeypatch.setattr(
        "src.services.logic_audit.runner.run_logic_audit",
        _slow_logic_audit,
    )
    monkeypatch.setattr(
        "src.services.chat_stream.enforce_llm_quota_for_paper",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr("src.services.chat_stream.LOGIC_AUDIT_TIMEOUT_SEC", 0.2)

    request = ChatRequest(
        message="/logic",
        task="logic",
        latex_content="\\begin{document}\\section{A}Text\\end{document}",
        logic_audit_mode="quick",
    )
    events = await _collect_stream(request)
    error = next((data for name, data in events if name == "error"), None)
    assert error is not None
    assert "logic" in error["message"].lower()
    assert "timed out" in error["message"].lower()
