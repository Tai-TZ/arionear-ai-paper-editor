from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from src.api.deps import get_admin_user, get_current_user, get_db_session
from src.db.models import User
from src.models.template_schemas import (
    OpenTemplateResponse,
    PaperTemplateCreateRequest,
    PaperTemplateDetail,
    PaperTemplateListResponse,
    PaperTemplateUpdateRequest,
)
from src.services.template_store import (
    create_template,
    delete_template,
    ensure_template_seed,
    get_template,
    get_template_pdf_path,
    get_template_preview_path,
    list_templates,
    open_template_as_paper,
    update_template,
    upload_template_pdf,
    upload_template_preview,
)

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=PaperTemplateListResponse)
def list_paper_templates(query: str | None = None, tag: str | None = None):
    ensure_template_seed()
    items = list_templates(query=query, tag=tag)
    return PaperTemplateListResponse(items=items, total=len(items), query=query)


@router.get("/{template_id}", response_model=PaperTemplateDetail)
def get_paper_template(template_id: str):
    ensure_template_seed()
    return get_template(template_id)


@router.get("/{template_id}/preview")
def get_paper_template_preview(template_id: str):
    ensure_template_seed()
    path, media_type = get_template_preview_path(template_id)
    return FileResponse(path, media_type=media_type)


@router.get("/{template_id}/pdf")
def get_paper_template_pdf(template_id: str):
    ensure_template_seed()
    path, media_type = get_template_pdf_path(template_id)
    return FileResponse(path, media_type=media_type, filename=f"{template_id}-sample.pdf")


@router.post("/{template_id}/open", response_model=OpenTemplateResponse)
def open_paper_template(
    template_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    ensure_template_seed()
    paper_id, name = open_template_as_paper(db, user.id, template_id)
    db.commit()
    return OpenTemplateResponse(paper_id=paper_id, name=name, template_id=template_id)


# ─── Admin ───────────────────────────────────────────────────────────────────


@router.post("", response_model=PaperTemplateDetail)
def admin_create_template(
    body: PaperTemplateCreateRequest,
    _admin: User = Depends(get_admin_user),
):
    return create_template(body)


@router.patch("/{template_id}", response_model=PaperTemplateDetail)
def admin_update_template(
    template_id: str,
    body: PaperTemplateUpdateRequest,
    _admin: User = Depends(get_admin_user),
):
    return update_template(template_id, body)


@router.delete("/{template_id}", status_code=204)
def admin_delete_template(
    template_id: str,
    _admin: User = Depends(get_admin_user),
):
    delete_template(template_id)


@router.post("/{template_id}/preview", response_model=PaperTemplateDetail)
async def admin_upload_template_preview(
    template_id: str,
    file: UploadFile = File(...),
    _admin: User = Depends(get_admin_user),
):
    return await upload_template_preview(template_id, file)


@router.post("/{template_id}/pdf", response_model=PaperTemplateDetail)
async def admin_upload_template_pdf(
    template_id: str,
    file: UploadFile = File(...),
    _admin: User = Depends(get_admin_user),
):
    return await upload_template_pdf(template_id, file)
