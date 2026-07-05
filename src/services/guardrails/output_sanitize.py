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


def _best_matching_line(original: str, suggestion: str) -> str | None:
    orig = original.strip()
    if not orig:
        return None

    cand_lines = [line.strip() for line in suggestion.splitlines() if line.strip()]
    if not cand_lines:
        return None

    cmd_match = re.match(r"(\\[a-zA-Z@*]+)", orig)
    if cmd_match:
        cmd = cmd_match.group(1)
        for line in cand_lines:
            if line.startswith(cmd):
                return line

    best_line = ""
    best_score = 0.0
    for line in cand_lines:
        score = _word_overlap(line, orig)
        if score > best_score:
            best_score = score
            best_line = line
    if best_score >= 0.15:
        return best_line
    return cand_lines[0] if len(cand_lines) == 1 else None


def _strip_leaked_section_command(original: str, replacement: str) -> str:
    """Drop a leading \\section{...} when editing section body only."""
    if re.search(r"\\section\b", original, re.IGNORECASE):
        return replacement
    match = re.match(r"^\s*\\section\*?\s*\{", replacement, re.IGNORECASE)
    if not match:
        return replacement
    brace_start = match.end() - 1
    depth = 0
    header_end = None
    for index in range(brace_start, len(replacement)):
        char = replacement[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                header_end = index + 1
                break
    if header_end is None:
        return replacement
    return replacement[header_end:].lstrip("\n")


def clamp_selection_replacement(
    original: str,
    suggestion: str,
    *,
    apply_mode: str = "selection",
    query: str = "",
) -> str:
    """Prevent selection edits from leaking full-document LLM output."""
    if apply_mode == "document":
        return suggestion.strip()

    orig = original.strip()
    sugg = suggestion.strip()
    if not orig:
        return sugg
    if not sugg:
        return orig

    leaked_preamble = bool(
        re.search(r"\\documentclass\b", sugg, re.IGNORECASE)
        or re.search(r"\\begin\{document\}", sugg, re.IGNORECASE)
    )
    orig_lines = max(1, orig.count("\n") + 1)
    sugg_lines = max(1, sugg.count("\n") + 1)
    oversized = sugg_lines > orig_lines + 1 or len(sugg) > max(len(orig) * 3, len(orig) + 120)

    if leaked_preamble or oversized:
        if query:
            from src.services.direct_edit import try_direct_text_edit

            direct = try_direct_text_edit(query, orig)
            if direct and direct.strip() and direct.strip() != orig:
                return _strip_leaked_section_command(orig, direct.strip())

        picked = _best_matching_line(orig, sugg)
        if picked:
            return _strip_leaked_section_command(orig, picked)
        return orig

    return _strip_leaked_section_command(orig, sugg)


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

    text = clamp_selection_replacement(
        original,
        text,
        apply_mode=apply_mode,
    )

    return text.strip()
