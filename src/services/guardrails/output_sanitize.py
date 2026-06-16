from __future__ import annotations

import re

_META_SECTION_RE = re.compile(
    r"(?:^|\n)\s*(?:#+\s.*|"
    r"Các thay đổi chính|Key Improvements|"
    r"Tôi đã chỉnh|Đã chỉnh sửa|Dưới đây là|"
    r"Bạn có thể copy|You can copy|"
    r"Giải thích|Explanation:)",
    re.IGNORECASE,
)

_META_LINE_RE = re.compile(
    r"^(?:#+\s|>\s*|[-*•]\s+|"
    r"Tôi đã|Dưới đây|Các thay đổi|Key Improvements|Bạn có thể|"
    r"Here is the|Note:|Giải thích|Abstract \(Đã)",
    re.IGNORECASE,
)


def looks_like_chatty_output(text: str) -> bool:
    if not text.strip():
        return False
    return bool(
        re.search(r"^#+\s", text, re.MULTILINE)
        or re.search(r"^\s*>\s", text, re.MULTILINE)
        or re.search(r"^\s*[-*•]\s", text, re.MULTILINE)
        or _META_SECTION_RE.search(text)
        or re.search(r"\*\*[^*]+\*\*", text)
    )


def _strip_markdown_lines(text: str) -> str:
    lines: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            if lines and lines[-1] != "":
                lines.append("")
            continue
        if _META_LINE_RE.match(line):
            continue
        if line.startswith("#"):
            continue
        if line.startswith(">"):
            line = line.lstrip(">").strip().strip('"').strip("'")
        line = re.sub(r"\*\*([^*]+)\*\*", r"\1", line)
        line = re.sub(r"`([^`]+)`", r"\1", line)
        line = line.strip('"').strip("'")
        if line:
            lines.append(line)
    return "\n".join(lines).strip()


def _truncate_at_meta_section(text: str) -> str:
    match = _META_SECTION_RE.search(text)
    if match:
        return text[: match.start()].strip()
    return text.strip()


def _extract_abstract_body(text: str) -> str:
    env = re.search(
        r"\\begin\{abstract\}\s*(.*)",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if env:
        body = env.group(1)
        end = re.search(r"\\end\{abstract\}", body, re.IGNORECASE)
        if end:
            body = body[: end.start()]
        return _truncate_at_meta_section(body)

    quote = re.search(
        r'>\s*["\']?(.+?)["\']?\s*$',
        text,
        re.MULTILINE,
    )
    if quote and len(quote.group(1)) > 40:
        return quote.group(1).strip()

    return _truncate_at_meta_section(text)


def _word_overlap(a: str, b: str) -> float:
    words_a = set(re.findall(r"\w+", a.lower()))
    words_b = set(re.findall(r"\w+", b.lower()))
    if not words_a or not words_b:
        return 0.0
    return len(words_a & words_b) / max(len(words_a), len(words_b))


def _pick_best_prose_chunk(text: str, original: str) -> str:
    chunks = re.split(r"\n\s*#+\s*[^\n]*\n?|\n\s*\n", text)
    best = ""
    best_score = 0.0
    for chunk in chunks:
        cleaned = _strip_markdown_lines(chunk)
        if len(cleaned) < 40:
            continue
        if _META_LINE_RE.match(cleaned):
            continue
        score = _word_overlap(cleaned, original)
        if score > best_score:
            best_score = score
            best = cleaned
    return best


def sanitize_style_output(
    original: str,
    suggestion: str,
    *,
    section: str = "",
    apply_mode: str = "selection",
) -> str:
    """Coerce LLM output to paste-ready section text (no markdown / commentary)."""
    text = suggestion.strip()
    if not text:
        return text

    text = re.sub(r"^```(?:latex|tex|markdown)?\s*\n?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\n?```\s*$", "", text).strip()

    section_key = (section or "").lower()
    if apply_mode != "document" and section_key == "abstract":
        text = _extract_abstract_body(text)
    else:
        tex_start = re.search(
            r"\\(?:begin\{|documentclass|section\*?\{|cite|textbf|textit|emph)",
            text,
        )
        if tex_start and tex_start.start() > 0:
            text = text[tex_start.start() :]
        text = _truncate_at_meta_section(text)

    text = _strip_markdown_lines(text)

    if section_key == "abstract":
        text = re.sub(r"^\\begin\{abstract\}\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\\end\{abstract\}\s*$", "", text, flags=re.IGNORECASE)

    text = text.strip().strip('"').strip("'")

    if looks_like_chatty_output(text) or _word_overlap(text, original) < 0.15:
        candidate = _pick_best_prose_chunk(suggestion, original)
        if candidate and _word_overlap(candidate, original) >= 0.15:
            text = candidate

    if looks_like_chatty_output(text):
        cleaned = _strip_markdown_lines(_truncate_at_meta_section(suggestion))
        if cleaned and _word_overlap(cleaned, original) >= 0.15:
            text = cleaned

    if not text or looks_like_chatty_output(text) or len(text) < 20:
        return original.strip()

    return text.strip()
