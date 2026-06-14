from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
DEFAULT_PROMPTS_FILE = PROMPTS_DIR / "prompts.default.yaml"


@lru_cache
def load_prompts() -> dict:
    if not DEFAULT_PROMPTS_FILE.exists():
        return {}
    with DEFAULT_PROMPTS_FILE.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def get_prompt(key: str, field: str = "system") -> str:
    prompts = load_prompts()
    section = prompts.get(key, {})
    if isinstance(section, dict):
        return section.get(field, "")
    return str(section) if section else ""
