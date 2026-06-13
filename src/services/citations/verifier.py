from __future__ import annotations

import re
from typing import Any

import httpx

ARXIV_RE = re.compile(r"(\d{4}\.\d{4,5})(?:v\d+)?")
DOI_RE = re.compile(r"10\.\d{4,9}/[^\s\"]+", re.IGNORECASE)


async def _check_arxiv(arxiv_id: str) -> dict[str, Any]:
    url = f"https://export.arxiv.org/api/query?id_list={arxiv_id}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
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


async def _check_crossref(doi: str) -> dict[str, Any]:
    url = f"https://api.crossref.org/works/{doi}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers={"User-Agent": "Arionear/1.0"})
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
                "year": str((data.get("published-print") or data.get("published-online") or {}).get("date-parts", [[""]])[0][0]),
            }
    except Exception:
        pass
    return {"found": False}


async def _check_semantic_scholar(
    title: str, api_key: str = ""
) -> dict[str, Any]:
    if not title.strip():
        return {"found": False}
    headers: dict[str, str] = {}
    if api_key:
        headers["x-api-key"] = api_key
    params = {"query": title[:200], "limit": 1, "fields": "title,externalIds,year"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://api.semanticscholar.org/graph/v1/paper/search",
                params=params,
                headers=headers,
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


def _normalize_title(title: str) -> str:
    return re.sub(r"\s+", " ", title.lower().strip())


def _title_match(a: str, b: str) -> bool:
    if not a or not b:
        return False
    na, nb = _normalize_title(a), _normalize_title(b)
    if na == nb:
        return True
    return na in nb or nb in na


async def verify_single_citation(
    entry: dict,
    semantic_scholar_api_key: str = "",
) -> dict:
    """4-layer citation verification (layers 1–3 deterministic)."""
    key = entry.get("key", "")
    title = entry.get("title", "")
    doi = entry.get("doi", "").strip()
    eprint = entry.get("eprint", "")

    if not doi:
        doi_match = DOI_RE.search(entry.get("raw", ""))
        if doi_match:
            doi = doi_match.group(0).rstrip(".,)")

    arxiv_id = ""
    arxiv_match = ARXIV_RE.search(eprint) or ARXIV_RE.search(entry.get("raw", ""))
    if arxiv_match:
        arxiv_id = arxiv_match.group(1)

    layers: list[str] = []
    verified_meta: dict[str, Any] = {}

    if arxiv_id:
        result = await _check_arxiv(arxiv_id)
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
        result = await _check_crossref(doi)
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
        result = await _check_semantic_scholar(title, semantic_scholar_api_key)
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


async def verify_citations(
    entries: list[dict],
    semantic_scholar_api_key: str = "",
) -> list[dict]:
    results = []
    for entry in entries:
        results.append(
            await verify_single_citation(entry, semantic_scholar_api_key)
        )
    return results
