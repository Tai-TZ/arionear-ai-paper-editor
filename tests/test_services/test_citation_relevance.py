"""Citation Layer 4 — LLM relevance judgments with a mocked LLM (no network, no provider keys)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from src.models.citation_schemas import RELEVANCE_MAX_KEYS_PER_REQUEST, CitationRelevanceRequest
from src.services.citations import relevance
from src.services.citations.relevance import (
    build_relevance_messages,
    check_citation_relevance,
    judge_citation,
    parse_relevance_output,
    run_citation_relevance,
)
from src.services.citations.sources import SourceText, enrich_entry_from_registry

ABSTRACT = "We show that residual connections make networks with over 100 layers trainable."
SOURCE = SourceText(title="Deep Residual Learning", abstract=ABSTRACT, source="openalex")
CLAIM = ["Residual connections ease optimisation of very deep networks [he2016]."]


class FakeLLM:
    """Records prompts; replies with a fixed string (or raises / sleeps)."""

    def __init__(self, reply: str = "", *, error: Exception | None = None, delay: float = 0.0) -> None:
        self.reply = reply
        self.error = error
        self.delay = delay
        self.calls: list[list] = []

    async def ainvoke(self, messages):
        self.calls.append(messages)
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.error:
            raise self.error
        return SimpleNamespace(content=self.reply, additional_kwargs={})


VALID_REPLY = (
    '{"verdict": "supports", "rationale": "The abstract states residual nets train deeply.", "confidence": 0.9}'
)


# ---------------------------------------------------------------------------
# Strict output parsing
# ---------------------------------------------------------------------------


def test_parse_valid_json():
    parsed = parse_relevance_output(VALID_REPLY)
    assert parsed is not None
    assert parsed.verdict == "supports"
    assert parsed.confidence == pytest.approx(0.9)


def test_parse_fenced_json_with_thinking_tags():
    raw = '<think>hmm</think>\n```json\n{"verdict": "partial", "rationale": "On topic.", "confidence": 0.5}\n```'
    parsed = parse_relevance_output(raw)
    assert parsed is not None and parsed.verdict == "partial"


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "The source supports the claim.",
        "{not json}",
        '["supports"]',
        '{"verdict": "relevant", "rationale": "x", "confidence": 0.5}',
        '{"verdict": "supports", "rationale": "x", "confidence": 1.7}',
        '{"verdict": "supports", "rationale": "   ", "confidence": 0.5}',
        '{"verdict": "supports", "confidence": 0.5}',
        '{"verdict": "supports", "rationale": "x"}',
    ],
)
def test_parse_invalid_output_returns_none(raw):
    assert parse_relevance_output(raw) is None


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------


def test_prompt_contains_only_provided_text_and_language():
    messages = build_relevance_messages("he2016", CLAIM, SOURCE, language="Vietnamese")
    system, user = messages[0].content, messages[1].content
    assert "Judge ONLY" in system
    assert "Never invent" in system
    assert "Vietnamese" in system and "{response_language}" not in system
    assert "he2016" in user
    assert CLAIM[0] in user
    assert ABSTRACT in user
    assert "Deep Residual Learning" in user
    assert "{" + "source_abstract}" not in user


# ---------------------------------------------------------------------------
# Single judgment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_judge_valid_json_returns_verdict():
    llm = FakeLLM(VALID_REPLY)
    usage: list[tuple[str, str]] = []
    item = await judge_citation(llm, "he2016", CLAIM, SOURCE, language="English", usage=usage)
    assert item.verdict == "supports"
    assert item.reason == "judged"
    assert item.rationale.startswith("The abstract states")
    assert item.confidence == pytest.approx(0.9)
    assert item.claim_snippets == CLAIM
    assert item.source == "openalex"
    assert item.source_title == "Deep Residual Learning"
    assert len(llm.calls) == 1
    assert len(usage) == 1


@pytest.mark.asyncio
async def test_judge_invalid_json_is_insufficient_info():
    llm = FakeLLM("Sure! The paper clearly supports it.")
    item = await judge_citation(llm, "he2016", CLAIM, SOURCE, language="English")
    assert item.verdict == "insufficient_info"
    assert item.reason == "invalid_output"
    assert item.rationale == ""
    assert item.confidence == 0.0


@pytest.mark.asyncio
async def test_judge_missing_abstract_skips_llm():
    llm = FakeLLM(VALID_REPLY)
    item = await judge_citation(llm, "he2016", CLAIM, SourceText(title="Deep Residual Learning"), language="English")
    assert item.verdict == "insufficient_info"
    assert item.reason == "no_abstract"
    assert item.source_title == "Deep Residual Learning"
    assert llm.calls == []


@pytest.mark.asyncio
async def test_judge_without_claim_context_skips_llm():
    llm = FakeLLM(VALID_REPLY)
    item = await judge_citation(llm, "he2016", [], SOURCE, language="English")
    assert item.reason == "not_cited"
    assert item.verdict == "insufficient_info"
    assert llm.calls == []


@pytest.mark.asyncio
async def test_judge_llm_error_and_timeout_are_insufficient_info():
    failing = FakeLLM(error=RuntimeError("Error code: 503 overloaded"))
    item = await judge_citation(failing, "he2016", CLAIM, SOURCE, language="English")
    assert (item.verdict, item.reason) == ("insufficient_info", "llm_error")

    slow = FakeLLM(VALID_REPLY, delay=1.0)
    item = await judge_citation(slow, "he2016", CLAIM, SOURCE, language="English", timeout_sec=0.01)
    assert (item.verdict, item.reason) == ("insufficient_info", "llm_error")


# ---------------------------------------------------------------------------
# Batch orchestration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_check_relevance_keeps_order_and_only_calls_llm_when_possible():
    llm = FakeLLM(VALID_REPLY)
    fetched: list[str] = []

    async def fetch_source(entry: dict) -> SourceText:
        fetched.append(entry["key"])
        return SOURCE if entry["key"] == "with_abstract" else SourceText(title="No Abstract Paper")

    results = await check_citation_relevance(
        keys=["not_cited", "with_abstract", "no_abstract"],
        claim_map={"with_abstract": CLAIM, "no_abstract": ["Some claim [no_abstract]."]},
        entries={"with_abstract": {"key": "with_abstract", "title": "Deep Residual Learning"}},
        llm=llm,
        language="English",
        fetch_source=fetch_source,
    )

    assert [r.key for r in results] == ["not_cited", "with_abstract", "no_abstract"]
    assert [r.reason for r in results] == ["not_cited", "judged", "no_abstract"]
    assert [r.verdict for r in results] == ["insufficient_info", "supports", "insufficient_info"]
    assert sorted(fetched) == ["no_abstract", "with_abstract"]  # never fetched for an uncited key
    assert len(llm.calls) == 1


@pytest.mark.asyncio
async def test_check_relevance_slow_or_failing_source_lookup_is_no_abstract(monkeypatch):
    monkeypatch.setattr(relevance, "RELEVANCE_SOURCE_TIMEOUT_SEC", 0.01)
    llm = FakeLLM(VALID_REPLY)

    async def fetch_source(entry: dict) -> SourceText:
        if entry["key"] == "slow":
            await asyncio.sleep(1.0)
            return SOURCE
        raise RuntimeError("unexpected bug in lookup")

    results = await check_citation_relevance(
        keys=["slow", "broken"],
        claim_map={"slow": CLAIM, "broken": CLAIM},
        entries={"slow": {"key": "slow", "title": "Deep Residual Learning"}},
        llm=llm,
        language="English",
        fetch_source=fetch_source,
    )

    assert [(r.key, r.reason) for r in results] == [("slow", "no_abstract"), ("broken", "no_abstract")]
    assert results[0].source_title == "Deep Residual Learning"
    assert llm.calls == []


def test_enrich_entry_from_registry_fills_missing_identifiers():
    entry = {"key": "k", "title": "", "doi": "", "eprint": "", "raw": ""}
    registry = {"metadata": {"title": "Canonical Title", "external_ids": {"DOI": "10.1/x", "ArXiv": "2001.00001"}}}
    merged = enrich_entry_from_registry(entry, registry)
    assert merged["title"] == "Canonical Title"
    assert merged["doi"] == "10.1/x"
    assert merged["eprint"] == "2001.00001"
    assert entry["title"] == ""  # original untouched
    assert enrich_entry_from_registry(entry, None) is entry


# ---------------------------------------------------------------------------
# Endpoint service
# ---------------------------------------------------------------------------


def _manuscript(n_keys: int) -> tuple[str, str]:
    body = "\n\n".join(f"Claim number {i} is backed by evidence \\cite{{key{i}}}." for i in range(n_keys))
    latex = f"\\documentclass{{article}}\n\\begin{{document}}\n{body}\n\\end{{document}}"
    bib = "\n".join(f"@article{{key{i}, title={{Paper {i}}}, doi={{10.1000/p{i}}}}}" for i in range(n_keys))
    return latex, bib


@pytest.mark.asyncio
async def test_run_relevance_caps_keys_and_uses_quota_and_llm(monkeypatch):
    llm = FakeLLM(VALID_REPLY)
    quota_calls: list[str | None] = []
    built: list[str | None] = []

    def fake_build(chat_provider=None):
        built.append(chat_provider)
        return llm, "google", "gemini-2.5-flash"

    async def fake_fetch_source_text(entry, **_kwargs):
        assert entry["doi"].startswith("10.1000/")
        return SourceText(title=entry["title"], abstract=ABSTRACT, source="openalex")

    monkeypatch.setattr(relevance, "build_relevance_llm", fake_build)
    monkeypatch.setattr(relevance, "fetch_source_text", fake_fetch_source_text)
    monkeypatch.setattr(relevance, "enforce_llm_quota_for_paper", lambda session_id: quota_calls.append(session_id))

    latex, bib = _manuscript(RELEVANCE_MAX_KEYS_PER_REQUEST + 3)
    keys = [f"key{i}" for i in range(RELEVANCE_MAX_KEYS_PER_REQUEST + 3)]
    response = await run_citation_relevance(
        CitationRelevanceRequest(session_id="rel-cap", keys=keys, latex_content=latex, bib_content=bib, locale="vi")
    )

    assert len(response.results) == RELEVANCE_MAX_KEYS_PER_REQUEST
    assert response.skipped_keys == keys[RELEVANCE_MAX_KEYS_PER_REQUEST:]
    assert all(r.verdict == "supports" for r in response.results)
    assert len(llm.calls) == RELEVANCE_MAX_KEYS_PER_REQUEST
    assert quota_calls == ["rel-cap"]
    assert built == [None]
    assert "Vietnamese" in llm.calls[0][0].content
    assert response.summary.startswith(f"Checked relevance of {RELEVANCE_MAX_KEYS_PER_REQUEST} citations")


@pytest.mark.asyncio
async def test_run_relevance_without_claims_never_builds_llm(monkeypatch):
    def fail_build(*_args, **_kwargs):
        raise AssertionError("LLM must not be built")

    def fail_quota(*_args, **_kwargs):
        raise AssertionError("quota must not be consumed")

    monkeypatch.setattr(relevance, "build_relevance_llm", fail_build)
    monkeypatch.setattr(relevance, "enforce_llm_quota_for_paper", fail_quota)

    latex = "\\documentclass{article}\\begin{document}No cites at all.\\end{document}"
    response = await run_citation_relevance(
        CitationRelevanceRequest(session_id="rel-none", keys=["ghost"], latex_content=latex)
    )
    assert [(r.key, r.reason) for r in response.results] == [("ghost", "not_cited")]

    empty = await run_citation_relevance(CitationRelevanceRequest(session_id="rel-empty", latex_content=latex))
    assert empty.results == []
