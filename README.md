# Arionear — AI Trợ Lý Viết & Biên Tập Bài Báo Khoa Học

> **Tagline:** *Closer to Publication*  
> **Chương trình:** [Arionear](https://github.com/Tai-TZ/arionear-ai-paper-editor)

Arionear là nền tảng **Assisted Editing** giúp researcher cải thiện bản thảo LaTeX bằng trợ lý AI **Ario**. Mọi thay đổi hiển thị dưới dạng **diff** — người dùng **Accept/Reject** trước khi áp dụng; AI không tự publish thay tác giả.

**Luồng MVP chính:** đăng nhập → mở project → soạn LaTeX trong editor → chat Ario (style / structure / citation / template) → xem diff → Accept → compile PDF.

---

## Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| Frontend | TanStack Start, React 19, shadcn/ui, Tailwind v4, Vite |
| Backend | FastAPI, Python 3.11+, LangGraph |
| LLM | OpenRouter · OpenAI · Anthropic · Z.AI (GLM) |
| Database | Prisma + PostgreSQL |
| PDF | pdflatex + PDF.js + SyncTeX |

---

## Prerequisites

- **Python 3.11+**
- **Node.js 20+** và npm (hoặc Bun)
- **Git**
- **LLM API key** — ít nhất một trong: `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ZAI_API_KEY`, `ANTHROPIC_API_KEY`
- **TeX distribution** (tùy chọn, cho PDF preview): MiKTeX (Windows) / TeX Live (Linux/macOS)

---

## Setup

### 1. Clone repository

```bash
git clone https://github.com/Tai-TZ/arionear-ai-paper-editor.git
cd Arionear
```

### 2. Cấu hình môi trường

```bash
cp .env.example .env
# Mở .env và điền API keys + DATABASE_URL (xem bảng bên dưới)
```

### 3. Backend (Python)

```bash
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
```

**Database (Prisma Postgres):**

```bash
# Trong .env: DIRECT_DATABASE_URL=postgresql://... (bắt buộc cho backend)
# DATABASE_URL=prisma+postgres://... (cho npm run db:migrate)
npm install
npm run db:generate
npm run db:migrate
```

### 4. Frontend

```bash
cd frontend
npm install
cd ..
```

### 5. AI Usage Logging hooks (BTC deliverable)

```bash
# Linux / macOS / Git Bash
bash scripts/setup_hooks.sh

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File scripts\setup_hooks.ps1
```

### 6. Chạy development

Mở **hai terminal**. Backend và frontend phải dùng **cùng port** với `.env` (`APP_PORT`, mặc định trong `.env.example` là `8001`).

```bash
# Terminal 1 — Backend
python -m uvicorn src.main:app --host 127.0.0.1 --port 8001 --reload

# Terminal 2 — Frontend (proxy /api/v1 → backend)
cd frontend
# Nếu backend không chạy ở 8000, set proxy target:
# Windows PowerShell:
#   $env:VITE_DEV_API_PROXY="http://127.0.0.1:8001"; npm run dev
# macOS / Linux:
#   VITE_DEV_API_PROXY=http://127.0.0.1:8001 npm run dev
npm run dev
```

Mở trình duyệt tại URL Vite in ra (thường `http://localhost:8080`).

### 7. Kiểm tra nhanh

```bash
curl http://127.0.0.1:8001/health
curl http://127.0.0.1:8001/api/v1/status
curl http://127.0.0.1:8001/api/v1/compile/status
```

Kỳ vọng: `health` → `"status": "ok"`; `compile/status` → `"available": true` nếu đã cài TeX.

> **Lưu ý:** Chỉ chạy **một** instance uvicorn để tránh DB lock khi dùng PostgreSQL remote.

### 8. PDF Preview — cài TeX (local)

| OS | Lệnh |
|----|------|
| **Windows** | `winget install MiKTeX.MiKTeX` |
| **macOS** | `brew install --cask miktex` |
| **Linux** | `sudo apt install texlive-latex-base texlive-latex-extra texlive-fonts-recommended` |

Sau khi cài, restart terminal và chạy lại backend.

### 9. Docker (production backend)

```bash
docker compose build
docker compose up -d
curl http://localhost:8000/api/v1/compile/status
```

Docker image dùng port **8000** và đã gồm TeX Live. Chi tiết deploy: `docs/pdf-preview-deploy.md`.

---

## Environment Variables

Copy từ [`.env.example`](./.env.example). **Không commit file `.env`.**

### Bắt buộc (tối thiểu để chạy agent)

| Biến | Mô tả | Ví dụ |
|------|--------|-------|
| `LLM_PROVIDER` | Provider mặc định: `openrouter`, `openai`, `anthropic`, `zai` | `openrouter` |
| `OPENROUTER_API_KEY` | Key OpenRouter (nếu dùng OpenRouter) | `sk-or-...` |
| `OPENAI_API_KEY` | Key OpenAI (nếu dùng OpenAI) | `sk-...` |
| `ZAI_API_KEY` | Key Z.AI GLM (nếu dùng Z.AI) | `...` |
| `ANTHROPIC_API_KEY` | Key Anthropic (nếu dùng Claude) | `sk-ant-...` |
| `DATABASE_URL` | Prisma Accelerate URL (Prisma CLI) | `prisma+postgres://...` |
| `DIRECT_DATABASE_URL` | PostgreSQL TCP cho FastAPI/SQLAlchemy (**bắt buộc**) | `postgresql://...` |
| `AUTH_SECRET_KEY` | JWT secret — generate: `openssl rand -hex 32` | `a1b2c3...` |
| `AI_LOG_API_KEY` | Key BTC cho AI usage logging | *(từ link mời BTC)* |

> Cần **ít nhất một** LLM API key tương ứng với `LLM_PROVIDER`. Có thể đổi provider/model trực tiếp trong editor chat dock.

### Database (PostgreSQL / Prisma)

| Biến | Mô tả |
|------|--------|
| `DATABASE_URL` | URL cho Prisma CLI (có thể là `prisma+postgres://` Accelerate) |
| `DIRECT_DATABASE_URL` | URL TCP trực tiếp `postgresql://...` cho FastAPI/SQLAlchemy |

### App & CORS

| Biến | Mặc định | Mô tả |
|------|----------|--------|
| `APP_ENV` | `development` | `development` \| `production` \| `test` |
| `APP_PORT` | `8001` | Port backend (khớp lệnh uvicorn) |
| `APP_HOST` | `127.0.0.1` | Host bind |
| `CORS_ORIGINS` | `http://localhost:8080,...` | Origins frontend được phép |
| `FRONTEND_BASE_URL` | `http://localhost:8080` | URL frontend (email/OAuth redirect) |
| `BACKEND_BASE_URL` | `http://127.0.0.1:8001` | URL backend công khai |

### Auth & OAuth (tùy chọn)

| Biến | Mô tả |
|------|--------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | VD: `http://127.0.0.1:8001/api/v1/auth/google/callback` |
| `SMTP_*` | Gửi email xác minh đăng ký (dev: code in ra log) |

### Observability (tùy chọn)

| Biến | Mô tả |
|------|--------|
| `LANGCHAIN_API_KEY` | LangSmith tracing (deliverable AI Logs) |
| `LANGCHAIN_PROJECT` | Tên project trên LangSmith |
| `LANGCHAIN_TRACING_V2` | `true` để bật trace |
| `INNGEST_DEV` | `1` để chạy Inngest dev server local |
| `AI_LOG_SERVER` | Endpoint submit AI logs (pre-configured BTC) |

### Frontend build

| Biến | Mô tả |
|------|--------|
| `VITE_DEV_API_PROXY` | Target proxy dev (VD: `http://127.0.0.1:8001`) |
| `VITE_API_URL` | API URL khi build production |

Danh sách đầy đủ và comment: [`.env.example`](./.env.example).

---

## Sample Queries

Các ví dụ dưới đây dùng bản thảo mẫu ngắn. Trong UI, mở `/editor`, paste LaTeX vào `main.tex`, rồi gửi prompt tương ứng trong chat Ario.

**LaTeX mẫu** (`SAMPLE_LATEX` trong `frontend/src/lib/project-store.ts`):

```latex
\documentclass{article}
\begin{document}
\begin{abstract}
Machine learning models achieve strong results but often lack interpretability.
\end{abstract}
\section{Introduction}
Prior work cites \cite{smith2020}.
\end{document}
```

### Trong Editor (UI)

| # | Task | Sample query (gửi trong chat) | Kỳ vọng |
|---|------|------------------------------|---------|
| 1 | `chat` | Giải thích ngắn gọn abstract của bài này bằng tiếng Việt | Trả lời tiếng Việt, không diff |
| 2 | `style` | Chỉnh sửa abstract cho văn phong học thuật hơn | Diff đỏ/xanh + Accept/Reject |
| 3 | `structure` | Phân tích cấu trúc IMRaD của bài này | Gợi ý section thiếu/thừa |
| 4 | `template` | Thêm các section IMRaD còn thiếu | Gợi ý skeleton IMRaD |
| 5 | `citation` | Kiểm tra trích dẫn trong bài | Báo cáo verify từng cite key |
| 6 | compile | Nhấn **Compile** trên toolbar | PDF preview bên phải |

Bạn cũng có thể **bôi đen** một đoạn trong editor → **Quick Edit** (`Ctrl+K`) với prompt như: *"Viết lại đoạn này trang trọng hơn"*.

### Qua API (`curl`)

Thay `8001` nếu backend chạy port khác. Body dùng `latex_content` để Ario có ngữ cảnh manuscript.

**TC1 — Chat**

```bash
curl -s -X POST http://127.0.0.1:8001/api/v1/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Giải thích ngắn gọn abstract của bài này bằng tiếng Việt\",\"task\":\"chat\",\"latex_content\":\"\\\\documentclass{article}\\\\begin{document}\\\\begin{abstract}Machine learning models achieve strong results but often lack interpretability.\\\\end{abstract}\\\\end{document}\"}"
```

**TC2 — Style**

```bash
curl -s -X POST http://127.0.0.1:8001/api/v1/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Chỉnh sửa abstract cho văn phong học thuật hơn\",\"task\":\"style\",\"latex_content\":\"\\\\documentclass{article}\\\\begin{document}\\\\begin{abstract}Machine learning models achieve strong results but often lack interpretability.\\\\end{abstract}\\\\end{document}\"}"
```

**TC3 — Structure**

```bash
curl -s -X POST http://127.0.0.1:8001/api/v1/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Phân tích cấu trúc IMRaD của bài này\",\"task\":\"structure\",\"latex_content\":\"\\\\documentclass{article}\\\\begin{document}\\\\begin{abstract}...\\\\end{abstract}\\\\section{Introduction}...\\\\end{document}\"}"
```

**TC4 — Template (SSE stream — luồng chính của editor)**

```bash
curl -N -X POST http://127.0.0.1:8001/api/v1/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d "{\"message\":\"Thêm các section IMRaD còn thiếu\",\"task\":\"template\",\"latex_content\":\"\\\\documentclass{article}\\\\begin{document}\\\\begin{abstract}Test\\\\end{abstract}\\\\end{document}\"}"
```

**TC5 — Compile PDF**

```bash
curl -s -X POST http://127.0.0.1:8001/api/v1/compile \
  -H "Content-Type: application/json" \
  -d "{\"latex_content\":\"\\\\documentclass{article}\\\\begin{document}Hello Arionear.\\\\end{document}\",\"main_file\":\"main.tex\"}"
```

**TC6 — Citation verify**

```bash
# Tạo session trước
curl -s -X POST http://127.0.0.1:8001/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"eval\",\"latex_content\":\"\\\\cite{smith2020}\",\"metadata\":{}}"

# Verify (thay SESSION_ID)
curl -s -X POST http://127.0.0.1:8001/api/v1/citations/verify \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"SESSION_ID\",\"latex_content\":\"\\\\cite{smith2020}\",\"bib_content\":\"@article{smith2020, title={Deep Learning}, year={2020}}\"}"
```

Kết quả eval thực tế (6 test cases): [`eval/results/_live_outputs.json`](./eval/results/_live_outputs.json).

### API tham khảo

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/health` | Health + DB status |
| GET | `/api/v1/status` | Agent name, provider, storage |
| GET | `/api/v1/providers` | LLM providers khả dụng |
| POST | `/api/v1/sessions` | Tạo paper session |
| POST | `/api/v1/chat` | Chat sync (LangGraph) |
| POST | `/api/v1/chat/stream` | Chat SSE (editor chính) |
| POST | `/api/v1/citations/verify` | Xác minh trích dẫn |
| POST | `/api/v1/compile` | Compile LaTeX → PDF |
| POST | `/api/v1/auth/login` | Đăng nhập JWT |
| GET/POST | `/api/v1/papers` | CRUD papers (cần auth) |

---

## Testing

```bash
# Backend unit/integration tests
pytest tests/ -v

# Lint
ruff check src tests
```

---

## Documentation

| Tài liệu | Nội dung |
|----------|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Kiến trúc 4 tầng, agents, guardrail |
| [docs/architecture_diagram.md](./docs/architecture_diagram.md) | Sơ đồ component & data flow |
| [ROADMAP.md](./ROADMAP.md) | Lộ trình phase |
| [eval/results/report.md](./eval/results/report.md) | Báo cáo đánh giá |
| [eval/results/gate3_summary.md](./eval/results/gate3_summary.md) | Gate 3 metrics (11 metrics vs baseline) |
| [REPORT_GATE3.md](./REPORT_GATE3.md) | Gate 3 — production, eval, guardrails |
| [docs/GUARDRAILS.md](./docs/GUARDRAILS.md) | Guardrail 4 lớp |
| [eval/results/guardrails.html](./eval/results/guardrails.html) | Báo cáo Guardrails (HTML) |
| [eval/results/evaluation-metrics.html](./eval/results/evaluation-metrics.html) | Gate 3 metrics (HTML) |
| [eval/results/cost-report.html](./eval/results/cost-report.html) | Cost report (HTML) |
| [Technical Guidebook](https://phoenix.note.transformerlabs.ai/technical-book) | Hướng dẫn Arionear 10 chương |

---

## AI Usage Logging

Hooks tự động log prompt khi dùng Cursor, Claude Code, Codex, Gemini CLI, Copilot. Log lưu tại `.ai-log/session.jsonl` và submit khi `git push`.

```bash
# Log thủ công (ChatGPT / web)
bash scripts/_pyrun.sh scripts/log_manual.py --tool chatgpt --prompt "What you asked"
```

---

## Team

| Thành viên | MSSV |
|------------|------|
| **Nguyễn Trọng Nguyên** | *** |
| **Nguyễn Thành Tài** | *** |
| **Ngô Thị Ánh** | *** |


---

## License

MIT — Sử dụng tự do cho mục đích giáo dục.
