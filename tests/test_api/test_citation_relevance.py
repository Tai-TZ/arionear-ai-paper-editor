"""POST /api/v1/citations/relevance — Citation Layer 4 (mocked LLM + source lookup, no network)."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from src.services.citations import relevance
from src.services.citations.sources import SourceText
from src.services.quota_policy import QuotaExceededError

LATEX = (
    "\\documentclass{article}\n\\begin{document}\n"
    "Residual connections make very deep networks trainable \\citep{he2016}.\n\n"
    "Transformers rely entirely on attention \\cite{vaswani2017, he2016}.\n"
    "\\end{document}\n"
)
BIB = (
    "@inproceedings{he2016, title={Deep Residual Learning for Image Recognition}, doi={10.1109/CVPR.2016.90}}\n"
    "@inproceedings{vaswani2017, title={Attention Is All You Need}}\n"
)
SUPPORTS = '{"verdict": "supports", "rationale": "The abstract reports trainable 152-layer nets.", "confidence": 0.85}'


class FakeLLM:
    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.calls = 0

    async def ainvoke(self, _messages):
        self.calls += 1
        return SimpleNamespace(content=self.reply, additional_kwargs={})


async def _create_session(client) -> str:
    session_id = str(uuid.uuid4())
    res = await client.post(
        "/api/v1/sessions",
        json={"id": session_id, "name": "Relevance", "latex_content": LATEX},
    )
    assert res.status_code == 200, res.text
    return session_id


@pytest.fixture
def mocked_layer4(monkeypatch):
    llm = FakeLLM(SUPPORTS)

    async def fake_fetch_source_text(entry, **_kwargs):
        if entry["key"] == "he2016":
            return SourceText(
                title="Deep Residual Learning for Image Recognition",
                abstract="We present a residual learning framework to ease the training of deeper networks.",
                source="openalex",
            )
        return SourceText(title=entry.get("title", ""))  # abstract unavailable

    monkeypatch.setattr(relevance, "build_relevance_llm", lambda chat_provider=None: (llm, "google", "gemini"))
    monkeypatch.setattr(relevance, "fetch_source_text", fake_fetch_source_text)
    monkeypatch.setattr(relevance, "enforce_llm_quota_for_paper", lambda _session_id: None)
    return llm


@pytest.mark.asyncio
async def test_relevance_endpoint_returns_per_key_verdicts(client, mocked_layer4):
    session_id = await _create_session(client)

    res = await client.post(
        "/api/v1/citations/relevance",
        json={"session_id": session_id, "keys": ["he2016", "vaswani2017"], "bib_content": BIB, "locale": "en"},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    by_key = {item["key"]: item for item in body["results"]}
    assert list(by_key) == ["he2016", "vaswani2017"]

    he = by_key["he2016"]
    assert he["verdict"] == "supports"
    assert he["reason"] == "judged"
    assert he["confidence"] == pytest.approx(0.85)
    assert he["source"] == "openalex"
    assert he["claim_snippets"] == [
        "Residual connections make very deep networks trainable [he2016].",
        "Transformers rely entirely on attention [vaswani2017, he2016].",
    ]

    vaswani = by_key["vaswani2017"]
    assert vaswani["verdict"] == "insufficient_info"
    assert vaswani["reason"] == "no_abstract"
    assert vaswani["rationale"] == ""

    assert mocked_layer4.calls == 1  # no LLM call without an abstract
    assert body["skipped_keys"] == []
    assert body["max_keys"] == 15
    assert "Checked relevance of 2 citations" in body["summary"]


@pytest.mark.asyncio
async def test_relevance_endpoint_prefers_live_latex_and_is_read_only(client, mocked_layer4):
    session_id = await _create_session(client)
    live = LATEX.replace("very deep networks trainable", "extremely deep models trainable")

    res = await client.post(
        "/api/v1/citations/relevance",
        json={"session_id": session_id, "keys": ["he2016"], "bib_content": BIB, "latex_content": live},
    )

    assert res.status_code == 200, res.text
    assert "extremely deep models" in res.json()["results"][0]["claim_snippets"][0]
    session = await client.get(f"/api/v1/sessions/{session_id}")
    assert session.json()["latex_content"] == LATEX


@pytest.mark.asyncio
async def test_relevance_endpoint_quota_exceeded_returns_429(client, mocked_layer4, monkeypatch):
    session_id = await _create_session(client)

    def over_quota(_session_id):
        raise QuotaExceededError("Bạn đã dùng hết hạn mức token hôm nay (1,000 token).")

    monkeypatch.setattr(relevance, "enforce_llm_quota_for_paper", over_quota)
    res = await client.post(
        "/api/v1/citations/relevance",
        json={"session_id": session_id, "keys": ["he2016"], "bib_content": BIB},
    )
    assert res.status_code == 429
    assert "hạn mức" in res.json()["detail"]
    assert mocked_layer4.calls == 0


@pytest.mark.asyncio
async def test_relevance_endpoint_missing_provider_key_returns_400(client, mocked_layer4, monkeypatch):
    session_id = await _create_session(client)

    def no_key(chat_provider=None):
        raise ValueError("No API key configured for provider 'zai'.")

    monkeypatch.setattr(relevance, "build_relevance_llm", no_key)
    res = await client.post(
        "/api/v1/citations/relevance",
        json={"session_id": session_id, "keys": ["he2016"], "bib_content": BIB},
    )
    assert res.status_code == 400
    assert "API key" in res.json()["detail"]


@pytest.mark.asyncio
async def test_relevance_endpoint_validation(client):
    res = await client.post("/api/v1/citations/relevance", json={"keys": ["a"]})
    assert res.status_code == 422

    res = await client.post(
        "/api/v1/citations/relevance",
        json={"session_id": "x", "llm_provider": "not-a-provider"},
    )
    assert res.status_code == 422
