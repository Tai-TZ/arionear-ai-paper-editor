"""Tolerant JSON extraction + strict pydantic validation for LLM stage outputs."""

from __future__ import annotations

from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from src.services.llm_json import extract_llm_json

ModelT = TypeVar("ModelT", bound=BaseModel)


def extract_json_value(text: str) -> Any | None:
    """Return the first JSON object/array found in an LLM reply (fences/think tags tolerated, damage repaired)."""
    return extract_llm_json(text)


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
