from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from src.config import get_settings
from src.db.engine import db_is_ready, get_db
from src.models.auth_schemas import (
    AuthTokenResponse,
    AuthUserResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
)
from src.services.auth_service import (
    authenticate_user,
    create_access_token,
    decode_access_token,
    get_user_by_id,
    register_user,
    request_password_reset,
    reset_password_with_token,
    user_to_dict,
)

router = APIRouter(prefix="/auth", tags=["auth"])

FORGOT_PASSWORD_MESSAGE = (
    "If that email is registered, we sent a password reset link. "
    "The link expires in 30 minutes."
)
INVALID_CREDENTIALS = "Invalid email or password."


def _require_db():
    if not db_is_ready():
        raise HTTPException(
            status_code=503,
            detail="Authentication requires a database connection. Set DIRECT_DATABASE_URL.",
        )


def _get_db_session():
    _require_db()
    with get_db() as db:
        yield db


@router.post("/register", response_model=AuthTokenResponse)
async def register(body: RegisterRequest, db: Session = Depends(_get_db_session)):
    user, error = register_user(
        db,
        name=body.name,
        email=body.email,
        password=body.password,
        affiliation=body.affiliation,
    )
    if error or not user:
        raise HTTPException(status_code=400, detail=error or "Registration failed.")

    token = create_access_token(user_id=str(user.id), email=user.email)
    return AuthTokenResponse(
        access_token=token,
        user=AuthUserResponse(**user_to_dict(user)),
    )


@router.post("/login", response_model=AuthTokenResponse)
async def login(body: LoginRequest, db: Session = Depends(_get_db_session)):
    user = authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail=INVALID_CREDENTIALS)

    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        remember=body.remember,
    )
    return AuthTokenResponse(
        access_token=token,
        user=AuthUserResponse(**user_to_dict(user)),
    )


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(_get_db_session)):
    dev_url, error = request_password_reset(db, body.email)
    if error:
        raise HTTPException(status_code=400, detail=error)

    settings = get_settings()
    response = MessageResponse(message=FORGOT_PASSWORD_MESSAGE)
    if settings.app_env == "development" and dev_url:
        response.dev_reset_url = dev_url
        print(f"[auth] Dev reset link: {dev_url}")
    return response


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(body: ResetPasswordRequest, db: Session = Depends(_get_db_session)):
    error = reset_password_with_token(db, body.token, body.password)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return MessageResponse(message="Password updated. You can sign in with your new password.")


@router.get("/me", response_model=AuthUserResponse)
async def me(
    authorization: str | None = Header(default=None),
    db: Session = Depends(_get_db_session),
):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated.")

    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    user = get_user_by_id(db, str(payload["sub"]))
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    return AuthUserResponse(**user_to_dict(user))
