from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from src.db.engine import db_error_detail, db_is_ready, get_db, is_db_enabled
from src.models.auth_schemas import (
    AuthTokenResponse,
    AuthUserResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    VerifySignupRequest,
)
from src.services.auth_service import (
    AUTH_ACCOUNT_DISABLED,
    authenticate_user,
    create_access_token,
    decode_access_token,
    find_or_create_google_user,
    get_user_by_id,
    request_password_reset,
    request_signup_verification,
    reset_password_with_token,
    user_to_dict,
    verify_signup_and_register,
)
from src.services.google_oauth_service import (
    GoogleOAuthError,
    build_google_authorization_url,
    decode_oauth_state,
    exchange_google_code,
    frontend_oauth_callback_url,
    frontend_oauth_error_url,
    google_oauth_configured,
)

router = APIRouter(prefix="/auth", tags=["auth"])

FORGOT_PASSWORD_MESSAGE = (
    "If that email is registered, we sent a password reset link. "
    "The link expires in 30 minutes."
)
SIGNUP_CODE_SENT_MESSAGE = (
    "We sent a 6-digit verification code to your email. "
    "Enter it below to finish creating your account."
)
SIGNUP_CODE_DEV_MESSAGE = (
    "Development mode: no email was sent. "
    "Use the verification code shown on this page."
)
INVALID_CREDENTIALS = "Invalid email or password."
ACCOUNT_DISABLED_MESSAGE = "Your account has been disabled by an administrator."
DB_BUSY_MESSAGE = "Database is busy. Please wait a moment and try again."
LOGIN_TIMEOUT_SEC = 20.0


def _authenticate_user_for_login(email: str, password: str) -> tuple[dict | None, str | None]:
    with get_db() as db:
        user, auth_error = authenticate_user(db, email, password)
        if user is None:
            return None, auth_error
        return user_to_dict(user), auth_error


def _raise_db_busy(exc: OperationalError) -> None:
    raise HTTPException(status_code=503, detail=DB_BUSY_MESSAGE) from exc


def _require_db():
    if not db_is_ready():
        if not is_db_enabled():
            detail = "Authentication requires a database connection. Set DIRECT_DATABASE_URL."
        else:
            err = db_error_detail()
            detail = (
                f"Authentication requires a database connection. Database init failed: {err}"
                if err
                else "Authentication requires a database connection. Database is not ready."
            )
        raise HTTPException(
            status_code=503,
            detail=detail,
        )


def _get_db_session():
    _require_db()
    with get_db() as db:
        yield db


@router.post("/register/send-code", response_model=MessageResponse)
def register_send_code(body: RegisterRequest, db: Session = Depends(_get_db_session)):
    result = request_signup_verification(
        db,
        name=body.name,
        email=body.email,
        password=body.password,
        affiliation=body.affiliation,
    )
    if result.error:
        raise HTTPException(status_code=400, detail=result.error)

    response = MessageResponse(message=SIGNUP_CODE_SENT_MESSAGE)
    if result.dev_code:
        response.dev_verification_code = result.dev_code
        response.message = SIGNUP_CODE_DEV_MESSAGE
    return response


@router.post("/register/verify", response_model=AuthTokenResponse)
def register_verify(body: VerifySignupRequest, db: Session = Depends(_get_db_session)):
    user, error = verify_signup_and_register(db, email=body.email, code=body.code)
    if error or not user:
        raise HTTPException(status_code=400, detail=error or "Registration failed.")

    token = create_access_token(user_id=str(user.id), email=user.email)
    return AuthTokenResponse(
        access_token=token,
        user=AuthUserResponse(**user_to_dict(user)),
    )


@router.post("/register", response_model=AuthTokenResponse, deprecated=True)
def register(body: RegisterRequest, db: Session = Depends(_get_db_session)):
    raise HTTPException(
        status_code=400,
        detail="Email verification is required. Use /auth/register/send-code, then /auth/register/verify.",
    )


@router.post("/login", response_model=AuthTokenResponse)
async def login(body: LoginRequest):
    try:
        user_dict, auth_error = await asyncio.wait_for(
            asyncio.to_thread(_authenticate_user_for_login, body.email, body.password),
            timeout=LOGIN_TIMEOUT_SEC,
        )
    except TimeoutError as exc:
        raise HTTPException(status_code=503, detail=DB_BUSY_MESSAGE) from exc
    except OperationalError as exc:
        _raise_db_busy(exc)
    if auth_error == AUTH_ACCOUNT_DISABLED:
        raise HTTPException(
            status_code=403,
            detail={"code": AUTH_ACCOUNT_DISABLED, "message": ACCOUNT_DISABLED_MESSAGE},
        )
    if not user_dict:
        raise HTTPException(status_code=401, detail=INVALID_CREDENTIALS)

    token = create_access_token(
        user_id=user_dict["id"],
        email=user_dict["email"],
        remember=body.remember,
    )
    return AuthTokenResponse(
        access_token=token,
        user=AuthUserResponse(**user_dict),
    )


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(_get_db_session)):
    result = request_password_reset(db, body.email)
    if result.error:
        raise HTTPException(status_code=400, detail=result.error)

    response = MessageResponse(message=FORGOT_PASSWORD_MESSAGE)
    if result.dev_reset_url:
        response.dev_reset_url = result.dev_reset_url
    return response


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(_get_db_session)):
    error = reset_password_with_token(db, body.token, body.password)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return MessageResponse(message="Password updated. You can sign in with your new password.")


@router.get("/me", response_model=AuthUserResponse)
def me(
    authorization: str | None = Header(default=None),
    db: Session = Depends(_get_db_session),
):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated.")

    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    try:
        user = get_user_by_id(db, str(payload["sub"]))
    except OperationalError as exc:
        _raise_db_busy(exc)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    return AuthUserResponse(**user_to_dict(user))


def _safe_return_to(value: str | None) -> str:
    if not value or not value.startswith("/") or value.startswith("//"):
        return "/projects"
    return value


@router.get("/google/start")
async def google_start(
    return_to: str = Query(default="/projects"),
    remember: bool = Query(default=False),
):
    _require_db()
    if not google_oauth_configured():
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )
    try:
        url = build_google_authorization_url(
            return_to=_safe_return_to(return_to),
            remember=remember,
        )
    except GoogleOAuthError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return RedirectResponse(url=url, status_code=302)


@router.get("/google/callback")
async def google_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    db: Session = Depends(_get_db_session),
):
    if error:
        return RedirectResponse(
            url=frontend_oauth_error_url("Google sign-in was cancelled."),
            status_code=302,
        )
    if not code or not state:
        return RedirectResponse(
            url=frontend_oauth_error_url("Google sign-in failed. Please try again."),
            status_code=302,
        )

    state_payload = decode_oauth_state(state)
    if not state_payload:
        return RedirectResponse(
            url=frontend_oauth_error_url("Sign-in session expired. Please try again."),
            status_code=302,
        )

    try:
        profile = await exchange_google_code(code)
    except GoogleOAuthError as exc:
        return RedirectResponse(url=frontend_oauth_error_url(str(exc)), status_code=302)

    google_sub = str(profile.get("sub") or "")
    email = str(profile.get("email") or "")
    name = str(profile.get("name") or profile.get("given_name") or "")
    picture = str(profile.get("picture") or "")

    user, auth_error = find_or_create_google_user(
        db,
        google_sub=google_sub,
        email=email,
        full_name=name,
        avatar_url=picture or None,
    )
    if auth_error or not user:
        if auth_error == AUTH_ACCOUNT_DISABLED:
            return RedirectResponse(
                url=frontend_oauth_error_url(
                    ACCOUNT_DISABLED_MESSAGE,
                    code=AUTH_ACCOUNT_DISABLED,
                ),
                status_code=302,
            )
        return RedirectResponse(
            url=frontend_oauth_error_url(auth_error or "Could not sign in with Google."),
            status_code=302,
        )

    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        remember=state_payload["remember"],
    )
    return RedirectResponse(
        url=frontend_oauth_callback_url(
            access_token=token,
            return_to=state_payload["return_to"],
        ),
        status_code=302,
    )
