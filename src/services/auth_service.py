from __future__ import annotations

import hashlib
import re
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from src.config import get_settings
from src.db.models import PasswordResetToken, SignupVerification, User, UserRole
from src.services.email_service import send_signup_verification_email
from src.services.profile_service import apply_google_avatar_if_empty

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
    provider = "google" if user.google_sub else "email"
    return {
        "id": str(user.id),
        "name": user.full_name,
        "email": user.email,
        "affiliation": user.institution,
        "provider": provider,
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


def _hash_verification_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _generate_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _validate_signup_fields(
    *,
    name: str,
    email: str,
    password: str,
) -> tuple[str, str, str | None]:
    full_name = name.strip()
    normalized = normalize_email(email)
    if not full_name:
        return normalized, full_name, "Please enter your full name."
    if not validate_email(normalized):
        return normalized, full_name, "Please enter a valid email address."
    pw_error = validate_password_strength(password)
    if pw_error:
        return normalized, full_name, pw_error
    return normalized, full_name, None


def request_signup_verification(
    db: Session,
    *,
    name: str,
    email: str,
    password: str,
    affiliation: str | None = None,
) -> tuple[str | None, str | None]:
    """Send a signup verification code. Returns (dev_code, error)."""
    normalized, full_name, field_error = _validate_signup_fields(
        name=name,
        email=email,
        password=password,
    )
    if field_error:
        return None, field_error

    existing = db.query(User).filter(User.email == normalized).first()
    if existing:
        return None, "An account with this email already exists."

    settings = get_settings()
    now = datetime.now(UTC)
    code = _generate_verification_code()

    (
        db.query(SignupVerification)
        .filter(
            SignupVerification.email == normalized,
            SignupVerification.used_at.is_(None),
        )
        .update({SignupVerification.used_at: now}, synchronize_session=False)
    )

    record = SignupVerification(
        email=normalized,
        full_name=full_name,
        institution=affiliation.strip() if affiliation else None,
        password_hash=hash_password(password),
        code_hash=_hash_verification_code(code),
        expires_at=now + timedelta(minutes=settings.auth_signup_code_expire_minutes),
    )
    db.add(record)
    db.flush()

    sent, send_error = send_signup_verification_email(to_email=normalized, code=code)
    if not sent:
        return None, send_error or "Could not send verification email."

    dev_code = code if settings.app_env == "development" else None
    return dev_code, None


def verify_signup_and_register(
    db: Session,
    *,
    email: str,
    code: str,
) -> tuple[User | None, str | None]:
    normalized = normalize_email(email)
    if not validate_email(normalized):
        return None, "Please enter a valid email address."

    cleaned = code.strip()
    if not cleaned.isdigit() or len(cleaned) != 6:
        return None, "Please enter the 6-digit verification code."

    settings = get_settings()
    now = datetime.now(UTC)
    record = (
        db.query(SignupVerification)
        .filter(
            SignupVerification.email == normalized,
            SignupVerification.used_at.is_(None),
            SignupVerification.expires_at > now,
        )
        .order_by(SignupVerification.created_at.desc())
        .first()
    )
    if not record:
        return None, "Verification code is invalid or has expired."

    if record.attempt_count >= settings.auth_signup_max_attempts:
        return None, "Too many failed attempts. Request a new code."

    if record.code_hash != _hash_verification_code(cleaned):
        record.attempt_count += 1
        db.flush()
        return None, "Verification code is incorrect."

    existing = db.query(User).filter(User.email == normalized).first()
    if existing:
        record.used_at = now
        db.flush()
        return None, "An account with this email already exists."

    user = User(
        email=normalized,
        full_name=record.full_name,
        institution=record.institution,
        password_hash=record.password_hash,
        role=UserRole.RESEARCHER,
        is_active=True,
        last_active_at=now,
    )
    db.add(user)
    record.used_at = now
    db.flush()
    return user, None


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


def find_or_create_google_user(
    db: Session,
    *,
    google_sub: str,
    email: str,
    full_name: str,
    avatar_url: str | None = None,
) -> tuple[User | None, str | None]:
    sub = google_sub.strip()
    normalized = normalize_email(email)
    name = full_name.strip() or normalized.split("@", 1)[0]

    if not sub:
        return None, "Google profile is missing a user id."
    if not validate_email(normalized):
        return None, "Google account email is not valid."

    by_sub = db.query(User).filter(User.google_sub == sub, User.is_active.is_(True)).first()
    if by_sub:
        apply_google_avatar_if_empty(by_sub, avatar_url)
        by_sub.last_active_at = datetime.now(UTC)
        db.flush()
        return by_sub, None

    by_email = db.query(User).filter(User.email == normalized).first()
    if by_email:
        if not by_email.is_active:
            return None, "This account is inactive. Contact support."
        if by_email.google_sub and by_email.google_sub != sub:
            return None, "This email is linked to a different Google account."
        by_email.google_sub = sub
        if name and (not by_email.full_name or by_email.full_name == by_email.email):
            by_email.full_name = name
        apply_google_avatar_if_empty(by_email, avatar_url)
        by_email.last_active_at = datetime.now(UTC)
        db.flush()
        return by_email, None

    settings: dict[str, str] = {}
    if avatar_url and avatar_url.strip():
        settings["avatar_url"] = avatar_url.strip()[:500]

    user = User(
        email=normalized,
        full_name=name,
        google_sub=sub,
        password_hash=None,
        profile_settings=settings,
        role=UserRole.RESEARCHER,
        is_active=True,
        last_active_at=datetime.now(UTC),
    )
    db.add(user)
    db.flush()
    return user, None
