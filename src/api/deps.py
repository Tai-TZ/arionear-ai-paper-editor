from __future__ import annotations

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from src.db.engine import db_error_detail, db_is_ready, get_db, is_db_enabled
from src.db.models import User
from src.services.auth_service import decode_access_token, get_user_by_id, is_god_admin


def _require_db() -> None:
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


def get_db_session():
    _require_db()
    with get_db() as db:
        yield db


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated.")

    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    user = get_user_by_id(db, str(payload["sub"]))
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    return user


def _user_from_bearer(authorization: str | None, db: Session) -> User | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        return None
    return get_user_by_id(db, str(payload["sub"]))


def get_admin_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
) -> User:
    user = _user_from_bearer(authorization, db)

    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    if not is_god_admin(user):
        raise HTTPException(status_code=403, detail="God admin access required.")
    return user
