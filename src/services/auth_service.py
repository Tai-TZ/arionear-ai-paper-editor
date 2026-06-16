from __future__ import annotations

import hashlib
import re
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from src.config import get_settings
from src.db.models import PasswordResetToken, User, UserRole

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_email(email: str) -> bool:
    return bool(email and EMAIL_RE.match(email))


def validate_password_strength(password: str) -> str | None:
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if len(password.encode("utf-8")) > 72:
        return "Password must be at most 72 characters."
    if not re.search(r"[A-Za-z]", password):
        return "Password must include at least one letter."
    if not re.search(r"\d", password):
        return "Password must include at least one number."
    return None


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(*, user_id: str, email: str, remember: bool = False) -> str:
    settings = get_settings()
    hours = settings.auth_token_remember_days * 24 if remember else settings.auth_token_expire_hours
    expire = datetime.now(UTC) + timedelta(hours=hours)
    payload = {"sub": user_id, "email": email, "exp": expire}
    return jwt.encode(payload, settings.auth_secret_key, algorithm="HS256")


def decode_access_token(token: str) -> dict | None:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.auth_secret_key, algorithms=["HS256"])
    except JWTError:
        return None


def user_to_dict(user: User) -> dict:
    return {
        "id": str(user.id),
        "name": user.full_name,
        "email": user.email,
        "affiliation": user.institution,
        "provider": "email",
    }


def register_user(
    db: Session,
    *,
    name: str,
    email: str,
    password: str,
    affiliation: str | None = None,
) -> tuple[User | None, str | None]:
    full_name = name.strip()
    normalized = normalize_email(email)
    if not full_name:
        return None, "Please enter your full name."
    if not validate_email(normalized):
        return None, "Please enter a valid email address."
    pw_error = validate_password_strength(password)
    if pw_error:
        return None, pw_error

    existing = db.query(User).filter(User.email == normalized).first()
    if existing:
        return None, "An account with this email already exists."

    user = User(
        email=normalized,
        full_name=full_name,
        institution=affiliation.strip() if affiliation else None,
        password_hash=hash_password(password),
        role=UserRole.RESEARCHER,
        is_active=True,
        last_active_at=datetime.now(UTC),
    )
    db.add(user)
    db.flush()
    return user, None


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    normalized = normalize_email(email)
    if not normalized or not password:
        return None
    user = db.query(User).filter(User.email == normalized, User.is_active.is_(True)).first()
    if not user or not verify_password(password, user.password_hash):
        return None
    user.last_active_at = datetime.now(UTC)
    db.flush()
    return user


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def request_password_reset(db: Session, email: str) -> tuple[str | None, str | None]:
    """Returns (dev_reset_url, error). Always succeeds from caller perspective if no error."""
    normalized = normalize_email(email)
    if not validate_email(normalized):
        return None, "Please enter a valid email address."

    user = db.query(User).filter(User.email == normalized, User.is_active.is_(True)).first()
    if not user:
        return None, None

    raw_token = secrets.token_urlsafe(32)
    settings = get_settings()
    record = PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_reset_token(raw_token),
        expires_at=datetime.now(UTC) + timedelta(minutes=settings.auth_reset_expire_minutes),
    )
    db.add(record)
    db.flush()

    dev_url = f"{settings.frontend_base_url.rstrip('/')}/reset-password?token={raw_token}"
    return dev_url, None


def reset_password_with_token(db: Session, token: str, new_password: str) -> str | None:
    pw_error = validate_password_strength(new_password)
    if pw_error:
        return pw_error
    if not token.strip():
        return "Reset link is invalid or has expired."

    token_hash = _hash_reset_token(token.strip())
    now = datetime.now(UTC)
    record = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .first()
    )
    if not record:
        return "Reset link is invalid or has expired."

    user = db.query(User).filter(User.id == record.user_id, User.is_active.is_(True)).first()
    if not user:
        return "Reset link is invalid or has expired."

    user.password_hash = hash_password(new_password)
    user.last_active_at = now
    record.used_at = now
    db.flush()
    return None


def get_user_by_id(db: Session, user_id: str) -> User | None:
    try:
        import uuid

        uid = uuid.UUID(user_id)
    except ValueError:
        return None
    return db.query(User).filter(User.id == uid, User.is_active.is_(True)).first()
