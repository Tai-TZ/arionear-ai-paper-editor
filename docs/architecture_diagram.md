# Architecture Diagram — Arionear

**Tagline:** *Closer to Publication*  
**Cập nhật:** 04/10/2026 · Đồng bộ production v1.0 · sơ đồ sinh bởi [`scripts/build_diagrams.py`](../scripts/build_diagrams.py)  
**Live:** [https://arionear.id.vn/](https://arionear.id.vn/) · API: [https://api.arionear.id.vn](https://api.arionear.id.vn)

Sơ đồ bổ sung cho [ARCHITECTURE.md](../ARCHITECTURE.md). ✅ = đã triển khai · ⚠️ = một phần · *(planned)* = mục tiêu tương lai.

---

## 1. System Overview (Deployment)

<p align="center">
  <img src="./assets/system-overview.svg" alt="System overview: trình duyệt, Cloud Run, FastAPI, PostgreSQL, LLM providers, citation APIs" width="100%">
</p>

| Surface | URL / host | Ghi chú |
|---------|------------|---------|
| Frontend (prod) | `https://arionear.id.vn` | Custom domain → Cloud Run `arionear-web` |
| Backend API | `https://api.arionear.id.vn` | Custom domain → Cloud Run `arionear-api` + TeX compile |
| Database | `DIRECT_DATABASE_URL` | Papers, auth, profiles, templates, platform provider keys |

---

## 2. Four-Layer Product Architecture

<p align="center">
  <img src="./assets/architecture.svg" alt="Kiến trúc sản phẩm theo tầng: User, Processing, Human Gate, Output, Infrastructure" width="100%">
</p>

---

## 3. Frontend Routes & Components

<p align="center">
  <img src="./assets/frontend-routes.svg" alt="Frontend routes và các panel của editor shell" width="100%">
</p>

---

## 4. Backend API Surface

<p align="center">
  <img src="./assets/api-surface.svg" alt="Backend API surface dưới /api/v1 và các service tương ứng" width="100%">
</p>

---

## 5. LangGraph Agent Flow (sync `/chat`)

<p align="center">
  <img src="./assets/langgraph.svg" alt="LangGraph: route → parse → style/edit/structure/logic/citation/chat → integrity → respond" width="100%">
</p>

| Node | Module |
|------|--------|
| `logic_node` | `services/logic_audit/runner.py` + `debate.py` |
| `style_node` | `guardrails/integrity.py` + LLM |
| `citation_node` | `services/citations/verifier.py` |
| Stream-only `template` | `chat_stream.py` + `template_latex.py` |

---

## 6. SSE — Editor Chat (`/chat/stream`)

<p align="center">
  <img src="./assets/sse-chat.svg" alt="SSE editor chat: chat_stream.py rẽ nhánh theo task" width="100%">
</p>

---

## 7. Defense Mode (`/defense/stream`)

<p align="center">
  <img src="./assets/defense-flow.svg" alt="Defense mode: luồng mock viva qua defense_stream.py" width="100%">
</p>

---

## 8. Publication Score & Export Gate

<p align="center">
  <img src="./assets/export-gate.svg" alt="Publication score và export gate" width="100%">
</p>

Dimensions: structure, completeness, citations, compile health, peer-review signals from logic audit.

---

## 9. Template Gallery

<p align="center">
  <img src="./assets/template-gallery.svg" alt="Template gallery: chọn template, tạo paper mới, mở editor" width="100%">
</p>

---

## 10. Guardrail & Auth

<p align="center">
  <img src="./assets/guardrails.svg" alt="Guardrail 4 lớp" width="100%">
</p>

<p align="center">
  <img src="./assets/auth-session.svg" alt="Auth: đăng nhập, JWT, localStorage, Bearer" width="100%">
</p>

---

## 11. Citation Verifier (layers 1–3 ✅)

<p align="center">
  <img src="./assets/citation-verifier.svg" alt="Citation verifier: arXiv → CrossRef → Semantic Scholar" width="100%">
</p>

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
| LLM | OpenAI / Anthropic / OpenRouter / Z.AI / Gemini | Inference + key failover (`llm_failover.py`) | ✅ |
| Database | PostgreSQL, Prisma, SQLAlchemy | Papers, auth, profiles, templates, provider keys | ✅ |
| Auth | JWT + Google OAuth | Sign-in, 3-day default session | ✅ |
| Admin | `admin_routes.py` + `provider_key_store.py` | Users, LLM policy, platform API keys, priority failover, quotas | ✅ |
| Editor onboarding | `editor-onboarding-dialog.tsx` | First-run guide in editor (localPreference) | ✅ |
| Inngest | `inngest/` + hooks | Chat telemetry (optional) | ⚠️ |
| Citation L4 LLM | — | Relevance layer | *(planned)* |
| DOCX/PDF import | — | Non-LaTeX ingest | *(planned)* |

---

## Tài liệu liên quan

- [ARCHITECTURE.md](../ARCHITECTURE.md) — mô tả chi tiết kiến trúc
- [README.md](../README.md) — setup & Live URL (`https://arionear.id.vn`)
- [pdf-preview-deploy.md](./pdf-preview-deploy.md) — TeX & Docker ops
