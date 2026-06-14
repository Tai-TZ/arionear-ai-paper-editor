from __future__ import annotations

import re

from src.services.guardrails.integrity import build_diff

IMRAD_BODY_SECTIONS: list[tuple[str, str]] = [
    (
        "abstract",
        "\\begin{abstract}\n% TODO: Tóm tắt ngắn gọn mục tiêu, phương pháp và kết quả chính\n\\end{abstract}\n",
    ),
    (
        "Introduction",
        "\\section{Introduction}\n% TODO: Bối cảnh, mục tiêu và đóng góp của nghiên cứu\n\n",
    ),
    (
        "Methods",
        "\\section{Methods}\n% TODO: Mô tả phương pháp, dữ liệu và quy trình thực nghiệm\n\n",
    ),
    (
        "Results",
        "\\section{Results}\n% TODO: Trình bày kết quả chính (giữ nguyên số liệu thực tế)\n\n",
    ),
    (
        "Discussion",
        "\\section{Discussion}\n% TODO: Giải thích kết quả và so sánh với nghiên cứu liên quan\n\n",
    ),
    (
        "Conclusion",
        "\\section{Conclusion}\n% TODO: Tóm tắt điểm chính và hướng phát triển\n\n",
    ),
]

_SECTION_ALIASES: dict[str, str] = {
    "methodology": "Methods",
    "materials and methods": "Methods",
    "materials & methods": "Methods",
    "experiments": "Results",
    "related work": "Introduction",
}


def _normalize_section_name(name: str) -> str:
    lower = name.strip().lower()
    return _SECTION_ALIASES.get(lower, name.strip())


def _extract_preamble_and_body(latex: str) -> tuple[str, str]:
    doc_start = latex.find("\\begin{document}")
    if doc_start == -1:
        return latex, ""
    preamble = latex[: doc_start + len("\\begin{document}")]
    doc_end = latex.rfind("\\end{document}")
    if doc_end == -1:
        return preamble + "\n", latex[doc_start + len("\\begin{document}") :]
    body = latex[doc_start + len("\\begin{document}") : doc_end]
    suffix = latex[doc_end:]
    return preamble + "\n", body + suffix


def _parse_existing_sections(body: str) -> dict[str, str]:
    sections: dict[str, str] = {}

    abstract_match = re.search(
        r"(\\begin\{abstract\}.*?\\end\{abstract\})",
        body,
        re.DOTALL | re.IGNORECASE,
    )
    if abstract_match:
        sections["abstract"] = abstract_match.group(1).strip() + "\n"

    for match in re.finditer(
        r"\\section\*?\{([^}]+)\}(.*?)(?=\\section\*?\{|\\begin\{abstract\}|\\end\{document\}|$)",
        body,
        re.DOTALL,
    ):
        name = _normalize_section_name(match.group(1))
        content = match.group(0).strip() + "\n"
        if name not in sections:
            sections[name] = content

    return sections


def _ensure_preamble(latex: str) -> str:
    if "\\documentclass" in latex:
        return latex
    return (
        "\\documentclass[11pt]{article}\n"
        "\\usepackage[margin=1in]{geometry}\n"
        "\\usepackage{amsmath,amssymb}\n"
        "\\usepackage{graphicx}\n\n"
        "\\title{Untitled}\n"
        "\\author{Author Name}\n"
        "\\date{\\today}\n\n"
        "\\begin{document}\n\n"
        "\\maketitle\n\n"
        "\\end{document}"
    )


def build_imrad_template(existing_latex: str) -> str:
    """Build IMRAD skeleton, preserving existing section content when present."""
    latex = _ensure_preamble(existing_latex)
    preamble, rest = _extract_preamble_and_body(latex)

    if "\\end{document}" in rest:
        body, suffix = rest.rsplit("\\end{document}", 1)
        suffix = "\\end{document}" + suffix
    else:
        body, suffix = rest, "\n\\end{document}\n"

    existing = _parse_existing_sections(body)

    maketitle = ""
    if "\\maketitle" in body:
        maketitle = "\\maketitle\n\n"

    parts: list[str] = [preamble, "\n"]
    if maketitle:
        parts.append(maketitle)

    for key, default_block in IMRAD_BODY_SECTIONS:
        if key in existing:
            parts.append(existing[key])
            if not parts[-1].endswith("\n\n"):
                parts.append("\n")
        else:
            parts.append(default_block)

    parts.append("\n% Bibliography\n% \\bibliography{references}\n\n")
    parts.append(suffix if suffix.strip() else "\\end{document}\n")

    return "".join(parts)


async def generate_template(state: dict) -> dict:
    latex = state.get("latex", "")
    suggestion = build_imrad_template(latex)
    diff = build_diff(latex, suggestion)

    return {
        "original_text": latex,
        "suggestion": suggestion,
        "diff": diff,
        "apply_mode": "document",
        "integrity_flags": [],
        "response": (
            "Ario đã soạn sườn bài IMRAD trực tiếp vào main.tex. "
            "Xem phần thay đổi (đỏ = cũ, xanh = mới) và nhấn Accept để áp dụng."
        ),
        "analysis": "IMRAD template generated.",
    }
