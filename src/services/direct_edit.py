from __future__ import annotations

import re

_RENAME_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"đổi\s+(.+?)\s+thành\s+(.+)", re.IGNORECASE),
    re.compile(r"thay\s+(.+?)\s+bằng\s+(.+)", re.IGNORECASE),
    re.compile(r"sửa\s+(.+?)\s+thành\s+(.+)", re.IGNORECASE),
    re.compile(r"chỉnh\s+(.+?)\s+thành\s+(.+)", re.IGNORECASE),
    re.compile(r"change\s+(.+?)\s+to\s+(.+)", re.IGNORECASE),
    re.compile(r"replace\s+(.+?)\s+with\s+(.+)", re.IGNORECASE),
)


def _clean_fragment(text: str) -> str:
    return text.strip().strip("*#.,;:!?\"'""''")


def _word_permutations(words: list[str]) -> list[str]:
    if len(words) <= 1:
        return [" ".join(words)] if words else []
    if len(words) == 2:
        return [f"{words[0]} {words[1]}", f"{words[1]} {words[0]}"]
    if len(words) == 3:
        a, b, c = words
        return [
            f"{a} {b} {c}",
            f"{b} {c} {a}",
            f"{c} {a} {b}",
            f"{a} {c} {b}",
            f"{b} {a} {c}",
            f"{c} {b} {a}",
        ]
    return [" ".join(words)]


def _replace_flexible(haystack: str, needle: str, replacement: str) -> str | None:
    if not needle or not replacement:
        return None

    if needle in haystack:
        return haystack.replace(needle, replacement, 1)

    lower_hay = haystack.lower()
    lower_needle = needle.lower()
    if lower_needle in lower_hay:
        idx = lower_hay.index(lower_needle)
        return haystack[:idx] + replacement + haystack[idx + len(needle) :]

    words = [w for w in re.split(r"\s+", needle) if w]
    if len(words) < 2:
        return None

    for phrase in _word_permutations(words):
        pattern = r"\b" + r"\s+".join(re.escape(part) for part in phrase.split()) + r"\b"
        match = re.search(pattern, haystack, re.IGNORECASE)
        if match:
            return haystack[: match.start()] + replacement + haystack[match.end() :]

    return None


def parse_rename_instruction(query: str) -> tuple[str, str] | None:
    text = query.strip()
    for pattern in _RENAME_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        old_text = _clean_fragment(match.group(1))
        new_text = _clean_fragment(match.group(2))
        if old_text and new_text:
            return old_text, new_text
    return None


def try_direct_text_edit(query: str, source: str) -> str | None:
    """Apply simple rename/replace instructions without calling an LLM."""
    parsed = parse_rename_instruction(query)
    if not parsed:
        return None
    old_text, new_text = parsed
    return _replace_flexible(source, old_text, new_text)
