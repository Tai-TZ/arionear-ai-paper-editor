"""Extract the manuscript claim (sentence context) around each ``\\cite{key}``.

Read-only helper for Citation Layer 4: it never modifies the LaTeX source.
Handles ``\\cite``, ``\\citep``, ``\\citet`` (and other ``\\cite*`` / biblatex
variants), optional ``[pre][post]`` notes and multi-key cites.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

DEFAULT_MAX_CONTEXTS_PER_KEY = 3
DEFAULT_MAX_SNIPPET_CHARS = 600
# A sentence with fewer words than this outside cite commands (e.g. "See \cite{x}.") also pulls in
# the previous sentence, which carries the actual claim.
_SHORT_SENTENCE_WORDS = 4

CITE_COMMAND_RE = re.compile(r"\\([a-zA-Z]*cite[a-zA-Z]*)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^{}]*)\}")
_NON_CLAIM_CITE_COMMANDS = frozenset({"nocite"})

_COMMENT_RE = re.compile(r"(?<!\\)%[^\n]*")
_DOCUMENT_START_RE = re.compile(r"\\begin\{document\}")
_BODY_END_RE = re.compile(r"\\begin\{thebibliography\}|\\bibliography\{|\\printbibliography|\\end\{document\}")

# Structural markers that always end a claim (paragraph breaks, headings, environments, list items).
_HARD_BOUNDARY_RE = re.compile(
    r"\n[ \t]*\n"
    r"|\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?(?:\[[^\]]*\])?\{[^{}]*\}"
    r"|\\(?:begin|end)\{[^}]*\}"
    r"|\\item\b(?:\s*\[[^\]]*\])?"
    r"|\\par\b"
    r"|\\\\"
)

_ABBREVIATIONS = frozenset(
    {
        "al",
        "e.g",
        "i.e",
        "etc",
        "cf",
        "vs",
        "viz",
        "fig",
        "figs",
        "eq",
        "eqs",
        "sec",
        "secs",
        "tab",
        "ref",
        "refs",
        "ch",
        "chap",
        "no",
        "vol",
        "pp",
        "approx",
        "resp",
        "dr",
        "prof",
        "mr",
        "mrs",
        "ms",
        "st",
        "jr",
    }
)
_WORD_BEFORE_PERIOD_RE = re.compile(r"([A-Za-z]+(?:\.[A-Za-z]+)*)$")

_FORMAT_COMMAND_RE = re.compile(r"\\(?:emph|textbf|textit|textsc|texttt|underline|textrm|textsf)\{([^{}]*)\}")
_REF_COMMAND_RE = re.compile(r"\\(?:ref|eqref|autoref|cref|Cref|pageref)\{[^{}]*\}")
_LABEL_COMMAND_RE = re.compile(r"\\label\{[^{}]*\}")


def split_cite_keys(raw: str) -> list[str]:
    """Split the ``{a, b}`` argument of a cite command into keys (order kept, de-duplicated)."""
    keys: list[str] = []
    for part in raw.split(","):
        key = part.strip()
        if key and key not in keys:
            keys.append(key)
    return keys


def _strip_comments(latex: str) -> str:
    return _COMMENT_RE.sub("", latex)


def _manuscript_body(latex: str) -> str:
    text = _strip_comments(latex or "")
    start = _DOCUMENT_START_RE.search(text)
    if start:
        text = text[start.end() :]
    end = _BODY_END_RE.search(text)
    if end:
        text = text[: end.start()]
    return text


def _is_sentence_end(text: str, index: int) -> bool:
    char = text[index]
    if char not in ".!?":
        return False
    following = text[index + 1] if index + 1 < len(text) else ""
    if following and not following.isspace():
        # "e.g.," "3.5" "Fig.~2" "work.\cite{x}" — not a boundary.
        return False
    if char == ".":
        word = _WORD_BEFORE_PERIOD_RE.search(text[max(0, index - 24) : index])
        if word:
            token = word.group(1)
            if token.lower() in _ABBREVIATIONS:
                return False
            if len(token) == 1 and token.isupper():  # author initial: "J. Smith"
                return False
    cursor = index + 1
    while cursor < len(text) and text[cursor].isspace():
        cursor += 1
    if cursor >= len(text):
        return True
    upcoming = text[cursor]
    return upcoming.isupper() or upcoming.isdigit() or upcoming in "\\[{(\"'`"


def _word_count_without_cites(sentence: str) -> int:
    return len(re.findall(r"\w+", CITE_COMMAND_RE.sub(" ", sentence)))


def _hard_boundaries(text: str) -> list[tuple[int, int]]:
    return [(m.start(), m.end()) for m in _HARD_BOUNDARY_RE.finditer(text)]


def _segment_bounds(boundaries: list[tuple[int, int]], text_len: int, start: int, end: int) -> tuple[int, int]:
    """Bounds of the structural segment (paragraph / list item / between headings) around a span."""
    seg_start, seg_end = 0, text_len
    for b_start, b_end in boundaries:
        if b_end <= start:
            seg_start = b_end
        elif b_start >= end:
            seg_end = b_start
            break
    return seg_start, seg_end


def _sentence_bounds(text: str, boundaries: list[tuple[int, int]], start: int, end: int) -> tuple[int, int]:
    seg_start, seg_end = _segment_bounds(boundaries, len(text), start, end)
    # Up to two sentence ends before the cite (nearest first), scanning backwards.
    ends_before: list[int] = []
    for i in range(start - 1, seg_start - 1, -1):
        if _is_sentence_end(text, i):
            ends_before.append(i + 1)
            if len(ends_before) == 2:
                break
    sent_start = ends_before[0] if ends_before else seg_start
    sent_end = seg_end
    for i in range(end, seg_end):
        if _is_sentence_end(text, i):
            sent_end = i + 1
            break
    if ends_before and _word_count_without_cites(text[sent_start:sent_end]) < _SHORT_SENTENCE_WORDS:
        sent_start = ends_before[1] if len(ends_before) == 2 else seg_start
    return sent_start, sent_end


def _render_cite(match: re.Match[str]) -> str:
    if match.group(1) in _NON_CLAIM_CITE_COMMANDS:
        return ""
    keys = split_cite_keys(match.group(2))
    return f"[{', '.join(keys)}]" if keys else ""


def clean_claim_snippet(raw: str) -> str:
    """Make a LaTeX sentence readable: cites → ``[key, …]``, drop labels/formatting, collapse spaces."""
    text = CITE_COMMAND_RE.sub(_render_cite, raw)
    text = _LABEL_COMMAND_RE.sub("", text)
    text = _REF_COMMAND_RE.sub("[ref]", text)
    for _ in range(3):  # unwrap simple nested formatting
        text = _FORMAT_COMMAND_RE.sub(r"\1", text)
    text = text.replace("~", " ").replace("\\%", "%").replace("\\&", "&")
    return re.sub(r"\s+", " ", text).strip()


def _window(text: str, sent_start: int, sent_end: int, cite_start: int, cite_end: int, max_chars: int) -> str:
    """Trim an overlong sentence to ``max_chars`` (raw), centred on the cite command."""
    if sent_end - sent_start <= max_chars:
        return text[sent_start:sent_end]
    half = max(0, (max_chars - (cite_end - cite_start)) // 2)
    lo = max(sent_start, cite_start - half)
    hi = min(sent_end, max(cite_end + half, lo + max_chars))
    prefix = "… " if lo > sent_start else ""
    suffix = " …" if hi < sent_end else ""
    return f"{prefix}{text[lo:hi]}{suffix}"


def extract_claim_contexts(
    latex: str,
    keys: Iterable[str] | None = None,
    *,
    max_per_key: int = DEFAULT_MAX_CONTEXTS_PER_KEY,
    max_chars: int = DEFAULT_MAX_SNIPPET_CHARS,
) -> dict[str, list[str]]:
    """Map cite key → cleaned claim sentence(s) where it is cited (document order, de-duplicated).

    When ``keys`` is given, every requested key is present in the result (``[]`` if never cited).
    """
    wanted = list(dict.fromkeys(k.strip() for k in keys if k and k.strip())) if keys is not None else None
    contexts: dict[str, list[str]] = {key: [] for key in wanted} if wanted is not None else {}
    body = _manuscript_body(latex)
    if not body.strip():
        return contexts

    boundaries = _hard_boundaries(body)
    for match in CITE_COMMAND_RE.finditer(body):
        if match.group(1) in _NON_CLAIM_CITE_COMMANDS:
            continue
        cited = split_cite_keys(match.group(2))
        targets = [key for key in cited if wanted is None or key in contexts]
        targets = [key for key in targets if len(contexts.get(key, [])) < max_per_key]
        if not targets:
            continue
        sent_start, sent_end = _sentence_bounds(body, boundaries, match.start(), match.end())
        snippet = clean_claim_snippet(_window(body, sent_start, sent_end, match.start(), match.end(), max_chars))
        if not snippet:
            continue
        for key in targets:
            bucket = contexts.setdefault(key, [])
            if snippet not in bucket:
                bucket.append(snippet)
    return contexts
