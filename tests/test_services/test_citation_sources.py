"""Source title + abstract lookup for Citation Layer 4 (mocked HTTP — never hits the network)."""

from __future__ import annotations

import httpx
import pytest

from src.services.citations import openalex
from src.services.citations.sources import fetch_source_text

_REAL_ASYNC_CLIENT = httpx.AsyncClient


def _install_transport(monkeypatch, handler) -> list[httpx.Request]:
    seen: list[httpx.Request] = []

    def recording_handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(recording_handler)
        return _REAL_ASYNC_CLIENT(*args, **kwargs)

    monkeypatch.setattr(openalex.httpx, "AsyncClient", factory)
    return seen


def _work(title: str, abstract_words: list[str] | None = None) -> dict:
    index = {word: [i] for i, word in enumerate(abstract_words or [])}
    return {"id": "https://openalex.org/W1", "title": title, "publication_year": 2016, "abstract_inverted_index": index}


@pytest.mark.asyncio
async def test_openalex_doi_abstract_is_used(monkeypatch):
    seen = _install_transport(
        monkeypatch,
        lambda request: httpx.Response(200, json=_work("Deep Residual Learning", ["Residual", "nets", "train."])),
    )
    source = await fetch_source_text({"key": "he", "title": "", "doi": "10.1109/cvpr.2016.90", "raw": ""})
    assert (source.title, source.abstract, source.source) == (
        "Deep Residual Learning",
        "Residual nets train.",
        "openalex",
    )
    assert len(seen) == 1


@pytest.mark.asyncio
async def test_title_search_requires_title_match(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.openalex.org":
            # Top hit has an abstract but a different title — must NOT be used.
            return httpx.Response(200, json={"results": [_work("Some Other Paper", ["Unrelated", "text."])]})
        return httpx.Response(200, json={"data": []})

    seen = _install_transport(monkeypatch, handler)
    source = await fetch_source_text({"key": "x", "title": "My Specific Study", "raw": ""})
    assert source.abstract == ""
    assert source.source == ""
    assert source.title == "My Specific Study"
    assert {request.url.host for request in seen} == {"api.openalex.org", "api.semanticscholar.org"}


@pytest.mark.asyncio
async def test_semantic_scholar_fallback_when_openalex_has_no_abstract(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.openalex.org":
            if "/works/doi:" in request.url.path:
                return httpx.Response(200, json=_work("Deep Residual Learning"))  # no abstract
            return httpx.Response(200, json={"results": []})
        assert "/paper/DOI:10.1109/cvpr.2016.90" in request.url.path
        return httpx.Response(200, json={"title": "Deep Residual Learning", "abstract": "S2 abstract text."})

    _install_transport(monkeypatch, handler)
    source = await fetch_source_text({"key": "he", "title": "Deep Residual Learning", "doi": "10.1109/cvpr.2016.90"})
    assert (source.abstract, source.source) == ("S2 abstract text.", "semantic_scholar")


@pytest.mark.asyncio
async def test_network_failure_everywhere_returns_empty_abstract(monkeypatch):
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    _install_transport(monkeypatch, boom)
    source = await fetch_source_text({"key": "k", "title": "Title", "doi": "10.1000/abc", "eprint": "1706.03762"})
    assert source.abstract == ""
    assert source.title == "Title"


@pytest.mark.asyncio
async def test_no_metadata_makes_no_requests(monkeypatch):
    seen = _install_transport(monkeypatch, lambda request: httpx.Response(200, json={}))
    source = await fetch_source_text({"key": "k", "title": "", "raw": ""})
    assert source.abstract == ""
    assert seen == []
