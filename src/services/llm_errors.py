from __future__ import annotations

import re

LLM_USER_ERROR_MSG = (
    "Úi, kết nối tới AI đang bị gián đoạn một chút. Bạn thử đổi Model/Provider giúp mình nhé!"
)

_USER_SAFE_HINTS = (
    "thử đổi model",
    "thử lại",
    "gián đoạn",
    "model/provider",
    "api key",
)


def looks_like_provider_error(msg: str) -> bool:
    """True when text is a raw LLM/provider failure, not user-facing prose."""
    text = (msg or "").strip()
    if not text:
        return False
    lower = text.lower()

    if lower.startswith("error code:"):
        return True
    if "insufficient balance" in lower or "please recharge" in lower:
        return True
    if "no resource package" in lower:
        return True
    if re.search(r"error\s*code\s*:\s*\d{3}", lower):
        return True
    if "'error'" in text and ("'code'" in text or "'message'" in text):
        return True
    if re.search(r"\b[45]\d{2}\b", text) and "error" in lower:
        return True
    if "rate_limit" in lower or "rate limit exceeded" in lower:
        return True
    if "overloaded" in lower and "error" in lower:
        return True
    if text.startswith("{") and "error" in lower:
        return True
    return False


def _is_user_safe_message(msg: str) -> bool:
    lower = msg.lower()
    return any(hint in lower for hint in _USER_SAFE_HINTS)


def friendly_llm_error(exc: BaseException) -> str:
    """Map provider/LLM exceptions to short user-facing Vietnamese messages."""
    msg = str(exc).strip()
    lower = msg.lower()

    if not msg or looks_like_provider_error(msg):
        return LLM_USER_ERROR_MSG

    if "no api key" in lower or "api_key" in lower:
        return LLM_USER_ERROR_MSG

    if "rerank" in lower:
        return LLM_USER_ERROR_MSG

    if _is_user_safe_message(msg) and len(msg) <= 220:
        return msg

    return LLM_USER_ERROR_MSG
