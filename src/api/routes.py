from __future__ import annotations

import asyncio
import subprocess

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from src.agents.graph import agent
from src.config import get_settings
from src.db.engine import db_is_ready, is_db_enabled
from src.models.schemas import (
    ChatRequest,
    ChatResponse,
    CitationVerifyRequest,
    CitationVerifyResponse,
    CompileRequest,
    CompileResponse,
    CompileStatusResponse,
    IntegrityFlagSchema,
    ProviderInfo,
    ProvidersResponse,
    RevisionAction,
    RevisionRecordResponse,
    RevisionsListResponse,
    SessionCreate,
    SessionResponse,
    SessionUpdate,
    StyleEditRequest,
    StyleEditResponse,
    SyncTeXLookupRequest,
    SyncTeXLookupResponse,
)
from src.services.chat_stream import AGENT_NAME, flush_sse_stream, stream_chat
from src.services.citations.verifier import verify_citations
from src.services.latex_compile import (
    compile_latex,
    compile_status,
    parse_synctex_inverse_disambiguated,
    resolve_synctex_line,
)
from src.services.llm import list_providers
from src.services.parser.latex import extract_bib_content, extract_cite_keys, parse_bib_entries
from src.services.sessions import session_store

router = APIRouter()


def _session_to_response(session) -> SessionResponse:
    return SessionResponse(
        id=session.id,
        name=session.name,
        latex_content=session.latex_content,
        metadata=session.metadata,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def _build_chat_response(result: dict) -> ChatResponse:
    flags = [IntegrityFlagSchema(**f) for f in result.get("integrity_flags", [])]
    metadata = result.get("metadata") or {}
    return ChatResponse(
        response=result.get("response", ""),
        analysis=result.get("analysis", ""),
        task=result.get("task", "chat"),
        suggestion=result.get("suggestion", ""),
        original_text=result.get("original_text", ""),
        diff=result.get("diff", ""),
        apply_mode=result.get("apply_mode"),
        revision_id=metadata.get("revision_id", result.get("revision_id", "")),
        integrity_flags=flags,
        edits=result.get("edits", []),
        citation_results=result.get("citation_results", []),
        structure_suggestions=result.get("structure_suggestions", []),
        logic_audit_report=result.get("logic_audit_report", {}),
    )


def _revision_to_response(record) -> RevisionRecordResponse:
    return RevisionRecordResponse(
        id=record.id,
        section=record.section,
        original=record.original,
        suggestion=record.suggestion,
        action=record.action,
        created_at=record.created_at,
    )


def _agent_input(**kwargs) -> dict:
    settings = get_settings()
    payload = dict(kwargs)
    if not payload.get("llm_provider"):
        payload["llm_provider"] = settings.llm_provider
    return payload


@router.get("/status")
async def agent_status():
    settings = get_settings()
    if db_is_ready():
        storage = (
            "postgresql"
            if get_settings().sqlalchemy_database_url().startswith(("postgresql://", "postgres://"))
            else "database"
        )
    elif is_db_enabled():
        storage = "database (connection failed — check DATABASE_URL)"
    else:
        storage = "in-memory (set DATABASE_URL to enable persistence)"
    return {
        "status": "ready",
        "agent": f"{AGENT_NAME} v1.0",
        "default_provider": settings.llm_provider,
        "storage": storage,
    }


@router.get("/providers", response_model=ProvidersResponse)
async def get_providers():
    settings = get_settings()
    providers = [ProviderInfo(**p) for p in list_providers()]
    if not providers:
        raise HTTPException(
            status_code=503,
            detail="No LLM API keys configured. Set ZAI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY in .env",
        )
    return ProvidersResponse(
        default_provider=settings.llm_provider,
        providers=providers,
    )


@router.post("/sessions", response_model=SessionResponse)
async def create_session(body: SessionCreate):
    session = session_store.create(
        session_id=body.id,
        name=body.name,
        latex_content=body.latex_content,
        metadata=body.metadata,
    )
    return _session_to_response(session)


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return _session_to_response(session)


@router.patch("/sessions/{session_id}", response_model=SessionResponse)
async def update_session(session_id: str, body: SessionUpdate):
    session = session_store.get(session_id)
    if not session:
        session = session_store.get_or_create(
            session_id,
            name=body.name or "Untitled",
            latex_content=body.latex_content or "",
            metadata=body.metadata,
        )
    else:
        updated = session_store.update(
            session_id,
            name=body.name,
            latex_content=body.latex_content,
            metadata=body.metadata,
        )
        session = updated or session
    return _session_to_response(session)


@router.get("/sessions/{session_id}/revisions", response_model=RevisionsListResponse)
async def list_session_revisions(session_id: str):
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return RevisionsListResponse(
        revisions=[_revision_to_response(r) for r in session.revision_history],
    )


@router.get("/sessions/{session_id}/citations", response_model=CitationVerifyResponse)
async def get_session_citations(session_id: str):
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    results = session.citation_registry or []
    verified = sum(1 for r in results if r.get("status") == "verified")
    summary = (
        f"Verified {verified}/{len(results)} citations."
        if results
        else "No citation verification on file."
    )
    return CitationVerifyResponse(results=results, summary=summary)


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest, http_request: Request):
    async def stream_with_disconnect():
        async for chunk in flush_sse_stream(stream_chat(request)):
            if await http_request.is_disconnected():
                break
            yield chunk

    try:
        return StreamingResponse(
            stream_with_disconnect(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "Content-Encoding": "identity",
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        if request.session_id and request.latex_content:
            session_store.get_or_create(
                request.session_id,
                latex_content=request.latex_content,
            )
            session_store.update(request.session_id, latex_content=request.latex_content)

        result = await agent.ainvoke(
            _agent_input(
                query=request.message,
                session_id=request.session_id or "",
                latex=request.latex_content,
                selection=request.selection,
                task=request.task,
                llm_provider=request.llm_provider,
                llm_model=request.llm_model,
            )
        )
        result["task"] = result.get("task") or request.task or "chat"
        return _build_chat_response(result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/edit/style", response_model=StyleEditResponse)
async def edit_style(request: StyleEditRequest):
    try:
        session = session_store.get_or_create(request.session_id)
        session_store.update(request.session_id, latex_content=session.latex_content)

        result = await agent.ainvoke(
            _agent_input(
                task="style",
                session_id=request.session_id,
                latex=session.latex_content,
                selection=request.text,
                section=request.section,
                query=f"Improve style: {request.section or 'selection'}",
                llm_provider=request.llm_provider,
                llm_model=request.llm_model,
            )
        )
        flags = [IntegrityFlagSchema(**f) for f in result.get("integrity_flags", [])]
        revision_id = (result.get("metadata") or {}).get("revision_id", "")
        return StyleEditResponse(
            original_text=result.get("original_text", request.text),
            suggestion=result.get("suggestion", ""),
            diff=result.get("diff", ""),
            integrity_flags=flags,
            revision_id=revision_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/citations/verify", response_model=CitationVerifyResponse)
async def verify_session_citations(request: CitationVerifyRequest):
    session = session_store.get_or_create(request.session_id)
    latex = session.latex_content
    bib = extract_bib_content(latex, request.bib_content)
    cite_keys = extract_cite_keys(latex)
    bib_entries = parse_bib_entries(bib)

    entries = []
    for key in cite_keys:
        entries.append(bib_entries.get(key, {"key": key, "title": "", "doi": "", "eprint": "", "raw": ""}))

    if not entries:
        return CitationVerifyResponse(
            results=[],
            summary="No citations found in manuscript.",
        )

    settings = get_settings()
    results = await verify_citations(
        entries,
        semantic_scholar_api_key=settings.semantic_scholar_api_key,
    )
    session_store.set_citation_registry(request.session_id, results)
    verified = sum(1 for r in results if r.get("status") == "verified")
    return CitationVerifyResponse(
        results=results,
        summary=f"Verified {verified}/{len(results)} citations.",
    )


@router.get("/compile/status", response_model=CompileStatusResponse)
async def get_compile_status():
    return compile_status()


@router.post("/compile", response_model=CompileResponse)
async def compile_manuscript(body: CompileRequest):
    try:
        result = await asyncio.to_thread(compile_latex, body)
        return result
    except subprocess.TimeoutExpired as e:
        raise HTTPException(status_code=504, detail="LaTeX compilation timed out.") from e
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[COMPILE_ERROR] {tb}", flush=True)
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}") from e


@router.post("/compile/synctex", response_model=SyncTeXLookupResponse)
async def synctex_lookup(body: SyncTeXLookupRequest):
    hit = parse_synctex_inverse_disambiguated(
        body.synctex_base64,
        body.pdf_base64,
        body.page,
        body.x,
        body.y,
        body.jobname,
        body.word,
        body.latex,
        body.context,
    )
    if not hit:
        return SyncTeXLookupResponse(found=False, page=body.page)
    raw_line = int(hit.get("line", 0))
    resolved_line = resolve_synctex_line(body.latex, raw_line, body.word, body.context)
    return SyncTeXLookupResponse(
        found=True,
        file=str(hit.get("file", "")),
        line=resolved_line,
        synctex_line=raw_line,
        column=int(hit.get("column", -1)),
        page=body.page,
    )


@router.post("/revisions/{session_id}/{revision_id}")
async def revision_action(session_id: str, revision_id: str, body: RevisionAction):
    record = session_store.set_revision_action(session_id, revision_id, body.action)
    if not record:
        raise HTTPException(status_code=404, detail="Revision not found")
    return {"status": "ok", "revision_id": revision_id, "action": body.action}
