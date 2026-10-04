"""``extract_llm_json`` and the LLM-reply parsers built on it (intent, edit plan, audits, review, L4, structure)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from src.services.citations.relevance import parse_relevance_output
from src.services.edit_planner import parse_edit_plan_payload
from src.services.intent_router import parse_intent_payload
from src.services.llm_json import extract_llm_json
from src.services.logic_audit.paper_gate_skim import _extract_json
from src.services.logic_audit.runner import _extract_json_object
from src.services.peer_review.json_utils import extract_json_value

# --- extract_llm_json --------------------------------------------------------------------------


def test_plain_json_is_returned_as_is():
    assert extract_llm_json('{"a": 1}') == {"a": 1}
    assert extract_llm_json("[1, 2]") == [1, 2]
    assert extract_llm_json("{}", expect=dict) == {}


def test_think_markup_and_code_fences_are_stripped():
    raw = '<think>plan</think>\n<thinking>more</thinking>\n```json\n{"a": "x"}\n```'
    assert extract_llm_json(raw, expect=dict) == {"a": "x"}
    assert extract_llm_json('```json {"a": 1}```', expect=dict) == {"a": 1}


def test_fenced_block_after_prose_and_another_fence():
    raw = 'Change:\n```latex\n\\section{Intro}\n```\nResult:\n```json\n{"ok": true}\n```'
    assert extract_llm_json(raw, expect=dict) == {"ok": True}


def test_prose_around_a_nested_object_returns_the_outer_object():
    raw = 'Sure! {"action": "edit", "scope": "document", "meta": {"why": "rewrite"}} Hope this helps.'
    assert extract_llm_json(raw, expect=dict) == {
        "action": "edit",
        "scope": "document",
        "meta": {"why": "rewrite"},
    }


def test_two_objects_first_wins():
    assert extract_llm_json('{"a": 1}\n{"b": 2}', expect=dict) == {"a": 1}
    assert extract_llm_json('{"a": 1} {"b": 2}') == {"a": 1}


def test_trailing_comma_is_repaired():
    assert extract_llm_json('{"action": "edit", "scope": "document",}', expect=dict) == {
        "action": "edit",
        "scope": "document",
    }


def test_truncated_array_is_repaired():
    assert extract_llm_json('[{"a": 1}, {"b": 2', expect=list) == [{"a": 1}, {"b": 2}]


def test_truncated_object_keeps_the_outer_value():
    raw = '{"items": [{"t": "x"}, {"t": "y"'
    assert extract_llm_json(raw) == {"items": [{"t": "x"}, {"t": "y"}]}


def test_braces_inside_strings_do_not_end_the_value():
    raw = 'Result: {"replace": "\\\\textbf{x} and }", "n": 1} done'
    assert extract_llm_json(raw, expect=dict) == {"replace": "\\textbf{x} and }", "n": 1}


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        "The source supports the claim.",
        "I think {it} is fine, see [the appendix].",
        "{not json}",
        "{",
        "<think>only thoughts</think>",
    ],
)
def test_prose_and_garbage_return_none(raw):
    assert extract_llm_json(raw) is None
    assert extract_llm_json(raw, expect=dict) is None


def test_expected_type_is_enforced():
    assert extract_llm_json("[1, 2]", expect=dict) is None
    assert extract_llm_json('{"a": 1}', expect=list) is None
    assert extract_llm_json('"just a string"', expect=dict) is None
    assert extract_llm_json('Here: [{"a": 1}]', expect=list) == [{"a": 1}]


def test_object_preferred_over_bracketed_prose_when_no_type_expected():
    assert extract_llm_json('As noted in [1], here it is: {"items": []}') == {"items": []}
    assert extract_llm_json("prefix [1, 2] suffix") == [1, 2]


# --- callers -----------------------------------------------------------------------------------


def test_intent_prose_with_nested_object_routes_to_edit():
    raw = 'Classification: {"action": "edit", "scope": "selection", "reason": {"kind": "rewrite"}}'
    result = parse_intent_payload(raw)
    assert result is not None
    assert (result.action, result.scope) == ("edit", "selection")


def test_intent_trailing_comma_still_parses():
    result = parse_intent_payload('{"action": "edit", "scope": "document",}')
    assert result is not None and result.action == "edit"


def test_intent_prose_only_is_none():
    assert parse_intent_payload("I think the user wants to chat.") is None


def test_edit_plan_prose_with_nested_object():
    raw = 'Plan: {"target_type": "section", "target_id": "Methods", "operation": "replace_body", "meta": {"a": 1}}'
    plan = parse_edit_plan_payload(raw)
    assert plan is not None
    assert (plan.target_type, plan.target_id, plan.operation) == ("section", "Methods", "replace_body")


def test_peer_review_two_objects_first_wins_and_truncation_is_repaired():
    assert extract_json_value('{"items": [1]}\n{"items": [2]}') == {"items": [1]}
    assert extract_json_value('{"items": [{"t": "x"}, {"t": "y"') == {"items": [{"t": "x"}, {"t": "y"}]}


def test_logic_audit_truncated_object_is_repaired():
    data = _extract_json_object('```json\n{"conflicts": [], "weak_claims": ["x", "y"')
    assert data == {"conflicts": [], "weak_claims": ["x", "y"]}


def test_gate_skim_trailing_comma_is_repaired():
    assert _extract_json('{"summary": "ok", "sections": [],}') == {"summary": "ok", "sections": []}


def test_relevance_prose_with_object_is_parsed_and_still_validated():
    raw = 'Verdict: {"verdict": "partial", "rationale": "On topic.", "confidence": 0.5, "extra": {"k": 1}}'
    parsed = parse_relevance_output(raw)
    assert parsed is not None and parsed.verdict == "partial"
    assert parse_relevance_output('{"verdict": "bogus", "rationale": "x", "confidence": 0.5,}') is None


def test_structure_node_accepts_fenced_llm_suggestions(monkeypatch):
    from src.agents.nodes import academic_nodes

    reply = '```json\n[{"type": "clarity", "section": "Methods", "message": "Name the dataset.", "severity": "info"}, 7]\n```'

    class _FakeLLM:
        async def ainvoke(self, _messages):
            return SimpleNamespace(content=reply, additional_kwargs={})

    monkeypatch.setattr(academic_nodes, "get_llm", lambda **_kwargs: _FakeLLM())
    body = "Enough words here to avoid the very short section notice in the rule-based structure checks."
    latex = (
        rf"\begin{{abstract}}{body}\end{{abstract}}"
        rf"\section{{Introduction}}{body}\section{{Methods}}{body}\section{{Results}}{body}"
        rf"\section{{Discussion}}{body}\section{{Conclusion}}{body}"
    )
    result = asyncio.run(academic_nodes.structure_node({"latex": latex, "query": "check structure"}))
    assert result["structure_suggestions"] == [
        {"type": "clarity", "section": "Methods", "message": "Name the dataset.", "severity": "info"}
    ]
