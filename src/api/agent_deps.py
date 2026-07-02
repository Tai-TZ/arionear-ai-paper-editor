from __future__ import annotations

import uuid

from fastapi import Header, HTTPException

from src.db.engine import db_is_ready, get_db
from src.services.auth_service import decode_access_token, get_user_by_id
from src.services.paper_service import get_paper


def get_agent_user_id(authorization: str | None = Header(default=None)) -> uuid.UUID | None:
    """Return authenticated user id when DB auth is enabled; else None (in-memory dev/test)."""
    if not db_is_ready():
        return None
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated.")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    with get_db() as db:
        user = get_user_by_id(db, str(payload["sub"]))
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired session.")
        return user.id


def assert_paper_session_access(session_id: str, user_id: uuid.UUID | None) -> None:
    """Ensure session_id maps to a paper owned by user (no-op when DB auth is disabled)."""
    if not db_is_ready():
        return
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    if not session_id:
        return
    try:
        paper_id = uuid.UUID(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid session id") from exc
    with get_db() as db:
        paper = get_paper(db, user_id, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Session not found")
