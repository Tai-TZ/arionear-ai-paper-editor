from src.services.llm_errors import friendly_llm_error


def test_friendly_llm_error_rerank_model():
    msg = friendly_llm_error(Exception("Model nvidia/llama-nemotron-rerank is rerank only"))
    assert "rerank" in msg.lower()


def test_friendly_llm_error_api_key():
    msg = friendly_llm_error(ValueError("No API key configured for provider 'openrouter'"))
    assert "api key" in msg.lower() or "OPENROUTER" in msg
