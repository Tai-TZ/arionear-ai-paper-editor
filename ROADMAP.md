# ROADMAP — Arionear (Arionear)

**Tagline:** *Closer to Publication*  
**Cập nhật:** 16/06/2026  
**Tham chiếu:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [AutoResearchReferee.md](./AutoResearchReferee.md)

---

## 1. Tầm nhìn sản phẩm

Arionear là nền tảng **Assisted Editing** — AI đóng vai biên tập viên (**Ario**), giúp researcher cải thiện bản thảo học thuật **không thay đổi ý nghĩa khoa học** và **không bịa dữ liệu**. Mọi output AI đều qua **Human Gate** (diff + Accept/Reject).

### Nguyên tắc bất biến (mọi phase)

| # | Nguyên tắc |
|---|------------|
| 1 | **Human Supremacy** — Researcher quyết định cuối; AI không commit thay đổi |
| 2 | **Transparent AI** — Mọi can thiệp hiển thị, audit được, export được |
| 3 | **Containment** — LLM chỉ làm việc trên thông tin có trong bản thảo |
| 4 | **Graceful degradation** — Guardrail fail → trả “không suggestion an toàn”, không ép output rủi ro |
| 5 | **Researcher attribution** — Bài báo là của researcher; AI là công cụ |

### Cố ý loại bỏ (từ ARC)

- **Experiment Sandbox** — nguy cơ fabrication dữ liệu thực nghiệm  
- **PIVOT/REFINE loop** — AI không được đóng vai investigator  

---

## 2. Trạng thái hiện tại (baseline 16/06/2026)

Sau merge PR [#11](https://github.com/Tai-TZ/arionear-ai-paper-editor/pull/11) vào `develop`.

### ✅ Đã hoàn thành

| Lớp | Thành phần | Ghi chú |
|-----|------------|---------|
| **Editor** | LaTeX multi-file, Overleaf ZIP import, compile log, PDF.js preview | Overleaf-style |
| **Editor** | SyncTeX inverse (double-click PDF → source), word/context disambiguation, highlight + auto-scroll | |
| **Backend** | LaTeX compile multi-engine (pdflatex/xelatex/lualatex), latexmk, biber, stubs | |
| **AI — Orchestrator** | LangGraph + SSE streaming (`chat_stream.py`) | |
| **AI — Agents** | Style, Structure, Citation, Template (IMRAD), Chat (Ario) | |
| **AI — Routing** | Intent router (regex + LLM classifier) | |
| **AI — Guardrail** | L1 prompt constraint, L2 integrity check + retry, L3 diff gate | |
| **AI — Citation** | 4-layer verify: arXiv → CrossRef → Semantic Scholar | Lớp 4 LLM chưa có |
| **Infra** | JWT auth, Prisma/Postgres papers API, dark/light theme | |
| **DevOps** | CI (pytest + ruff), Docker backend, AI usage logging hooks | |

### ⚠️ Còn thiếu / partial

| Thành phần | Gap |
|------------|-----|
| Guardrail **L4** | API `revisionAction` có; frontend **chưa gọi** khi Accept |
| Session store | Papers lưu DB; `revision_history`, `citation_registry` session **chưa persist đầy đủ** |
| Researcher profile | Chưa có schema/UI preference (template, citation style, LLM, integrity level) |
| Tài liệu | `ARCHITECTURE.md` vẫn ghi mock auth / in-memory ở vài chỗ |
| Logic / Review agents | Chưa có (P2) |
| DOCX/PDF parser | Chỉ LaTeX + ZIP (P2) |

---

## 3. Bản đồ AI trong dự án

```mermaid
flowchart TB
    subgraph Input
        U[Researcher]
        DOC[LaTeX / ZIP / selection]
    end

    subgraph Routing
        IR[Intent Router]
    end

    subgraph Agents["AI Agents (LangGraph + SSE)"]
        A1[Style Agent]
        A2[Structure Analyzer]
        A3[Citation Verifier]
        A4[Template Generator]
        A5[Chat — Ario]
        A6[Logic Audit — P2]
        A7[Peer-Review Response — P2]
    end

    subgraph Guardrails
        L1[L1 Prompt YAML]
        L2[L2 Integrity Monitor]
        L3[L3 Diff Gate]
        L4[L4 Audit Log — partial]
    end

    subgraph LLM
        P[OpenAI / Anthropic / OpenRouter]
    end

    subgraph External
        E1[arXiv · CrossRef · Semantic Scholar]
        E2[OpenAlex — P2]
    end

    U --> DOC --> IR
    IR --> A1 & A2 & A3 & A4 & A5
    A1 & A2 & A4 & A5 --> P
    A3 --> E1
    A3 -.-> E2
    A1 --> L1 --> L2 --> L3 --> L4
    L3 --> U
```

| Agent | Input | Output | LLM? | Trạng thái |
|-------|-------|--------|------|------------|
| **Ario (chat)** | Message + latex context + selection | Text / gợi ý chung | ✅ | ✅ |
| **Style** | Selection hoặc section | Polished text + diff | ✅ | ✅ |
| **Structure** | Parsed sections | JSON suggestions | ✅ (rules + LLM) | ✅ |
| **Citation** | Cite keys + BibTeX | Status report 4 lớp | ❌ (L1–3) / ✅ (L4 P2) | ✅ L1–3 |
| **Template** | Chat “sườn IMRAD” | Full document skeleton + diff | ✅ (template_latex) | ✅ |
| **Logic Audit** | Full draft | Conflict report (comment only) | ✅ multi-agent | 🔜 P2 |
| **Peer-Review** | Reviewer comments + draft | Response draft Major/Minor | ✅ | 🔜 P2 |

---

## 4. Lộ trình theo phase

### Phase 1 — Foundation MVP ✅ *(đóng)*

**Mục tiêu:** Core pipeline + guardrail cơ bản + human gate.

| # | Hạng mục | Trạng thái |
|---|----------|------------|
| 1.1 | LaTeX parser + editor | ✅ |
| 1.2 | Style Agent + L1–L2 guardrail | ✅ |
| 1.3 | Citation Verifier (L1–3 deterministic) | ✅ |
| 1.4 | Human Gate UI (diff Accept/Reject) | ✅ |
| 1.5 | Structure + Template + Chat streaming | ✅ |
| 1.6 | Prompts external YAML (C9) | ✅ |

**Deliverable:** Style fix + citation validation + diff gate — **đạt**.

---

### Phase 1.5 — Hardening & Trust *(ưu tiên hiện tại)*

**Mục tiêu:** Đóng gap tin cậy (L4), persistence đầy đủ, editor production-ready, docs đồng bộ.

**Thời gian gợi ý:** 1–2 tuần

#### 1.5.1 Guardrail L4 — Audit log đầy đủ

| Task | Mô tả | File / API liên quan | Ưu tiên |
|------|--------|----------------------|---------|
| Wire `revisionAction` on Accept | Gọi `POST /revisions/{session_id}/{revision_id}` khi user Accept gợi ý | `editor.tsx`, `suggestion-panel.tsx` | **P0** |
| Wire on Reject | Ghi `rejected` vào revision history | Cùng trên | P1 |
| Hiển thị revision history | Panel hoặc tab “Revisions” trong editor | Frontend mới | P2 |
| Blocking flags | Giữ disable Accept khi integrity blocking | Đã có — verify E2E | P1 |

**Done khi:** Mọi Accept/Reject đều persist; có thể truy vết “AI đã sửa gì”.

#### 1.5.2 Persistence & session store

| Task | Mô tả | Ưu tiên |
|------|--------|---------|
| Persist `revision_history` theo paper/session | Prisma schema + API | **P0** |
| Persist `citation_registry` sau verify | Tránh verify lại mỗi lần mở project | P1 |
| Multi-file project qua API ổn định | `files`, `mainFile`, `compiler` trong metadata | ✅ cơ bản — harden |
| Session sync | `syncSession()` + papers API thống nhất | P1 |

#### 1.5.3 Editor & compile (non-AI nhưng blocker UX)

| Task | Mô tả | Trạng thái |
|------|--------|------------|
| Dev proxy port 8000 thống nhất | `vite.config.ts` | ✅ |
| SyncTeX word/context disambiguation | Backend + frontend | ✅ |
| Horizontal scroll tới từ highlight | `latex-code-editor.tsx` | ✅ — monitor edge cases |
| Compile CI smoke test | `test_latex_compile.py` mở rộng | P2 |

#### 1.5.4 Researcher profile (foundation cho P2)

| Task | Mô tả | Ưu tiên |
|------|--------|---------|
| Schema `UserProfile` / metadata JSON | Affiliation, ORCID, default template, citation style, LLM preference, integrity strictness | P1 |
| API `GET/PATCH /users/me/profile` | Backend | P1 |
| UI Settings trong editor | Tab Settings hoặc `/profile` | P2 |

**Deliverable P1.5:** Audit trail hoạt động + DB persist revision/citation + profile skeleton + docs cập nhật.

---

### Phase 2 — Intelligence *(multi-agent mở rộng)*

**Mục tiêu:** Logic check, peer-review assist, import đa định dạng, citation nâng cao.

**Thời gian gợi ý:** 3–5 tuần  
**Phụ thuộc:** P1.5 L4 + persistence

#### 2.1 Logic Audit Panel (ARC C2 adapt)

| Task | Mô tả |
|------|--------|
| `logic_node` trong LangGraph | Route intent `logic` |
| Multi-agent debate (2–3 personas) | Chỉ **comment** — không sửa draft |
| UI Logic Audit Panel | Danh sách conflict / weak claim / missing evidence |
| Guardrail | Không được thêm claim mới; output structured JSON |

**Done khi:** User gửi “kiểm tra logic” → nhận báo cáo conflict, không auto-apply.

#### 2.2 Peer-Review Response Agent

| Task | Mô tả |
|------|--------|
| `review_node` + intent `review` | Parse reviewer comments (paste hoặc upload) |
| Phân loại Major / Minor / Reject | Structured output |
| Draft phản hồi từng điểm | Human gate diff trước khi copy |
| `peer_review_log` trong session store | Persist theo paper |

#### 2.3 Unified Document Parser

| Task | Mô tả |
|------|--------|
| `LaTeXAdapter` | ✅ hiện có |
| `DOCXAdapter` | mammoth/python-docx → `PaperStructure` |
| `PDFAdapter` | pdfplumber/pymupdf → text + heuristic sections |
| Upload UI | `/projects` + editor import DOCX/PDF |
| Normalize → LaTeX hoặc internal AST | Đưa vào cùng pipeline AI |

#### 2.4 Citation nâng cao

| Task | Mô tả |
|------|--------|
| OpenAlex integration | Literature suggest + validate bổ sung |
| **Lớp 4** LLM relevance scoring | “Citation có support claim không?” |
| Citation.js / format reformat | IEEE, APA, Vancouver — deterministic rules |
| DataCite | DOI metadata fallback |

#### 2.5 Structure & Template nâng cao

| Task | Mô tả |
|------|--------|
| Journal-specific templates | IEEE, Elsevier, Springer skeletons |
| Structure auto-apply (optional) | Diff cho từng suggestion — user bật/tắt |
| LLM intent classifier ổn định hơn | Giảm fallback regex |

**Deliverable P2:** Full assisted-editing feature set theo ARC adapt — logic + review + multi-format import + citation L4.

---

### Phase 3 — Scale, Learning & Production

**Mục tiêu:** Production-ready, institution deploy, học từ usage (anonymized).

**Thời gian gợi ý:** 4–8 tuần  
**Phụ thuộc:** P2 stable + đủ session data

| # | Hạng mục | Mô tả |
|---|----------|--------|
| 3.1 | **MetaClaw** (ARC C8) | Học pattern “loại edit hay bị reject” — chỉ metadata ẩn danh |
| 3.2 | **AI Contribution Report** | Export PDF/JSON cho journal disclosure |
| 3.3 | **LangSmith production** | Trace end-to-end, eval datasets, regression |
| 3.4 | **Cost guardrail** | Token budget per session, model routing theo task |
| 3.5 | **Performance** | Cache citation verify, async compile queue, CDN PDF |
| 3.6 | **On-premise package** | Docker compose full stack + air-gapped LLM option |
| 3.7 | **Semantic integrity scoring** | Embedding/model score thay vì chỉ rule-based L2 |
| 3.8 | **Domain calibration** | Ngưỡng embedding theo lĩnh vực (y sinh, CS, …) |

**Deliverable P3:** Deploy được cho institution; báo cáo AI contribution; quality học dần từ usage.

---

## 5. Ma trận ưu tiên (Q3 2026)

| Ưu tiên | ID | Task | Phase | Effort |
|---------|-----|------|-------|--------|
| **P0** | R1 | Wire `revisionAction` on Accept/Reject | 1.5 | S |
| **P0** | R2 | Persist revision_history DB | 1.5 | M |
| **P1** | R3 | Persist citation_registry | 1.5 | M |
| **P1** | R4 | Researcher profile schema + API | 1.5 | M |
| **P1** | R5 | Cập nhật ARCHITECTURE + diagram | 1.5 | S |
| **P2** | R6 | Logic Audit Panel | 2 | L |
| **P2** | R7 | Peer-Review Response Agent | 2 | L |
| **P2** | R8 | DOCX import adapter | 2 | M |
| **P2** | R9 | OpenAlex + Citation L4 | 2 | M |
| **P3** | R10 | AI Contribution Report export | 3 | M |
| **P3** | R11 | MetaClaw opt-in | 3 | L |

*Effort: S = vài ngày, M = 1–2 tuần, L = 2+ tuần*

---

## 6. Milestone & timeline gợi ý

```mermaid
gantt
    title Arionear Roadmap 2026
    dateFormat YYYY-MM-DD
    section P1 MVP
    Core agents + guardrail L1-L3     :done, p1, 2026-05-29, 2026-06-13
    Editor PDF SyncTeX Auth DB        :done, p1b, 2026-06-14, 2026-06-16
    section P1.5 Hardening
    L4 revisionAction + DB persist    :active, p15, 2026-06-17, 2026-06-30
    Researcher profile + docs sync    :p15b, 2026-06-24, 2026-07-07
    section P2 Intelligence
    Logic Audit Panel                 :p2a, 2026-07-01, 2026-07-21
    Peer-Review Response              :p2b, 2026-07-15, 2026-08-04
    DOCX/PDF parser + OpenAlex        :p2c, 2026-07-22, 2026-08-18
    section P3 Scale
    MetaClaw + AI Report + on-prem    :p3, 2026-08-19, 2026-10-15
```

---

## 7. Tiêu chí “xong” từng phase

| Phase | Tiêu chí đạt |
|-------|----------------|
| **P1** | User compile LaTeX, chat Ario, nhận style/citation/structure suggestion qua diff, Accept/Reject — **đạt** |
| **P1.5** | Accept ghi audit DB; mở lại project thấy lịch sử revision; citation registry không mất |
| **P2** | Logic audit + peer-review draft; import DOCX; citation L4 + OpenAlex |
| **P3** | Export AI contribution report; LangSmith eval pass; on-prem docker one-command |

---

## 8. Rủi ro & phụ thuộc

| Rủi ro | Giảm thiểu |
|--------|------------|
| LLM hallucination trên citation L4 | L1–3 deterministic trước; L4 chỉ advisory |
| Chi phí token P2 multi-agent | Cost guardrail P3; model nhỏ cho routing |
| DOCX/PDF parse chất lượng kém | Human review step; giữ LaTeX là source of truth |
| Disk / MiKTeX trên Windows dev | Document compile requirements; CI Linux |
| Profile/PII | Opt-in; encrypt at rest; retention policy |

---

## 9. Việc tiếp theo (tuần này)

1. **R1** — Wire `revisionAction` khi Accept/Reject trong `suggestion-panel.tsx` / `editor.tsx`  
2. **R2** — Migration Prisma + API lưu `revision_history` theo paper  
3. **R5** — Cập nhật `ARCHITECTURE.md` §11 (auth ✅, DB ✅, SyncTeX ✅)  
4. Chạy E2E: compile → chat style → Accept → reload project → thấy revision trong DB  

---

## 10. Tài liệu liên quan

| File | Nội dung |
|------|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Kiến trúc 4 tầng, guardrail, API |
| [AutoResearchReferee.md](./AutoResearchReferee.md) | Phân tích ARC adopt/adapt/drop |
| [docs/DATABASE_SETUP.md](./docs/DATABASE_SETUP.md) | Prisma + Postgres setup |
| [WORKLOG.md](./WORKLOG.md) | Nhật ký team theo ngày |

---

*Roadmap sống — cập nhật khi merge PR hoặc thay đổi ưu tiên sprint.*
