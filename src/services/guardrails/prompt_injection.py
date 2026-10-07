"""Prompt-injection detection, input delimiting, and output leak checks."""

from __future__ import annotations

import re
import unicodedata

from src.services.stream_i18n import UiLocale, resolve_locale

_ZERO_WIDTH_RE = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]")

_INJECTION_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE | re.DOTALL)
    for p in (
        r"ignore\s+(?:all\s+)?(?:previous|prior|above|earlier|system)\s+instructions?",
        r"disregard\s+(?:all\s+)?(?:previous|prior|above|system)\s+instructions?",
        r"forget\s+(?:all\s+)?(?:previous|prior|your)\s+instructions?",
        r"override\s+(?:all\s+)?(?:safety|security|guard|filter|restriction|rule)s?",
        r"bypass\s+(?:all\s+)?(?:safety|security|guard|filter|restriction|rule)s?",
        r"jailbreak",
        r"\bDAN\s+mode\b",
        r"developer\s+mode",
        r"reveal\s+(?:your\s+)?(?:system\s+)?prompt",
        r"show\s+(?:me\s+)?(?:your\s+)?(?:system\s+)?prompt",
        r"print\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions?)",
        r"repeat\s+(?:the\s+)?(?:system\s+)?(?:prompt|instructions?)",
        r"what\s+are\s+your\s+(?:system\s+)?instructions?",
        r"output\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions?)",
        r"tiết\s+lộ\s+(?:prompt|hướng\s+dẫn|system)",
        r"bỏ\s+qua\s+(?:tất\s+cả\s+)?(?:hướng\s+dẫn|quy\s+tắc|instruction)",
        r"quên\s+(?:tất\s+cả\s+)?(?:hướng\s+dẫn|instruction)",
        r"you\s+are\s+now\s+(?:an?\s+)?(?:unrestricted|unfiltered|evil|DAN)",
        r"pretend\s+(?:you\s+are|to\s+be)\s+(?:an?\s+)?(?:unrestricted|unfiltered|hacker|admin)",
        r"act\s+as\s+(?:an?\s+)?(?:unrestricted|unfiltered|root|admin|developer)\b",
        r"<\s*/?\s*system\s*>",
        r"\[/?INST\]",
        r"###\s*(?:system|instruction)\b",
        r"BEGIN\s+SYSTEM\s+PROMPT",
        r"API[_\s-]?KEY|SECRET[_\s-]?KEY|OPENAI[_\s-]?KEY",
    )
)

_LEAK_MARKERS: tuple[str, ...] = (
    "integrity guard (non-negotiable)",
    "what this product is",
    "you are dico — the ai research assistant",
    "return only valid json",
    "target_type=latex_command",
    "non-negotiable",
    "paper ide for scientific manuscripts",
)


def normalize_user_input(text: str) -> str:
    """Collapse obfuscation tricks before pattern matching."""
    cleaned = _ZERO_WIDTH_RE.sub("", text or "")
    return unicodedata.normalize("NFKC", cleaned).strip()


def detect_prompt_injection(text: str) -> bool:
    normalized = normalize_user_input(text)
    if not normalized:
        return False
    return any(pattern.search(normalized) for pattern in _INJECTION_PATTERNS)


def detect_prompt_injection_in_history(history: list | None) -> bool:
    if not history:
        return False
    for turn in history[-6:]:
        role = turn.role if hasattr(turn, "role") else turn.get("role")
        if role != "user":
            continue
        content = turn.content if hasattr(turn, "content") else turn.get("content", "")
        if detect_prompt_injection(str(content or "")):
            return True
    return False


def wrap_untrusted_user_text(text: str, *, label: str = "user_request") -> str:
    """Delimit untrusted text so the model treats it as data, not instructions."""
    body = normalize_user_input(text)
    if not body:
        return ""
    safe_label = re.sub(r"[^\w-]", "_", label.strip()) or "user_request"
    escaped = body.replace(f"</{safe_label}>", f"< /{safe_label}>")
    return f"<{safe_label}>\n{escaped}\n</{safe_label}>"


def looks_like_system_prompt_leak(text: str) -> bool:
    lower = (text or "").lower()
    if len(lower) < 80:
        return False
    hits = sum(1 for marker in _LEAK_MARKERS if marker in lower)
    return hits >= 2


_REFUSALS: dict[UiLocale, str] = {
    "vi": (
        "Tôi không thể thực hiện yêu cầu ghi đè hướng dẫn hệ thống hoặc tiết lộ prompt nội bộ. "
        "EDICO chỉ hỗ trợ biên tập bài báo LaTeX — hãy đặt câu hỏi về bản thảo của bạn."
    ),
    "en": (
        "I can't override system instructions or reveal internal prompts. "
        "EDICO only supports LaTeX manuscript editing — ask about your draft instead."
    ),
}


def injection_refusal(locale: str | None = None) -> str:
    return _REFUSALS[resolve_locale(locale)]


def evaluate_prompt_injection(
    query: str,
    *,
    locale: str | None = None,
    history: list | None = None,
) -> tuple[bool, str]:
    """Return (allowed, refusal_message)."""
    if detect_prompt_injection(query) or detect_prompt_injection_in_history(history):
        return False, injection_refusal(locale)
    return True, ""
