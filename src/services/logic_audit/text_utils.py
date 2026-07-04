from __future__ import annotations

import re

SUBSECTION_MARKER_RE = re.compile(r"\\subsection\*?\{([^}]*)\}", re.MULTILINE)

_QUOTE_PATTERNS = (
    re.compile(r'"([^"]{12,220})"'),
    re.compile(r"'([^']{12,220})'"),
    re.compile(r"「([^」]{12,220})」"),
)


def infer_claim_text(comment: str, existing: str = "") -> str:
    """Best-effort claim excerpt for jump-to-line when the LLM omits claim_text."""
    claim = (existing or "").strip()
    if len(claim) >= 12:
        return claim[:500]
    text = (comment or "").strip()
    if not text:
        return ""
    for pattern in _QUOTE_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(1).strip()[:500]
    return ""


def subsection_starts(text: str) -> list[int]:
    """Character offsets where \\subsection blocks begin."""
    return [match.start() for match in SUBSECTION_MARKER_RE.finditer(text or "")]


def _char_chunks(text: str, limit: int, max_chunks: int) -> list[str]:
    overlap = min(500, max(200, limit // 10))
    chunks: list[str] = []
    start = 0
    while start < len(text) and len(chunks) < max(1, max_chunks):
        end = min(start + limit, len(text))
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return chunks


def split_section_text_subsection_aware(
    text: str,
    limit: int,
    *,
    max_chunks: int = 2,
) -> list[str]:
    """Split section text, preferring breaks at \\subsection boundaries."""
    cleaned = (text or "").strip()
    if not cleaned or len(cleaned) <= limit:
        return [cleaned] if cleaned else []

    starts = subsection_starts(cleaned)
    if not starts:
        return _char_chunks(cleaned, limit, max_chunks)

    boundaries = [0, *starts, len(cleaned)]
    segments: list[str] = []
    for index in range(len(boundaries) - 1):
        segment = cleaned[boundaries[index] : boundaries[index + 1]].strip()
        if segment:
            segments.append(segment)

    chunks: list[str] = []
    current = ""
    for segment in segments:
        if len(segment) > limit:
            if current:
                chunks.append(current)
                current = ""
            if len(chunks) >= max_chunks:
                break
            chunks.extend(_char_chunks(segment, limit, max_chunks - len(chunks)))
            continue
        joined = f"{current}\n\n{segment}".strip() if current else segment
        if len(joined) <= limit:
            current = joined
            continue
        if current:
            chunks.append(current)
        current = segment
        if len(chunks) >= max_chunks:
            current = ""
            break
    if current and len(chunks) < max_chunks:
        chunks.append(current)

    if not chunks:
        return _char_chunks(cleaned, limit, max_chunks)
    return chunks[:max_chunks]
