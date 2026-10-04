from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
import jwt

from src.config import get_settings

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
OAUTH_STATE_TTL_MINUTES = 10


class GoogleOAuthError(Exception):
    pass


def google_oauth_configured() -> bool:
    settings = get_settings()
    return bool(settings.google_client_id.strip() and settings.google_client_secret.strip())


def google_redirect_uri() -> str:
    settings = get_settings()
    explicit = settings.google_oauth_redirect_uri.strip()
    if explicit:
        return explicit
    base = settings.backend_base_url.rstrip("/")
    return f"{base}/api/v1/auth/google/callback"


def create_oauth_state(*, return_to: str, remember: bool) -> str:
    settings = get_settings()
    expire = datetime.now(UTC) + timedelta(minutes=OAUTH_STATE_TTL_MINUTES)
    payload = {
        "return_to": return_to,
        "remember": remember,
        "nonce": secrets.token_urlsafe(12),
        "exp": expire,
    }
    return jwt.encode(payload, settings.auth_secret_key, algorithm="HS256")


def decode_oauth_state(state: str) -> dict | None:
    settings = get_settings()
    try:
        payload = jwt.decode(state, settings.auth_secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return_to = payload.get("return_to")
    if not isinstance(return_to, str) or not return_to.startswith("/") or return_to.startswith("//"):
        return None
    return {
        "return_to": return_to,
        "remember": bool(payload.get("remember")),
    }


def build_google_authorization_url(*, return_to: str, remember: bool) -> str:
    settings = get_settings()
    if not google_oauth_configured():
        raise GoogleOAuthError("Google sign-in is not configured.")

    state = create_oauth_state(return_to=return_to, remember=remember)
    params = {
        "client_id": settings.google_client_id.strip(),
        "redirect_uri": google_redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_google_code(code: str) -> dict:
    settings = get_settings()
    if not google_oauth_configured():
        raise GoogleOAuthError("Google sign-in is not configured.")

    payload = {
        "code": code,
        "client_id": settings.google_client_id.strip(),
        "client_secret": settings.google_client_secret.strip(),
        "redirect_uri": google_redirect_uri(),
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        token_res = await client.post(GOOGLE_TOKEN_URL, data=payload)
        if token_res.status_code != 200:
            detail = ""
            try:
                body = token_res.json()
                if isinstance(body, dict):
                    detail = str(body.get("error_description") or body.get("error") or "").strip()
            except Exception:
                detail = ""
            if detail:
                raise GoogleOAuthError(f"Could not complete Google sign-in ({detail}).")
            raise GoogleOAuthError("Could not complete Google sign-in.")
        token_data = token_res.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise GoogleOAuthError("Google did not return an access token.")

        user_res = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_res.status_code != 200:
            raise GoogleOAuthError("Could not read your Google profile.")
        return user_res.json()


def frontend_oauth_callback_url(**params: str) -> str:
    settings = get_settings()
    base = f"{settings.frontend_base_url.rstrip('/')}/auth/google/callback"
    return f"{base}?{urlencode(params)}"


def frontend_oauth_error_url(message: str, *, code: str | None = None) -> str:
    params: dict[str, str] = {"error": message}
    if code:
        params["error_code"] = code
    return frontend_oauth_callback_url(**params)
