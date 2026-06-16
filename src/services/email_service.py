from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from src.config import get_settings

logger = logging.getLogger(__name__)


def smtp_configured() -> bool:
    settings = get_settings()
    return bool(settings.smtp_host.strip() and settings.smtp_from.strip())


def send_signup_verification_email(*, to_email: str, code: str) -> tuple[bool, str | None]:
    """Send a 6-digit signup verification code. Returns (sent, error)."""
    settings = get_settings()
    subject = "Your Arionear verification code"
    body = (
        f"Your verification code is: {code}\n\n"
        f"This code expires in {settings.auth_signup_code_expire_minutes} minutes.\n\n"
        "If you did not request this, you can ignore this email."
    )

    if not smtp_configured():
        if settings.app_env == "development":
            logger.info("[auth] Dev signup code for %s: %s", to_email, code)
            print(f"[auth] Dev signup verification code for {to_email}: {code}")
            return True, None
        return False, "Email delivery is not configured."

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from.strip()
    msg["To"] = to_email
    msg.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host.strip(), settings.smtp_port, timeout=15) as server:
            if settings.smtp_use_tls:
                server.starttls()
            user = settings.smtp_user.strip()
            password = settings.smtp_password
            if user and password:
                server.login(user, password)
            server.send_message(msg)
        return True, None
    except OSError as exc:
        logger.exception("Failed to send signup verification email to %s", to_email)
        return False, f"Could not send verification email: {exc}"
