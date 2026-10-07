from __future__ import annotations

import re


def is_provider_key_error(message: str) -> bool:
    """True when the provider rejected credentials or ran out of prepaid balance."""
    text = (message or "").strip().lower()
    if not text:
        return False
    if re.search(r"\b401\b", message) and "error" in text:
        return True
    if re.search(r"\b402\b", message):
        return True
    if re.search(r"\b403\b", message) and ("api key" in text or "permission" in text):
        return True
    markers = (
        "invalid api key",
        "incorrect api key",
        "authentication",
        "unauthorized",
        "invalid authentication",
        "api key not valid",
        "no api key",
        "insufficient balance",
        "please recharge",
        "credit balance",
        "quota exceeded",
        "billing",
        "payment required",
        "exceeded your current quota",
        "insufficient_quota",
    )
    return any(marker in text for marker in markers)


def is_provider_key_error_exc(exc: BaseException) -> bool:
    return is_provider_key_error(str(exc))


def is_google_project_denied(message: str) -> bool:
    text = (message or "").strip().lower()
    return "denied access" in text and ("403" in text or "permission_denied" in text)


def format_provider_test_failure(
    provider: str,
    model: str | None,
    exc: BaseException,
) -> str:
    """Human-readable admin test failure — especially for opaque Google 403 blocks."""
    msg = str(exc).strip()
    model_label = model or "default"

    if provider == "google" and is_google_project_denied(msg):
        return (
            "Google đã chặn project GCP gắn với API key này (403 PERMISSION_DENIED). "
            "Key có thể hợp lệ nhưng project bị Google flag — không phải lỗi cấu hình Proofline. "
            "Kiểm tra banner tại aistudio.google.com hoặc console.cloud.google.com; "
            "tạo project + API key mới nếu cần; thử model gemini-2.5-flash-lite. "
            f"(model: {model_label})"
        )

    if provider == "google" and (
        "invalid api key" in msg.lower() or "api key not valid" in msg.lower() or "api_key_invalid" in msg.lower()
    ):
        return (
            f"API key Google không hợp lệ. Lấy key tại aistudio.google.com/apikey (bắt đầu bằng AIza…). ({msg[:100]})"
        )

    return msg[:240]
