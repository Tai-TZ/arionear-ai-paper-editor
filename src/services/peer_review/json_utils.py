"""Tolerant JSON extraction + strict pydantic validation for LLM stage outputs."""

from __future__ import annotations

import json
import re
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from src.services.logic_audit.debate import _strip_thinking_markup

ModelT = TypeVar("ModelT", bound=BaseModel)

_FENCE_OPEN_RE = re.compile(r"^```(?:json)?\s*", re.IGNORECASE)
_FENCE_CLOSE_RE = re.compile(r"\s*```\s*$")


def extract_json_value(text: str) -> Any | None:
    """Return the first JSON object/array found in an LLM reply (fences/think tags tolerated)."""
    cleaned = _strip_thinking_markup(text or "").strip()
    if not cleaned:
        return None
    if cleaned.startswith("```"):
        cleaned = _FENCE_CLOSE_RE.sub("", _FENCE_OPEN_RE.sub("", cleaned))
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    for pattern in (r"\{[\s\S]*\}", r"\[[\s\S]*\]"):
        match = re.search(pattern, cleaned)
        if not match:
            continue
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            continue
    return None


def _format_validation_error(exc: ValidationError, limit: int = 6) -> str:
    parts: list[str] = []
    for err in exc.errors()[:limit]:
        loc = ".".join(str(p) for p in err.get("loc", ()))
        parts.append(f"{loc or 'root'}: {err.get('msg', 'invalid')}")
    return "; ".join(parts)


def parse_payload(text: str, model: type[ModelT], *, list_key: str) -> tuple[ModelT | None, str]:
    """Validate an LLM reply against `model`. Returns (payload, error message for the repair prompt)."""
    data = extract_json_value(text)
    if data is None:
        return None, "the reply was not valid JSON"
    if isinstance(data, list):
        data = {list_key: data}
    if not isinstance(data, dict):
        return None, "the reply must be a JSON object"
    try:
        return model.model_validate(data), ""
    except ValidationError as exc:
        return None, f"the JSON did not match the required shape ({_format_validation_error(exc)})"
