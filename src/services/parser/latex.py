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
        "conclusion": ["conclusion", "conclustion", "kết luận", "ket luan"],
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
        body = latex[start:end].strip()
        subsections = [
            sub.group(1).strip()
            for sub in SUBSECTION_RE.finditer(body)
            if sub.group(1).strip()
        ]
        sections.append(
            {
                "name": name,
                "content": body,
                "kind": "section",
                "subsections": subsections,
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

# IMRaD groups — any alias match counts as present.
_IMRAD_GROUPS: list[tuple[str, tuple[str, ...]]] = [
    ("Abstract", ("abstract", "tóm tắt", "tom tat")),
    ("Introduction", ("introduction", "intro", "giới thiệu", "gioi thieu", "mở đầu", "mo dau")),
    (
        "Methods",
        (
            "method",
            "methodology",
            "materials and methods",
            "materials",
            "experiment",
            "approach",
            "phương pháp",
            "phuong phap",
            "experimental setup",
        ),
    ),
    ("Results", ("result", "kết quả", "ket qua", "findings")),
    ("Discussion", ("discussion", "thảo luận", "thao luan")),
    ("Conclusion", ("conclusion", "kết luận", "ket luan")),
]

_IMRAD_ORDER = ("Introduction", "Methods", "Results", "Discussion", "Conclusion")


def _section_name_matches(name: str, patterns: tuple[str, ...]) -> bool:
    lower = name.lower()
    return any(pattern in lower for pattern in patterns)


def _find_group_index(section_names: list[str], patterns: tuple[str, ...]) -> int | None:
    for idx, name in enumerate(section_names):
        if _section_name_matches(name, patterns):
            return idx
    return None


def _group_patterns(label: str) -> tuple[str, ...]:
    for group_label, patterns in _IMRAD_GROUPS:
        if group_label == label:
            return patterns
    return ()


def analyze_structure(sections: list[dict]) -> list[dict]:
    """Rule-based structure suggestions (no LLM)."""
    suggestions: list[dict] = []
    all_names = [str(s.get("name", "")).strip() for s in sections if str(s.get("name", "")).strip()]
    heading_names = [
        str(s.get("name", "")).strip()
        for s in sections
        if s.get("kind") == "section" and str(s.get("name", "")).strip()
    ]
    name_list = [n.lower() for n in all_names]

    group_present: dict[str, bool] = {}
    group_index: dict[str, int | None] = {}
    for label, patterns in _IMRAD_GROUPS:
        present = any(_section_name_matches(n, patterns) for n in all_names)
        group_present[label] = present
        group_index[label] = _find_group_index(heading_names, patterns)

    for label, patterns in _IMRAD_GROUPS:
        if group_present[label]:
            continue
        if label == "Abstract":
            msg = "Thiếu Abstract — nên có \\begin{abstract} hoặc section tóm tắt."
        elif label == "Methods":
            msg = (
                "Thiếu phần Methods/Phương pháp — bài IMRaD cần mô tả phương pháp "
                "trước Results."
            )
        else:
            msg = f"Thiếu phần {label} — khung IMRaD thường cần section này."
        suggestions.append(
            {
                "type": "missing",
                "section": label,
                "message": msg,
                "severity": "warning",
            }
        )

    # IMRaD order on \\section headings (skip abstract block).
    ordered: list[tuple[str, int]] = []
    for label in _IMRAD_ORDER:
        idx = group_index.get(label)
        if idx is not None:
            ordered.append((label, idx))
    for i in range(1, len(ordered)):
        prev_label, prev_idx = ordered[i - 1]
        curr_label, curr_idx = ordered[i]
        if curr_idx < prev_idx:
            suggestions.append(
                {
                    "type": "misplaced",
                    "section": curr_label,
                    "message": (
                        f"Thứ tự IMRaD: {prev_label} nên đứng trước {curr_label}."
                    ),
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
                    "message": f"Section '{section['name']}' rất ngắn ({content_len} ký tự).",
                    "severity": "info",
                }
            )
        lower = section["name"].lower()
        if (
            section.get("kind") == "section"
            and any(p in lower for p in _group_patterns("Methods"))
            and idx > 0
            and any(
                p in name_list[max(0, idx - 1)]
                for p in _group_patterns("Results")
            )
        ):
            suggestions.append(
                {
                    "type": "misplaced",
                    "section": section["name"],
                    "message": "Methods thường đứng trước Results trong khung IMRaD.",
                    "severity": "warning",
                }
            )

    return suggestions
