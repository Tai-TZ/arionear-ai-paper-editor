"""Fetch a cited work's title + abstract (OpenAlex first, Semantic Scholar fallback).

Only text returned by the bibliographic APIs is used — nothing is generated.
Title-search hits are accepted only when they pass the verifier's title-match
rule, so an unrelated paper's abstract is never attributed to a citation.
Every failure degrades to an empty abstract; nothing here raises.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

from src.services.citations.openalex import (
    MAX_ABSTRACT_CHARS,
    fetch_openalex_by_doi,
    search_openalex_by_title,
)
from src.services.citations.verifier import _title_match, entry_identifiers

S2_API_BASE = "https://api.semanticscholar.org/graph/v1"
S2_TIMEOUT_SEC = 10.0


@dataclass(frozen=True)
class SourceText:
    title: str = ""
    abstract: str = ""
    source: str = ""  # "openalex" | "semantic_scholar" | ""


def _clip(text: Any) -> str:
    return " ".join(str(text or "").split())[:MAX_ABSTRACT_CHARS]


def enrich_entry_from_registry(entry: dict, registry_item: dict | None) -> dict:
    """Fill a missing title / DOI / arXiv id from a stored verification result (database metadata)."""
    if not registry_item:
        return entry
    meta = registry_item.get("metadata") or {}
    if not isinstance(meta, dict):
        return entry
    merged = dict(entry)
    external = meta.get("external_ids") or {}
    if not isinstance(external, dict):
        external = {}
    if not (merged.get("title") or "").strip() and meta.get("title"):
        merged["title"] = str(meta["title"])
    if not (merged.get("doi") or "").strip():
        doi = meta.get("doi") or external.get("DOI") or ""
        if doi:
            merged["doi"] = str(doi)
    if not (merged.get("eprint") or "").strip() and external.get("ArXiv"):
        merged["eprint"] = str(external["ArXiv"])
    return merged


async def _semantic_scholar_abstract(*, doi: str, arxiv_id: str, title: str, api_key: str = "") -> SourceText | None:
    headers = {"x-api-key": api_key} if api_key else {}
    paper_id = f"DOI:{doi}" if doi else (f"ARXIV:{arxiv_id}" if arxiv_id else "")
    try:
        async with httpx.AsyncClient(timeout=S2_TIMEOUT_SEC) as client:
            if paper_id:
                resp = await client.get(
                    f"{S2_API_BASE}/paper/{quote(paper_id, safe=':/')}",
                    params={"fields": "title,abstract"},
                    headers=headers,
                )
                if resp.status_code == 200:
                    paper = resp.json()
                    if isinstance(paper, dict) and paper.get("abstract") and paper.get("title"):
                        return SourceText(_clip(paper["title"]), _clip(paper["abstract"]), "semantic_scholar")
            if title.strip():
                resp = await client.get(
                    f"{S2_API_BASE}/paper/search",
                    params={"query": title[:200], "limit": 3, "fields": "title,abstract"},
                    headers=headers,
                )
                if resp.status_code == 200:
                    for paper in resp.json().get("data") or []:
                        if not isinstance(paper, dict) or not paper.get("abstract"):
                            continue
                        if _title_match(title, str(paper.get("title") or "")):
                            return SourceText(_clip(paper["title"]), _clip(paper["abstract"]), "semantic_scholar")
    except Exception:
        return None
    return None


async def fetch_source_text(
    entry: dict,
    *,
    openalex_mailto: str = "",
    semantic_scholar_api_key: str = "",
) -> SourceText:
    """Title + abstract for one bib entry; ``abstract == ""`` when no database provides one."""
    title = (entry.get("title") or "").strip()
    doi, arxiv_id = entry_identifiers(entry)
    lookup_doi = doi or (f"10.48550/arXiv.{arxiv_id}" if arxiv_id else "")
    known_title = ""

    try:
        if lookup_doi:
            work = await fetch_openalex_by_doi(lookup_doi, openalex_mailto)
            if work.get("found"):
                known_title = work.get("title", "")
                if work.get("abstract"):
                    return SourceText(known_title, work["abstract"], "openalex")

        query_title = title or known_title
        if query_title:
            for candidate in await search_openalex_by_title(query_title, openalex_mailto):
                if candidate.get("abstract") and _title_match(query_title, candidate.get("title", "")):
                    return SourceText(candidate["title"], candidate["abstract"], "openalex")

        s2 = await _semantic_scholar_abstract(
            doi=doi,
            arxiv_id=arxiv_id,
            title=query_title,
            api_key=semantic_scholar_api_key,
        )
        if s2:
            return s2
    except Exception:
        pass
    return SourceText(title=known_title or title)
