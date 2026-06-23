from unittest.mock import MagicMock, patch

import pytest

from src.config import get_settings
from src.services import email_service


@pytest.fixture(autouse=True)
def clear_settings_cache(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "")
    monkeypatch.setenv("SMTP_FROM", "")
    monkeypatch.setenv("SMTP_USER", "")
    monkeypatch.setenv("SMTP_PASSWORD", "")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_signup_email_dev_echo_without_smtp(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    get_settings.cache_clear()

    result = email_service.send_signup_verification_email(to_email="user@uni.edu", code="123456")

    assert result.ok
    assert result.dev_echo
    assert not result.delivered_via_smtp


def test_signup_email_requires_smtp_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SMTP_HOST", "")
    monkeypatch.setenv("SMTP_FROM", "")
    get_settings.cache_clear()

    result = email_service.send_signup_verification_email(to_email="user@uni.edu", code="123456")

    assert not result.ok
    assert result.error == "Email delivery is not configured."


@patch("src.services.email_service.smtplib.SMTP")
def test_signup_email_sends_via_smtp(mock_smtp_ctor, monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_FROM", "noreply@arionear.test")
    monkeypatch.setenv("SMTP_USER", "smtp-user")
    monkeypatch.setenv("SMTP_PASSWORD", "smtp-pass")
    get_settings.cache_clear()

    server = MagicMock()
    mock_smtp_ctor.return_value.__enter__.return_value = server

    result = email_service.send_signup_verification_email(to_email="user@uni.edu", code="654321")

    assert result.ok
    assert result.delivered_via_smtp
    assert not result.dev_echo
    server.starttls.assert_called_once()
    server.login.assert_called_once_with("smtp-user", "smtp-pass")
    server.send_message.assert_called_once()


@patch("src.services.email_service.smtplib.SMTP")
def test_signup_email_no_dev_fallback_when_smtp_fails(mock_smtp_ctor, monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_FROM", "noreply@arionear.test")
    monkeypatch.setenv("SMTP_USER", "smtp-user")
    monkeypatch.setenv("SMTP_PASSWORD", "smtp-pass")
    get_settings.cache_clear()

    server = MagicMock()
    server.login.side_effect = OSError("auth failed")
    mock_smtp_ctor.return_value.__enter__.return_value = server

    result = email_service.send_signup_verification_email(to_email="user@uni.edu", code="123456")

    assert not result.ok
    assert not result.dev_echo


@patch("src.services.email_service.smtplib.SMTP_SSL")
def test_password_reset_email_uses_ssl_when_configured(mock_ssl_ctor, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_PORT", "465")
    monkeypatch.setenv("SMTP_FROM", "noreply@arionear.test")
    monkeypatch.setenv("SMTP_USE_SSL", "true")
    monkeypatch.setenv("SMTP_USE_TLS", "false")
    get_settings.cache_clear()

    server = MagicMock()
    mock_ssl_ctor.return_value.__enter__.return_value = server

    result = email_service.send_password_reset_email(
        to_email="user@uni.edu",
        reset_url="http://localhost:8080/reset-password?token=abc",
    )

    assert result.ok
    assert result.delivered_via_smtp
    mock_ssl_ctor.assert_called_once()
    server.send_message.assert_called_once()
