"""Deterministic helpers: input capping, reviewer labels, quote anchoring and output guardrails."""

from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher

from src.models.peer_review_schemas import LetterLanguage
from src.services.guardrails.integrity import extract_numbers
from src.services.logic_audit.language import clean_section_display_name
from src.services.parser.latex import parse_latex_sections
from src.services.peer_review.config import MAX_COMMENTS_CHARS, MAX_MANUSCRIPT_CHARS, MAX_OUTLINE_SECTIONS

AUTHOR_PLACEHOLDER_RE = re.compile(r"\[AUTHOR:[^\]]*\]", re.IGNORECASE)

_LATEX_COMMENT_RE = re.compile(r"(?<!\\)%.*$", re.MULTILINE)
_BLANK_RUN_RE = re.compile(r"\n{3,}")
_WS_RE = re.compile(r"\s+")

_REVIEWER_NUM_RE = re.compile(
    r"^(?:reviewer|referee|rev\.?|r|phản\s*biện|người\s*phản\s*biện)\s*#?\s*(\d{1,2})\b",
    re.IGNORECASE,
)
_EDITOR_RE = re.compile(r"\b(?:editor|ae|biên\s*tập)\b", re.IGNORECASE)

COMMENTS_TRUNCATION_NOTE = "[... reviewer comments truncated ...]"
MANUSCRIPT_TRUNCATION_NOTE = "[... manuscript truncated to fit the context window ...]"


def _truncate_at_boundary(text: str, limit: int) -> str:
    """Cut at the last line break before `limit` when one exists reasonably close."""
    if len(text) <= limit:
        return text
    head = text[:limit]
    cut = head.rfind("\n")
    if cut >= int(limit * 0.8):
        head = head[:cut]
    return head.rstrip()


def prepare_comments(comments: str, limit: int = MAX_COMMENTS_CHARS) -> tuple[str, bool]:
    """Return (comments for the LLM, truncated?)."""
    text = (comments or "").replace("\r\n", "\n").strip()
    if len(text) <= limit:
        return text, False
    return f"{_truncate_at_boundary(text, limit)}\n{COMMENTS_TRUNCATION_NOTE}", True


def manuscript_outline(latex: str, limit: int = MAX_OUTLINE_SECTIONS) -> list[str]:
    """Section names of the full manuscript — kept even when the body itself is truncated."""
    names: list[str] = []
    for section in parse_latex_sections(latex or ""):
        name = clean_section_display_name(str(section.get("name") or ""))
        if name and name not in names:
            names.append(name)
        if len(names) >= limit:
            break
    return names


def prepare_manuscript(latex: str, limit: int = MAX_MANUSCRIPT_CHARS) -> tuple[str, list[str], bool]:
    """Return (condensed manuscript body, section outline, truncated?).

    Drops the preamble and LaTeX comments before applying the character cap so the
    budget is spent on prose the responses can actually reference.
    """
    source = (latex or "").replace("\r\n", "\n")
    outline = manuscript_outline(source)
    body = source
    start = body.find(r"\begin{document}")
    if start != -1:
        body = body[start + len(r"\begin{document}") :]
    end = body.find(r"\end{document}")
    if end != -1:
        body = body[:end]
    body = _LATEX_COMMENT_RE.sub("", body)
    body = _BLANK_RUN_RE.sub("\n\n", body).strip()
    if len(body) <= limit:
        return body, outline, False
    return f"{_truncate_at_boundary(body, limit)}\n{MANUSCRIPT_TRUNCATION_NOTE}", outline, True


def normalize_reviewer_label(raw: str | None) -> str | None:
    """'Reviewer #2' / 'Referee 2' / 'R2' → 'R2'; editor comments → 'Editor'; unknown → None."""
    text = (raw or "").strip().strip(":.-—").strip()
    if not text or text.lower() in {"none", "null", "unknown", "n/a", "general", "-"}:
        return None
    match = _REVIEWER_NUM_RE.match(text)
    if match:
        return f"R{int(match.group(1))}"
    if _EDITOR_RE.search(text):
        return "Editor"
    return text[:24]


def _normalize_for_match(text: str) -> str:
    folded = unicodedata.normalize("NFKC", text or "")
    folded = folded.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    return _WS_RE.sub(" ", folded).strip().lower()


def anchor_quote(quote: str, source: str, *, min_ratio: float = 0.72) -> tuple[str, bool]:
    """Ensure the quote is verbatim from the reviewer text.

    Returns (quote, verified). When the model paraphrased, snap to the closest source
    paragraph/line if it is similar enough; otherwise keep the model text but flag it.
    """
    raw = (quote or "").strip()
    unquoted = raw.strip('"“”').strip()
    if not unquoted:
        return "", False
    normalized_source = _normalize_for_match(source)
    for candidate in (raw, unquoted):
        if _normalize_for_match(candidate) in normalized_source:
            return candidate, True
    cleaned = unquoted

    target = _normalize_for_match(cleaned)
    best_ratio = 0.0
    best_segment = ""
    segments = [p.strip() for p in re.split(r"\n\s*\n", source or "") if p.strip()]
    segments += [line.strip() for line in (source or "").splitlines() if line.strip()]
    for segment in segments:
        candidate = _normalize_for_match(segment)
        # ratio <= 2*min(a, b)/(a + b): skip segments whose length alone rules them out.
        if 2 * min(len(target), len(candidate)) < min_ratio * (len(target) + len(candidate)):
            continue
        matcher = SequenceMatcher(None, target, candidate)
        if matcher.quick_ratio() < max(min_ratio, best_ratio):
            continue
        ratio = matcher.ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_segment = segment
    if best_segment and best_ratio >= min_ratio:
        return best_segment, True
    return cleaned, False


def find_author_placeholders(text: str) -> list[str]:
    return AUTHOR_PLACEHOLDER_RE.findall(text or "")


def _number_key(token: str) -> str:
    """Numeric value without unit suffix — LaTeX writes `91.2\\%`, prose writes `91.2%`."""
    core = token.lstrip("+")
    for suf in ("%", "pp", "bps"):
        if core.endswith(suf):
            core = core[: -len(suf)]
            break
    try:
        value = float(core)
    except ValueError:
        return token
    if value == int(value):
        return str(int(value))
    return f"{value:.6f}".rstrip("0").rstrip(".")


def _is_reference_like(token: str) -> bool:
    """Small bare integers are usually section/figure/item numbers, not results."""
    if any(ch in token for ch in ".%") or token.endswith(("pp", "bps")):
        return False
    try:
        return abs(int(token)) <= 20
    except ValueError:
        return False


def known_numbers(*sources: str) -> set[str]:
    """Normalised numbers present in the manuscript / reviewer comments (computed once per run)."""
    return {_number_key(n) for source in sources for n in extract_numbers(source or "")}


def unverified_numbers(text: str, known: set[str]) -> list[str]:
    """Numbers in a drafted response that appear in neither the manuscript nor the comments.

    Placeholders are excluded. This is the deterministic L2 check behind the
    "never invent results" rule — flagged numbers are surfaced in the UI for the author.
    """
    body = AUTHOR_PLACEHOLDER_RE.sub(" ", text or "")
    flagged: list[str] = []
    for token in sorted(extract_numbers(body)):
        if _is_reference_like(token):
            continue
        if _number_key(token) in known or token in flagged:
            continue
        flagged.append(token)
    return flagged[:10]


# Letters that only occur in Vietnamese (French/Spanish names like "Pérez" must not flip the language).
_VI_DISTINCT_CHARS = frozenset("ăđơưạảẹẻẽịỉĩọỏụủũỳỷỹỵấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự")


def resolve_letter_language(comments: str) -> LetterLanguage:
    """Responses are written in the reviewers' language (usually English)."""
    lowered = (comments or "").lower()
    letters = sum(1 for ch in lowered if ch.isalpha())
    vi_hits = sum(1 for ch in lowered if ch in _VI_DISTINCT_CHARS)
    if letters and vi_hits >= 3 and vi_hits / letters >= 0.01:
        return "vi"
    return "en"
