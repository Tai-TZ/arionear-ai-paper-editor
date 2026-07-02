from __future__ import annotations

import re

from src.services.quota_policy import QuotaExceededError

LLM_USER_ERROR_MSG = (
    "Úi, kết nối tới AI đang bị gián đoạn một chút. Bạn thử đổi Model/Provider giúp mình nhé!"
)

_PROVIDER_RATE_LIMIT_MSG = (
    "Provider AI đang giới hạn tốc độ. Đợi vài giây hoặc đổi model/provider khác."
)

_PROVIDER_OVERLOADED_MSG = (
    "Server AI đang quá tải. Thử lại sau vài giây hoặc đổi provider."
)

_PROVIDER_NO_KEY_MSG = (
    "Chưa cấu hình API key cho provider này trên server (kiểm tra file .env)."
)

_PROVIDER_MODEL_MSG = (
    "Model không khả dụng với provider đã chọn. Hãy chọn model khác trong menu chat."
)

_USER_SAFE_HINTS = (
    "thử đổi model",
    "thử lại",
    "gián đoạn",
    "model/provider",
    "api key",
)

_QUOTA_HINTS = (
    "hạn mức",
    "quota",
    "quá nhiều yêu cầu",
    "hết lượt",
    "dùng hết",
    "chưa được bật quyền dùng ai",
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


def _is_quota_user_message(msg: str) -> bool:
    lower = msg.lower()
    return any(hint in lower for hint in _QUOTA_HINTS)


def _classify_provider_error(msg: str) -> str | None:
    lower = msg.lower()
    if _is_quota_user_message(msg):
        return None
    if (
        "rate limit" in lower
        or "rate_limit" in lower
        or "too many requests" in lower
        or re.search(r"\b429\b", msg)
    ):
        return _PROVIDER_RATE_LIMIT_MSG
    if "overloaded" in lower or re.search(r"\b503\b", msg):
        return _PROVIDER_OVERLOADED_MSG
    if (
        "no api key" in lower
        or "api_key" in lower
        or "api key" in lower
        or "invalid api key" in lower
        or "authentication" in lower
    ):
        return _PROVIDER_NO_KEY_MSG
    if (
        "model" in lower
        and (
            "not found" in lower
            or "does not exist" in lower
            or "not available" in lower
            or "unknown model" in lower
        )
    ):
        return _PROVIDER_MODEL_MSG
    if "insufficient balance" in lower or "please recharge" in lower:
        return (
            "Tài khoản provider hết số dư. Nạp thêm credit hoặc đổi provider có API key hợp lệ."
        )
    return None


def friendly_llm_error(exc: BaseException) -> str:
    """Map provider/LLM exceptions to short user-facing Vietnamese messages."""
    if isinstance(exc, QuotaExceededError):
        return str(exc)

    msg = str(exc).strip()
    lower = msg.lower()

    specific = _classify_provider_error(msg)
    if specific:
        return specific

    if not msg or looks_like_provider_error(msg):
        return LLM_USER_ERROR_MSG

    if "rerank" in lower:
        return LLM_USER_ERROR_MSG

    if _is_quota_user_message(msg) and len(msg) <= 280:
        return msg

    if _is_user_safe_message(msg) and len(msg) <= 220:
        return msg

    return LLM_USER_ERROR_MSG
