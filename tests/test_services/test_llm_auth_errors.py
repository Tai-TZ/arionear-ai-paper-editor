from src.services.llm_auth_errors import format_provider_test_failure, is_google_project_denied


def test_is_google_project_denied():
    msg = "403 PERMISSION_DENIED. Your project has been denied access."
    assert is_google_project_denied(msg)


def test_format_google_project_denied():
    msg = format_provider_test_failure(
        "google",
        "gemini-3.1-flash-lite",
        Exception("403 PERMISSION_DENIED denied access"),
    )
    assert "Google đã chặn project" in msg
    assert "gemini-3.1-flash-lite" in msg
