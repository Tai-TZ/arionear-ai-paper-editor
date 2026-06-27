from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field

from src.services.parser.latex import parse_latex_sections


@dataclass(frozen=True)
class LatexCommandRef:
    name: str
    line: int
    start: int
    end: int
    preview: str
    full_text: str


@dataclass(frozen=True)
class SectionRef:
    name: str
    kind: str
    line: int
    start: int
    end: int
    preview: str


@dataclass
class ManuscriptOutline:
    commands: list[LatexCommandRef] = field(default_factory=list)
    sections: list[SectionRef] = field(default_factory=list)

    def get_command(self, name: str) -> LatexCommandRef | None:
        key = name.lower()
        for cmd in self.commands:
            if cmd.name.lower() == key:
                return cmd
        return None

    def to_planner_json(self) -> str:
        payload = {
            "commands": [
                {
                    "name": cmd.name,
                    "line": cmd.line,
                    "preview": cmd.preview,
                }
                for cmd in self.commands
            ],
            "sections": [
                {
                    "name": sec.name,
                    "kind": sec.kind,
                    "line": sec.line,
                    "preview": sec.preview,
                }
                for sec in self.sections
            ],
        }
        return json.dumps(payload, ensure_ascii=False, indent=2)


def _line_at(latex: str, offset: int) -> int:
    return latex[: max(0, offset)].count("\n") + 1


def _preview(text: str, limit: int = 120) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1] + "…"


def find_latex_command_block(latex: str, command: str) -> tuple[str, str, int, int] | None:
    """Return (full_command, inner_text, start, end) for \\command[...]{...}."""
    pattern = re.compile(
        r"\\" + re.escape(command) + r"(?:\s*\[[^\]]*\])?\s*\{",
        re.IGNORECASE,
    )
    match = pattern.search(latex)
    if not match:
        return None

    brace_start = match.end() - 1
    depth = 0
    for index in range(brace_start, len(latex)):
        char = latex[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                full = latex[match.start() : index + 1]
                inner = latex[match.end() : index]
                return full, inner, match.start(), index + 1
    return None


def find_section_span(latex: str, section_name: str) -> tuple[int, int, str] | None:
    """Return (start, end, content) for a section or abstract by name."""
    target = section_name.strip().lower()
    if target in {"abstract", "tóm tắt", "tom tat"}:
        match = re.search(
            r"\\begin\{abstract\}(.*?)\\end\{abstract\}",
            latex,
            re.DOTALL | re.IGNORECASE,
        )
        if match:
            start = match.start(1)
            end = match.end(1)
            return start, end, latex[start:end]

    pattern = re.compile(
        r"\\section\*?\{(" + re.escape(section_name) + r")\}(.*?)(?=\\section\*?\{|$)",
        re.DOTALL | re.IGNORECASE,
    )
    match = pattern.search(latex)
    if match:
        start = match.start(2)
        end = match.end(2)
        return start, end, latex[start:end]

    for section in parse_latex_sections(latex):
        name = str(section.get("name") or "")
        if name.lower() == target or target in name.lower():
            content = str(section.get("content") or "")
            if content and content in latex:
                idx = latex.index(content)
                return idx, idx + len(content), content
    return None


def build_manuscript_outline(latex: str) -> ManuscriptOutline:
    outline = ManuscriptOutline()
    if not latex.strip():
        return outline

    for command in ("title", "author", "date", "thanks"):
        block = find_latex_command_block(latex, command)
        if not block:
            continue
        full, inner, start, end = block
        outline.commands.append(
            LatexCommandRef(
                name=command,
                line=_line_at(latex, start),
                start=start,
                end=end,
                preview=_preview(inner or full),
                full_text=full,
            )
        )

    abstract_match = re.search(
        r"\\begin\{abstract\}(.*?)\\end\{abstract\}",
        latex,
        re.DOTALL | re.IGNORECASE,
    )
    if abstract_match:
        start = abstract_match.start()
        end = abstract_match.end()
        body = abstract_match.group(1).strip()
        outline.sections.append(
            SectionRef(
                name="Abstract",
                kind="abstract",
                line=_line_at(latex, start),
                start=start,
                end=end,
                preview=_preview(body),
            )
        )

    for match in re.finditer(r"\\section\*?\{([^}]*)\}", latex):
        name = match.group(1).strip()
        content_start = match.end()
        next_section = re.search(r"\\section\*?\{", latex[content_start:])
        content_end = content_start + next_section.start() if next_section else len(latex)
        content = latex[content_start:content_end].strip()
        outline.sections.append(
            SectionRef(
                name=name,
                kind="section",
                line=_line_at(latex, match.start()),
                start=match.start(),
                end=content_end,
                preview=_preview(content),
            )
        )

    return outline


def outline_as_dict(outline: ManuscriptOutline) -> dict:
    return asdict(outline)
