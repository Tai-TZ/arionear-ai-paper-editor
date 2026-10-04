"""Citation Layer 4 — LLM relevance: does the cited source support the claim where it is cited?

Read-only and comment-only: the manuscript is never modified. The LLM judges only
the claim sentence(s) extracted from the manuscript against the source's title +
abstract fetched from OpenAlex / Semantic Scholar. When the claim context or the
abstract is missing, or the model output is not valid JSON, the verdict is
``insufficient_info`` — nothing is invented.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from pydantic import ValidationError

from src.config import LLMProvider, get_settings
from src.models.citation_schemas import (
    RELEVANCE_MAX_KEYS_PER_REQUEST,
    CitationRelevanceItem,
    CitationRelevanceRequest,
    CitationRelevanceResponse,
    RelevanceLLMOutput,
    RelevanceReason,
    RelevanceVerdict,
)
from src.services.citations.claim_context import extract_claim_contexts
from src.services.citations.sources import SourceText, enrich_entry_from_registry, fetch_source_text
from src.services.llm import extract_llm_text, get_llm
from src.services.logic_audit.config import resolve_logic_audit_llm
from src.services.parser.latex import extract_bib_content, extract_cite_keys, parse_bib_entries
from src.services.prompts import get_prompt, render_template, render_user_prompt
from src.services.quota_policy import enforce_llm_quota_for_paper
from src.services.sessions import session_store
from src.services.usage_tracking import estimate_tokens, record_ai_usage

logger = logging.getLogger(__name__)

RELEVANCE_LLM_TIMEOUT_SEC = 45.0
RELEVANCE_SOURCE_TIMEOUT_SEC = 25.0
RELEVANCE_TOTAL_BUDGET_SEC = 150.0
RELEVANCE_CONCURRENCY = 4

SourceFetcher = Callable[[dict], Awaitable[SourceText]]

_THINKING_BLOCK_RE = re.compile(r"<(think|thinking|reasoning)>[\s\S]*?</\1>", re.IGNORECASE)
_LANGUAGE_BY_LOCALE = {"vi": "Vietnamese", "en": "English"}


def resolve_relevance_language(locale: str | None) -> str:
    return _LANGUAGE_BY_LOCALE.get((locale or "").strip().lower(), "English")


def build_relevance_llm(chat_provider: str | None = None) -> tuple[Any, LLMProvider, str | None]:
    """Same routing as the quick logic audit: fast model, platform keys + failover via ``get_llm``."""
    provider, model = resolve_logic_audit_llm("quick", chat_provider)
    llm = get_llm(provider=provider, model=model, temperature=0.0, json_output=True)
    return llm, provider, model


def parse_relevance_output(raw: str) -> RelevanceLLMOutput | None:
    """Strictly parse the model reply; ``None`` when it is not the expected JSON object."""
    text = _THINKING_BLOCK_RE.sub("", raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text.strip())
    data: Any = None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                data = json.loads(match.group(0))
            except json.JSONDecodeError:
                data = None
    if not isinstance(data, dict):
        return None
    try:
        return RelevanceLLMOutput.model_validate(data)
    except ValidationError:
        return None


def build_relevance_messages(
    key: str,
    claim_snippets: list[str],
    source: SourceText,
    *,
    language: str,
) -> list[BaseMessage]:
    system = render_template(get_prompt("citation_relevance", "system"), response_language=language).strip()
    contexts = "\n".join(f"{index}. {snippet}" for index, snippet in enumerate(claim_snippets, start=1))
    user = render_user_prompt(
        "citation_relevance",
        cite_key=key,
        claim_contexts=contexts,
        source_title=source.title or "(unknown)",
        source_abstract=source.abstract,
        response_language=language,
    )
    return [SystemMessage(content=system), HumanMessage(content=user)]


def _item(
    key: str,
    snippets: list[str],
    *,
    verdict: RelevanceVerdict = "insufficient_info",
    reason: RelevanceReason,
    source: SourceText | None = None,
    rationale: str = "",
    confidence: float = 0.0,
) -> CitationRelevanceItem:
    src = source or SourceText()
    return CitationRelevanceItem(
        key=key,
        verdict=verdict,
        reason=reason,
        rationale=rationale,
        confidence=confidence,
        claim_snippets=snippets,
        source_title=src.title,
        source=src.source if src.source in {"openalex", "semantic_scholar"} else "",
    )


async def judge_citation(
    llm: Any,
    key: str,
    claim_snippets: list[str],
    source: SourceText,
    *,
    language: str,
    timeout_sec: float = RELEVANCE_LLM_TIMEOUT_SEC,
    usage: list[tuple[str, str]] | None = None,
) -> CitationRelevanceItem:
    """One LLM judgment. Missing context/abstract → ``insufficient_info`` without calling the LLM."""
    if not claim_snippets:
        return _item(key, claim_snippets, reason="not_cited", source=source)
    if not source.abstract.strip():
        return _item(key, claim_snippets, reason="no_abstract", source=source)

    messages = build_relevance_messages(key, claim_snippets, source, language=language)
    try:
        response = await asyncio.wait_for(llm.ainvoke(messages), timeout=timeout_sec)
    except Exception as exc:  # provider error, auth/quota at provider, timeout
        logger.warning("citation relevance LLM call failed for %s: %s", key, exc)
        return _item(key, claim_snippets, reason="llm_error", source=source)

    raw = extract_llm_text(response)
    if usage is not None:
        usage.append(("\n".join(str(m.content) for m in messages), raw))
    parsed = parse_relevance_output(raw)
    if parsed is None:
        return _item(key, claim_snippets, reason="invalid_output", source=source)
    return _item(
        key,
        claim_snippets,
        verdict=parsed.verdict,
        reason="judged",
        source=source,
        rationale=parsed.rationale,
        confidence=parsed.confidence,
    )


async def check_citation_relevance(
    *,
    keys: list[str],
    claim_map: dict[str, list[str]],
    entries: dict[str, dict],
    llm: Any,
    language: str,
    fetch_source: SourceFetcher,
    usage: list[tuple[str, str]] | None = None,
) -> list[CitationRelevanceItem]:
    """Judge ``keys`` (order kept) with bounded concurrency and an overall time budget."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + RELEVANCE_TOTAL_BUDGET_SEC
    semaphore = asyncio.Semaphore(RELEVANCE_CONCURRENCY)

    async def one(key: str) -> CitationRelevanceItem:
        snippets = claim_map.get(key, [])
        if not snippets:
            return _item(key, snippets, reason="not_cited")
        async with semaphore:
            entry = entries.get(key) or {"key": key, "title": "", "doi": "", "eprint": "", "raw": ""}
            fetch_timeout = min(RELEVANCE_SOURCE_TIMEOUT_SEC, max(deadline - loop.time(), 0.1))
            try:
                source = await asyncio.wait_for(fetch_source(entry), timeout=fetch_timeout)
            except Exception:  # slow/broken bibliographic APIs → judged as "no abstract"
                source = SourceText(title=str(entry.get("title") or ""))
            remaining = deadline - loop.time()
            if source.abstract.strip() and remaining < 1.0:
                return _item(key, snippets, reason="llm_error", source=source)
            return await judge_citation(
                llm,
                key,
                snippets,
                source,
                language=language,
                timeout_sec=min(RELEVANCE_LLM_TIMEOUT_SEC, max(remaining, 1.0)),
                usage=usage,
            )

    return list(await asyncio.gather(*(one(key) for key in keys)))


def summarize_relevance(results: list[CitationRelevanceItem]) -> str:
    counts = {verdict: 0 for verdict in ("supports", "partial", "unrelated", "insufficient_info")}
    for item in results:
        counts[item.verdict] += 1
    return (
        f"Checked relevance of {len(results)} citations: {counts['supports']} supports, "
        f"{counts['partial']} partial, {counts['unrelated']} unrelated, "
        f"{counts['insufficient_info']} insufficient info."
    )


async def run_citation_relevance(
    request: CitationRelevanceRequest,
    *,
    user_id: uuid.UUID | None = None,
) -> CitationRelevanceResponse:
    """Endpoint service: resolve manuscript + bib, enforce quota, judge up to 15 keys, record usage.

    Raises ``QuotaExceededError`` (quota) or ``ValueError`` (no LLM provider key configured).
    """
    session = session_store.get_or_create(request.session_id)
    latex = request.latex_content or session.latex_content or ""
    entries = parse_bib_entries(extract_bib_content(latex, request.bib_content))
    registry = {str(item.get("key")): item for item in (session.citation_registry or []) if isinstance(item, dict)}

    requested = request.keys or extract_cite_keys(latex)
    keys = requested[:RELEVANCE_MAX_KEYS_PER_REQUEST]
    skipped = requested[RELEVANCE_MAX_KEYS_PER_REQUEST:]
    if not keys:
        return CitationRelevanceResponse(results=[], summary="No citations to check.", skipped_keys=skipped)

    claim_map = extract_claim_contexts(latex, keys)
    llm: Any = None
    provider: str | None = None
    model: str | None = None
    if any(claim_map.get(key) for key in keys):
        enforce_llm_quota_for_paper(request.session_id, user_id=user_id)
        llm, provider, model = build_relevance_llm(request.llm_provider)

    settings = get_settings()

    async def fetch_source(entry: dict) -> SourceText:
        enriched = enrich_entry_from_registry(entry, registry.get(str(entry.get("key"))))
        return await fetch_source_text(
            enriched,
            openalex_mailto=settings.openalex_mailto,
            semantic_scholar_api_key=settings.semantic_scholar_api_key,
        )

    usage: list[tuple[str, str]] = []
    results = await check_citation_relevance(
        keys=keys,
        claim_map=claim_map,
        entries=entries,
        llm=llm,
        language=resolve_relevance_language(request.locale),
        fetch_source=fetch_source,
        usage=usage,
    )

    if usage and request.session_id:
        prompt_text = "\n\n".join(prompt for prompt, _ in usage)
        output_text = "\n".join(output for _, output in usage)
        record_ai_usage(
            paper_id=request.session_id,
            task_type="citation",
            user_input=f"[citation relevance L4] keys: {', '.join(keys)}\n\n{prompt_text}",
            ai_output=output_text,
            tokens_used=estimate_tokens(prompt_text) + estimate_tokens(output_text),
            llm_provider=provider,
            llm_model=model or "",
        )

    return CitationRelevanceResponse(results=results, summary=summarize_relevance(results), skipped_keys=skipped)
