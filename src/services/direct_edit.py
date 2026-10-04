from __future__ import annotations

import re

from src.services.latex_outline import find_latex_command_block as _find_latex_command_block

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
    cleaned = text.strip().strip("*#.,;:!?\"'''")
    cleaned = re.sub(r"\s+(?:giúp\s+tôi|please)(?:\s+nhé)?\s*$", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip().strip(".,;:!?")


def _normalize_model_token(text: str) -> str:
    normalized = re.sub(r"efficiet\s*net", "EfficientNet", text, flags=re.IGNORECASE)
    normalized = re.sub(
        r"efficientnet\s*v?\s*(\d+)",
        lambda m: f"EfficientNetV{m.group(1)}",
        normalized,
        flags=re.IGNORECASE,
    )
    return normalized


_TITLE_SET_RE = re.compile(
    r"(?:sửa|đổi|chỉnh|thay)(?:\s+\w+){0,6}\s+(?:tiêu đề|title)(?:\s+\w+){0,4}\s+thành\s+(.+)",
    re.IGNORECASE,
)
_TITLE_QUERY_RE = re.compile(
    r"tiêu đề|title|đề\s*tài|tên\s*(?:đề\s*)?tài",
    re.IGNORECASE,
)


def find_latex_command_block(latex: str, command: str) -> tuple[str, str, int, int] | None:
    return _find_latex_command_block(latex, command)


def parse_title_set_instruction(query: str) -> str | None:
    match = _TITLE_SET_RE.search(query.strip())
    if not match:
        # "đổi tên đề tài để sử dụng model X"
        alt = re.search(
            r"(?:đổi|sửa|chỉnh)\s+(?:tên\s+)?(?:đề\s*tài|tiêu đề|title)"
            r"(?:.+?)(?:model\s+)?(EfficientNetV?\d+)",
            query,
            re.IGNORECASE,
        )
        if alt:
            return _normalize_model_token(alt.group(1))
        return None
    value = _normalize_model_token(_clean_fragment(match.group(1)))
    return value or None


def resolve_title_body(current: str, instruction: str) -> str:
    """Map a title-edit instruction to the next \\title{...} body."""
    instruction = _normalize_model_token(_clean_fragment(instruction))
    if not instruction:
        return current

    model_match = re.search(r"(EfficientNetV?\d+)", instruction, re.IGNORECASE)
    if model_match:
        model = _normalize_model_token(model_match.group(1))
        updated = re.sub(r"EfficientNet\s*V?\d+", model, current, count=1, flags=re.IGNORECASE)
        if updated != current:
            return updated

    if len(instruction) > 60 or not re.search(r"model|efficientnet|v\d", instruction, re.IGNORECASE):
        return instruction

    updated = re.sub(r"EfficientNetV2", "EfficientNetV3", current, flags=re.IGNORECASE)
    updated = re.sub(r"EfficientNet\s*V2", "EfficientNetV3", updated, flags=re.IGNORECASE)
    if updated == current:
        updated = re.sub(r"\bV2\b", "V3", current)
    return updated


def try_metadata_scoped_edit(query: str, latex: str) -> tuple[str, str, str] | None:
    """Return (original_snippet, replacement_snippet, full_latex) for metadata edits."""
    if not _TITLE_QUERY_RE.search(query):
        return None

    title_instruction = parse_title_set_instruction(query)
    title_block = find_latex_command_block(latex, "title")
    if not title_instruction or not title_block:
        return None

    original_cmd, current_body, start, end = title_block
    new_body = resolve_title_body(current_body, title_instruction)
    if new_body == current_body:
        return None

    replacement_cmd = f"\\title{{{new_body}}}"
    full_next = latex[:start] + replacement_cmd + latex[end:]
    return original_cmd, replacement_cmd, full_next


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
    if _TITLE_QUERY_RE.search(text) and parse_title_set_instruction(text):
        if not re.search(r"từ\s+.+\s+sang", text, re.IGNORECASE):
            return None
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
    scoped = try_metadata_scoped_edit(query, source)
    if scoped:
        _, _, full_next = scoped
        return full_next

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
