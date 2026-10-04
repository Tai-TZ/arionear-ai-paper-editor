from __future__ import annotations

import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

from src.config import Settings, get_settings

logger = logging.getLogger(__name__)


def _smtp_settings() -> Settings:
    """Read SMTP settings on each send so .env edits apply without restarting the server."""
    return Settings()


@dataclass(frozen=True)
class EmailDeliveryResult:
    ok: bool
    error: str | None = None
    delivered_via_smtp: bool = False
    dev_echo: bool = False


def _dev_email_echo_allowed() -> bool:
    return get_settings().app_env in ("development", "test")


def smtp_configured() -> bool:
    settings = _smtp_settings()
    return bool(settings.smtp_host.strip() and settings.smtp_from.strip())


def _smtp_auth_error_message(exc: OSError) -> str:
    detail = str(exc)
    if "535" in detail or "BadCredentials" in detail:
        return (
            "Gmail rejected SMTP login (535). Regenerate an App Password at "
            "https://myaccount.google.com/apppasswords, update SMTP_PASSWORD in .env, "
            "then restart uvicorn if the error persists."
        )
    return f"Could not send email: {exc}"


def _dispatch_smtp(*, subject: str, to_email: str, plain_body: str, html_body: str) -> EmailDeliveryResult:
    settings = _smtp_settings()
    if not smtp_configured():
        return EmailDeliveryResult(ok=False, error="Email delivery is not configured.")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from.strip()
    msg["To"] = to_email
    msg.set_content(plain_body)
    msg.add_alternative(html_body, subtype="html")

    try:
        host = settings.smtp_host.strip()
        port = settings.smtp_port
        user = settings.smtp_user.strip()
        password = settings.smtp_password.replace(" ", "")

        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(host, port, timeout=15) as server:
                if user and password:
                    server.login(user, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as server:
                if settings.smtp_use_tls:
                    server.starttls()
                if user and password:
                    server.login(user, password)
                server.send_message(msg)
        logger.info("SMTP email sent to %s (subject: %s)", to_email, subject)
        return EmailDeliveryResult(ok=True, delivered_via_smtp=True)
    except OSError as exc:
        logger.exception("Failed to send email to %s", to_email)
        return EmailDeliveryResult(ok=False, error=_smtp_auth_error_message(exc))


def _deliver_auth_email(
    *,
    to_email: str,
    subject: str,
    plain_body: str,
    html_body: str,
    dev_log_label: str,
    dev_log_value: str,
) -> EmailDeliveryResult:
    """Send via SMTP when configured; otherwise echo to logs in dev/test only."""
    if smtp_configured():
        return _dispatch_smtp(
            subject=subject,
            to_email=to_email,
            plain_body=plain_body,
            html_body=html_body,
        )

    if _dev_email_echo_allowed():
        logger.info("[auth] Dev %s for %s: %s", dev_log_label, to_email, dev_log_value)
        return EmailDeliveryResult(ok=True, dev_echo=True)

    return EmailDeliveryResult(ok=False, error="Email delivery is not configured.")


def _verification_html(*, code: str, expire_minutes: int) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f6f3ee;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:480px;background:#fff;border:1px solid #d4cfc6;" cellpadding="0" cellspacing="0">
        <tr><td style="padding:28px 32px 8px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#8b0000;">Arionear</p>
          <h1 style="margin:12px 0 0;font-size:22px;font-weight:600;">Verify your email</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 24px;font-size:15px;line-height:1.6;color:#333;">
          <p style="margin:0 0 16px;">Enter this code to finish creating your account:</p>
          <p style="margin:0 0 20px;font-size:28px;letter-spacing:0.35em;font-weight:700;font-family:ui-monospace,monospace;">{code}</p>
          <p style="margin:0;color:#666;font-size:13px;">This code expires in {expire_minutes} minutes. If you did not request this, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _password_reset_html(*, reset_url: str, expire_minutes: int) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f6f3ee;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:480px;background:#fff;border:1px solid #d4cfc6;" cellpadding="0" cellspacing="0">
        <tr><td style="padding:28px 32px 8px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#8b0000;">Arionear</p>
          <h1 style="margin:12px 0 0;font-size:22px;font-weight:600;">Reset your password</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 24px;font-size:15px;line-height:1.6;color:#333;">
          <p style="margin:0 0 20px;">We received a request to reset your password. Click the button below — the link works once and expires in {expire_minutes} minutes.</p>
          <p style="margin:0 0 20px;"><a href="{reset_url}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">Set new password</a></p>
          <p style="margin:0;color:#666;font-size:13px;">If you did not request this, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def send_signup_verification_email(*, to_email: str, code: str) -> EmailDeliveryResult:
    """Send a 6-digit signup verification code."""
    settings = get_settings()
    expire = settings.auth_signup_code_expire_minutes
    subject = "Your Arionear verification code"
    plain_body = (
        f"Your verification code is: {code}\n\n"
        f"This code expires in {expire} minutes.\n\n"
        "If you did not request this, you can ignore this email."
    )
    html_body = _verification_html(code=code, expire_minutes=expire)
    return _deliver_auth_email(
        to_email=to_email,
        subject=subject,
        plain_body=plain_body,
        html_body=html_body,
        dev_log_label="signup verification code",
        dev_log_value=code,
    )


def send_password_reset_email(*, to_email: str, reset_url: str) -> EmailDeliveryResult:
    """Send a one-time password reset link."""
    settings = get_settings()
    expire = settings.auth_reset_expire_minutes
    subject = "Reset your Arionear password"
    plain_body = (
        "We received a request to reset your Arionear password.\n\n"
        f"Open this link to set a new password (expires in {expire} minutes):\n"
        f"{reset_url}\n\n"
        "If you did not request this, you can ignore this email."
    )
    html_body = _password_reset_html(reset_url=reset_url, expire_minutes=expire)
    return _deliver_auth_email(
        to_email=to_email,
        subject=subject,
        plain_body=plain_body,
        html_body=html_body,
        dev_log_label="password reset link",
        dev_log_value=reset_url,
    )
