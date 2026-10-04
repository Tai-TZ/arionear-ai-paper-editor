from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from src.db.models import Paper
from src.services.paper_service import get_paper, update_paper
from src.services.share_room import clear_share_room


def _share_meta(metadata: dict[str, Any] | None) -> dict[str, Any]:
    raw = metadata or {}
    share = raw.get("share")
    return share if isinstance(share, dict) else {}


def get_share_token(metadata: dict[str, Any] | None) -> str | None:
    share = _share_meta(metadata)
    token = share.get("token")
    if not isinstance(token, str) or not token.strip():
        return None
    if share.get("enabled") is False:
        return None
    return token.strip()


def enable_paper_share(db: Session, user_id: uuid.UUID, paper_id: uuid.UUID) -> dict[str, str]:
    paper = get_paper(db, user_id, paper_id)
    if not paper:
        raise LookupError("Paper not found.")

    metadata = dict(paper.metadata_ or {})
    share = dict(_share_meta(metadata))
    token = share.get("token")
    created_new = False
    if not isinstance(token, str) or not token.strip():
        token = secrets.token_urlsafe(24)
        created_new = True
    share["token"] = token
    share["enabled"] = True
    if created_new or not share.get("created_at"):
        share["created_at"] = datetime.now(UTC).isoformat()
    metadata["share"] = share
    update_paper(db, user_id, paper_id, metadata=metadata)
    return {"token": token}


def disable_paper_share(db: Session, user_id: uuid.UUID, paper_id: uuid.UUID) -> None:
    paper = get_paper(db, user_id, paper_id)
    if not paper:
        raise LookupError("Paper not found.")

    metadata = dict(paper.metadata_ or {})
    share = dict(_share_meta(metadata))
    token = share.get("token")
    if isinstance(token, str) and token.strip():
        clear_share_room(token.strip())
    share["enabled"] = False
    metadata["share"] = share
    update_paper(db, user_id, paper_id, metadata=metadata)


def get_shared_paper(db: Session, token: str) -> Paper | None:
    if not token:
        return None
    # Filter in the database (JSONB on Postgres, JSON1 on SQLite) instead of loading every paper.
    paper = db.query(Paper).filter(Paper.metadata_["share"]["token"].as_string() == token).first()
    if paper is None or get_share_token(paper.metadata_) != token:
        return None  # e.g. the link was disabled
    return paper


def get_share_status(db: Session, user_id: uuid.UUID, paper_id: uuid.UUID) -> dict[str, Any]:
    paper = get_paper(db, user_id, paper_id)
    if not paper:
        raise LookupError("Paper not found.")
    share = _share_meta(paper.metadata_)
    token = get_share_token(paper.metadata_)
    return {
        "enabled": bool(token),
        "token": token,
        "created_at": share.get("created_at"),
    }
