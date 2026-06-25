from __future__ import annotations

import re

_RENAME_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"đổi\s+(?:đề\s+tài\s+)?từ\s+(.+?)\s+sang\s+(.+)", re.IGNORECASE),
    re.compile(r"đổi\s+(.+?)\s+sang\s+(.+)", re.IGNORECASE),
    re.compile(r"đổi\s+(.+?)\s+thành\s+(.+)", re.IGNORECASE),
    re.compile(r"thay\s+(.+?)\s+bằng\s+(.+)", re.IGNORECASE),
    re.compile(r"sửa\s+(.+?)\s+thành\s+(.+)", re.IGNORECASE),
    re.compile(r"chỉnh\s+(.+?)\s+thành\s+(.+)", re.IGNORECASE),
    re.compile(r"change\s+(.+?)\s+to\s+(.+)", re.IGNORECASE),
    re.compile(r"replace\s+(.+?)\s+with\s+(.+)", re.IGNORECASE),
)

# Quick Edit on a selection: "đổi thành X" = replace whole selection with X
_SELECTION_REPLACE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"^đổi\s+thành\s+(.+)$", re.IGNORECASE),
    re.compile(r"^thay\s+bằng\s+(.+)$", re.IGNORECASE),
    re.compile(r"^sửa\s+thành\s+(.+)$", re.IGNORECASE),
    re.compile(r"^chỉnh\s+thành\s+(.+)$", re.IGNORECASE),
    re.compile(r"^change\s+to\s+(.+)$", re.IGNORECASE),
    re.compile(r"^replace\s+with\s+(.+)$", re.IGNORECASE),
    re.compile(r"^set\s+to\s+(.+)$", re.IGNORECASE),
)


def _clean_fragment(text: str) -> str:
    cleaned = text.strip().strip("*#.,;:!?\"'""''")
    cleaned = re.sub(r"\s+(?:giúp\s+tôi|please)(?:\s+nhé)?\s*$", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip().strip(".,;:!?")


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


def parse_selection_replace_instruction(query: str) -> str | None:
    """Parse 'change selection to X' when the whole highlight should become X."""
    text = query.strip()
    for pattern in _SELECTION_REPLACE_PATTERNS:
        match = pattern.match(text)
        if not match:
            continue
        replacement = _clean_fragment(match.group(1))
        if replacement:
            return replacement
    return None


def _split_latex_line_suffix(text: str) -> tuple[str, str]:
    match = re.search(r"((?:\\\\)+)\s*$", text)
    if match:
        return text[: match.start()].rstrip(), match.group(1)
    return text.rstrip(), ""


def apply_selection_replace(source: str, replacement: str) -> str:
    """Replace selected span; keep LaTeX command wrappers and trailing \\\\."""
    new_body = _clean_fragment(replacement)
    if not new_body:
        return source

    if new_body.startswith("\\"):
        body, suffix = _split_latex_line_suffix(source)
        if suffix and not re.search(r"(?:\\\\)+\s*$", new_body):
            return new_body + suffix
        return new_body

    cmd_wrap = re.match(
        r"^(\s*\\[a-zA-Z@*]+(?:\[[^\]]*\])?\{)(.*?)(\}\s*)((?:\\\\)*)$",
        source,
        re.DOTALL,
    )
    if cmd_wrap:
        return f"{cmd_wrap.group(1)}{new_body}{cmd_wrap.group(3)}{cmd_wrap.group(4)}"

    body, suffix = _split_latex_line_suffix(source)
    if re.search(r"(?:\\\\)+\s*$", new_body):
        return new_body
    if suffix:
        return new_body + suffix
    return new_body


def try_direct_text_edit(query: str, source: str) -> str | None:
    """Apply simple rename/replace instructions without calling an LLM."""
    parsed = parse_rename_instruction(query)
    if parsed:
        old_text, new_text = parsed
        replaced = _replace_flexible(source, old_text, new_text)
        if replaced is not None:
            return replaced

    whole = parse_selection_replace_instruction(query)
    if whole is not None:
        result = apply_selection_replace(source, whole)
        if result != source:
            return result

    return None
