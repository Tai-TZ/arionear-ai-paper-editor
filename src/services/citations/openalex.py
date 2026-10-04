"""OpenAlex lookups (free, no API key) for citation verification and source abstracts.

Every public coroutine here swallows network/parse errors and returns an empty
result — an OpenAlex outage must never break citation verification.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

import httpx

OPENALEX_API_BASE = "https://api.openalex.org"
OPENALEX_TIMEOUT_SEC = 10.0
OPENALEX_SEARCH_LIMIT = 5
MAX_ABSTRACT_CHARS = 4000
# Guard against absurd positions in malformed inverted indexes.
_MAX_ABSTRACT_POSITION = 20_000

_SELECT_FIELDS = "id,doi,title,display_name,publication_year,abstract_inverted_index"
_DOI_PREFIX_RE = re.compile(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", re.IGNORECASE)
_LATEX_COMMAND_RE = re.compile(r"\\[a-zA-Z]+\*?")


def normalize_doi(doi: str) -> str:
    """Strip resolver prefixes (https://doi.org/, doi:) and lowercase; '' when not a DOI."""
    cleaned = _DOI_PREFIX_RE.sub("", (doi or "").strip()).strip().rstrip(".,;)")
    return cleaned.lower() if cleaned.startswith("10.") else ""


def reconstruct_abstract(inverted_index: Any) -> str:
    """Rebuild plain text from OpenAlex ``abstract_inverted_index`` ({word: [positions]})."""
    if not isinstance(inverted_index, dict) or not inverted_index:
        return ""
    positions: dict[int, str] = {}
    for word, indexes in inverted_index.items():
        if not isinstance(word, str) or not isinstance(indexes, list):
            continue
        for index in indexes:
            if isinstance(index, int) and not isinstance(index, bool) and 0 <= index < _MAX_ABSTRACT_POSITION:
                positions.setdefault(index, word)
    if not positions:
        return ""
    text = " ".join(positions[index] for index in sorted(positions))
    return re.sub(r"\s+", " ", text).strip()


def parse_openalex_work(work: Any) -> dict[str, Any] | None:
    """Normalize one OpenAlex work object; ``None`` when it has no usable title."""
    if not isinstance(work, dict):
        return None
    title = str(work.get("title") or work.get("display_name") or "").strip()
    if not title:
        return None
    year = work.get("publication_year")
    return {
        "found": True,
        "source": "openalex",
        "title": title,
        "doi": normalize_doi(str(work.get("doi") or "")),
        "year": str(year) if year else "",
        "openalex_id": str(work.get("id") or ""),
        "abstract": reconstruct_abstract(work.get("abstract_inverted_index"))[:MAX_ABSTRACT_CHARS],
    }


def _params(mailto: str, **extra: str) -> dict[str, str]:
    params: dict[str, str] = {"select": _SELECT_FIELDS, **extra}
    contact = (mailto or "").strip()
    if contact:
        params["mailto"] = contact
    return params


def _headers(mailto: str) -> dict[str, str]:
    contact = (mailto or "").strip()
    agent = f"Arionear/1.0 (mailto:{contact})" if contact else "Arionear/1.0"
    return {"User-Agent": agent}


def _search_query(title: str) -> str:
    """Drop LaTeX markup that would confuse the OpenAlex full-text search."""
    text = _LATEX_COMMAND_RE.sub(" ", title or "")
    text = re.sub(r"[{}$\\~]", " ", text)
    return re.sub(r"\s+", " ", text).strip()[:200]


async def fetch_openalex_by_doi(doi: str, mailto: str = "") -> dict[str, Any]:
    """Look up one work by DOI. Returns ``{"found": False}`` on miss or any failure."""
    normalized = normalize_doi(doi)
    if not normalized:
        return {"found": False}
    url = f"{OPENALEX_API_BASE}/works/doi:{quote(normalized, safe='/')}"
    try:
        async with httpx.AsyncClient(timeout=OPENALEX_TIMEOUT_SEC) as client:
            resp = await client.get(url, params=_params(mailto), headers=_headers(mailto))
            if resp.status_code == 404:
                return {"found": False}
            if resp.status_code == 429:
                return {"found": False, "rate_limited": True}
            resp.raise_for_status()
            parsed = parse_openalex_work(resp.json())
            if parsed:
                return parsed
    except Exception:
        pass
    return {"found": False}


async def search_openalex_by_title(
    title: str,
    mailto: str = "",
    *,
    limit: int = OPENALEX_SEARCH_LIMIT,
) -> list[dict[str, Any]]:
    """Full-text title search; returns normalized candidates (best first) or ``[]`` on failure."""
    query = _search_query(title)
    if not query:
        return []
    params = _params(mailto, search=query, **{"per-page": str(max(1, min(limit, 25)))})
    try:
        async with httpx.AsyncClient(timeout=OPENALEX_TIMEOUT_SEC) as client:
            resp = await client.get(f"{OPENALEX_API_BASE}/works", params=params, headers=_headers(mailto))
            if resp.status_code != 200:
                return []
            results = resp.json().get("results") or []
    except Exception:
        return []
    if not isinstance(results, list):
        return []
    return [work for work in (parse_openalex_work(item) for item in results) if work]
