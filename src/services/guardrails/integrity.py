from __future__ import annotations

import difflib
import re
from difflib import SequenceMatcher
from typing import Literal

IntegrityStrictness = Literal["relaxed", "standard", "strict"]
EditScope = Literal["document", "selection"]

NUMBER_RE = re.compile(
    r"(?<![a-zA-Z])[-+]?\d+(?:\.\d+)?(?:%|pp|bps)?(?![a-zA-Z])"
)

# Numbers in layout / package lines cause false positives on full-file LLM edits.
_LATEX_LAYOUT_RE = re.compile(
    r"\\(?:usepackage|documentclass|setlength|vspace|hspace|includegraphics|"
    r"geometry|linewidth|textwidth|top|bottom|left|right|margin|hoffset|voffset)"
    r"[^\n]*",
    re.IGNORECASE,
)


def extract_numbers(text: str) -> set[str]:
    return set(NUMBER_RE.findall(text))


def _normalize_number_token(token: str) -> str:
    suffix = ""
    core = token
    for suf in ("%", "pp", "bps"):
        if core.endswith(suf):
            suffix = suf
            core = core[: -len(suf)]
            break
    try:
        value = float(core)
        if value == int(value):
            normalized = str(int(value))
        else:
            normalized = f"{value:.6f}".rstrip("0").rstrip(".")
        return f"{normalized}{suffix}"
    except ValueError:
        return token


def _normalized_numbers(text: str) -> set[str]:
    return {_normalize_number_token(n) for n in extract_numbers(text)}


def _latex_numeric_surface(text: str, scope: EditScope | None) -> str:
    """Strip preamble and layout lines — major source of false numeric drift."""
    body = text
    doc_start = text.find(r"\begin{document}")
    doc_end = text.find(r"\end{document}")
    if doc_start != -1 and doc_end != -1 and doc_end > doc_start:
        body = text[doc_start:doc_end]

    if scope == "document":
        body = _LATEX_LAYOUT_RE.sub(" ", body)

    lines: list[str] = []
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith("%"):
            continue
        if scope == "document" and _LATEX_LAYOUT_RE.search(line):
            continue
        lines.append(line)
    return "\n".join(lines)


def build_diff(original: str, suggestion: str) -> str:
    original_lines = original.splitlines(keepends=True) or [original]
    suggestion_lines = suggestion.splitlines(keepends=True) or [suggestion]
    diff = difflib.unified_diff(
        original_lines,
        suggestion_lines,
        fromfile="original",
        tofile="suggestion",
        lineterm="",
    )
    return "\n".join(diff)


def _word_overlap_ratio(a: str, b: str) -> float:
    words_a = set(re.findall(r"\b\w+\b", a.lower()))
    words_b = set(re.findall(r"\b\w+\b", b.lower()))
    if not words_a or not words_b:
        return 1.0 if a.strip() == b.strip() else 0.0
    return len(words_a & words_b) / max(len(words_a), len(words_b))


def _numeric_severity(
    *,
    strictness: IntegrityStrictness,
    scope: EditScope | None,
    new_count: int,
) -> Literal["error", "warning", "skip"]:
    if strictness == "relaxed":
        return "skip" if scope == "document" else "warning"
    if strictness == "standard":
        if scope == "document":
            # Document edits: warn (human gate) but do not hard-block Accept in UI.
            return "warning"
        return "warning"
    # strict
    if scope == "document" and new_count <= 3:
        return "warning"
    return "error"


def _is_section_outline_number(num: str, text: str) -> bool:
    """Ignore ordinals like 'Section 2' — not scientific metrics."""
    for match in re.finditer(re.escape(num), text):
        window = text[max(0, match.start() - 32) : match.end() + 12].lower()
        if any(token in window for token in ("section", "sections", "phần")):
            return True
    return False


def check_integrity(
    original: str,
    suggestion: str,
    semantic_threshold: float = 0.0,
    *,
    strictness: IntegrityStrictness = "standard",
    scope: EditScope | None = None,
) -> list[dict]:
    """Layer-2 guardrail: numeric drift + optional semantic overlap.

  ``standard`` (default): numeric drift yields warnings; user reviews diff before Accept.
  ``strict``: blocks when new metrics appear in selection scope.
    """
    flags: list[dict] = []

    orig_surface = _latex_numeric_surface(original, scope)
    sugg_surface = _latex_numeric_surface(suggestion, scope)
    orig_nums = _normalized_numbers(orig_surface)
    sugg_nums = _normalized_numbers(sugg_surface)
    new_nums = sugg_nums - orig_nums
    new_nums = {n for n in new_nums if not _is_section_outline_number(n, sugg_surface)}
    removed_nums = orig_nums - sugg_nums

    if new_nums:
        severity = _numeric_severity(
            strictness=strictness,
            scope=scope,
            new_count=len(new_nums),
        )
        if severity != "skip":
            flags.append(
                {
                    "code": "numeric_drift",
                    "message": (
                        "Phát hiện số mới trong gợi ý: "
                        f"{', '.join(sorted(new_nums)[:5])}"
                    ),
                    "severity": severity,
                }
            )

    if removed_nums and orig_nums:
        severity: Literal["error", "warning"] = (
            "error" if strictness == "strict" and scope != "document" else "warning"
        )
        flags.append(
            {
                "code": "numeric_removed",
                "message": (
                    "Số trong bản gốc không còn trong gợi ý: "
                    f"{', '.join(sorted(removed_nums)[:5])}"
                ),
                "severity": severity,
            }
        )

    if semantic_threshold > 0:
        ratio = SequenceMatcher(None, original, suggestion).ratio()
        overlap = _word_overlap_ratio(original, suggestion)
        combined = (ratio + overlap) / 2
        if combined < semantic_threshold:
            flags.append(
                {
                    "code": "semantic_drift",
                    "message": (
                        f"Gợi ý có thể đổi nghĩa (độ tương đồng {combined:.2f} < {semantic_threshold})"
                    ),
                    "severity": "warning" if strictness != "strict" else "error",
                }
            )

    length_ratio = len(suggestion) / max(len(original), 1)
    if length_ratio > 2.5:
        flags.append(
            {
                "code": "length_expansion",
                "message": "Gợi ý dài hơn đáng kể so với bản gốc — có thể đã thêm nội dung.",
                "severity": "warning",
            }
        )

    return flags


def has_blocking_flags(flags: list[dict]) -> bool:
    return any(f.get("severity") == "error" for f in flags)
