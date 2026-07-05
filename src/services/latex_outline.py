from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field


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


def _close_brace_index(latex: str, open_brace_index: int) -> int | None:
    depth = 0
    for index in range(open_brace_index, len(latex)):
        char = latex[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index + 1
    return None


def _normalize_section_title(raw: str) -> str:
    text = raw.strip()
    prev = None
    while text != prev:
        prev = text
        text = re.sub(
            r"\\(?:textbf|textit|emph|textsc)\{([^{}]*)\}",
            r"\1",
            text,
            flags=re.IGNORECASE,
        )
    return re.sub(r"\s+", " ", text).strip().lower()


def _section_names_match(query: str, title: str) -> bool:
    q = _normalize_section_title(query)
    t = _normalize_section_title(title)
    if not q or not t:
        return False
    if q == t or q in t or t in q:
        return True
    aliases: dict[str, list[str]] = {
        "abstract": ["abstract", "tóm tắt", "tom tat"],
        "introduction": ["introduction", "mở đầu", "mo dau", "giới thiệu"],
        "methods": ["methods", "methodology", "phương pháp", "phuong phap"],
        "results": ["results", "kết quả", "ket qua"],
        "discussion": ["discussion", "thảo luận", "thao luan"],
        "conclusion": ["conclusion", "kết luận", "ket luan"],
    }
    for key, terms in aliases.items():
        if key in q or key in t:
            if any(term in q for term in terms) or any(term in t for term in terms):
                return True
    return False


def _iter_section_blocks(latex: str):
    """Yield (header_start, body_start, body_end, title_raw) for each \\section."""
    for match in re.finditer(r"\\section\*?", latex, re.IGNORECASE):
        cursor = match.end()
        while cursor < len(latex) and latex[cursor].isspace():
            cursor += 1
        if cursor >= len(latex) or latex[cursor] != "{":
            continue
        header_end = _close_brace_index(latex, cursor)
        if header_end is None:
            continue
        title_raw = latex[cursor + 1 : header_end - 1]
        body_start = header_end
        next_match = re.search(r"\\section\*?", latex[body_start:], re.IGNORECASE)
        body_end = body_start + next_match.start() if next_match else len(latex)
        yield match.start(), body_start, body_end, title_raw


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
    """Return (start, end, content) for a section body — never includes \\section{...}."""
    target = section_name.strip()
    if _normalize_section_title(target) in {"abstract", "tóm tắt", "tom tat"}:
        match = re.search(
            r"\\begin\{abstract\}(.*?)\\end\{abstract\}",
            latex,
            re.DOTALL | re.IGNORECASE,
        )
        if match:
            start = match.start(1)
            end = match.end(1)
            return start, end, latex[start:end]

    for _header_start, body_start, body_end, title_raw in _iter_section_blocks(latex):
        if _section_names_match(target, title_raw):
            return body_start, body_end, latex[body_start:body_end]

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

    for header_start, body_start, body_end, title_raw in _iter_section_blocks(latex):
        content = latex[body_start:body_end].strip()
        outline.sections.append(
            SectionRef(
                name=_normalize_section_title(title_raw) or title_raw.strip(),
                kind="section",
                line=_line_at(latex, header_start),
                start=header_start,
                end=body_end,
                preview=_preview(content),
            )
        )

    return outline


def outline_as_dict(outline: ManuscriptOutline) -> dict:
    return asdict(outline)
