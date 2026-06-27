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
  r"^(?:h+u+l+o+|hello|hi|hey|chào|chao|xin\s*chào|yo|"
  r"hú|hu|hì|helo|good\s*(?:morning|afternoon|evening)|"
  r"thanks?|thank\s*you|cảm\s*ơn|cam\s*on|"
  r"ok(?:ay)?|oke|ừ|uh|ah|"
  r"test|thử|thu)\s*[!?.…]*$",
    re.IGNORECASE,
)
_CONVERSATIONAL_CHAT_RE = re.compile(
    r"bạn\s+là\s+ai|who\s+are\s+you|what\s+can\s+you\s+do|"
    r"giúp\s+tôi\s+gì|help\s+me|bạn\s+biết\s+gì",
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
    return _CONVERSATIONAL_CHAT_RE.search(q) is not None


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
        return IntentResult(action="chat")

    if has_selection:
        return IntentResult(action="style", scope="selection")

    return IntentResult(action="chat")
