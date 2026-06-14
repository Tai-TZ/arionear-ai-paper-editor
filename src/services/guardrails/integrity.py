from __future__ import annotations

import difflib
import re
from difflib import SequenceMatcher

NUMBER_RE = re.compile(
    r"(?<![a-zA-Z])[-+]?\d+(?:\.\d+)?(?:%|pp|bps)?(?![a-zA-Z])"
)


def extract_numbers(text: str) -> set[str]:
    return set(NUMBER_RE.findall(text))


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


def check_integrity(
    original: str,
    suggestion: str,
    semantic_threshold: float = 0.0,
) -> list[dict]:
    """Layer-2 guardrail: numeric drift + optional semantic overlap."""
    flags: list[dict] = []

    orig_nums = extract_numbers(original)
    sugg_nums = extract_numbers(suggestion)
    new_nums = sugg_nums - orig_nums
    if new_nums:
        flags.append(
            {
                "code": "numeric_drift",
                "message": f"New numbers appeared in suggestion: {', '.join(sorted(new_nums)[:5])}",
                "severity": "error",
            }
        )

    removed_nums = orig_nums - sugg_nums
    if removed_nums and orig_nums:
        flags.append(
            {
                "code": "numeric_removed",
                "message": f"Numbers removed from original: {', '.join(sorted(removed_nums)[:5])}",
                "severity": "warning",
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
                    "message": f"Suggestion may change meaning (similarity {combined:.2f} < {semantic_threshold})",
                    "severity": "warning",
                }
            )

    length_ratio = len(suggestion) / max(len(original), 1)
    if length_ratio > 2.5:
        flags.append(
            {
                "code": "length_expansion",
                "message": "Suggestion is significantly longer than original — possible content addition.",
                "severity": "warning",
            }
        )

    return flags


def has_blocking_flags(flags: list[dict]) -> bool:
    return any(f.get("severity") == "error" for f in flags)
