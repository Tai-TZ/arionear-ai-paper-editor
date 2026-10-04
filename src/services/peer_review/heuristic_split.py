"""Deterministic fallback splitter used when the LLM split stage returns unusable JSON.

It recognises reviewer headings ("Reviewer 2", "R1:", "Referee #3"), "Major/Minor comments"
sub-headings, numbered / bulleted points and blank-line paragraphs. Classification is a
keyword heuristic — good enough to let the drafting stage run instead of failing outright.
"""

from __future__ import annotations

import re

from src.models.peer_review_schemas import ReviewCategory
from src.services.peer_review.config import MAX_ITEMS, MAX_SUMMARY_CHARS
from src.services.peer_review.schemas import SplitItemPayload

_HEADER_RE = re.compile(
    r"^\s*(?:#+\s*)?(?:\*\*)?\s*(?:comments?\s+(?:from|of|by)\s+)?(?:the\s+)?"
    r"(?:reviewer|referee|phản\s*biện|người\s*phản\s*biện)\s*#?\s*(\d{1,2})\b"
    r"\s*(?:\*\*)?\s*(?:'s)?\s*(?:comments?)?\s*[:.\-—]?\s*(?:\*\*)?\s*(.*)$",
    re.IGNORECASE,
)
# Bare "R1" headings need a separator or end of line so "R2 is low in Table 3" stays a comment.
_SHORT_HEADER_RE = re.compile(r"^\s*(?:\*\*)?R(\d{1,2})(?:\*\*)?\s*(?:$|[:.\-—]\s*(.*)$)")
_EDITOR_HEADER_RE = re.compile(
    r"^\s*(?:#+\s*)?(?:\*\*)?\s*(?:associate\s+|academic\s+)?editor(?:'s)?(?:\s+comments?)?\s*[:.]?\s*(?:\*\*)?\s*$",
    re.IGNORECASE,
)
_CATEGORY_HEADING_RE = re.compile(
    r"^\s*(?:#+\s*)?(?:\*\*)?\s*(major|minor|editorial|specific|general)"
    r"(?:\s+(?:comments?|issues?|points?|concerns?|remarks?|revisions?|suggestions?))?\s*:?\s*(?:\*\*)?\s*$",
    re.IGNORECASE,
)
_ITEM_START_RE = re.compile(r"^\s*(?:\(?\d{1,2}[.)]|[-*•]|\(?[a-h][.)])\s+", re.IGNORECASE)
_SENTENCE_END_RE = re.compile(r"(?<=[.!?])\s")

_EDITORIAL_HINTS = (
    "typo",
    "grammar",
    "spelling",
    "punctuation",
    "proofread",
    "formatting",
    "format of",
    "english language",
    "language editing",
    "lỗi chính tả",
    "ngữ pháp",
    "trình bày",
)
_MAJOR_HINTS = (
    "major",
    "fundamental",
    "serious",
    "critical",
    "not convinced",
    "unconvincing",
    "novelty",
    "lack of",
    "lacks",
    "insufficient",
    "flawed",
    "nghiêm trọng",
    "thiếu",
)


def _classify(text: str, context: ReviewCategory | None) -> ReviewCategory:
    lowered = text.lower()
    if text.rstrip().endswith("?"):
        return "question"
    if any(hint in lowered for hint in _EDITORIAL_HINTS):
        return "editorial"
    if context:
        return context
    if any(hint in lowered for hint in _MAJOR_HINTS):
        return "major"
    return "minor"


def _summarize(text: str) -> str:
    flat = " ".join(text.split())
    first = _SENTENCE_END_RE.split(flat, maxsplit=1)[0]
    if len(first) > 120:
        first = first[:117].rstrip() + "..."
    return first[:MAX_SUMMARY_CHARS]


def _split_block(lines: list[str]) -> list[str]:
    """Split one reviewer block into points (numbered/bulleted lines, else paragraphs)."""
    if any(_ITEM_START_RE.match(line) for line in lines):
        items: list[list[str]] = []
        for line in lines:
            if _ITEM_START_RE.match(line) or not items:
                items.append([line])
            else:
                items[-1].append(line)
        return ["\n".join(part).strip() for part in items if "\n".join(part).strip()]
    paragraphs: list[str] = []
    current: list[str] = []
    for line in lines:
        if line.strip():
            current.append(line)
        elif current:
            paragraphs.append("\n".join(current).strip())
            current = []
    if current:
        paragraphs.append("\n".join(current).strip())
    return paragraphs


_BOILERPLATE_PREFIXES = (
    "dear ",
    "thank you",
    "thanks",
    "sincerely",
    "best regards",
    "kind regards",
    "kính gửi",
    "trân trọng",
    "cảm ơn",
)


def _is_heading_only(text: str) -> bool:
    stripped = text.strip()
    if len(stripped) < 15 or (stripped.endswith(":") and len(stripped) < 60 and "\n" not in stripped):
        return True
    # Greetings / sign-offs are not reviewer points.
    return len(stripped) < 160 and stripped.lower().startswith(_BOILERPLATE_PREFIXES)


def heuristic_split(comments: str, *, max_items: int = MAX_ITEMS) -> list[SplitItemPayload]:
    reviewer: str | None = None
    category_ctx: ReviewCategory | None = None
    block: list[str] = []
    items: list[SplitItemPayload] = []

    def flush() -> None:
        nonlocal block
        for point in _split_block(block):
            if _is_heading_only(point):
                continue
            items.append(
                SplitItemPayload(
                    reviewer=reviewer,
                    quote=point,
                    category=_classify(point, category_ctx),
                    summary=_summarize(point),
                )
            )
        block = []

    for raw_line in (comments or "").replace("\r\n", "\n").split("\n"):
        header = _HEADER_RE.match(raw_line) or _SHORT_HEADER_RE.match(raw_line)
        if header:
            flush()
            reviewer = f"R{int(header.group(1))}"
            category_ctx = None
            rest = (header.group(2) or "").strip()
            if len(rest) >= 20:
                block.append(rest)
            continue
        if _EDITOR_HEADER_RE.match(raw_line):
            flush()
            reviewer = "Editor"
            category_ctx = None
            continue
        heading = _CATEGORY_HEADING_RE.match(raw_line)
        if heading:
            flush()
            word = heading.group(1).lower()
            category_ctx = "major" if word == "major" else "minor" if word in {"minor", "specific"} else None
            if word == "editorial":
                category_ctx = "editorial"
            continue
        block.append(raw_line)
    flush()
    return items[:max_items]
