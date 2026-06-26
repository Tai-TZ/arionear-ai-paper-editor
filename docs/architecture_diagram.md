# Architecture Diagram — Arionear

**Dự án:** Arionear · *Closer to Publication*  
**Cập nhật:** 26/06/2026 · Đồng bộ Phase 2 (`develop` @ defense + templates + paper score)  
**Live:** [https://arionear-web-345047770052.asia-east1.run.app/](https://arionear-web-345047770052.asia-east1.run.app/)

Sơ đồ bổ sung cho [ARCHITECTURE.md](../ARCHITECTURE.md). ✅ = đã triển khai · ⚠️ = một phần · *(planned)* = mục tiêu tương lai.

---

## 1. System Overview (Deployment)

```mermaid
flowchart TB
    subgraph Users["Users"]
        R([Researcher])
    end

    subgraph Cloud["Google Cloud Run"]
        FE[TanStack Start / React 19<br/>Marketing · Projects · Editor · Defense · Templates]
    end

    subgraph Backend["FastAPI API"]
        API[REST + SSE<br/>/api/v1/*]
        ING[Inngest /api/inngest<br/>chat telemetry ⚠️ optional]
    end

    subgraph Data["Persistence ✅"]
        PG[(PostgreSQL<br/>Prisma + SQLAlchemy)]
        LS[(Browser localStorage<br/>JWT + session)]
    end

    subgraph LLM["LLM Providers"]
        OAI[OpenAI]
        ANT[Anthropic]
        OR[OpenRouter]
        ZAI[Z.AI GLM]
    end

    subgraph Scholar["Citation APIs ✅"]
        ARX[arXiv]
        CR[CrossRef]
        SS[Semantic Scholar]
    end

    R -->|HTTPS| FE
    FE <-->|Bearer JWT| LS
    FE -->|REST + SSE| API
    API --> PG
    API --> ING
    API --> OAI & ANT & OR & ZAI
    API --> Scholar
```

| Surface | URL / host | Ghi chú |
|---------|------------|---------|
| Frontend (prod) | `arionear-web-*.asia-east1.run.app` | Nitro `node-server`, Docker |
| Backend API | Configured `VITE_API_URL` / proxy | FastAPI + TeX compile |
| Database | `DIRECT_DATABASE_URL` | Papers, auth, profiles, templates |

---

## 2. Four-Layer Product Architecture

```mermaid
flowchart TB
    subgraph UL["USER LAYER"]
        U([Researcher])
        UP[Upload LaTeX · Overleaf ZIP · templates]
        UF[Chat / slash commands / defense]
    end

    subgraph PL["PROCESSING LAYER"]
        DP[LaTeX Parser ✅]
        RE[Intent Router ✅]
        SA[Style Agent ✅]
        TN[Template Generator ✅]
        ST[Structure Analyzer ✅]
        CV[Citation Verifier ✅]
        LA[Logic Audit ✅<br/>Quick / Deep debate]
        DF[Defense Council ✅<br/>mock viva SSE]
        AIM[Integrity Monitor ✅]
    end

    subgraph HGL["HUMAN GATE ✅"]
        DIFF[Diff in editor<br/>Accept / Reject]
    end

    subgraph OL["OUTPUT LAYER"]
        RD[Revised draft ✅]
        IR[Integrity flags ✅]
        CRpt[Citation report ✅]
        LAR[Logic audit report ✅]
        PS[Publication score ✅<br/>export gate]
        AL[Revision audit log ✅]
        PDF[Compiled PDF ✅]
    end

    U --> UP --> DP
    UF --> RE
    DP --> RE
    RE --> SA & TN & ST & CV & LA
    UF --> DF
    SA & TN --> AIM
    LA --> LAR
    DF --> LAR
    AIM --> DIFF
    DIFF --> RD & IR & CRpt & AL
    RD --> PS & PDF
```

---

## 3. Frontend Routes & Components

```mermaid
flowchart TB
    subgraph Public["Marketing / auth"]
        HOME["/"]
        SIGN["/signin · /signup"]
        GUIDE["/guide · /latex-guide"]
    end

    subgraph Workspace["Authenticated"]
        PRJ["/projects"]
        ED["/editor?projectId="]
        DEF["/defense?projectId="]
        TPL["/templates"]
        PROF["/profile"]
        ADM["/admin"]
    end

    subgraph EditorUI["Editor shell"]
        LE[LatexEditor + Diff]
        PP[PdfPreviewPanel + SyncTeX]
        CD[Chat dock / Ario]
        TP[Tools: Info · Citations · Logic · Versions]
        EXP[Export / Paper score dialog]
    end

    PRJ --> ED & DEF
    TPL -->|open template| PRJ
    ED --> LE & PP & CD & TP & EXP
    DEF --> DEFCHAT[DefenseChatPanel] & PP
```

---

## 4. Backend API Surface

```mermaid
flowchart LR
    FE[Frontend] --> AUTH["/auth/*<br/>JWT · Google SSO"]
    FE --> PAPERS["/papers/*<br/>CRUD LaTeX projects"]
    FE --> CORE["/chat · /chat/stream<br/>/compile · /citations"]
    FE --> PROF["/users/me/profile"]
    FE --> SHARE["/papers/{id}/share"]
    FE --> DEF["/defense/stream · /defense/quota"]
    FE --> TPL["/templates/*"]
    FE --> ADM["/admin/*"]

    CORE --> STREAM[chat_stream.py]
    CORE --> LG[LangGraph + logic_audit]
    DEF --> DSTREAM[defense_stream.py]
    TPL --> TSTORE[template_store.py]
    PAPERS --> DB[(PostgreSQL)]
    AUTH --> DB
```

---

## 5. LangGraph Agent Flow (sync `/chat`)

```mermaid
flowchart LR
    START((Start)) --> ROUTE[route_node]
    ROUTE --> PARSE[parse_node]
    PARSE -->|style| STYLE[style_node]
    PARSE -->|structure| STRUCT[structure_node]
    PARSE -->|citation| CITE[citation_node]
    PARSE -->|logic| LOGIC[logic_node<br/>logic_audit runner]
    PARSE -->|chat| CHAT[chat_node]
    STYLE --> AIM[integrity_node]
    AIM --> RESPOND[respond_node]
    LOGIC --> RESPOND
    CITE & STRUCT & CHAT --> RESPOND
    RESPOND --> END((End))
```

| Node | Module |
|------|--------|
| `logic_node` | `services/logic_audit/runner.py` + `debate.py` |
| `style_node` | `guardrails/integrity.py` + LLM |
| `citation_node` | `services/citations/verifier.py` |
| Stream-only `template` | `chat_stream.py` + `template_latex.py` |

---

## 6. SSE — Editor Chat (`/chat/stream`)

```mermaid
sequenceDiagram
    participant FE as Editor
    participant API as chat_stream.py
    participant LLM as LLM
    participant LA as logic_audit
    participant AIM as integrity.py

    FE->>API: POST /chat/stream {task, latex}
    API->>API: intent / task detect
    alt logic
        API->>LA: multi-agent debate + synthesize
        API-->>FE: done {logic_audit_report}
    else style
        API->>LLM: style + optional reasoning stream
        API->>AIM: L2 integrity + retry
        API-->>FE: done {suggestion, diff, flags}
    else template
        API-->>FE: done {apply_mode: document}
    else citation / structure / chat
        API->>LLM: handler
        API-->>FE: done
    end
    FE->>FE: Diff Accept/Reject or read-only panel
```

---

## 7. Defense Mode (`/defense/stream`)

```mermaid
sequenceDiagram
    participant R as Researcher
    participant FE as /defense
    participant API as defense_stream.py
    participant LLM as LLM persona

    R->>FE: Open defense from project
    FE->>FE: Compile PDF preview
    R->>FE: Proactive or Q&A mode
    FE->>API: POST /defense/stream (Bearer)
    API->>LLM: council prompt + manuscript context
    LLM-->>API: streamed tokens
    API-->>FE: SSE token + done
    FE->>FE: PDF citation deep-link highlight
```

---

## 8. Publication Score & Export Gate

```mermaid
flowchart LR
    EXP[User clicks Export] --> GATE{Manuscript<br/>changed?}
    GATE -->|yes| SKIM[Quick logic skim<br/>paper_gate_skim]
    GATE -->|no| SCORE[computePaperScore]
    SKIM --> SCORE
    SCORE --> DIALOG[Score ring + dimensions<br/>+ PDF download]
```

Dimensions: structure, completeness, citations, compile health, peer-review signals from logic audit.

---

## 9. Template Gallery

```mermaid
flowchart LR
    GAL["/templates"] --> API["GET /templates"]
    API --> STORE[template_store.py<br/>seed + admin CRUD]
  GAL -->|Open as Template| OPEN["POST /templates/{id}/open"]
    OPEN --> PAPERS[New paper in PostgreSQL]
    PAPERS --> ED["/editor"]
```

---

## 10. Guardrail & Auth

```mermaid
flowchart TB
    subgraph Guardrails
        L1[L1 Prompt constraint ✅]
        L2[L2 Integrity check ✅]
        L3[L3 Diff gate UI ✅]
        L4[L4 Revision history ✅]
        L1 --> L2 --> L3 --> L4
    end

    subgraph Auth
        JWT[JWT access token<br/>default 72h · remember 30d]
        LS[(localStorage)]
        JWT --> LS
    end
```

---

## 11. Citation Verifier (layers 1–3 ✅)

```mermaid
flowchart LR
    IN[BibTeX + cite keys] --> L1{arXiv?}
    L1 -->|yes| ARX[arXiv API]
    L1 -->|no| L2{DOI?}
    L2 -->|yes| CR[CrossRef]
    L2 -->|no| L3{Title?}
    L3 -->|yes| SS[Semantic Scholar]
    L3 -->|no| NF[not_found]
    ARX & CR & SS --> OUT[verified / mismatch / not_found]
    OUT -.-> L4["L4 LLM relevance<br/>(planned)"]
```

---

## 12. Component Reference

| Component | Technology | Purpose | Status |
|-----------|-----------|---------|--------|
| Frontend | TanStack Start, React 19, Tailwind v4 | Editor, defense, templates, marketing | ✅ |
| Deploy | Cloud Run + frontend Dockerfile | Live URL | ✅ |
| Backend | FastAPI, Pydantic | REST + SSE | ✅ |
| Agent | LangGraph `graph.py` | style, structure, citation, logic, chat | ✅ |
| Stream | `chat_stream.py`, `defense_stream.py` | Editor + defense SSE | ✅ |
| Logic audit | `services/logic_audit/*` | Multi-agent comment-only review | ✅ |
| Paper score | `lib/paper-score.ts` + gate skim | Export readiness dialog | ✅ |
| Templates | `template_store.py`, `template_routes.py` | Gallery + open as project | ✅ |
| Defense | `defense_stream.py`, `defense_citations.py` | Mock viva + PDF links | ✅ |
| LLM | OpenAI / Anthropic / OpenRouter / Z.AI | Inference | ✅ |
| Database | PostgreSQL, Prisma, SQLAlchemy | Papers, auth, profiles, templates | ✅ |
| Auth | JWT + Google OAuth | Sign-in, 3-day default session | ✅ |
| Admin | `admin_routes.py` | Users, LLM policy, quotas | ✅ |
| Inngest | `inngest/` + hooks | Chat telemetry (optional) | ⚠️ |
| Citation L4 LLM | — | Relevance layer | *(planned)* |
| DOCX/PDF import | — | Non-LaTeX ingest | *(planned)* |

---

## Tài liệu liên quan

- [ARCHITECTURE.md](../ARCHITECTURE.md) — mô tả chi tiết kiến trúc
- [README.md](../README.md) — setup & Live URL
- [AutoResearchReferee.md](../AutoResearchReferee.md) — ARC adopt/adapt/drop
- [pdf-preview-deploy.md](./pdf-preview-deploy.md) — TeX & Docker ops
