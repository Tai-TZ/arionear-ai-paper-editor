from src.services.llm_errors import (
    LLM_USER_ERROR_MSG,
    _PROVIDER_NO_KEY_MSG,
    _PROVIDER_RATE_LIMIT_MSG,
    friendly_llm_error,
    looks_like_provider_error,
)


def test_friendly_llm_error_rerank_model():
    msg = friendly_llm_error(Exception("Model nvidia/llama-nemotron-rerank is rerank only"))
    assert msg == LLM_USER_ERROR_MSG


def test_friendly_llm_error_api_key():
    msg = friendly_llm_error(ValueError("No API key configured for provider 'openrouter'"))
    assert msg == _PROVIDER_NO_KEY_MSG


def test_friendly_llm_error_zai_insufficient_balance():
    raw = (
        "Error code: 429 - {'error': {'code': '1113', "
        "'message': 'Insufficient balance or no resource package. Please recharge.'}}"
    )
    msg = friendly_llm_error(Exception(raw))
    assert msg == _PROVIDER_RATE_LIMIT_MSG
    assert "429" not in msg
    assert "1113" not in msg


def test_looks_like_provider_error():
    assert looks_like_provider_error("Error code: 429 - {'error': {'code': '1113'}}")
    assert not looks_like_provider_error("Chào bạn! Tôi là Ario.")
