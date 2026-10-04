"""OpenAlex lookup layer + abstract reconstruction (mocked HTTP — never hits the network)."""

from __future__ import annotations

import httpx
import pytest

from src.services.citations import openalex, verifier
from src.services.citations.openalex import (
    fetch_openalex_by_doi,
    normalize_doi,
    reconstruct_abstract,
    search_openalex_by_title,
)
from src.services.citations.verifier import verify_single_citation

_REAL_ASYNC_CLIENT = httpx.AsyncClient


def _install_transport(monkeypatch, handler) -> list[httpx.Request]:
    """Route every httpx.AsyncClient created during the test through a MockTransport."""
    seen: list[httpx.Request] = []

    def recording_handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(recording_handler)
        return _REAL_ASYNC_CLIENT(*args, **kwargs)

    monkeypatch.setattr(openalex.httpx, "AsyncClient", factory)
    return seen


def _work(title: str = "Attention Is All You Need", **extra) -> dict:
    return {
        "id": "https://openalex.org/W2963403868",
        "doi": "https://doi.org/10.5555/3295222.3295349",
        "title": title,
        "display_name": title,
        "publication_year": 2017,
        "abstract_inverted_index": {"The": [0], "dominant": [1], "models": [2]},
        **extra,
    }


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def test_reconstruct_abstract_orders_words_by_position():
    index = {"is": [1], "Attention": [0], "all": [2], "you": [3], "need.": [4], "Attention.": [5]}
    assert reconstruct_abstract(index) == "Attention is all you need. Attention."


def test_reconstruct_abstract_repeated_words_and_gaps():
    index = {"the": [0, 3], "model": [1], "beats": [2], "baseline": [5]}
    assert reconstruct_abstract(index) == "the model beats the baseline"


@pytest.mark.parametrize("bad", [None, {}, [], "text", {"word": "not-a-list"}, {"w": [-1, "x", True]}])
def test_reconstruct_abstract_invalid_input_returns_empty(bad):
    assert reconstruct_abstract(bad) == ""


def test_normalize_doi_strips_resolver_prefixes():
    assert normalize_doi("https://doi.org/10.1000/ABC.123") == "10.1000/abc.123"
    assert normalize_doi("doi:10.1000/xyz.") == "10.1000/xyz"
    assert normalize_doi("not a doi") == ""
    assert normalize_doi("") == ""


# ---------------------------------------------------------------------------
# DOI lookup
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_by_doi_success_includes_abstract_and_mailto(monkeypatch):
    seen = _install_transport(monkeypatch, lambda request: httpx.Response(200, json=_work()))

    result = await fetch_openalex_by_doi("https://doi.org/10.5555/3295222.3295349", mailto="lab@example.org")

    assert result["found"] is True
    assert result["source"] == "openalex"
    assert result["title"] == "Attention Is All You Need"
    assert result["year"] == "2017"
    assert result["doi"] == "10.5555/3295222.3295349"
    assert result["abstract"] == "The dominant models"
    request = seen[0]
    assert request.url.host == "api.openalex.org"
    assert "/works/doi:10.5555/3295222.3295349" in request.url.path
    assert request.url.params["mailto"] == "lab@example.org"
    assert "abstract_inverted_index" in request.url.params["select"]


@pytest.mark.asyncio
async def test_fetch_by_doi_without_mailto_omits_param(monkeypatch):
    seen = _install_transport(monkeypatch, lambda request: httpx.Response(200, json=_work()))
    await fetch_openalex_by_doi("10.5555/x")
    assert "mailto" not in seen[0].url.params


@pytest.mark.asyncio
async def test_fetch_by_doi_not_found_and_rate_limited(monkeypatch):
    _install_transport(monkeypatch, lambda request: httpx.Response(404, json={"error": "nope"}))
    assert await fetch_openalex_by_doi("10.1000/missing") == {"found": False}

    _install_transport(monkeypatch, lambda request: httpx.Response(429))
    assert await fetch_openalex_by_doi("10.1000/busy") == {"found": False, "rate_limited": True}


@pytest.mark.asyncio
async def test_fetch_by_doi_network_failure_returns_not_found(monkeypatch):
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    _install_transport(monkeypatch, boom)
    assert await fetch_openalex_by_doi("10.1000/offline") == {"found": False}


@pytest.mark.asyncio
async def test_fetch_by_doi_bad_payload_returns_not_found(monkeypatch):
    _install_transport(monkeypatch, lambda request: httpx.Response(200, content=b"<html>oops</html>"))
    assert await fetch_openalex_by_doi("10.1000/html") == {"found": False}

    _install_transport(monkeypatch, lambda request: httpx.Response(500))
    assert await fetch_openalex_by_doi("10.1000/err") == {"found": False}


@pytest.mark.asyncio
async def test_fetch_by_doi_skips_request_for_invalid_doi(monkeypatch):
    seen = _install_transport(monkeypatch, lambda request: httpx.Response(200, json=_work()))
    assert await fetch_openalex_by_doi("arXiv:1706.03762") == {"found": False}
    assert seen == []


# ---------------------------------------------------------------------------
# Title search
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_by_title_returns_candidates(monkeypatch):
    payload = {"results": [_work("Other Paper"), _work(), {"title": ""}]}
    seen = _install_transport(monkeypatch, lambda request: httpx.Response(200, json=payload))

    results = await search_openalex_by_title(r"Attention Is All You \emph{Need}", mailto="a@b.org")

    assert [r["title"] for r in results] == ["Other Paper", "Attention Is All You Need"]
    params = seen[0].url.params
    assert params["search"] == "Attention Is All You Need"
    assert params["per-page"] == "5"
    assert params["mailto"] == "a@b.org"


@pytest.mark.asyncio
async def test_search_by_title_failure_returns_empty(monkeypatch):
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    _install_transport(monkeypatch, boom)
    assert await search_openalex_by_title("Anything") == []

    _install_transport(monkeypatch, lambda request: httpx.Response(503))
    assert await search_openalex_by_title("Anything") == []


# ---------------------------------------------------------------------------
# Verifier integration — OpenAlex is a fallback after arXiv → CrossRef → S2
# ---------------------------------------------------------------------------


def _patch_existing_layers(monkeypatch, *, s2_result: dict | None = None) -> None:
    async def not_found(*_args, **_kwargs):
        return {"found": False}

    async def s2(*_args, **_kwargs):
        return s2_result or {"found": False, "rate_limited": True}

    monkeypatch.setattr(verifier, "_check_arxiv", not_found)
    monkeypatch.setattr(verifier, "_check_crossref", not_found)
    monkeypatch.setattr(verifier, "_check_semantic_scholar", s2)


@pytest.mark.asyncio
async def test_verifier_uses_openalex_doi_when_other_layers_miss(monkeypatch):
    _patch_existing_layers(monkeypatch)
    seen = _install_transport(monkeypatch, lambda request: httpx.Response(200, json=_work()))

    result = await verify_single_citation(
        {"key": "vaswani2017", "title": "Attention Is All You Need", "doi": "10.5555/3295222.3295349", "raw": ""},
        openalex_mailto="lab@example.org",
    )

    assert result["status"] == "verified"
    assert result["layers"] == ["openalex"]
    assert result["message"] == "Verified via OpenAlex."
    assert "abstract" not in result["metadata"]
    assert result["metadata"]["openalex_id"].endswith("W2963403868")
    assert seen[0].url.params["mailto"] == "lab@example.org"


@pytest.mark.asyncio
async def test_verifier_openalex_title_search_picks_matching_candidate(monkeypatch):
    _patch_existing_layers(monkeypatch)
    payload = {"results": [_work("Unrelated Survey"), _work("Attention Is All You Need")]}
    _install_transport(monkeypatch, lambda request: httpx.Response(200, json=payload))

    result = await verify_single_citation({"key": "v", "title": "Attention is all you need", "raw": ""})

    assert result["status"] == "verified"
    assert result["metadata"]["title"] == "Attention Is All You Need"


@pytest.mark.asyncio
async def test_verifier_openalex_title_mismatch_is_possible_mismatch(monkeypatch):
    _patch_existing_layers(monkeypatch)
    payload = {"results": [_work("A Completely Different Paper")]}
    _install_transport(monkeypatch, lambda request: httpx.Response(200, json=payload))

    result = await verify_single_citation({"key": "x", "title": "My Imaginary Study", "raw": ""})

    assert result["status"] == "possible_mismatch"
    assert result["layers"] == ["openalex"]


@pytest.mark.asyncio
async def test_verifier_openalex_network_failure_keeps_not_found(monkeypatch):
    _patch_existing_layers(monkeypatch)

    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    _install_transport(monkeypatch, boom)

    result = await verify_single_citation(
        {"key": "k", "title": "Some Title", "doi": "10.1000/abc", "raw": ""},
    )

    assert result["status"] == "not_found"
    assert result["layers"] == []
    assert result["message"] == "Could not verify citation in external databases."


@pytest.mark.asyncio
async def test_verifier_openalex_unexpected_exception_never_breaks(monkeypatch):
    _patch_existing_layers(monkeypatch)

    async def explode(*_args, **_kwargs):
        raise RuntimeError("bug")

    monkeypatch.setattr(verifier, "fetch_openalex_by_doi", explode)
    monkeypatch.setattr(verifier, "search_openalex_by_title", explode)

    result = await verify_single_citation({"key": "k", "title": "T", "doi": "10.1000/abc", "raw": ""})
    assert result["status"] == "not_found"


@pytest.mark.asyncio
async def test_verifier_existing_layer_result_skips_openalex(monkeypatch):
    _patch_existing_layers(
        monkeypatch,
        s2_result={"found": True, "source": "semantic_scholar", "title": "Other Title", "year": "2020"},
    )
    seen = _install_transport(monkeypatch, lambda request: httpx.Response(200, json=_work()))

    result = await verify_single_citation({"key": "k", "title": "My Title", "raw": ""})

    assert result["status"] == "possible_mismatch"
    assert result["layers"] == ["semantic_scholar"]
    assert seen == []


@pytest.mark.asyncio
async def test_verifier_arxiv_only_entry_uses_arxiv_doi_on_openalex(monkeypatch):
    _patch_existing_layers(monkeypatch)
    seen = _install_transport(monkeypatch, lambda request: httpx.Response(200, json=_work()))

    result = await verify_single_citation({"key": "a", "title": "", "eprint": "1706.03762", "raw": ""})

    assert result["status"] == "verified"
    assert "/works/doi:10.48550/arxiv.1706.03762" in seen[0].url.path


@pytest.mark.asyncio
async def test_verifier_insufficient_metadata_makes_no_requests(monkeypatch):
    _patch_existing_layers(monkeypatch)
    seen = _install_transport(monkeypatch, lambda request: httpx.Response(200, json=_work()))

    result = await verify_single_citation({"key": "empty", "title": "", "raw": ""})

    assert result["status"] == "not_found"
    assert result["message"] == "Insufficient metadata to verify."
    assert seen == []
