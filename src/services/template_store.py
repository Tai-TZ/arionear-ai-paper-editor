from __future__ import annotations

import json
import re
import shutil
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from src.models.template_schemas import (
    PaperTemplateCreateRequest,
    PaperTemplateDetail,
    PaperTemplateSummary,
    PaperTemplateUpdateRequest,
)
from src.services.paper_service import create_paper
from src.services.template_builtins import PUBLISHER_TEMPLATES, BuiltinTemplate

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_TEMPLATES_ROOT = _PROJECT_ROOT / "data" / "templates"
_REGISTRY_PATH = _TEMPLATES_ROOT / "registry.json"
_STUB_IEEE = _PROJECT_ROOT / "frontend" / "public" / "assets" / "latex" / "ieee"

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_PREVIEW_NAMES = ("preview.png", "preview.jpg", "preview.jpeg", "preview.webp", "preview.svg")
_PDF_NAMES = ("sample.pdf", "preview.pdf")


def _build_placeholder_pdf(title: str = "IEEE Journal Template Sample") -> bytes:
    """Minimal valid single-page PDF for template gallery previews."""
    stream = f"BT /F1 20 Tf 72 720 Td ({title}) Tj ET".encode("latin-1")
    parts: list[bytes] = [b"%PDF-1.4\n"]
    offsets = [0]
    objects = [
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n",
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n",
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n",
        b"4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n",
        f"5 0 obj<</Length {len(stream)}>>stream\n".encode("ascii") + stream + b"\nendstream\nendobj\n",
    ]
    for obj in objects:
        offsets.append(sum(len(part) for part in parts))
        parts.append(obj)
    xref_pos = sum(len(part) for part in parts)
    parts.append(b"xref\n")
    parts.append(f"0 {len(offsets)}\n".encode("ascii"))
    parts.append(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        parts.append(f"{off:010d} 00000 n \n".encode("ascii"))
    parts.append(b"trailer<</Size 6/Root 1 0 R>>\n")
    parts.append(f"startxref\n{xref_pos}\n%%EOF\n".encode("ascii"))
    return b"".join(parts)


def _is_valid_pdf(path: Path) -> bool:
    try:
        data = path.read_bytes()
    except OSError:
        return False
    return data.startswith(b"%PDF-") and b"endstream" in data and data.rstrip().endswith(b"%%EOF")


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _ensure_dirs() -> None:
    _TEMPLATES_ROOT.mkdir(parents=True, exist_ok=True)


def _template_dir(template_id: str) -> Path:
    return _TEMPLATES_ROOT / template_id


def _read_registry() -> dict[str, Any]:
    _ensure_dirs()
    if not _REGISTRY_PATH.is_file():
        return {"templates": []}
    raw = _REGISTRY_PATH.read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        return {"templates": []}
    if not isinstance(data.get("templates"), list):
        data["templates"] = []
    return data


def _write_registry(data: dict[str, Any]) -> None:
    _ensure_dirs()
    _REGISTRY_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _parse_dt(value: object) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _find_preview_file(template_id: str) -> Path | None:
    folder = _template_dir(template_id)
    if not folder.is_dir():
        return None
    for name in _PREVIEW_NAMES:
        candidate = folder / name
        if candidate.is_file():
            return candidate
    return None


def _find_pdf_file(template_id: str) -> Path | None:
    folder = _template_dir(template_id)
    if not folder.is_dir():
        return None
    for name in _PDF_NAMES:
        candidate = folder / name
        if candidate.is_file():
            return candidate
    return None


def _media_type_for(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".pdf": "application/pdf",
    }.get(suffix, "application/octet-stream")


def _to_summary(row: dict[str, Any]) -> PaperTemplateSummary:
    template_id = str(row.get("id") or "")
    return PaperTemplateSummary(
        id=template_id,
        slug=str(row.get("slug") or template_id),
        title=str(row.get("title") or ""),
        title_vi=row.get("title_vi"),
        description=str(row.get("description") or ""),
        description_vi=row.get("description_vi"),
        author=str(row.get("author") or ""),
        tags=[str(t) for t in row.get("tags") or []],
        is_official=bool(row.get("is_official")),
        format=str(row.get("format") or "ieee"),
        venue=str(row.get("venue") or "journal"),
        featured=bool(row.get("featured")),
        has_preview=_find_preview_file(template_id) is not None,
        has_pdf=_find_pdf_file(template_id) is not None,
        updated_at=_parse_dt(row.get("updated_at")),
    )


def _to_detail(row: dict[str, Any]) -> PaperTemplateDetail:
    summary = _to_summary(row)
    template_id = summary.id
    return PaperTemplateDetail(
        **summary.model_dump(),
        license=str(row.get("license") or ""),
        abstract=str(row.get("abstract") or ""),
        abstract_vi=row.get("abstract_vi"),
        created_at=_parse_dt(row.get("created_at")),
        preview_url=f"/api/v1/templates/{template_id}/preview" if summary.has_preview else None,
        pdf_url=f"/api/v1/templates/{template_id}/pdf" if summary.has_pdf else None,
        main_tex=_read_main_tex_optional(template_id),
    )


def _get_row(template_id: str) -> dict[str, Any]:
    data = _read_registry()
    for row in data["templates"]:
        if str(row.get("id")) == template_id:
            return row
    raise HTTPException(status_code=404, detail="Template not found.")


def list_templates(*, query: str | None = None, tag: str | None = None) -> list[PaperTemplateSummary]:
    data = _read_registry()
    rows = list(data["templates"])
    rows.sort(key=lambda r: (not bool(r.get("featured")), str(r.get("title") or "").lower()))

    q = (query or "").strip().lower()
    tag_q = (tag or "").strip().lower()

    filtered: list[dict[str, Any]] = []
    for row in rows:
        if q:
            haystack = " ".join(
                [
                    str(row.get("title") or ""),
                    str(row.get("title_vi") or ""),
                    str(row.get("description") or ""),
                    str(row.get("description_vi") or ""),
                    " ".join(str(t) for t in row.get("tags") or []),
                    str(row.get("format") or ""),
                ]
            ).lower()
            if q not in haystack:
                continue
        if tag_q:
            tags = [str(t).lower() for t in row.get("tags") or []]
            if (
                tag_q not in tags
                and tag_q not in str(row.get("format") or "").lower()
                and tag_q != str(row.get("venue") or "").lower()
            ):
                continue
        filtered.append(row)

    return [_to_summary(row) for row in filtered]


def get_template(template_id: str) -> PaperTemplateDetail:
    return _to_detail(_get_row(template_id))


def get_template_preview_path(template_id: str) -> tuple[Path, str]:
    path = _find_preview_file(template_id)
    if not path:
        raise HTTPException(status_code=404, detail="Template preview not found.")
    return path, _media_type_for(path)


def get_template_pdf_path(template_id: str) -> tuple[Path, str]:
    path = _find_pdf_file(template_id)
    if not path:
        raise HTTPException(status_code=404, detail="Template PDF not found.")
    return path, _media_type_for(path)


def _read_main_tex_optional(template_id: str) -> str | None:
    folder = _template_dir(template_id)
    for name in ("main.tex", "template.tex"):
        candidate = folder / name
        if candidate.is_file():
            return candidate.read_text(encoding="utf-8")
    return None


def _read_main_tex(template_id: str) -> str:
    content = _read_main_tex_optional(template_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Template source not found.")
    return content


def _collect_template_files(template_id: str) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    folder = _template_dir(template_id)
    if not folder.is_dir():
        return [], []

    files: list[dict[str, str]] = []
    assets: list[dict[str, str]] = []
    for path in sorted(folder.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(folder).as_posix()
        if rel in _PREVIEW_NAMES or rel in _PDF_NAMES:
            continue
        lower = rel.lower()
        if lower.endswith((".tex", ".latex")):
            files.append({"path": rel, "content": path.read_text(encoding="utf-8")})
        elif lower.endswith((".bib", ".cls", ".bst", ".sty", ".eps", ".png", ".jpg", ".jpeg", ".pdf")):
            import base64

            mime = _media_type_for(path)
            payload = base64.b64encode(path.read_bytes()).decode("ascii")
            assets.append({"name": rel, "mimeType": mime, "dataUrl": f"data:{mime};base64,{payload}"})
    return files, assets


def open_template_as_paper(db: Session, user_id: uuid.UUID, template_id: str) -> tuple[str, str]:
    row = _get_row(template_id)
    latex = _read_main_tex(template_id)
    files, assets = _collect_template_files(template_id)
    main_file = "main.tex"
    if files and not any(f["path"] == "main.tex" for f in files):
        main_file = files[0]["path"]

    metadata: dict[str, Any] = {
        "template_id": template_id,
        "mainFile": main_file,
        "compiler": "pdflatex",
    }
    if files:
        metadata["files"] = files
    if assets:
        metadata["assets"] = assets

    paper = create_paper(
        db,
        user_id,
        name=str(row.get("title") or "Untitled"),
        latex=latex,
        metadata=metadata,
    )
    return str(paper.id), str(row.get("title") or "Untitled")


def create_template(body: PaperTemplateCreateRequest) -> PaperTemplateDetail:
    template_id = body.id.strip().lower()
    if not _SLUG_RE.match(template_id):
        raise HTTPException(status_code=400, detail="Template id must be lowercase slug (a-z, 0-9, hyphen).")

    data = _read_registry()
    if any(str(r.get("id")) == template_id for r in data["templates"]):
        raise HTTPException(status_code=409, detail="Template id already exists.")

    now = _utcnow().isoformat()
    row = {
        "id": template_id,
        "slug": template_id,
        "title": body.title,
        "title_vi": body.title_vi,
        "description": body.description,
        "description_vi": body.description_vi,
        "abstract": body.abstract,
        "abstract_vi": body.abstract_vi,
        "author": body.author,
        "license": body.license,
        "tags": body.tags,
        "is_official": body.is_official,
        "format": body.format,
        "venue": body.venue,
        "featured": body.featured,
        "created_at": now,
        "updated_at": now,
    }
    data["templates"].append(row)
    _write_registry(data)

    folder = _template_dir(template_id)
    folder.mkdir(parents=True, exist_ok=True)
    if body.main_tex:
        (folder / "main.tex").write_text(body.main_tex, encoding="utf-8")

    return _to_detail(row)


def update_template(template_id: str, body: PaperTemplateUpdateRequest) -> PaperTemplateDetail:
    data = _read_registry()
    row = None
    for item in data["templates"]:
        if str(item.get("id")) == template_id:
            row = item
            break
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found.")

    patch = body.model_dump(exclude_unset=True)
    main_tex = patch.pop("main_tex", None)
    new_id = patch.pop("new_id", None)
    if new_id is not None:
        new_id = new_id.strip().lower()
        if new_id != template_id:
            if not _SLUG_RE.match(new_id):
                raise HTTPException(
                    status_code=400,
                    detail="Template id must be lowercase slug (a-z, 0-9, hyphen).",
                )
            if any(str(r.get("id")) == new_id for r in data["templates"]):
                raise HTTPException(status_code=409, detail="Template id already exists.")
            old_folder = _template_dir(template_id)
            new_folder = _template_dir(new_id)
            if old_folder.is_dir():
                new_folder.parent.mkdir(parents=True, exist_ok=True)
                if new_folder.exists():
                    shutil.rmtree(new_folder)
                old_folder.rename(new_folder)
            row["id"] = new_id
            row["slug"] = new_id
            template_id = new_id

    row.update(patch)
    row["updated_at"] = _utcnow().isoformat()
    _write_registry(data)

    if main_tex is not None:
        folder = _template_dir(template_id)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "main.tex").write_text(main_tex, encoding="utf-8")

    return _to_detail(row)


def delete_template(template_id: str) -> None:
    data = _read_registry()
    before = len(data["templates"])
    data["templates"] = [r for r in data["templates"] if str(r.get("id")) != template_id]
    if len(data["templates"]) == before:
        raise HTTPException(status_code=404, detail="Template not found.")
    _write_registry(data)
    folder = _template_dir(template_id)
    if folder.is_dir():
        shutil.rmtree(folder)


async def upload_template_preview(template_id: str, file: UploadFile) -> PaperTemplateDetail:
    _get_row(template_id)
    folder = _template_dir(template_id)
    folder.mkdir(parents=True, exist_ok=True)
    for old in _PREVIEW_NAMES:
        (folder / old).unlink(missing_ok=True)

    suffix = Path(file.filename or "preview.png").suffix.lower() or ".png"
    if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".svg"}:
        raise HTTPException(status_code=400, detail="Preview must be PNG, JPG, WEBP, or SVG.")
    dest = folder / f"preview{suffix}"
    dest.write_bytes(await file.read())
    return get_template(template_id)


async def upload_template_pdf(template_id: str, file: UploadFile) -> PaperTemplateDetail:
    _get_row(template_id)
    folder = _template_dir(template_id)
    folder.mkdir(parents=True, exist_ok=True)
    for old in _PDF_NAMES:
        (folder / old).unlink(missing_ok=True)

    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Sample file must be a PDF.")
    dest = folder / "sample.pdf"
    dest.write_bytes(await file.read())
    return get_template(template_id)


IEEE_JOURNAL_MAIN_TEX = r"""\documentclass[journal]{IEEEtran}

\usepackage{amsmath,amssymb,amsfonts}
\usepackage{graphicx}
\usepackage{textcomp}
\usepackage{xcolor}

\begin{document}

\title{Bare Demo of IEEEtran.cls for IEEE Journals}

\author{Michael~Shell,~\IEEEmembership{Member,~IEEE,}
        John~Doe,~\IEEEmembership{Fellow,~OSA,}
        and~Jane~Doe,~\IEEEmembership{Life~Fellow,~IEEE}%
\thanks{Manuscript created for the Arionear template gallery.}}

\markboth{Journal of \LaTeX\ Class Files,~Vol.~14, No.~8, August~2021}%
{Shell \MakeLowercase{\textit{et al.}}: Bare Demo of IEEEtran.cls for IEEE Journals}

\maketitle

\begin{abstract}
The abstract goes here. Replace this paragraph with your manuscript summary.
\end{abstract}

\begin{IEEEkeywords}
IEEE, IEEEtran, journal, \LaTeX, paper, template.
\end{IEEEkeywords}

\section{Introduction}
\IEEEPARstart{T}{his} demo file is intended to serve as a starter template for IEEE journal articles.
Use the Arionear editor to replace placeholder text while keeping your scientific claims intact.

\section{Methods}
Describe your methodology here.

\section{Results}
Present your key findings here.

\section{Conclusion}
Summarize contributions and future work.

\bibliographystyle{IEEEtran}
\bibliography{references}

\end{document}
"""

IEEE_JOURNAL_ABSTRACT = """This is a skeleton file demonstrating advanced use of IEEEtran.cls (available at CTAN.org).
It is intended to be used for journal submissions to IEEE. A BibTeX example file is included."""

IEEE_PREVIEW_SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="320" height="420" viewBox="0 0 320 420">
  <rect width="320" height="420" fill="#ffffff" stroke="#d1d5db"/>
  <rect x="24" y="28" width="272" height="36" fill="#f3f4f6"/>
  <text x="160" y="50" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="#111827">IEEE Journal Template</text>
  <text x="160" y="78" text-anchor="middle" font-family="Arial, sans-serif" font-size="8" fill="#6b7280">Author Names</text>
  <rect x="40" y="96" width="112" height="220" fill="#fafafa" stroke="#e5e7eb"/>
  <rect x="168" y="96" width="112" height="220" fill="#fafafa" stroke="#e5e7eb"/>
  <text x="52" y="118" font-family="Arial, sans-serif" font-size="7" fill="#374151">Abstract —</text>
  <text x="52" y="140" font-family="Arial, sans-serif" font-size="7" fill="#374151">I. INTRODUCTION</text>
  <text x="180" y="140" font-family="Arial, sans-serif" font-size="7" fill="#374151">II. METHODS</text>
</svg>
"""


IEEE_JOURNAL_TEMPLATE_ID = "ieee-journal"
BUILTIN_TEMPLATE_IDS: tuple[str, ...] = (IEEE_JOURNAL_TEMPLATE_ID, *(t.id for t in PUBLISHER_TEMPLATES))
_PUBLISHER_TEMPLATES_BY_ID: dict[str, BuiltinTemplate] = {t.id: t for t in PUBLISHER_TEMPLATES}
# Registry key listing built-in ids already seeded once; they are never re-added, so admin
# edits, renames and deletions of built-in templates survive restarts.
_SEEDED_BUILTINS_KEY = "seeded_builtins"
_SEED_LOCK = threading.Lock()


def _ensure_sample_pdf(template_id: str, title: str | None = None) -> None:
    folder = _template_dir(template_id)
    if not folder.is_dir():
        return
    pdf_path = folder / "sample.pdf"
    if pdf_path.is_file() and _is_valid_pdf(pdf_path):
        return
    pdf_path.write_bytes(_build_placeholder_pdf(title) if title else _build_placeholder_pdf())


def _seeded_builtin_ids(data: dict[str, Any]) -> list[str]:
    raw = data.get(_SEEDED_BUILTINS_KEY)
    if isinstance(raw, list):
        return [str(item) for item in raw]
    # Registry written before seed tracking: the IEEE template was seeded whenever the registry
    # was empty, so a non-empty legacy registry has already had it (even if an admin removed it).
    return [IEEE_JOURNAL_TEMPLATE_ID] if data["templates"] else []


def _seed_publisher_template(spec: BuiltinTemplate, now: str) -> dict[str, Any]:
    folder = _template_dir(spec.id)
    folder.mkdir(parents=True, exist_ok=True)
    for rel_path, content in spec.files.items():
        (folder / rel_path).write_text(content, encoding="utf-8")
    _ensure_sample_pdf(spec.id, spec.sample_title)
    return spec.registry_row(now)


def ensure_template_seed() -> None:
    """Seed the built-in gallery templates (IEEE, Springer LNCS, Elsevier).

    Idempotent: each built-in is added at most once, also to an existing registry. Rows already
    present (admin-edited built-ins or admin rows reusing a built-in id) are never overwritten,
    and built-ins recorded under ``seeded_builtins`` are not re-added after an admin deletes them.
    """
    with _SEED_LOCK:
        _ensure_dirs()
        data = _read_registry()
        seeded = _seeded_builtin_ids(data)
        missing = [template_id for template_id in BUILTIN_TEMPLATE_IDS if template_id not in seeded]
        if missing:
            existing_ids = {str(row.get("id") or "") for row in data["templates"]}
            now = _utcnow().isoformat()
            for template_id in missing:
                if template_id in existing_ids:
                    continue
                if template_id == IEEE_JOURNAL_TEMPLATE_ID:
                    data["templates"].append(_seed_ieee_journal(now))
                else:
                    data["templates"].append(_seed_publisher_template(_PUBLISHER_TEMPLATES_BY_ID[template_id], now))
            data[_SEEDED_BUILTINS_KEY] = [*seeded, *missing]
            _write_registry(data)

        for row in data["templates"]:
            template_id = str(row.get("id") or "")
            spec = _PUBLISHER_TEMPLATES_BY_ID.get(template_id)
            _ensure_sample_pdf(template_id, spec.sample_title if spec else None)


def _seed_ieee_journal(now: str) -> dict[str, Any]:
    template_id = IEEE_JOURNAL_TEMPLATE_ID
    row = {
        "id": template_id,
        "slug": template_id,
        "title": "IEEE for journals template with bibtex example files included",
        "title_vi": "Mẫu IEEE cho tạp chí (kèm ví dụ BibTeX)",
        "description": (
            "Official-style IEEE journal starter with IEEEtran class, abstract, keywords, "
            "and bibliography hooks for Arionear Paper IDE."
        ),
        "description_vi": (
            "Mẫu khởi tạo bài báo tạp chí IEEE với lớp IEEEtran, abstract, từ khóa "
            "và khung tài liệu tham khảo cho Paper IDE Arionear."
        ),
        "abstract": IEEE_JOURNAL_ABSTRACT,
        "abstract_vi": (
            "Đây là file khung minh họa IEEEtran.cls dùng cho bài gửi tạp chí IEEE. Có thể kèm file BibTeX mẫu."
        ),
        "author": "IEEE template (Arionear gallery)",
        "license": "Other (as stated in the work)",
        "tags": [
            "Citations",
            "IEEE Official Templates",
            "IEEE (all)",
            "Journal articles",
            "Bibliographies",
        ],
        "is_official": True,
        "format": "ieee",
        "venue": "journal",
        "featured": True,
        "created_at": now,
        "updated_at": now,
    }

    folder = _template_dir(template_id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "main.tex").write_text(IEEE_JOURNAL_MAIN_TEX, encoding="utf-8")
    (folder / "references.bib").write_text(
        "@article{example2024,\n"
        "  author={Author, A. and Author, B.},\n"
        "  journal={IEEE Transactions on Example},\n"
        "  title={An Example Reference},\n"
        "  year={2024}\n"
        "}\n",
        encoding="utf-8",
    )
    (folder / "preview.svg").write_text(IEEE_PREVIEW_SVG, encoding="utf-8")

    if _STUB_IEEE.is_dir():
        for name in ("IEEEtran.cls", "IEEEtran.bst"):
            src = _STUB_IEEE / name
            if src.is_file():
                shutil.copy2(src, folder / name)

    _ensure_sample_pdf(template_id)
    return row
