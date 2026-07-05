from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session, load_only

from src.db.models import AiSession, Paper, PaperStatus, TaskType


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _ensure_ai_session(db: Session, paper: Paper) -> AiSession:
    if paper.ai_sessions:
        return paper.ai_sessions[-1]
    ai_session = AiSession(paper_id=paper.id, task_type=TaskType.CHAT)
    db.add(ai_session)
    db.flush()
    paper.ai_sessions.append(ai_session)
    return ai_session


def _merge_files(existing: list[dict], incoming: list[dict]) -> list[dict]:
    by_path: dict[str, dict] = {}
    for item in existing:
        path = str(item.get("path") or "").strip()
        if path:
            by_path[path] = dict(item)
    for item in incoming:
        path = str(item.get("path") or "").strip()
        if path:
            by_path[path] = dict(item)
    return list(by_path.values())


def _merge_assets(existing: list[dict], incoming: list[dict]) -> list[dict]:
    merged = [dict(item) for item in existing]
    for asset in incoming:
        name = str(asset.get("name") or "").replace("\\", "/").replace("./", "").strip()
        if not name:
            continue
        idx = next(
            (
                i
                for i, item in enumerate(merged)
                if str(item.get("name", "")).replace("\\", "/").replace("./", "").strip().lower()
                == name.lower()
            ),
            -1,
        )
        row = {**asset, "name": name}
        if idx >= 0:
            merged[idx] = row
        else:
            merged.append(row)
    return merged


def list_papers(db: Session, user_id: uuid.UUID) -> list[Paper]:
    """List papers without loading heavy raw_latex / metadata columns."""
    return (
        db.query(Paper)
        .options(load_only(Paper.id, Paper.title, Paper.created_at, Paper.updated_at))
        .filter(Paper.user_id == user_id)
        .order_by(Paper.updated_at.desc())
        .all()
    )


def get_paper(db: Session, user_id: uuid.UUID, paper_id: uuid.UUID) -> Paper | None:
    return (
        db.query(Paper)
        .filter(Paper.id == paper_id, Paper.user_id == user_id)
        .one_or_none()
    )


def create_paper(
    db: Session,
    user_id: uuid.UUID,
    *,
    name: str = "Untitled",
    latex: str = "",
    metadata: dict | None = None,
) -> Paper:
    paper = Paper(
        user_id=user_id,
        title=name,
        raw_latex=latex,
        metadata_=metadata or {},
        status=PaperStatus.DRAFT,
    )
    db.add(paper)
    db.flush()
    _ensure_ai_session(db, paper)
    return paper


def update_paper(
    db: Session,
    user_id: uuid.UUID,
    paper_id: uuid.UUID,
    *,
    name: str | None = None,
    latex: str | None = None,
    metadata: dict | None = None,
    assets: list[dict] | None = None,
) -> Paper | None:
    paper = get_paper(db, user_id, paper_id)
    if not paper:
        return None

    if name is not None:
        paper.title = name
    if latex is not None:
        paper.raw_latex = latex
    if metadata is not None:
        merged = dict(paper.metadata_ or {})
        incoming_files = metadata.get("files")
        if isinstance(incoming_files, list) and incoming_files:
            merged["files"] = _merge_files(merged.get("files") or [], incoming_files)
            rest = {k: v for k, v in metadata.items() if k != "files"}
            merged.update(rest)
        else:
            merged.update(metadata)
        paper.metadata_ = merged
    if assets is not None:
        current = dict(paper.metadata_ or {})
        current["assets"] = _merge_assets(current.get("assets") or [], assets)
        paper.metadata_ = current

    paper.updated_at = _utcnow()
    db.flush()
    return paper


def delete_paper(db: Session, user_id: uuid.UUID, paper_id: uuid.UUID) -> bool:
    paper = get_paper(db, user_id, paper_id)
    if not paper:
        return False
    db.delete(paper)
    db.flush()
    return True
