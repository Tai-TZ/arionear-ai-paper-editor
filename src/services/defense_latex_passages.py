"""Extract LaTeX section passages for defense PDF deep links."""
from __future__ import annotations

import re
import unicodedata

_SECTION_HEADING_RE = re.compile(
    r"\\(chapter|section|subsection|subsubsection)\*?\{([^}]+)\}",
    re.I,
)


def _clean_latex_fragment(raw: str) -> str:
    text = re.sub(r"\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?", " ", raw)
    text = re.sub(r"[{}\\$]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _slugify(title: str) -> str:
    text = unicodedata.normalize("NFD", _clean_latex_fragment(title).lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def _strip_latex_body(raw: str) -> str:
    text = re.sub(r"%.*", " ", raw)
    for env in ("figure", "table", "equation", "align", "lstlisting"):
        text = re.sub(
            rf"\\begin\{{{env}\*?\}}[\s\S]*?\\end\{{{env}\*?\}}",
            " ",
            text,
            flags=re.I,
        )
    text = re.sub(r"\\includegraphics(\[[^\]]*\])?\{[^}]*\}", " ", text, flags=re.I)
    text = re.sub(r"\\cite(?:p|t)?\{[^}]*\}", " ", text, flags=re.I)
    text = re.sub(r"\\ref\{[^}]*\}", " ", text, flags=re.I)
    text = re.sub(r"\\label\{[^}]*\}", " ", text, flags=re.I)
    return text


def _extract_first_excerpt(body: str) -> str:
    text = _clean_latex_fragment(_strip_latex_body(body))
    if not text:
        return ""
    sentence = re.match(r"^[^.!?]{12,}[.!?]", text)
    if sentence and len(sentence.group(0).strip()) >= 20:
        return sentence.group(0).strip()[:180]
    chunk = text[:180].strip()
    last_space = chunk.rfind(" ")
    if last_space > 40:
        return chunk[:last_space]
    return chunk


def extract_latex_passages(latex: str) -> list[dict[str, str | int]]:
    if not latex.strip():
        return []

    headings: list[tuple[int, str, int, int]] = []
    for match in _SECTION_HEADING_RE.finditer(latex):
        kind = match.group(1).lower()
        level = {"chapter": 0, "section": 1, "subsection": 2, "subsubsection": 3}.get(kind, 1)
        title = _clean_latex_fragment(match.group(2))
        headings.append((match.start(), level, title, match.end()))

    passages: list[dict[str, str | int]] = []
    for index, (_start, level, title, body_start) in enumerate(headings):
        body_end = headings[index + 1][0] if index + 1 < len(headings) else len(latex)
        excerpt = _extract_first_excerpt(latex[body_start:body_end])
        if len(title) < 2:
            continue
        passages.append(
            {
                "id": _slugify(title),
                "title": title,
                "excerpt": excerpt,
                "level": level,
            }
        )
    return passages


_SECTION_SYNONYM_GROUPS = (
    ("methods", "methodology", "approach", "phuong phap", "phuong phap"),
    ("experiments", "experimental", "results", "evaluation", "thi nghiem"),
    ("introduction", "intro", "gioi thieu"),
    ("conclusion", "conclusions", "ket luan"),
)


def _normalize_title_hint(value: str) -> str:
    text = unicodedata.normalize("NFD", value.lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[^a-z0-9\s-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _titles_match(left: str, right: str) -> bool:
    a = _normalize_title_hint(left)
    b = _normalize_title_hint(right)
    if not a or not b:
        return False
    if a == b or a in b or b in a:
        return True
    return any(a in group and b in group for group in _SECTION_SYNONYM_GROUPS)


def find_passage_by_title_hint(passages: list[dict[str, str | int]], hint: str) -> dict[str, str | int] | None:
    needle = hint.strip()
    if not needle:
        return None
    for passage in passages:
        if _titles_match(str(passage["title"]), needle):
            return passage
    slug = _slugify(hint)
    for passage in passages:
        pid = str(passage["id"])
        if pid == slug or slug in pid or pid in slug:
            return passage
    return None


def build_passage_pdf_link(label: str, passage: dict[str, str | int]) -> str:
    return f"[{label}](#pdf?passage={passage['id']})"
