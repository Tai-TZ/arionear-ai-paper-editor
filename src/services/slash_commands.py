from __future__ import annotations

import re

from src.models.schemas import ChatTask

_SLASH_RE = re.compile(r"^/(\w+)\s*(.*)$", re.DOTALL)

_COMMAND_TO_TASK: dict[str, ChatTask] = {
    "logic": "logic",
    "style": "style",
    "structure": "structure",
    "citation": "citation",
    "citations": "citation",
    "template": "template",
    "edit": "edit",
    "chat": "chat",
}

_DEFAULT_MESSAGES: dict[ChatTask, str] = {
    "logic": "Kiểm tra logic bài báo",
    "style": "Chỉnh văn phong bản thảo",
    "structure": "Kiểm tra cấu trúc bài báo",
    "citation": "Kiểm tra trích dẫn",
    "template": "Tạo khung IMRAD",
    "edit": "Chỉnh sửa bản thảo",
    "chat": "",
}


def parse_slash_command(message: str) -> tuple[ChatTask | None, str]:
    """Parse leading slash command. Returns (task, cleaned_message)."""
    text = (message or "").strip()
    match = _SLASH_RE.match(text)
    if not match:
        return None, message

    command = match.group(1).lower()
    rest = (match.group(2) or "").strip()
    task = _COMMAND_TO_TASK.get(command)
    if not task:
        return None, message

    if rest:
        return task, rest
    default = _DEFAULT_MESSAGES.get(task, "")
    return task, default or text
