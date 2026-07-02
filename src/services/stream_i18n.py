"""Locale-aware labels for chat stream SSE state events."""

from __future__ import annotations

from typing import Literal

UiLocale = Literal["vi", "en"]


def resolve_locale(value: str | None) -> UiLocale:
    if (value or "").strip().lower() == "en":
        return "en"
    return "vi"


_TASK_LABELS: dict[UiLocale, dict[str, str]] = {
    "vi": {
        "style": "Biên tập văn phong",
        "edit": "Chỉnh sửa LaTeX",
        "structure": "Phân tích cấu trúc",
        "logic": "Kiểm tra logic",
        "citation": "Kiểm tra trích dẫn",
        "template": "Dựng khung IMRAD",
        "chat": "Trả lời câu hỏi",
    },
    "en": {
        "style": "Style edit",
        "edit": "LaTeX edit",
        "structure": "Structure analysis",
        "logic": "Logic check",
        "citation": "Citation check",
        "template": "IMRAD template",
        "chat": "Chat reply",
    },
}

_STATE: dict[UiLocale, dict[str, str]] = {
    "vi": {
        "intent_analyze": "Phân tích yêu cầu",
        "intent_detail_active": "Đang xác định tác vụ…",
        "intent_done": "Đã xác định ý định",
        "parse_done": "Đọc bản thảo",
        "scope_edit": "Xác định phạm vi chỉnh sửa",
        "scope_style": "Xác định phạm vi biên tập",
        "plan_edit": "Lập kế hoạch chỉnh sửa",
        "plan_style": "Chuẩn bị biên tập",
        "llm_edit_active": "Đang chỉnh sửa LaTeX",
        "llm_edit_done": "Hoàn tất chỉnh sửa",
        "llm_style_active": "Đang biên tập văn phong",
        "llm_style_done": "Hoàn tất biên tập",
        "llm_chat_active": "Đang trả lời",
        "llm_chat_done": "Hoàn tất trả lời",
        "llm_boot": "Khởi động LLM…",
        "llm_processing": "LLM đang xử lý",
        "integrity_done": "Kiểm tra integrity guard",
        "structure_scan": "Quét cấu trúc IMRAD",
        "structure_active": "Đang phân tích cấu trúc IMRAD",
        "structure_done": "Hoàn tất phân tích cấu trúc",
        "scope_suffix": "phạm vi",
        "no_sections": "Không có section",
        "integrity_blocking": "vấn đề cần xem lại",
        "integrity_ok": "Không phát hiện thay đổi số liệu",
        "parts_word": "phần",
        "citations_word": "trích dẫn",
        "chars_word": "ký tự",
        "selected_span": "Đoạn đã chọn",
        "full_main": "Toàn bộ main.tex",
        "section_prefix": "Phần",
        "request_guard_blocked": "Yêu cầu không được hỗ trợ",
    },
    "en": {
        "intent_analyze": "Analyzing request",
        "intent_detail_active": "Detecting task…",
        "intent_done": "Intent classified",
        "parse_done": "Reading manuscript",
        "scope_edit": "Resolving edit scope",
        "scope_style": "Resolving style scope",
        "plan_edit": "Planning edit",
        "plan_style": "Preparing style edit",
        "llm_edit_active": "Editing LaTeX",
        "llm_edit_done": "Edit complete",
        "llm_style_active": "Polishing style",
        "llm_style_done": "Style edit complete",
        "llm_chat_active": "Answering",
        "llm_chat_done": "Reply complete",
        "llm_boot": "Starting LLM…",
        "llm_processing": "LLM processing",
        "integrity_done": "Integrity guard check",
        "structure_scan": "Scanning IMRAD structure",
        "structure_active": "Analyzing IMRAD structure",
        "structure_done": "Structure analysis complete",
        "scope_suffix": "scope",
        "no_sections": "No sections",
        "integrity_blocking": "issues to review",
        "integrity_ok": "No numeric drift detected",
        "parts_word": "sections",
        "citations_word": "citations",
        "chars_word": "characters",
        "selected_span": "Selected span",
        "full_main": "Entire main.tex",
        "section_prefix": "Section",
        "request_guard_blocked": "Request not supported",
    },
}

_METADATA_LABELS: dict[UiLocale, dict[str, str]] = {
    "vi": {
        "title": "Tiêu đề · \\title{...}",
        "author": "Tác giả · \\author{...}",
        "abstract": "Abstract · \\begin{abstract}",
    },
    "en": {
        "title": "Title · \\title{...}",
        "author": "Author · \\author{...}",
        "abstract": "Abstract · \\begin{abstract}",
    },
}


def task_label(locale: UiLocale, task: str) -> str:
    return _TASK_LABELS[locale].get(task, task)


def state_label(locale: UiLocale, key: str) -> str:
    return _STATE[locale].get(key, key)


def metadata_label(locale: UiLocale, section_key: str) -> str | None:
    return _METADATA_LABELS[locale].get(section_key.lower())


def scope_detail(
    locale: UiLocale,
    prepared: dict,
    *,
    active_file: str = "main.tex",
    main_file: str = "main.tex",
) -> tuple[str, str]:
    section = str(prepared.get("section") or "").strip()
    scope_label = str(prepared.get("scope_label") or "").strip()
    if scope_label:
        return section, scope_label

    section_key = section.lower()
    meta = metadata_label(locale, section_key)
    if meta:
        return section, meta

    text = str(prepared.get("original_text") or "")
    word_count = len(text.split())
    apply_mode = prepared.get("apply_mode", "document")
    s = _STATE[locale]
    wc = f"{word_count:,}".replace(",", ".")
    if section:
        return section, f"{s['section_prefix']} {section} · ~{wc} words"
    if apply_mode == "document":
        fname = active_file if active_file != main_file else main_file
        label = s["full_main"] if fname == main_file else fname
        return "", f"{label} · ~{wc} words"
    return "", f"{s['selected_span']} · ~{wc} words"


def parse_detail(locale: UiLocale, sections: int, citations: int, chars: int) -> str:
    s = _STATE[locale]
    wc = f"{chars:,}".replace(",", ".")
    return f"{sections} {s['parts_word']} · {citations} {s['citations_word']} · {wc} {s['chars_word']}"
