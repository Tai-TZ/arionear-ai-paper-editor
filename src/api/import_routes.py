"""Document import: Word (.docx) / PDF upload → LaTeX project payload.

The endpoint only converts; the client creates the paper through the same path as the Overleaf ZIP import.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from src.api.deps import get_current_user
from src.db.models import User
from src.models.import_schemas import DocumentImportResponse
from src.services.document_import import (
    MAX_IMPORT_BYTES,
    DocumentImportError,
    convert_document,
    ensure_size,
    format_from_filename,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/import", tags=["import"])

_READ_CHUNK_BYTES = 1024 * 1024


def _http_error(error: DocumentImportError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})


async def _read_upload(file: UploadFile, limit: int) -> bytes:
    """Read the upload in chunks, failing fast once ``limit`` is exceeded."""
    if file.size is not None:
        ensure_size(file.size, limit)
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(_READ_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        ensure_size(total, limit)
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/document", response_model=DocumentImportResponse)
async def import_document(
    file: UploadFile = File(...),
    _user: User = Depends(get_current_user),
) -> DocumentImportResponse:
    filename = file.filename or ""
    try:
        format_from_filename(filename)
        data = await _read_upload(file, MAX_IMPORT_BYTES)
        project = await asyncio.to_thread(convert_document, data, filename)
    except DocumentImportError as error:
        raise _http_error(error) from error
    except Exception as exc:
        logger.exception("Document import failed for %r", filename)
        raise HTTPException(
            status_code=422,
            detail={
                "code": "conversion_failed",
                "message": "The document could not be converted. It may be corrupt or use unsupported features.",
            },
        ) from exc
    finally:
        await file.close()
    return DocumentImportResponse.from_project(project)
