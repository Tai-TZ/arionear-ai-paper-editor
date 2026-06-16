# Database Setup — Arionear (Prisma + PostgreSQL + FastAPI)

Arionear dùng **Prisma** để định nghĩa schema & tạo bảng trên PostgreSQL.  
Backend **Python/FastAPI** kết nối qua **SQLAlchemy** cùng `DIRECT_DATABASE_URL`.

```
prisma/schema.prisma  →  định nghĩa bảng (source of truth)
         ↓
Prisma Migrate / db push  →  tạo bảng trên PostgreSQL
         ↓
DIRECT_DATABASE_URL trong .env  →  FastAPI (SQLAlchemy) đọc/ghi dữ liệu
```

---

## Database Schema (ERD)

Sơ đồ dưới đây mirror `prisma/schema.prisma` — bám ERD gốc [`scientific_paper_assistant_erd.html`](../Db_Design_template/scientific_paper_assistant_erd.html) với vài field bổ sung cho Arionear Phase 1.

> Xem trực quan: mở file này trên GitHub / VS Code (Markdown Preview) — Mermaid sẽ render diagram tự động.

```mermaid
erDiagram
  users {
    uuid id PK
    string email UK
    string full_name
    string institution
    string native_language
    string research_field
    enum role
    timestamp created_at
    timestamp last_active_at
  }

  papers {
    uuid id PK
    uuid user_id FK "nullable"
    string title
    enum status
    string target_journal
    string citation_style
    string language_level
    text raw_latex "Arionear: full LaTeX blob"
    json metadata
    timestamp created_at
    timestamp updated_at
  }

  paper_sections {
    uuid id PK
    uuid paper_id FK
    enum section_type
    int order_index
    text original_content
    text current_content
    int word_count
    timestamp updated_at
  }

  ai_sessions {
    uuid id PK
    uuid paper_id FK
    uuid section_id FK "nullable"
    uuid user_id FK "nullable"
    enum task_type
    text user_input
    text ai_output
    json metadata
    int tokens_used
    float confidence_score
    timestamp created_at
  }

  suggestions {
    uuid id PK
    uuid session_id FK
    uuid section_id FK "nullable"
    enum suggestion_type
    text original_text
    text suggested_text
    string section_label "Arionear: intro/methods/…"
    text explanation
    text diff
    enum status
    timestamp created_at
    timestamp resolved_at
  }

  citations {
    uuid id PK
    uuid paper_id FK
    string citation_key UK "per paper"
    enum citation_type
    string authors
    string title
    string journal
    int year
    string doi
    string eprint
    text raw_text
    json formatted_styles
    enum verification_status "Arionear"
    text verification_message
    json verification_layers
    timestamp created_at
  }

  citation_usages {
    uuid id PK
    uuid citation_id FK
    uuid section_id FK
    int position_start
    int position_end
    text context_snippet
  }

  reviewer_comments {
    uuid id PK
    uuid paper_id FK
    string reviewer_label
    text comment_text
    enum severity
    enum category
    timestamp created_at
  }

  response_suggestions {
    uuid id PK
    uuid comment_id FK
    uuid session_id FK
    text suggested_response
    text revision_note
    enum status
    timestamp created_at
  }

  audit_logs {
    uuid id PK
    uuid user_id FK "nullable"
    uuid paper_id FK "nullable"
    enum action_type
    json before_state
    json after_state
    string ip_address
    timestamp created_at
  }

  users ||--o{ papers : owns
  users ||--o{ ai_sessions : runs
  users ||--o{ audit_logs : tracked_in

  papers ||--o{ paper_sections : contains
  papers ||--o{ ai_sessions : has
  papers ||--o{ citations : includes
  papers ||--o{ reviewer_comments : receives
  papers ||--o{ audit_logs : logged_in

  paper_sections ||--o{ ai_sessions : targets
  paper_sections ||--o{ suggestions : gets
  paper_sections ||--o{ citation_usages : references

  ai_sessions ||--o{ suggestions : produces
  ai_sessions ||--o{ response_suggestions : generates

  citations ||--o{ citation_usages : used_in

  reviewer_comments ||--o{ response_suggestions : addressed_by
```

### Trạng thái triển khai theo bảng

| Bảng | Phase | Backend đã dùng? | Ghi chú |
|------|-------|------------------|---------|
| `papers` | **P1** ✅ | Có | `POST/GET/PATCH /api/v1/sessions` |
| `suggestions` | **P1** ✅ | Có | Revision accept/reject |
| `citations` | **P1** ✅ | Có | `POST /api/v1/citations/verify` |
| `ai_sessions` | **P1** ✅ | Có (auto) | Tạo khi có suggestion |
| `users` | P2 | Chưa | Auth chưa có |
| `paper_sections` | P2 | Chưa | Parse LaTeX → sections |
| `citation_usages` | P2 | Chưa | Track vị trí cite trong section |
| `reviewer_comments` | P2 | Chưa | Peer-review agent |
| `response_suggestions` | P2 | Chưa | Reviewer response drafts |
| `audit_logs` | P3 | Chưa | Academic integrity audit trail |

### So với ERD template gốc

| Thay đổi | Lý do |
|----------|-------|
| `papers.raw_latex` | Editor hiện lưu full LaTeX blob, chưa tách section |
| `papers.metadata` | JSON linh hoạt (journal template, LLM prefs) |
| `suggestions.section_label` + `diff` | Khớp Human Gate / diff view |
| `citations.verification_*` | Lưu kết quả 4-layer citation verifier |
| `user_id` nullable | Chưa có auth — paper vẫn tạo được |

---

## Bước 1 — Tạo database trên Prisma Postgres

1. Đăng nhập [Prisma Data Platform](https://console.prisma.io)
2. **New project** → chọn **Prisma Postgres**
3. Copy **2 connection strings** từ tab **Connect**:
   - **Prisma Accelerate** → `DATABASE_URL` (cho Prisma CLI)
   - **Direct TCP** → `DIRECT_DATABASE_URL` (cho FastAPI)
4. Dán vào `.env`:
   ```env
   DATABASE_URL=prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_KEY
   DIRECT_DATABASE_URL=postgres://USER:PASSWORD@db.prisma.io:5432/postgres?sslmode=require
   ```

> **Lưu ý:** Không commit `.env`. Chỉ commit `.env.example`.

---

## Bước 2 — Cài Prisma CLI (Node.js)

Cần Node.js 18+.

```bash
# Từ root project
npm install
```

---

## Bước 3 — Push schema lên database

**Lần đầu** (tạo toàn bộ bảng):

```bash
# Tạo migration có tên (khuyên dùng cho team)
npm run db:migrate
# Prisma sẽ hỏi tên migration, ví dụ: init_arionear_schema

# Hoặc push nhanh không tạo file migration (chỉ dev cá nhân)
npm run db:push
```

Kiểm tra bảng đã tạo:

```bash
npm run db:studio
```

Mở browser tại `http://localhost:5555` — xem/sửa dữ liệu trực quan.

---

## Bước 4 — Cài Python dependencies & chạy backend

```bash
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

Kiểm tra kết nối:

```bash
curl http://localhost:8000/health
# {"status":"ok","env":"development","database":"connected"}

curl http://localhost:8000/api/v1/status
# {"storage":"postgresql", ...}
```

---

## Bước 5 — Test API session (paper persistence)

```bash
# Tạo paper/session
curl -X POST http://localhost:8000/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"name":"My Paper","latex_content":"\\documentclass{article}\\begin{document}Hi\\end{document}"}'

# Lấy lại (thay SESSION_ID)
curl http://localhost:8000/api/v1/sessions/SESSION_ID
```

Dữ liệu được lưu vào bảng `papers` (không mất khi restart server).

---

## Phương án thay thế

### Local PostgreSQL (Docker)

```bash
docker run --name arionear-db -e POSTGRES_USER=arionear -e POSTGRES_PASSWORD=arionear -e POSTGRES_DB=arionear -p 5432:5432 -d postgres:16-alpine
```

`.env`:
```env
DATABASE_URL=postgresql://arionear:arionear@localhost:5432/arionear
```

Sau đó chạy `npm run db:migrate` như bước 3.

### SQLite (dev nhanh, không cần Prisma migrate)

`.env`:
```env
DATABASE_URL=sqlite:///./data/app.db
```

Backend tự `create_all` bảng khi khởi động. **Không dùng** cho production.

---

## Mapping ERD → Code hiện tại

Chi tiết diagram ở [Database Schema (ERD)](#database-schema-erd) phía trên.

| ERD table | API hiện tại | Ghi chú |
|-----------|--------------|---------|
| `papers` | `POST/GET/PATCH /sessions/{id}` | `title` = name, `raw_latex` = latex_content |
| `suggestions` | `POST /revisions/{session}/{id}` | Revision accept/reject |
| `citations` | `POST /citations/verify` | Lưu kết quả verify |
| `ai_sessions` | (auto) | Tạo khi có suggestion/chat |
| `users` | — | Phase 2 (auth) |
| `paper_sections` | — | Phase 2 (parse LaTeX → sections) |
| `reviewer_comments` | — | Planned P2 |

---

## Troubleshooting

| Lỗi | Cách xử lý |
|-----|------------|
| `database: disconnected` | Kiểm tra `DATABASE_URL`, DB đang chạy, firewall/SSL |
| `relation "papers" does not exist` | Chạy `npm run db:migrate` hoặc `npm run db:push` |
| `storage: in-memory` | `DATABASE_URL` chưa set hoặc init DB thất bại — xem log uvicorn |
| Prisma P1001 | Host/port sai hoặc DB chưa start |

---

## Files liên quan

| File | Vai trò |
|------|---------|
| `prisma/schema.prisma` | Schema đầy đủ 10 bảng |
| `src/db/models.py` | SQLAlchemy models (mirror Prisma) |
| `src/db/paper_repository.py` | CRUD papers/suggestions/citations |
| `src/services/sessions.py` | Adapter API-facing `PaperSession` |
| `Db_Design_template/scientific_paper_assistant_erd.html` | ERD gốc tham khảo |
