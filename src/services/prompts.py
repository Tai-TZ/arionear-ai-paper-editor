from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
DEFAULT_PROMPTS_FILE = PROMPTS_DIR / "prompts.default.yaml"

_DEFAULT_BLOCKS = ("integrity_guard", "editor_role", "human_gate")
_ROUTER_BLOCKS: tuple[str, ...] = ()


@lru_cache
def load_prompts() -> dict:
    if not DEFAULT_PROMPTS_FILE.exists():
        return {}
    with DEFAULT_PROMPTS_FILE.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _stage_dict(key: str) -> dict[str, Any]:
    prompts = load_prompts()
    stages = prompts.get("stages", {})
    if isinstance(stages, dict):
        section = stages.get(key, {})
        if isinstance(section, dict):
            return section
    section = prompts.get(key, {})
    return section if isinstance(section, dict) else {}


def get_block(name: str) -> str:
    blocks = load_prompts().get("blocks", {})
    if not isinstance(blocks, dict):
        return ""
    value = blocks.get(name, "")
    return str(value) if value else ""


def get_prompt(key: str, field: str = "system") -> str:
    section = _stage_dict(key)
    if field in section:
        return str(section[field])
    if field == "system":
        paper = load_prompts().get("paper_ide", {})
        if key == "paper_ide" and isinstance(paper, dict):
            return str(paper.get("system", ""))
    return ""


def get_stage_meta(key: str) -> dict[str, Any]:
    """Return stage metadata (max_tokens, json_mode, etc.) excluding prompt fields."""
    section = _stage_dict(key)
    return {
        k: v
        for k, v in section.items()
        if k not in {"system", "user"}
    }


def render_template(template: str, **variables: Any) -> str:
    """Safe-ish format for {var} placeholders; unknown keys left as-is."""
    if not template:
        return ""

    def replacer(match: re.Match[str]) -> str:
        name = match.group(1)
        if name in variables and variables[name] is not None:
            return str(variables[name])
        return match.group(0)

    return re.sub(r"\{(\w+)\}", replacer, template)


def render_user_prompt(stage: str, **variables: Any) -> str:
    template = get_prompt(stage, "user")
    if not template.strip():
        return ""
    return render_template(template, **variables).strip()


def build_system_prompt(
    task: str,
    *,
    extra: str = "",
    include_blocks: tuple[str, ...] | None = None,
    block_vars: dict[str, Any] | None = None,
) -> str:
    """Compose Paper IDE identity + shared blocks + task-specific system prompt."""
    parts: list[str] = []
    core = get_prompt("paper_ide", "system")
    if not core.strip():
        paper = load_prompts().get("paper_ide", {})
        if isinstance(paper, dict):
            core = str(paper.get("system", ""))
    if core.strip():
        parts.append(core.strip())

    blocks = include_blocks if include_blocks is not None else _DEFAULT_BLOCKS
    vars_ = block_vars or {}
    for block_name in blocks:
        block = render_template(get_block(block_name), **vars_)
        if block.strip():
            parts.append(block.strip())

    task_prompt = get_prompt(task, "system")
    if task_prompt.strip():
        parts.append(task_prompt.strip())

    if extra.strip():
        parts.append(extra.strip())

    return "\n\n".join(parts)


def build_router_system_prompt() -> str:
    return build_system_prompt("router", include_blocks=_ROUTER_BLOCKS)


def format_sections_summary(sections: list[dict]) -> str:
    if not sections:
        return "(no sections parsed)"
    lines: list[str] = []
    for section in sections[:16]:
        name = section.get("name", "?")
        length = len(section.get("content", "") or "")
        lines.append(f"- {name}: ~{length} chars")
    return "\n".join(lines)


def clear_prompt_cache() -> None:
    load_prompts.cache_clear()
