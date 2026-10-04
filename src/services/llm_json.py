"""Find the JSON value in an LLM reply: think markup, code fences, surrounding prose, minor syntax damage.

Order: strict ``json.loads`` of the whole reply → the first top-level JSON value found in it → only then
``json_repair`` (trailing commas, truncated output, single quotes, …) on a region that looks like JSON.
``json_repair`` turns almost any text into *something*, so it never sees prose without a JSON-looking
``{`` / ``[`` and an empty repair result counts as nothing. Callers keep their own schema / key checks.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from typing import Any

import json_repair

from src.services.logic_audit.debate import _strip_thinking_markup

# `_strip_thinking_markup` does not cover <thinking>…</thinking>.
_THINKING_RE = re.compile(r"<thinking>[\s\S]*?</thinking>", re.IGNORECASE)
# A Markdown fence line (``` or ```json …). JSON strings cannot hold a raw newline, so such a line is never data.
_FENCE_LINE_RE = re.compile(r"^[ \t]*```[\w+-]*[ \t]*$", re.MULTILINE)
# A region worth repairing starts like JSON: `{"`, `{'`, `{}`, `{key:` or `["`, `[{`, `[[`, `[]`, `[1`, `[-`.
_JSONISH_START_RE = re.compile(r"""\{\s*(?:["'}]|[A-Za-z_]\w*\s*:)|\[\s*[-"'{\[\]\d]""")


def _strip_markup(text: str) -> str:
    return _THINKING_RE.sub("", _strip_thinking_markup(text)).strip()


def _matches(value: Any, expect: type | None) -> bool:
    return isinstance(value, expect) if expect is not None else True


def _region_end(text: str, start: int) -> int | None:
    """Index just past the bracket closing the one at ``start`` (string-aware); ``None`` if never closed."""
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
        elif char == '"':
            in_string = True
        elif char in "{[":
            depth += 1
        elif char in "}]":
            depth -= 1
            if depth == 0:
                return index + 1
    return None


def _top_level_regions(text: str, openers: str) -> Iterator[tuple[int, int]]:
    """``(start, end)`` of each top-level bracketed region starting with one of ``openers``, left to right."""
    pos = 0
    while True:
        starts = [index for index in (text.find(opener, pos) for opener in openers) if index >= 0]
        if not starts:
            return
        start = min(starts)
        end = _region_end(text, start)
        if end is None:  # unterminated (truncated reply): the rest of the text belongs to it
            yield start, len(text)
            return
        yield start, end
        pos = end


def _preferred(values: list[Any]) -> Any | None:
    """An object beats an array (an array before it is usually a bracketed aside such as ``[1]``)."""
    for value in values:
        if isinstance(value, dict):
            return value
    return values[0] if values else None


def _repair(fragment: str) -> Any | None:
    try:
        value = json_repair.loads(fragment)
    except Exception:
        return None
    # "", {} and [] are what json_repair makes of garbage.
    return value if isinstance(value, (dict, list)) and value else None


def extract_llm_json(text: str | None, expect: type[dict] | type[list] | None = None) -> Any | None:
    """The JSON value in an LLM reply, or ``None``. ``expect`` (``dict`` / ``list``) also filters the type.

    A reply that is valid JSON as a whole is returned as-is (``None`` if it has the wrong type). Otherwise the
    first top-level JSON object (or, failing that, array) in the reply wins; when none parses strictly, the
    first JSON-looking region is repaired with ``json_repair``.
    """
    cleaned = _strip_markup(text or "")
    if not cleaned:
        return None
    try:
        value = json.loads(cleaned)
    except ValueError:
        pass
    else:
        return value if _matches(value, expect) else None

    body = _FENCE_LINE_RE.sub("", cleaned)
    openers = "{" if expect is dict else "[" if expect is list else "{["
    regions = list(_top_level_regions(body, openers))

    parsed: list[Any] = []
    for start, end in regions:
        try:
            parsed.append(json.loads(body[start:end]))
        except ValueError:
            continue
    value = _preferred([item for item in parsed if _matches(item, expect)])
    if value is not None:
        return value

    jsonish = [(start, end) for start, end in regions if _JSONISH_START_RE.match(body, start)]
    jsonish.sort(key=lambda region: body[region[0]] != "{")  # objects first, order kept otherwise
    for start, end in jsonish:
        repaired = _repair(body[start:end])
        if repaired is not None and _matches(repaired, expect):
            return repaired
    return None
