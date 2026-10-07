from __future__ import annotations

import asyncio
import logging
import re
import threading
from typing import Any

import httpx
from cachetools import TTLCache

from src.services.citations.openalex import fetch_openalex_by_doi, http_client, search_openalex_by_title

logger = logging.getLogger(__name__)

ARXIV_RE = re.compile(r"(\d{4}\.\d{4,5})(?:v\d+)?")
DOI_RE = re.compile(r"10\.\d{4,9}/[^\s\"]+", re.IGNORECASE)

LOOKUP_TIMEOUT_SEC = 15.0
# Entries verified at once (each runs up to 4 sequential lookups) — bounded so a long bibliography
# does not hammer arXiv / CrossRef / Semantic Scholar / OpenAlex.
VERIFY_CONCURRENCY = 6
# Whole-batch budget; entries still running afterwards come back "unverified" instead of holding the
# request open (keeps /citations/verify well under the platform request timeout).
VERIFY_DEADLINE_SEC = 120.0
_HTTP_LIMITS = httpx.Limits(max_connections=VERIFY_CONCURRENCY * 2, max_keepalive_connections=VERIFY_CONCURRENCY * 2)

# Positive results (verified / possible_mismatch) keyed by DOI + arXiv id + normalized title. Misses are
# never cached: "not found" can be a transient outage or a rate limit.
_RESULT_CACHE_TTL_SEC = 6 * 60 * 60
_CACHEABLE_STATUSES = frozenset({"verified", "possible_mismatch"})
_result_cache: TTLCache[tuple[str, str, str], dict[str, Any]] = TTLCache(maxsize=2048, ttl=_RESULT_CACHE_TTL_SEC)
_result_cache_lock = threading.Lock()


def clear_verification_cache() -> None:
    with _result_cache_lock:
        _result_cache.clear()


async def _check_arxiv(arxiv_id: str, *, client: httpx.AsyncClient | None = None) -> dict[str, Any]:
    url = f"https://export.arxiv.org/api/query?id_list={arxiv_id}"
    try:
        async with http_client(client, LOOKUP_TIMEOUT_SEC) as http:
            resp = await http.get(url, timeout=LOOKUP_TIMEOUT_SEC)
            resp.raise_for_status()
            if f"<id>http://arxiv.org/abs/{arxiv_id}" in resp.text:
                title_match = re.search(r"<title>([^<]+)</title>", resp.text)
                title = title_match.group(1).strip() if title_match else ""
                if title.lower() == "error":
                    return {"found": False}
                return {"found": True, "source": "arxiv", "title": title}
    except Exception:
        pass
    return {"found": False}


async def _check_crossref(doi: str, *, client: httpx.AsyncClient | None = None) -> dict[str, Any]:
    url = f"https://api.crossref.org/works/{doi}"
    try:
        async with http_client(client, LOOKUP_TIMEOUT_SEC) as http:
            resp = await http.get(url, headers={"User-Agent": "Proofline/1.0"}, timeout=LOOKUP_TIMEOUT_SEC)
            if resp.status_code == 404:
                return {"found": False}
            resp.raise_for_status()
            data = resp.json().get("message", {})
            titles = data.get("title") or []
            return {
                "found": True,
                "source": "crossref",
                "title": titles[0] if titles else "",
                "doi": data.get("DOI", doi),
                "year": str(
                    (data.get("published-print") or data.get("published-online") or {}).get("date-parts", [[""]])[0][0]
                ),
            }
    except Exception:
        pass
    return {"found": False}


async def _check_semantic_scholar(
    title: str,
    api_key: str = "",
    *,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    if not title.strip():
        return {"found": False}
    headers: dict[str, str] = {}
    if api_key:
        headers["x-api-key"] = api_key
    params = {"query": title[:200], "limit": 1, "fields": "title,externalIds,year"}
    try:
        async with http_client(client, LOOKUP_TIMEOUT_SEC) as http:
            resp = await http.get(
                "https://api.semanticscholar.org/graph/v1/paper/search",
                params=params,
                headers=headers,
                timeout=LOOKUP_TIMEOUT_SEC,
            )
            if resp.status_code == 429:
                return {"found": False, "rate_limited": True}
            resp.raise_for_status()
            papers = resp.json().get("data") or []
            if papers:
                paper = papers[0]
                return {
                    "found": True,
                    "source": "semantic_scholar",
                    "title": paper.get("title", ""),
                    "year": str(paper.get("year", "")),
                    "external_ids": paper.get("externalIds", {}),
                }
    except Exception:
        pass
    return {"found": False}


async def _check_openalex(
    doi: str,
    title: str,
    mailto: str = "",
    *,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """OpenAlex fallback: DOI lookup first, then title search (best title match). Never raises."""
    try:
        if doi:
            work = await fetch_openalex_by_doi(doi, mailto, client=client)
            if work.get("found"):
                return work
        if title.strip():
            candidates = await search_openalex_by_title(title, mailto, client=client)
            for candidate in candidates:
                if _title_match(title, candidate.get("title", "")):
                    return candidate
            if candidates:
                return candidates[0]
    except Exception:
        pass
    return {"found": False}


def _normalize_title(title: str) -> str:
    """LaTeX → plain text, casefolded, without accents, punctuation, braces or extra whitespace."""
    from src.services.citations.title_match import normalize_title

    return normalize_title(title)


def _title_match(a: str, b: str) -> bool:
    """Same work: equal once normalized, or fuzzy-equal at a comparable length (a prefix is not a match)."""
    from src.services.citations.title_match import titles_match

    return titles_match(a, b)


def entry_identifiers(entry: dict) -> tuple[str, str]:
    """Return (doi, arxiv_id) from a parsed bib entry (explicit fields first, then raw text)."""
    doi = (entry.get("doi") or "").strip()
    if not doi:
        doi_match = DOI_RE.search(entry.get("raw", ""))
        if doi_match:
            doi = doi_match.group(0).rstrip(".,)")

    arxiv_id = ""
    arxiv_match = ARXIV_RE.search(entry.get("eprint", "") or "") or ARXIV_RE.search(entry.get("raw", ""))
    if arxiv_match:
        arxiv_id = arxiv_match.group(1)
    return doi, arxiv_id


async def verify_single_citation(
    entry: dict,
    semantic_scholar_api_key: str = "",
    openalex_mailto: str = "",
    *,
    client: httpx.AsyncClient | None = None,
) -> dict:
    """Citation verification: arXiv → CrossRef → Semantic Scholar → OpenAlex fallback (all deterministic).

    Every lookup for the entry goes through ``client`` (or one short-lived client when none is shared).
    """
    async with http_client(client, LOOKUP_TIMEOUT_SEC) as http:
        return await _verify_with_client(entry, semantic_scholar_api_key, openalex_mailto, http)


async def _verify_with_client(
    entry: dict,
    semantic_scholar_api_key: str,
    openalex_mailto: str,
    client: httpx.AsyncClient,
) -> dict:
    key = entry.get("key", "")
    title = entry.get("title", "")
    doi, arxiv_id = entry_identifiers(entry)

    layers: list[str] = []
    verified_meta: dict[str, Any] = {}

    if arxiv_id:
        result = await _check_arxiv(arxiv_id, client=client)
        if result.get("found"):
            layers.append("arxiv")
            verified_meta = result
            if _title_match(title, result.get("title", "")) or not title:
                return {
                    "key": key,
                    "status": "verified",
                    "layers": layers,
                    "metadata": verified_meta,
                    "message": "Verified via arXiv ID.",
                }
            return {
                "key": key,
                "status": "possible_mismatch",
                "layers": layers,
                "metadata": verified_meta,
                "message": "arXiv ID exists but title may not match.",
            }

    if doi:
        result = await _check_crossref(doi, client=client)
        if result.get("found"):
            layers.append("crossref")
            verified_meta = result
            if _title_match(title, result.get("title", "")) or not title:
                return {
                    "key": key,
                    "status": "verified",
                    "layers": layers,
                    "metadata": verified_meta,
                    "message": "Verified via CrossRef DOI.",
                }
            return {
                "key": key,
                "status": "possible_mismatch",
                "layers": layers,
                "metadata": verified_meta,
                "message": "DOI exists but title may not match.",
            }

    if title:
        result = await _check_semantic_scholar(title, semantic_scholar_api_key, client=client)
        if result.get("found"):
            layers.append("semantic_scholar")
            verified_meta = result
            if _title_match(title, result.get("title", "")):
                return {
                    "key": key,
                    "status": "verified",
                    "layers": layers,
                    "metadata": verified_meta,
                    "message": "Verified via Semantic Scholar title match.",
                }
            return {
                "key": key,
                "status": "possible_mismatch",
                "layers": layers,
                "metadata": verified_meta,
                "message": "Similar paper found but title differs.",
            }

    if title or doi or arxiv_id:
        # Fallback layer — only reached when the three layers above found nothing.
        openalex_doi = doi or (f"10.48550/arXiv.{arxiv_id}" if arxiv_id else "")
        result = await _check_openalex(openalex_doi, title, openalex_mailto, client=client)
        if result.get("found"):
            layers.append("openalex")
            verified_meta = {k: v for k, v in result.items() if k != "abstract"}
            if _title_match(title, result.get("title", "")) or not title:
                return {
                    "key": key,
                    "status": "verified",
                    "layers": layers,
                    "metadata": verified_meta,
                    "message": "Verified via OpenAlex.",
                }
            return {
                "key": key,
                "status": "possible_mismatch",
                "layers": layers,
                "metadata": verified_meta,
                "message": "OpenAlex record found but title may not match.",
            }

    if not title and not doi and not arxiv_id:
        return {
            "key": key,
            "status": "not_found",
            "layers": layers,
            "metadata": {},
            "message": "Insufficient metadata to verify.",
        }

    return {
        "key": key,
        "status": "not_found",
        "layers": layers,
        "metadata": verified_meta,
        "message": "Could not verify citation in external databases.",
    }


def _cache_key(entry: dict) -> tuple[str, str, str]:
    doi, arxiv_id = entry_identifiers(entry)
    return doi.lower(), arxiv_id, _normalize_title(entry.get("title", "") or "")


def _cached_result(entry: dict) -> dict | None:
    with _result_cache_lock:
        hit = _result_cache.get(_cache_key(entry))
    if hit is None:
        return None
    return {**hit, "key": entry.get("key", ""), "layers": list(hit["layers"]), "metadata": dict(hit["metadata"])}


def _remember_result(entry: dict, result: dict) -> None:
    if result.get("status") not in _CACHEABLE_STATUSES:
        return
    stored = {**result, "layers": list(result.get("layers") or []), "metadata": dict(result.get("metadata") or {})}
    with _result_cache_lock:
        _result_cache[_cache_key(entry)] = stored


_TIMED_OUT_MESSAGE = "Verification did not finish in time; try again."
_FAILED_MESSAGE = "Verification failed unexpectedly; try again."


def _unverified_result(entry: dict, message: str) -> dict:
    return {"key": entry.get("key", ""), "status": "unverified", "layers": [], "metadata": {}, "message": message}


async def verify_citations(
    entries: list[dict],
    semantic_scholar_api_key: str = "",
    openalex_mailto: str = "",
    *,
    concurrency: int = VERIFY_CONCURRENCY,
    deadline_sec: float = VERIFY_DEADLINE_SEC,
) -> list[dict]:
    """Verify entries concurrently (at most ``concurrency`` at a time) over one shared HTTP client.

    Results keep the input order. Entries still running after ``deadline_sec`` come back ``unverified``.
    """
    results: list[dict | None] = [_cached_result(entry) for entry in entries]
    pending_indexes = [index for index, result in enumerate(results) if result is None]
    if pending_indexes:
        semaphore = asyncio.Semaphore(max(1, concurrency))
        async with httpx.AsyncClient(timeout=LOOKUP_TIMEOUT_SEC, limits=_HTTP_LIMITS) as client:

            async def run(index: int) -> None:
                entry = entries[index]
                async with semaphore:
                    try:
                        result = await verify_single_citation(
                            entry, semantic_scholar_api_key, openalex_mailto, client=client
                        )
                    except Exception:
                        logger.exception("Citation verification failed for %r", entry.get("key", ""))
                        results[index] = _unverified_result(entry, _FAILED_MESSAGE)
                        return
                results[index] = result
                _remember_result(entry, result)

            tasks = [asyncio.create_task(run(index)) for index in pending_indexes]
            _done, unfinished = await asyncio.wait(tasks, timeout=deadline_sec)
            for task in unfinished:
                task.cancel()
            if unfinished:
                await asyncio.gather(*unfinished, return_exceptions=True)
                logger.warning(
                    "Citation verification hit its %.0fs deadline; %d of %d entries left unverified",
                    deadline_sec,
                    len(unfinished),
                    len(entries),
                )

    return [
        result if result is not None else _unverified_result(entries[index], _TIMED_OUT_MESSAGE)
        for index, result in enumerate(results)
    ]
