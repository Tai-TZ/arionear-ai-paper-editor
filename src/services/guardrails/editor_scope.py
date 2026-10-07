"""Editor scope guardrail — block off-topic requests before LLM calls."""

from __future__ import annotations

import re
from typing import Literal

from src.services.intent_rules import is_casual_chat
from src.services.stream_i18n import UiLocale, resolve_locale

OffTopicKind = Literal["general_coding", "homework"]

_CODING_REQUEST_RE = re.compile(
    r"\b(?:"
    r"code|viết\s*code|lập\s*trình|program(?:ming)?|debug(?:ging)?|"
    r"script|snippet|function|hàm|def\s+\w+|class\s+\w+|"
    r"api\s+endpoint|web\s*app|mobile\s*app|"
    r"python|javascript|typescript|java\b|c\+\+|golang|rust|php|ruby|"
    r"node\.?js|react|django|flask|fastapi|sql\s+query|algorithm\s+implementation"
    r")\b",
    re.IGNORECASE,
)

_HOMEWORK_RE = re.compile(
    r"\b(?:homework|bài\s*tập|bai\s*tap|assignment|đề\s*thi|ielts\s*essay)\b",
    re.IGNORECASE,
)

_PAPER_SCOPE_RE = re.compile(
    r"\b(?:"
    r"latex|listings|minted|algorithm2e|pseudocode|thuật\s*toán|"
    r"bài\s*báo|bản\s*thảo|manuscript|paper|main\.tex|"
    r"trong\s*file|vào\s*file|trong\s*bản\s*thảo|trong\s*main|"
    r"code\s*block|đoạn\s*code|snippet\s+trong|"
    r"appendix|phụ\s*lục|"
    r"method(?:s|ology)?|phương\s*pháp|"
    r"section|phần|abstract|introduction|discussion|conclusion|"
    r"imrad|citation|trích\s*dẫn|bibliography|equation|công\s*thức"
    r")\b",
    re.IGNORECASE,
)


def _has_paper_scope(query: str) -> bool:
    return _PAPER_SCOPE_RE.search(query) is not None


def detect_off_topic_request(query: str) -> OffTopicKind | None:
    """Return off-topic category when the request is outside Paper IDE scope."""
    q = query.strip()
    if not q or is_casual_chat(q):
        return None
    if _has_paper_scope(q):
        return None
    if _CODING_REQUEST_RE.search(q):
        return "general_coding"
    if _HOMEWORK_RE.search(q):
        return "homework"
    return None


_REFUSALS: dict[UiLocale, dict[OffTopicKind, str]] = {
    "vi": {
        "general_coding": (
            "Tôi là trợ lý biên tập bài báo trong EDICO — chỉ hỗ trợ viết/chỉnh LaTeX, "
            "cấu trúc IMRAD, trích dẫn và nội dung học thuật trong bản thảo của bạn. "
            "Tôi không viết code Python/JS hay lập trình chung cho mục đích khác.\n\n"
            "Nếu bạn cần chèn đoạn code minh họa vào bài (ví dụ phần Methods với listings), "
            "hãy nói rõ vị trí trong main.tex."
        ),
        "homework": (
            "EDICO chỉ hỗ trợ soạn và biên tập bài báo khoa học (LaTeX), không làm bài tập "
            "hay bài luận chung. Hãy đặt câu hỏi liên quan đến bản thảo đang mở."
        ),
    },
    "en": {
        "general_coding": (
            "I'm Dico, your manuscript co-pilot in EDICO — I help with LaTeX, IMRAD structure, "
            "citations, and academic writing in your draft. I don't write standalone Python/JS code "
            "or general programming for unrelated tasks.\n\n"
            "If you need a code snippet inside the paper (e.g. a listings block in Methods), "
            "say where in main.tex it should go."
        ),
        "homework": (
            "EDICO supports scientific manuscript editing (LaTeX) only — not homework or general essays. "
            "Ask about the open draft instead."
        ),
    },
}


def off_topic_refusal(kind: OffTopicKind, locale: str | None = None) -> str:
    loc = resolve_locale(locale)
    return _REFUSALS[loc][kind]


def evaluate_editor_scope(
    query: str,
    *,
    locale: str | None = None,
) -> tuple[bool, str]:
    """Return (allowed, message). Message is a canned refusal when not allowed."""
    kind = detect_off_topic_request(query)
    if not kind:
        return True, ""
    return False, off_topic_refusal(kind, locale)
