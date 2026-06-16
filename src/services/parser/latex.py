from __future__ import annotations

import re

SECTION_RE = re.compile(r"\\section\*?\{([^}]*)\}", re.MULTILINE)
SUBSECTION_RE = re.compile(r"\\subsection\*?\{([^}]*)\}", re.MULTILINE)
CITE_RE = re.compile(r"\\cite[a-zA-Z*]*\{([^}]+)\}")
BIB_ENTRY_RE = re.compile(r"@(\w+)\s*\{\s*([^,\s]+)\s*,([^@]*)", re.DOTALL)
FIELD_RE = re.compile(r"(\w+)\s*=\s*\{([^}]*)\}|(\w+)\s*=\s*\"([^\"]*)\"", re.DOTALL)

STANDARD_SECTIONS = [
    "abstract",
    "introduction",
    "related work",
    "methods",
    "methodology",
    "materials and methods",
    "experiments",
    "results",
    "discussion",
    "conclusion",
]


def find_section_for_query(query: str, sections: list[dict]) -> dict | None:
    """Match a manuscript section mentioned in the user query."""
    if not query or not sections:
        return None

    q = query.lower()
    aliases: dict[str, list[str]] = {
        "abstract": ["abstract", "tóm tắt", "tom tat", "phần abstract", "phan abstract"],
        "introduction": ["introduction", "mở đầu", "mo dau", "phần introduction"],
        "methods": ["methods", "methodology", "phương pháp", "phuong phap", "materials and methods"],
        "results": ["results", "kết quả", "ket qua"],
        "discussion": ["discussion", "thảo luận", "thao luan"],
        "conclusion": ["conclusion", "kết luận", "ket luan"],
    }

    for section in sections:
        name = (section.get("name") or "").strip()
        if not name:
            continue
        lower_name = name.lower()
        if lower_name in q:
            return section
        for key, terms in aliases.items():
            if lower_name == key or key in lower_name:
                if any(term in q for term in terms):
                    return section
    return None


def parse_latex_sections(latex: str) -> list[dict]:
    sections: list[dict] = []
    abstract_match = re.search(
        r"\\begin\{abstract\}(.*?)\\end\{abstract\}", latex, re.DOTALL | re.IGNORECASE
    )
    if abstract_match:
        sections.append(
            {
                "name": "Abstract",
                "content": abstract_match.group(1).strip(),
                "kind": "abstract",
            }
        )

    for match in SECTION_RE.finditer(latex):
        name = match.group(1).strip()
        start = match.end()
        next_section = SECTION_RE.search(latex, start)
        end = next_section.start() if next_section else len(latex)
        sections.append(
            {
                "name": name,
                "content": latex[start:end].strip(),
                "kind": "section",
            }
        )
    return sections


def extract_cite_keys(latex: str) -> list[str]:
    keys: list[str] = []
    seen: set[str] = set()
    for match in CITE_RE.finditer(latex):
        for key in match.group(1).split(","):
            k = key.strip()
            if k and k not in seen:
                seen.add(k)
                keys.append(k)
    return keys


def extract_bib_content(latex: str, bib_content: str = "") -> str:
    if bib_content.strip():
        return bib_content
    inline = re.search(r"\\begin\{thebibliography\}(.*?)\\end\{thebibliography\}", latex, re.DOTALL)
    if inline:
        return inline.group(1)
    return ""


def _parse_bib_fields(body: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for match in FIELD_RE.finditer(body):
        if match.group(1):
            fields[match.group(1).lower()] = match.group(2).strip()
        elif match.group(3):
            fields[match.group(3).lower()] = match.group(4).strip()
    return fields


def parse_bib_entries(bib: str) -> dict[str, dict]:
    entries: dict[str, dict] = {}
    if not bib.strip():
        return entries
    for match in BIB_ENTRY_RE.finditer(bib):
        entry_type = match.group(1).lower()
        key = match.group(2).strip()
        body = match.group(3)
        fields = _parse_bib_fields(body)
        entries[key] = {
            "key": key,
            "type": entry_type,
            "title": fields.get("title", ""),
            "author": fields.get("author", ""),
            "year": fields.get("year", ""),
            "doi": fields.get("doi", ""),
            "eprint": fields.get("eprint", ""),
            "journal": fields.get("journal", ""),
            "raw": body.strip(),
        }
    return entries


def analyze_structure(sections: list[dict]) -> list[dict]:
    """Rule-based structure suggestions (no LLM)."""
    suggestions: list[dict] = []
    names = {s["name"].lower() for s in sections}
    name_list = [s["name"].lower() for s in sections]

    for expected in STANDARD_SECTIONS:
        if expected not in names and not any(expected in n for n in names):
            if expected in ("abstract", "introduction", "conclusion"):
                suggestions.append(
                    {
                        "type": "missing",
                        "section": expected.title(),
                        "message": f"Consider adding a {expected.title()} section.",
                        "severity": "warning",
                    }
                )

    for idx, section in enumerate(sections):
        content_len = len(section.get("content", ""))
        if content_len < 80 and section.get("kind") == "section":
            suggestions.append(
                {
                    "type": "length",
                    "section": section["name"],
                    "message": f"Section '{section['name']}' is very short ({content_len} chars).",
                    "severity": "info",
                }
            )
        lower = section["name"].lower()
        if "method" in lower and idx > 0 and "result" in name_list[max(0, idx - 1)]:
            suggestions.append(
                {
                    "type": "misplaced",
                    "section": section["name"],
                    "message": "Methods typically precede Results.",
                    "severity": "warning",
                }
            )
    return suggestions
