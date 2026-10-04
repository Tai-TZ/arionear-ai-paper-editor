"""verify_citations: bounded concurrency, one shared HTTP client, deadline, ordering, positive-result cache.

HTTP is mocked with httpx.MockTransport — nothing here touches the network.
"""

from __future__ import annotations

import asyncio
import time

import httpx
import pytest

from src.services.citations import verifier
from src.services.citations.verifier import clear_verification_cache, verify_citations

_REAL_ASYNC_CLIENT = httpx.AsyncClient


@pytest.fixture(autouse=True)
def _fresh_cache():
    clear_verification_cache()
    yield
    clear_verification_cache()


def _entry(key: str, **fields: str) -> dict:
    return {"key": key, "title": "", "doi": "", "eprint": "", "raw": "", **fields}


def _crossref_handler(request: httpx.Request) -> httpx.Response:
    if request.url.host == "api.crossref.org":
        doi = request.url.path.removeprefix("/works/")
        if doi.endswith("missing"):
            return httpx.Response(404)
        return httpx.Response(200, json={"message": {"title": [f"Title {doi}"], "DOI": doi}})
    return httpx.Response(404)


def _install_transport(monkeypatch, handler) -> dict:
    stats = {"clients": 0, "requests": 0}

    def recording(request: httpx.Request) -> httpx.Response:
        stats["requests"] += 1
        return handler(request)

    def factory(*args, **kwargs):
        stats["clients"] += 1
        kwargs["transport"] = httpx.MockTransport(recording)
        return _REAL_ASYNC_CLIENT(*args, **kwargs)

    monkeypatch.setattr(verifier.httpx, "AsyncClient", factory)
    return stats


@pytest.mark.asyncio
async def test_batch_shares_one_client_and_keeps_order(monkeypatch):
    stats = _install_transport(monkeypatch, _crossref_handler)
    entries = [_entry(f"k{i}", doi=f"10.1000/{i}", title=f"Title 10.1000/{i}") for i in range(10)]

    results = await verify_citations(entries)

    assert [r["key"] for r in results] == [f"k{i}" for i in range(10)]
    assert all(r["status"] == "verified" and r["layers"] == ["crossref"] for r in results)
    assert stats["clients"] == 1
    assert stats["requests"] == 10


@pytest.mark.asyncio
async def test_batch_runs_concurrently_but_bounded(monkeypatch):
    active = 0
    peak = 0

    async def fake_verify(entry, *_args, **_kwargs):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.05 if entry["key"] != "k0" else 0.15)
        active -= 1
        return {"key": entry["key"], "status": "not_found", "layers": [], "metadata": {}, "message": ""}

    monkeypatch.setattr(verifier, "verify_single_citation", fake_verify)
    entries = [_entry(f"k{i}") for i in range(12)]

    results = await verify_citations(entries, concurrency=4)

    assert peak == 4
    assert [r["key"] for r in results] == [f"k{i}" for i in range(12)]


@pytest.mark.asyncio
async def test_deadline_returns_unverified_for_unfinished_entries(monkeypatch):
    async def fake_verify(entry, *_args, **_kwargs):
        if entry["key"] == "slow":
            await asyncio.sleep(30)
        return {"key": entry["key"], "status": "verified", "layers": ["crossref"], "metadata": {}, "message": "ok"}

    monkeypatch.setattr(verifier, "verify_single_citation", fake_verify)
    entries = [_entry("fast1", doi="10.1/a"), _entry("slow", doi="10.1/b"), _entry("fast2", doi="10.1/c")]

    started = time.perf_counter()
    results = await verify_citations(entries, deadline_sec=0.2)

    assert time.perf_counter() - started < 2
    assert [r["key"] for r in results] == ["fast1", "slow", "fast2"]
    assert [r["status"] for r in results] == ["verified", "unverified", "verified"]
    assert results[1]["layers"] == [] and results[1]["metadata"] == {}


@pytest.mark.asyncio
async def test_unexpected_error_marks_only_that_entry(monkeypatch):
    async def fake_verify(entry, *_args, **_kwargs):
        if entry["key"] == "bad":
            raise RuntimeError("bug")
        return {"key": entry["key"], "status": "not_found", "layers": [], "metadata": {}, "message": ""}

    monkeypatch.setattr(verifier, "verify_single_citation", fake_verify)

    results = await verify_citations([_entry("good"), _entry("bad")])

    assert [r["status"] for r in results] == ["not_found", "unverified"]


@pytest.mark.asyncio
async def test_positive_results_are_cached_misses_are_not(monkeypatch):
    stats = _install_transport(monkeypatch, _crossref_handler)
    found = _entry("a", doi="10.1000/1", title="Title 10.1000/1")
    missing = _entry("b", doi="10.1000/missing")

    first = await verify_citations([found, missing])
    requests_after_first = stats["requests"]
    second = await verify_citations([{**found, "key": "renamed"}, missing])

    assert [r["status"] for r in first] == ["verified", "not_found"]
    assert second[0] == {**first[0], "key": "renamed"}
    assert second[1]["status"] == "not_found"
    # Only the miss was looked up again (CrossRef, then OpenAlex by DOI).
    assert stats["requests"] - requests_after_first == requests_after_first - 1


@pytest.mark.asyncio
async def test_empty_and_fully_cached_batches_open_no_client(monkeypatch):
    stats = _install_transport(monkeypatch, _crossref_handler)
    assert await verify_citations([]) == []

    entry = _entry("a", doi="10.1000/7", title="Title 10.1000/7")
    await verify_citations([entry])
    clients = stats["clients"]
    await verify_citations([entry])
    assert stats["clients"] == clients


@pytest.mark.asyncio
async def test_single_citation_reuses_its_client_across_layers(monkeypatch):
    stats = _install_transport(monkeypatch, lambda request: httpx.Response(404))

    result = await verifier.verify_single_citation(_entry("x", doi="10.1000/missing", title="Unknown Paper"))

    assert result["status"] == "not_found"
    assert stats["requests"] >= 3  # CrossRef, Semantic Scholar, OpenAlex DOI + title search
    assert stats["clients"] == 1
