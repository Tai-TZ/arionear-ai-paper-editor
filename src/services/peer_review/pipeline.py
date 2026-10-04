"""Two-stage LLM pipeline: split & classify reviewer comments, then draft one response per item.

Model selection follows the editor chat path (request provider/model, else the configured
default) through `get_llm`, which applies admin platform keys + key failover. Every call is
bounded by a per-stage timeout and an overall budget; malformed JSON gets one repair attempt.
The pipeline never touches the manuscript — it only returns drafts (Human Gate).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, TypeVar

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from pydantic import BaseModel

from src.config import get_settings, normalize_llm_provider
from src.models.peer_review_schemas import (
    PeerReviewItem,
    PeerReviewRequest,
    PeerReviewResponse,
    PeerReviewWarning,
    ReviewTone,
)
from src.services.guardrails.prompt_injection import wrap_untrusted_user_text
from src.services.llm import (
    REASONING_MODEL_TEMPERATURE,
    _resolve_model,
    extract_llm_text,
    get_llm,
    is_reasoning_model,
)
from src.services.llm_policy import resolve_llm_temperature
from src.services.peer_review.config import (
    DRAFT_BATCH_SIZE,
    DRAFT_CONCURRENCY,
    DRAFT_TEMPERATURE,
    DRAFT_TIMEOUT_SEC,
    MAX_CHANGE_CHARS,
    MAX_ITEMS,
    MAX_QUOTE_CHARS,
    MAX_REPAIR_ECHO_CHARS,
    MAX_RESPONSE_CHARS,
    MAX_SECTION_REFS,
    MAX_SUMMARY_CHARS,
    PIPELINE_BUDGET_SEC,
    SPLIT_TEMPERATURE,
    SPLIT_TIMEOUT_SEC,
    stage_timeout_sec,
)
from src.services.peer_review.heuristic_split import heuristic_split
from src.services.peer_review.json_utils import parse_payload
from src.services.peer_review.schemas import DraftItemPayload, DraftPayload, SplitItemPayload, SplitPayload
from src.services.peer_review.text_utils import (
    anchor_quote,
    find_author_placeholders,
    known_numbers,
    normalize_reviewer_label,
    prepare_comments,
    prepare_manuscript,
    resolve_letter_language,
    unverified_numbers,
)
from src.services.prompts import get_prompt, load_prompts, render_template
from src.services.stream_i18n import resolve_locale
from src.services.usage_tracking import estimate_tokens

logger = logging.getLogger(__name__)

PayloadT = TypeVar("PayloadT", bound=BaseModel)

DEFAULT_TONE: ReviewTone = "courteous"
_LANGUAGE_NAMES = {"en": "English", "vi": "Vietnamese"}


class PeerReviewError(Exception):
    """Pipeline failure surfaced to the API as a coded, user-safe error."""

    def __init__(self, code: str, message: str = "") -> None:
        self.code = code
        super().__init__(message or code)


class PeerReviewParseError(PeerReviewError):
    def __init__(self, detail: str) -> None:
        super().__init__("parse_failed", detail)


@dataclass
class _RunContext:
    deadline: float
    tokens: int = 0
    calls: int = 0
    warnings: list[PeerReviewWarning] = field(default_factory=list)

    def warn(self, code: PeerReviewWarning) -> None:
        if code not in self.warnings:
            self.warnings.append(code)

    def timeout_for(self, stage_timeout: float) -> float:
        remaining = self.deadline - asyncio.get_running_loop().time()
        if remaining <= 1.0:
            raise PeerReviewError("timeout", "Peer-review pipeline exceeded its time budget.")
        return min(stage_timeout, remaining)


def _usage_tokens(response: Any, messages: list[BaseMessage], text: str) -> int:
    usage = getattr(response, "usage_metadata", None) or {}
    if isinstance(usage, dict):
        total = usage.get("total_tokens")
        if total:
            return int(total)
    prompt_chars = sum(len(str(m.content)) for m in messages)
    return prompt_chars // 4 + estimate_tokens(text)


async def _ainvoke_text(llm: Any, messages: list[BaseMessage], *, timeout: float, ctx: _RunContext) -> str:
    try:
        response = await asyncio.wait_for(llm.ainvoke(messages), timeout=timeout)
    except TimeoutError as exc:
        raise PeerReviewError("timeout", f"LLM call timed out after {int(timeout)}s.") from exc
    text = extract_llm_text(response)
    ctx.calls += 1
    ctx.tokens += _usage_tokens(response, messages, text)
    return text


async def invoke_json_with_repair(
    llm: Any,
    *,
    system: str,
    user: str,
    schema: type[PayloadT],
    list_key: str,
    stage_timeout: float,
    ctx: _RunContext,
    soft_check: Callable[[PayloadT], str] | None = None,
) -> PayloadT:
    """Call the LLM and validate its JSON; on failure send one repair turn, then give up.

    `soft_check` failures (e.g. missing ids) trigger the repair turn but are tolerated on it,
    so a mostly-valid repaired reply is still used.
    """
    messages: list[BaseMessage] = [SystemMessage(content=system), HumanMessage(content=user)]
    raw = await _ainvoke_text(llm, messages, timeout=ctx.timeout_for(stage_timeout), ctx=ctx)
    payload, error = parse_payload(raw, schema, list_key=list_key)
    if payload is not None and soft_check is not None:
        error = soft_check(payload)
        if not error:
            return payload
    elif payload is not None:
        return payload

    logger.info("peer_review: invalid %s reply, attempting repair (%s)", schema.__name__, error)
    repair = render_template(get_prompt("peer_review_repair", "user"), error=error).strip()
    repair_messages = [
        *messages,
        AIMessage(content=(raw or "").strip()[:MAX_REPAIR_ECHO_CHARS] or "(empty reply)"),
        HumanMessage(content=repair),
    ]
    raw_repaired = await _ainvoke_text(llm, repair_messages, timeout=ctx.timeout_for(stage_timeout), ctx=ctx)
    repaired, repair_error = parse_payload(raw_repaired, schema, list_key=list_key)
    if repaired is not None:
        return repaired
    if payload is not None:
        # First reply was schema-valid and only failed the soft check — better than nothing.
        return payload
    raise PeerReviewParseError(repair_error or error)


def _temperature(model: str | None, base: float) -> float:
    if is_reasoning_model(model):
        return REASONING_MODEL_TEMPERATURE
    return resolve_llm_temperature(base)


def _tone_instruction(tone: ReviewTone) -> str:
    raw = load_prompts().get("peer_review_draft", {})
    tones = raw.get("tones", {}) if isinstance(raw, dict) else {}
    if isinstance(tones, dict):
        text = str(tones.get(tone) or tones.get(DEFAULT_TONE) or "").strip()
        if text:
            return text
    return "Courteous, precise and respectful."


# ─── Stage 1: split & classify ─────────────────────────────────────────────


async def split_comments(
    llm: Any,
    comments: str,
    *,
    ui_language: str,
    model: str | None,
    ctx: _RunContext,
) -> list[SplitItemPayload]:
    """LLM split with one repair; falls back to the deterministic splitter on malformed output."""
    system = render_template(
        get_prompt("peer_review_split", "system"),
        ui_language=ui_language,
        max_items=str(MAX_ITEMS),
    )
    user = render_template(
        get_prompt("peer_review_split", "user"),
        reviewer_comments=wrap_untrusted_user_text(comments, label="reviewer_comments"),
        ui_language=ui_language,
    )
    try:
        payload = await invoke_json_with_repair(
            llm,
            system=system,
            user=user,
            schema=SplitPayload,
            list_key="items",
            stage_timeout=stage_timeout_sec(SPLIT_TIMEOUT_SEC, model),
            ctx=ctx,
        )
        return payload.items
    except PeerReviewParseError as exc:
        logger.warning("peer_review: split JSON unusable after repair, using heuristic splitter (%s)", exc)
        items = heuristic_split(comments, max_items=10_000)
        if not items:
            raise
        ctx.warn("split_fallback")
        return items


def _item_prefix(reviewer: str | None) -> str:
    if not reviewer:
        return "C"
    return re.sub(r"\W+", "", reviewer)[:12] or "C"


def build_items(
    split_items: list[SplitItemPayload], source_comments: str, ctx: _RunContext
) -> tuple[list[PeerReviewItem], int]:
    """Normalise labels, anchor quotes to the source text, assign stable ids and cap the count."""
    built: list[PeerReviewItem] = []
    counters: dict[str, int] = {}
    seen_quotes: set[str] = set()
    for raw in split_items:
        quote, verified = anchor_quote(raw.quote[:MAX_QUOTE_CHARS], source_comments)
        if not quote:
            continue
        key = " ".join(quote.lower().split())
        if key in seen_quotes:
            continue
        seen_quotes.add(key)
        reviewer = normalize_reviewer_label(raw.reviewer)
        prefix = _item_prefix(reviewer)
        counters[prefix] = counters.get(prefix, 0) + 1
        built.append(
            PeerReviewItem(
                id=f"{prefix}.{counters[prefix]}",
                reviewer=reviewer,
                category=raw.category,
                quote=quote[:MAX_QUOTE_CHARS],
                quote_verified=verified,
                summary=raw.summary[:MAX_SUMMARY_CHARS],
            )
        )
    omitted = max(0, len(built) - MAX_ITEMS)
    if omitted:
        ctx.warn("items_capped")
    return built[:MAX_ITEMS], omitted


# ─── Stage 2: draft responses ──────────────────────────────────────────────


def _match_section_refs(refs: list[str], outline: list[str]) -> list[str]:
    matched: list[str] = []
    for ref in refs:
        cleaned = ref.strip()[:80]
        if not cleaned:
            continue
        if outline:
            lowered = cleaned.lower()
            canonical = next(
                (name for name in outline if name.lower() == lowered or name.lower() in lowered),
                None,
            )
            if canonical is None:
                canonical = next((name for name in outline if lowered in name.lower()), None)
            if canonical is None:
                continue
            cleaned = canonical
        if cleaned not in matched:
            matched.append(cleaned)
        if len(matched) >= MAX_SECTION_REFS:
            break
    return matched


async def _draft_batch(
    llm: Any,
    batch: list[PeerReviewItem],
    *,
    system: str,
    outline_text: str,
    manuscript_block: str,
    letter_language: str,
    model: str | None,
    ctx: _RunContext,
) -> dict[str, DraftItemPayload]:
    expected = [item.id for item in batch]
    review_items = json.dumps(
        [
            {
                "id": item.id,
                "reviewer": item.reviewer,
                "category": item.category,
                "comment": item.quote,
            }
            for item in batch
        ],
        ensure_ascii=False,
        indent=2,
    )
    user = render_template(
        get_prompt("peer_review_draft", "user"),
        outline=outline_text,
        manuscript=manuscript_block,
        review_items=wrap_untrusted_user_text(review_items, label="review_items"),
        item_ids=", ".join(expected),
        letter_language=letter_language,
    )

    def missing_ids(payload: DraftPayload) -> str:
        got = {entry.id for entry in payload.responses}
        missing = [item_id for item_id in expected if item_id not in got]
        return f"responses are missing for ids {', '.join(missing)}" if missing else ""

    payload = await invoke_json_with_repair(
        llm,
        system=system,
        user=user,
        schema=DraftPayload,
        list_key="responses",
        stage_timeout=stage_timeout_sec(DRAFT_TIMEOUT_SEC, model),
        ctx=ctx,
        soft_check=missing_ids,
    )
    wanted = set(expected)
    return {entry.id: entry for entry in payload.responses if entry.id in wanted}


async def draft_responses(
    llm: Any,
    items: list[PeerReviewItem],
    *,
    latex: str,
    source_comments: str,
    tone: ReviewTone,
    letter_language: str,
    model: str | None,
    ctx: _RunContext,
) -> list[PeerReviewItem]:
    manuscript_text, outline, truncated = prepare_manuscript(latex)
    if truncated:
        ctx.warn("manuscript_truncated")
    outline_text = "\n".join(f"- {name}" for name in outline) or "(no sections detected)"
    manuscript_block = (
        wrap_untrusted_user_text(manuscript_text, label="manuscript")
        if manuscript_text
        else "<manuscript>\n(no manuscript text provided)\n</manuscript>"
    )
    system = render_template(
        get_prompt("peer_review_draft", "system"),
        tone_instruction=_tone_instruction(tone),
        letter_language=letter_language,
    )
    batches = [items[i : i + DRAFT_BATCH_SIZE] for i in range(0, len(items), DRAFT_BATCH_SIZE)]
    semaphore = asyncio.Semaphore(DRAFT_CONCURRENCY)

    async def run(batch: list[PeerReviewItem]) -> dict[str, DraftItemPayload]:
        async with semaphore:
            return await _draft_batch(
                llm,
                batch,
                system=system,
                outline_text=outline_text,
                manuscript_block=manuscript_block,
                letter_language=letter_language,
                model=model,
                ctx=ctx,
            )

    results = await asyncio.gather(*(run(batch) for batch in batches), return_exceptions=True)
    drafts: dict[str, DraftItemPayload] = {}
    failures: list[BaseException] = []
    numbers_in_sources = known_numbers(latex, source_comments)
    for result in results:
        if isinstance(result, BaseException):
            if isinstance(result, asyncio.CancelledError):
                raise result
            logger.warning("peer_review: draft batch failed: %s", result)
            failures.append(result)
        else:
            drafts.update(result)

    if items and not drafts:
        raise failures[0] if failures else PeerReviewParseError("no responses drafted")

    drafted: list[PeerReviewItem] = []
    for item in items:
        entry = drafts.get(item.id)
        if entry is None:
            ctx.warn("draft_partial")
            drafted.append(item.model_copy(update={"draft_failed": True}))
            continue
        response = entry.response[:MAX_RESPONSE_CHARS]
        change = entry.proposed_change[:MAX_CHANGE_CHARS]
        combined = f"{response}\n{change}"
        drafted.append(
            item.model_copy(
                update={
                    "response": response,
                    "proposed_change": change,
                    "section_refs": _match_section_refs(entry.section_refs, outline),
                    "needs_author_input": bool(find_author_placeholders(combined)),
                    "unverified_numbers": unverified_numbers(combined, numbers_in_sources),
                }
            )
        )
    return drafted


# ─── Orchestration ─────────────────────────────────────────────────────────


@dataclass
class PeerReviewRun:
    response: PeerReviewResponse
    tokens: int
    llm_calls: int


async def run_peer_review_pipeline(request: PeerReviewRequest) -> PeerReviewRun:
    settings = get_settings()
    provider = normalize_llm_provider(request.llm_provider or settings.llm_provider) or settings.llm_provider
    model = _resolve_model(settings, provider, request.llm_model or None)
    ui_language = _LANGUAGE_NAMES[resolve_locale(request.locale)]
    tone: ReviewTone = request.tone or DEFAULT_TONE

    ctx = _RunContext(deadline=asyncio.get_running_loop().time() + PIPELINE_BUDGET_SEC)
    comments, comments_truncated = prepare_comments(request.comments)
    if comments_truncated:
        ctx.warn("comments_truncated")
    letter_language = resolve_letter_language(comments)

    split_llm = get_llm(
        provider=provider,
        model=model,
        temperature=_temperature(model, SPLIT_TEMPERATURE),
        json_output=True,
    )
    split_items = await split_comments(split_llm, comments, ui_language=ui_language, model=model, ctx=ctx)
    items, omitted = build_items(split_items, comments, ctx)

    if items:
        draft_llm = get_llm(
            provider=provider,
            model=model,
            temperature=_temperature(model, DRAFT_TEMPERATURE),
            json_output=True,
        )
        items = await draft_responses(
            draft_llm,
            items,
            latex=request.latex_content,
            source_comments=request.comments,
            tone=tone,
            letter_language=_LANGUAGE_NAMES[letter_language],
            model=model,
            ctx=ctx,
        )

    reviewers: list[str] = []
    for item in items:
        if item.reviewer and item.reviewer not in reviewers:
            reviewers.append(item.reviewer)

    response = PeerReviewResponse(
        items=items,
        reviewers=reviewers,
        letter_language=letter_language,
        warnings=ctx.warnings,
        omitted_item_count=omitted,
        provider=str(provider),
        model=model,
    )
    return PeerReviewRun(response=response, tokens=ctx.tokens, llm_calls=ctx.calls)
