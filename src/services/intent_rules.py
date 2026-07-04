"""Rule-based intent classification — no LLM / langchain imports."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

Action = Literal["edit", "style", "structure", "logic", "citation", "template", "chat"]
Scope = Literal["document", "selection"]

_STYLE_RE = re.compile(
    r"văn\s*phong|viết\s*lại|polish|tone|học\s*thuật|academic|paraphrase|chỉnh\s*lý|làm\s*mượt|rewrite",
    re.IGNORECASE,
)
_RENAME_EDIT_RE = re.compile(
    r"đổi\s+.+\s+thành|đổi\s+.+\s+sang|đổi\s+.+\s+từ\s+.+\s+sang|"
    r"thay\s+.+\s+bằng|sửa\s+.+\s+thành|chỉnh\s+.+\s+thành|"
    r"replace\s+.+\s+with|change\s+.+\s+to",
    re.IGNORECASE,
)
_TITLE_EDIT_RE = re.compile(
    r"tiêu\s*đề|title|đề\s*tài|tên\s*(?:đề\s*)?tài|paper\s*title|project\s*title",
    re.IGNORECASE,
)
_STRUCTURE_RE = re.compile(
    r"cấu\s*trúc|structure|outline|dàn\s*bài|dan\s*bai|imrad|khung\s*bài|review\s*structure",
    re.IGNORECASE,
)
_LOGIC_RE = re.compile(
    r"kiểm\s*tra\s*logic|logic\s*check|consistency|mâu\s*thuẫn|contradiction|"
    r"logic\s*audit|nhất\s*quán|weak\s*claim|lỗ\s*hổng\s*lập\s*luận",
    re.IGNORECASE,
)
_CITATION_RE = re.compile(
    r"trích\s*dẫn|citation|bibliography|reference|verify\s*cite|kiểm\s*tra\s*trích",
    re.IGNORECASE,
)
_TEMPLATE_RE = re.compile(
    r"template|khung\s*bài|imrad\s*skeleton|"
    r"thêm\s+(?:các\s+)?section|bổ\s*sung\s+section|"
    r"section\s+imrad\s+còn\s+thiếu|imrad\s+còn\s+thiếu",
    re.IGNORECASE,
)
_GREETING_CHAT_RE = re.compile(
    r"^(?:h+u+l+o+|"
    r"hello(?:\s+(?:there|everyone|bao))?|"
    r"hi(?:\s+(?:there|everyone|bao))?|"
    r"hey|"
    r"chào(?:\s+(?:bạn|ban|nhé|nhe|anh|chị|chi|em|"
    r"mọi\s+người|moi\s+nguoi))?|"
    r"chao|xin\s*chào|yo|"
    r"hú|hu|hì|helo|good\s*(?:morning|afternoon|evening)|"
    r"thanks?|thank\s*you|cảm\s*ơn|cam\s*on|"
    r"ok(?:ay)?|oke|ừ|uh|ah|"
    r"test|thử|thu)\s*[!?.…]*$",
    re.IGNORECASE,
)
_ACKNOWLEDGMENT_CHAT_RE = re.compile(
    r"^(?:rất\s+tốt|rat\s+tot|good(?:\s+(?:job|work))?|nice|great|perfect|"
    r"tuyệt|tuyet|ổn|on|được|duoc)\s*[!?.…]*$",
    re.IGNORECASE,
)
_EDIT_FOLLOWUP_SIGNAL_RE = re.compile(
    r"chỉnh|sửa|\bedit\b|viết\s+lại|rewrite|thử\s+lại|try\s+again|continue|tiếp",
    re.IGNORECASE,
)
_CONVERSATIONAL_CHAT_RE = re.compile(
    r"bạn\s+là\s+ai|who\s+are\s+you|what\s+can\s+you\s+do|"
    r"giúp\s+tôi\s+gì|help\s+me|bạn\s+biết\s+gì",
    re.IGNORECASE,
)
_IMPROVE_RE = re.compile(
    r"hay\s+hơn|tốt\s+hơn|ngắn\s+hơn|dài\s+hơn|cải\s+thiện|"
    r"improve|better|polish|làm\s+mượt|clearer",
    re.IGNORECASE,
)
_MANUSCRIPT_SECTION_RE = re.compile(
    r"abstract|tóm\s*tắt|introduction|giới\s*thiệu|method|phương\s*pháp|"
    r"result|kết\s*quả|discussion|thảo\s*luận|conclusion|kết\s*luận|"
    r"section|phần|đoạn",
    re.IGNORECASE,
)
_FOLLOWUP_SHORT_RE = re.compile(
    r"^(?:ngắn\s+hơn|dài\s+hơn|lại|thử\s+lại|tiếp|nữa|ok|được|"
    r"sửa\s+tiếp|chỉnh\s+tiếp|hay\s+hơn|tốt\s+hơn|mượt\s+hơn|"
    r"shorter|longer|again|retry|continue)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class IntentResult:
    action: Action = "chat"
    scope: Scope = "document"


def is_casual_chat(query: str) -> bool:
    q = query.strip()
    if not q:
        return True
    if _GREETING_CHAT_RE.match(q):
        return True
    if _ACKNOWLEDGMENT_CHAT_RE.match(q):
        return True
    return _CONVERSATIONAL_CHAT_RE.search(q) is not None


def _has_edit_followup_signal(query: str) -> bool:
    q = query.strip()
    if not q:
        return False
    if _FOLLOWUP_SHORT_RE.match(q):
        return True
    if _IMPROVE_RE.search(q):
        return True
    return _EDIT_FOLLOWUP_SIGNAL_RE.search(q) is not None


def _turn_content(turn: object) -> str:
    if hasattr(turn, "content"):
        return str(turn.content or "").strip()
    if isinstance(turn, dict):
        return str(turn.get("content", "")).strip()
    return ""


def _turn_role(turn: object) -> str:
    if hasattr(turn, "role"):
        return str(turn.role or "")
    if isinstance(turn, dict):
        return str(turn.get("role", ""))
    return ""


def _last_user_turn_was_edit(history: list | None) -> bool:
    if not history:
        return False
    for turn in reversed(history[-8:]):
        if _turn_role(turn) != "user":
            continue
        lower = _turn_content(turn).lower()
        return bool(
            "/edit" in lower
            or re.search(r"chỉnh\s*sửa|sửa\s+phần|\bedit\b", lower)
            or _IMPROVE_RE.search(lower)
        )
    return False


def looks_like_edit_followup(query: str, history: list | None) -> bool:
    if is_casual_chat(query):
        return False
    if not history:
        return False
    q = query.strip()
    if not q:
        return False
    if _FOLLOWUP_SHORT_RE.match(q):
        return True
    if _last_user_turn_was_edit(history) and (
        _IMPROVE_RE.search(q)
        or _MANUSCRIPT_SECTION_RE.search(q)
        or _FOLLOWUP_SHORT_RE.match(q)
        or _EDIT_FOLLOWUP_SIGNAL_RE.search(q)
    ):
        return True
    last_assistant = ""
    for turn in history[-6:]:
        if _turn_role(turn) == "assistant":
            last_assistant = _turn_content(turn)
    if not last_assistant:
        return False
    lower = last_assistant.lower()
    if any(
        hint in lower
        for hint in (
            "accept/reject",
            "xem diff",
            "đã cập nhật",
            "gợi ý",
            "proposed",
            "biên tập",
            "chỉnh sửa",
        )
    ):
        return _has_edit_followup_signal(q)
    return False


def infer_followup_intent(
    query: str,
    history: list | None,
    *,
    has_selection: bool,
) -> IntentResult | None:
    if is_casual_chat(query):
        return None
    if not looks_like_edit_followup(query, history):
        return None
    q = query.strip().lower()
    scope: Scope = "selection" if has_selection else "document"
    if _STYLE_RE.search(q) or re.search(
        r"ngắn\s+hơn|dài\s+hơn|mượt|hay\s+hơn|polish|viết\s+lại",
        q,
        re.IGNORECASE,
    ):
        return IntentResult(action="style", scope=scope)
    return IntentResult(action="edit", scope=scope)


def fallback_intent(query: str, has_latex: bool, has_selection: bool) -> IntentResult:
    q = query.strip().lower()
    if not has_latex:
        return IntentResult(action="chat")

    if is_casual_chat(query):
        return IntentResult(action="chat")

    if _STYLE_RE.search(q):
        return IntentResult(action="style", scope="selection" if has_selection else "document")

    if _TITLE_EDIT_RE.search(q):
        return IntentResult(action="edit", scope="selection")

    if _RENAME_EDIT_RE.search(q):
        return IntentResult(action="edit", scope="selection" if has_selection else "document")

    if re.search(r"chỉnh\s*sửa", q, re.IGNORECASE):
        return IntentResult(action="edit", scope="selection" if has_selection else "document")

    if _CITATION_RE.search(q):
        return IntentResult(action="citation")

    if _TEMPLATE_RE.search(q):
        return IntentResult(action="template")

    if _LOGIC_RE.search(q):
        return IntentResult(action="logic")

    if _STRUCTURE_RE.search(q):
        return IntentResult(action="structure")

    if q.endswith("?"):
        if re.search(
            r"sửa|chỉnh|viết\s*lại|đổi|thay|rewrite|polish|edit|fix",
            q,
            re.IGNORECASE,
        ):
            return IntentResult(
                action="style" if _STYLE_RE.search(q) else "edit",
                scope="selection" if has_selection else "document",
            )
        if _IMPROVE_RE.search(q) and _MANUSCRIPT_SECTION_RE.search(q):
            return IntentResult(
                action="style" if _STYLE_RE.search(q) else "edit",
                scope="selection" if has_selection else "document",
            )
        return IntentResult(action="chat")

    if has_selection:
        return IntentResult(action="style", scope="selection")

    return IntentResult(action="chat")
