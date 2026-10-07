# PDF Preview — Deploy & Operations

Editor compile LaTeX server-side (`POST /api/v1/compile`) and renders the PDF with PDF.js in the browser.

## Local development

Each developer needs a TeX engine on their machine:

| OS | Install |
|----|---------|
| Windows | `winget install MiKTeX.MiKTeX` |
| macOS | `brew install --cask miktex` |
| Linux | `sudo apt install texlive-latex-base texlive-latex-extra texlive-fonts-recommended texlive-bibtex-extra` |

Run backend + frontend:

```bash
uvicorn src.main:app --reload --port 8000
cd frontend && npm run dev
```

Verify:

```bash
curl http://localhost:8000/api/v1/compile/status
# {"available": true, "engine": "...pdflatex..."}
```

## Production (Docker)

The production `Dockerfile` installs TeX Live. Developers do **not** need MiKTeX on the server if using Docker.

```bash
docker compose build
docker compose up -d
curl http://localhost:8000/api/v1/compile/status
```

### Environment variables

| Variable | Development | Production |
|----------|-------------|------------|
| `APP_ENV` | `development` | `production` |
| `CORS_ORIGINS` | `http://localhost:5173,...` | `https://app.your-domain.com` |
| `VITE_API_URL` | (unset: same-origin `/api/v1` via the Vite proxy) | Set at **frontend build** time, or leave unset to call same-origin `/api/v1` |

### Frontend build

`VITE_API_URL` is baked in at build time:

```bash
cd frontend
VITE_API_URL=https://api.your-domain.com/api/v1 npm run build
```

Deploy `frontend/dist` to your static host. Without `VITE_API_URL` the browser calls same-origin `/api/v1`, so the reverse proxy in front of the frontend must route `/api/v1` to the backend.

### Reverse proxy

LaTeX compile may take 30–120 seconds for large documents. Increase timeouts:

**Nginx**

```nginx
location /api/v1/compile {
    proxy_pass http://backend:8000;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    client_max_body_size 20m;
}
```

**Render / Railway** — set HTTP request timeout ≥ 120s in service settings.

### Resource recommendations

| Resource | Minimum |
|----------|---------|
| RAM | 1 GB |
| CPU | 1 vCPU |
| Disk | 2 GB (TeX + temp files) |

Docker image size increases by ~800 MB–1.5 GB due to TeX Live.

## Overleaf parity (Proofline)

| Feature | Supported |
|---------|-----------|
| pdfLaTeX / XeLaTeX / LuaLaTeX | Yes — compiler dropdown in PDF panel |
| latexmk multi-pass build | Yes — when `latexmk` is on PATH |
| BibTeX + Biber (biblatex) | Yes |
| Multi-file projects (`\input`, `\include`) | Yes — file tree + `.tex` assets |
| Overleaf ZIP import | Yes — Projects → Import → Overleaf ZIP |
| Full compile log | Yes — **Log** button in PDF panel |
| SyncTeX (PDF click → source line) | Yes — click PDF after compile |
| IEEEtran stubs | `IEEEtran.cls` + `IEEEtran.bst` bundled |

## Custom Overleaf classes

If the manuscript uses `\documentclass{RevDigMatEduInt}` or similar:

1. **Best:** Upload `RevDigMatEduInt.cls` (and related `.sty`/`.bst`) as project assets in the editor.
2. **Fallback:** Backend auto-switches to `IEEEtran` when the class file is missing (preview works, layout may differ from Overleaf).

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `available: false` in `/compile/status` | No `pdflatex` in PATH | Install TeX (local) or rebuild Docker image |
| `NETWORK_ERROR` on Compile | Backend not running or wrong `VITE_API_URL` | Start uvicorn; rebuild frontend with correct API URL |
| CORS error in browser | Domain not in `CORS_ORIGINS` | Add frontend URL to `.env` |
| 504 / timeout | Proxy timeout too low | Increase to 300s for `/compile` |
| Missing `.sty` package | Package not in TeX Live | Backend strips known optional packages; upload custom `.sty` or extend Dockerfile texlive packages |

## Key files

| File | Role |
|------|------|
| `src/services/latex_compile.py` | Compile engine, fallbacks, package stripping |
| `src/api/routes.py` | `POST /compile`, `GET /compile/status` |
| `frontend/src/components/pdf-preview-panel.tsx` | PDF.js preview UI |
| `frontend/public/latex-stubs/IEEEtran.cls` | IEEE fallback class stub |
| `Dockerfile` | TeX Live for production |
