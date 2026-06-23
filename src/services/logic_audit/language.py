from __future__ import annotations

import re

_VIETNAMESE_CHARS = set("ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ")
_VI_HINTS = (
    "kiểm tra",
    "mâu thuẫn",
    "bài báo",
    "bản thảo",
    "phần",
    "tiếng việt",
    "tieng viet",
)


def resolve_audit_language(query: str, *, default: str = "Vietnamese") -> str:
    """Pick comment language — Vietnamese unless the user clearly writes in English."""
    text = (query or "").strip()
    if not text:
        return default
    lower = text.lower()
    if any(ch in lower for ch in _VIETNAMESE_CHARS):
        return "Vietnamese"
    if any(hint in lower for hint in _VI_HINTS):
        return "Vietnamese"
    if re.search(r"[a-zA-Z]", text) and not re.search(
        r"[\u0300-\u036f]|[" + re.escape("".join(_VIETNAMESE_CHARS)) + "]",
        lower,
    ):
        # Latin-only query without Vietnamese diacritics → English OK
        return "English"
    return default


def clean_section_display_name(name: str) -> str:
    """Strip LaTeX markup from section titles for display."""
    text = (name or "").strip()
    if not text:
        return "Section"
    unwrap_patterns = (
        r"\\(?:textbf|textit|emph|textsc|textsf|texttt|section|subsection)\*?\{([^{}]*)\}",
        r"\\[a-zA-Z@]+\*?\{([^{}]*)\}",
    )
    for _ in range(6):
        prev = text
        for pattern in unwrap_patterns:
            text = re.sub(pattern, r"\1", text, flags=re.IGNORECASE)
        if text == prev:
            break
    text = re.sub(r"\\[a-zA-Z@]+\*?", "", text)
    text = text.replace("{", "").replace("}", "").strip()
    return text or "Section"
