# Architecture Diagram — Arionear

**Dự án:** Arionear · *Closer to Publication*  
**Cập nhật:** 13/06/2026 · Đồng bộ với [ARCHITECTURE.md](../ARCHITECTURE.md) v2.1

Sơ đồ bổ sung cho tài liệu kiến trúc chính. ✅ = Phase 1 MVP đã code · *(planned)* = mục tiêu tương lai.

---

## 1. System Overview (Deployment)

```mermaid
flowchart TB
    subgraph Client["Browser"]
        FE[TanStack Start / React 19<br/>Editor · Preview · Chat · Tools]
        LS[(localStorage<br/>projects)]
    end

    subgraph Backend["FastAPI :8000"]
        API[REST + SSE<br/>/api/v1/*]
        LG[LangGraph Agent]
        STREAM[chat_stream.py<br/>SSE orchestration]
        PSS[In-Memory Session Store]
    end

    subgraph LLM["LLM Providers"]
        OAI[OpenAI]
        ANT[Anthropic]
        OR[OpenRouter]
    end

    subgraph Scholar["Citation APIs ✅"]
        ARX[arXiv]
        CR[CrossRef]
        SS[Semantic Scholar]
    end

    subgraph Future["planned"]
        PG[(PostgreSQL)]
        OA[OpenAlex]
    end

    FE <-->|read/write| LS
    FE -->|REST + SSE| API
    API --> LG
    API --> STREAM
    API --> PSS
    LG --> OAI & ANT & OR
    STREAM --> OAI & ANT & OR
    LG --> Scholar
    STREAM --> Scholar
    PSS -.-> PG
    Scholar -.-> OA
```

---

## 2. Four-Layer Product Architecture

```mermaid
flowchart TB
    subgraph UL["USER LAYER"]
        U([Researcher])
        UP[Upload LaTeX + figures]
        UF[Chat intent]
    end

    subgraph PL["PROCESSING LAYER ✅"]
        DP[LaTeX Parser]
        RE[Routing Engine]
        SA[Style Agent]
        TN[Template Generator]
        ST[Structure Analyzer]
        CV[Citation Verifier]
        AIM[Integrity Monitor]
    end

    subgraph HGL["HUMAN GATE ✅"]
        DIFF[Line diff in editor<br/>Accept / Reject]
    end

    subgraph OL["OUTPUT"]
        RD[Revised draft ✅]
        IR[Integrity flags ✅]
        CR[Citation report ✅]
        AL[Audit log ⚠️ partial]
    end

    U --> UP --> DP
    UF --> RE
    DP --> RE
    RE --> SA & TN & ST & CV
    SA & TN & ST & CV --> AIM
    AIM --> DIFF
    DIFF --> RD & IR & CR & AL
```

---

## 3. Frontend Component Map

```mermaid
flowchart LR
    subgraph Routes
        ED["/editor"]
        PR["/projects"]
    end

    subgraph EditorUI["Editor UI"]
        LE[LatexEditor]
        LD[LatexDiffEditor]
        PP[PreviewPanel]
        SP[SuggestionPanel]
        CD[Chat Dock]
        TP[Tools Panel<br/>Citations · Info]
    end

    subgraph Lib
        API[lib/api/academic.ts]
        DIFF[lib/text-diff.ts]
        PS[lib/project-store.ts]
    end

    ED --> LE & PP & CD & TP
    LE -->|pendingSuggestion| LD
    ED --> SP
    CD -->|streamChat| API
    TP -->|verifyCitations| API
    SP --> DIFF
    ED --> PS
    PS -->|syncSession| API
```

---

## 4. Backend API Surface

```mermaid
flowchart LR
    FE[Frontend] --> H[GET /health]
    FE --> S[GET /status]
    FE --> P[GET /providers]
    FE --> SS[POST/PATCH /sessions]
    FE --> C[POST /chat]
    FE --> CS[POST /chat/stream]
    FE --> ES[POST /edit/style]
    FE --> CV[POST /citations/verify]
    FE --> RV[POST /revisions/...]

    CS --> STREAM[chat_stream.py]
    C & ES --> LG[LangGraph agent]
    SS --> STORE[sessions.py]
    CV --> VER[citations/verifier.py]
    ES & LG --> GRD[guardrails/integrity.py]
    LG & STREAM --> PRS[parser/latex.py]
```

---

## 5. LangGraph Agent Flow (sync `/chat`)

```mermaid
flowchart LR
    START((Start)) --> ROUTE[route_node<br/>regex intent]
    ROUTE --> PARSE[parse_node<br/>sections · cites · bib]
    PARSE -->|style| STYLE[style_node<br/>LLM + L2 retry]
    PARSE -->|structure| STRUCT[structure_node]
    PARSE -->|citation| CITE[citation_node]
    PARSE -->|chat| CHAT[chat_node]
    STYLE --> AIM[integrity_node]
    AIM --> RESPOND[respond_node]
    CITE --> RESPOND
    STRUCT --> RESPOND
    CHAT --> RESPOND
    RESPOND --> END((End))
```

| Node | Module |
|------|--------|
| `route_node` | `agents/nodes/academic_nodes.py` |
| `parse_node` | `services/parser/latex.py` |
| `style_node` | `prompts.default.yaml` + `guardrails/integrity.py` |
| `citation_node` | `services/citations/verifier.py` |
| `structure_node` | `parser/latex.py` + LLM |
| `chat_node` | Ario general chat |

---

## 6. SSE Stream Flow (`/chat/stream`)

Luồng chính của editor. Task **template** (IMRAD skeleton) chỉ chạy ở đây.

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant API as chat_stream.py
    participant LLM as LLM Provider
    participant AIM as integrity.py
    participant TPL as template_latex.py

    FE->>API: POST /chat/stream
    API->>API: _detect_task (style/structure/citation/template/chat)
    API-->>FE: SSE event: activity
    alt template
        API->>TPL: build_imrad_template()
        API-->>FE: SSE event: done (apply_mode: document)
    else style
        API->>LLM: reasoning stream (optional)
        API->>LLM: style prompt
        API->>AIM: check_integrity + retry
        API-->>FE: SSE event: token + done (diff, flags)
    else citation / structure / chat
        API->>LLM: task-specific handler
        API-->>FE: SSE event: token + done
    end
    FE->>FE: LatexDiffEditor + Accept/Reject
```

---

## 7. Guardrail Layers

```mermaid
flowchart TB
    L1["L1 Prompt Constraint ✅<br/>prompts.default.yaml"]
    L2["L2 Output Validation ✅<br/>numeric drift · length · semantic"]
    L3["L3 Diff Display ✅<br/>latex-diff-editor.tsx"]
    L4["L4 Audit Log ⚠️<br/>revision_history backend"]
    L1 --> L2 --> L3 --> L4
```

---

## 8. Citation Verifier (4-layer, layers 1–3 ✅)

```mermaid
flowchart LR
    IN[BibTeX + cite keys] --> L1{arXiv ID?}
    L1 -->|yes| ARX[arXiv API]
    L1 -->|no| L2{DOI?}
    L2 -->|yes| CR[CrossRef API]
    L2 -->|no| L3{Title?}
    L3 -->|yes| SS[Semantic Scholar]
    L3 -->|no| NF[not_found]
    ARX & CR & SS --> OUT[verified / possible_mismatch / not_found]
    OUT -.-> L4["L4 LLM relevance<br/>planned P2"]
```

---

## 9. Chat → Human Gate (End-to-End)

```mermaid
sequenceDiagram
    actor R as Researcher
    participant FE as Editor
    participant API as FastAPI
    participant Ario as Ario (LLM)

    R->>FE: "cải thiện đoạn intro"
    FE->>API: POST /chat/stream
    API->>Ario: style task + L1 prompts
    Ario-->>API: suggestion
    API->>API: L2 integrity check
    API-->>FE: done {suggestion, diff, flags}
    FE->>R: Diff đỏ/xanh trong editor
    R->>FE: Accept
    FE->>FE: Apply LaTeX · Ctrl+S lưu
```

---

## 10. Component Reference

| Component | Technology | Purpose | Status |
|-----------|-----------|---------|--------|
| Frontend | TanStack Start, React 19, shadcn/ui, Tailwind v4 | Editor, preview, chat, tools | ✅ |
| API client | `frontend/src/lib/api/academic.ts` | REST + SSE | ✅ |
| Backend | FastAPI, Pydantic | API server | ✅ |
| Agent | LangGraph (`src/agents/graph.py`) | Multi-task orchestration | ✅ |
| Stream service | `src/services/chat_stream.py` | SSE + template path | ✅ |
| LLM | OpenAI / Anthropic / OpenRouter | Inference | ✅ |
| Prompts | `src/prompts/prompts.default.yaml` | C9 external prompts | ✅ |
| Parser | `src/services/parser/latex.py` | Sections, cites, BibTeX | ✅ |
| Guardrails | `src/services/guardrails/integrity.py` | L2 validation | ✅ |
| Citations | `src/services/citations/verifier.py` | arXiv → CrossRef → S2 | ✅ |
| Session store | `sessions.py` + localStorage | Paper state MVP | ✅ |
| Database | PostgreSQL / SQLite | Persistent storage | *(planned)* |
| Logic / Review agents | LangGraph nodes | Debate & reply drafts | *(planned P2)* |
| Vector / RAG store | — | Not used (ARC C1 adapted to verifier only) | — |

---

## Tài liệu liên quan

- [ARCHITECTURE.md](../ARCHITECTURE.md) — mô tả đầy đủ kiến trúc & trạng thái triển khai
- [AutoResearchReferee.md](../AutoResearchReferee.md) — phân tích ARC adopt/adapt/drop
