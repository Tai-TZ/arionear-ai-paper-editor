from __future__ import annotations


def friendly_llm_error(exc: BaseException) -> str:
    """Map provider/LLM exceptions to short user-facing Vietnamese messages."""
    msg = str(exc).strip()
    lower = msg.lower()

    if not msg:
        return "Không thể gọi mô hình AI. Vui lòng thử lại hoặc đổi model trong khung chat."

    if "no api key" in lower or "api_key" in lower:
        return (
            "Chưa cấu hình API key cho nhà cung cấp LLM. "
            "Thêm ZAI_API_KEY (hoặc OPENROUTER/OPENAI/ANTHROPIC) vào .env rồi khởi động lại backend."
        )

    if "rerank" in lower:
        return (
            "Model đang chọn là model rerank, không dùng được cho chat. "
            "Hãy chọn model chat (ví dụ meta-llama/llama-3.2-3b-instruct:free) trong khung chat."
        )

    if "model" in lower and any(token in lower for token in ("not found", "does not exist", "404", "invalid")):
        return "Model LLM không khả dụng trên OpenRouter. Thử đổi model khác trong khung chat."

    if "rate" in lower and "limit" in lower:
        return "Đã vượt giới hạn gọi API. Đợi vài phút hoặc đổi sang model/provider khác."

    if "401" in lower or "unauthorized" in lower or "authentication" in lower:
        return "API key LLM không hợp lệ hoặc đã hết hạn. Kiểm tra lại .env."

    if len(msg) <= 160 and "http" not in lower and "traceback" not in lower:
        return msg

    return "Không thể gọi mô hình AI. Thử đổi model trong khung chat hoặc kiểm tra API key trong .env."
