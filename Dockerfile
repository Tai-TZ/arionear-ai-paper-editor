# ---- Stage 1: Build ----
FROM python:3.11-slim AS builder

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ---- Stage 2: Production ----
FROM python:3.11-slim

# TeX Live — required for POST /api/v1/compile (PDF preview, Overleaf parity)
RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-bibtex-extra \
    texlive-science \
    texlive-publishers \
    texlive-xetex \
    texlive-luatex \
    latexmk \
    biber \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Security: run as non-root user (packages must live under appuser, not /root/.local)
RUN useradd -m appuser
COPY --from=builder /root/.local /home/appuser/.local
ENV PATH=/home/appuser/.local/bin:$PATH

# Copy application code (includes frontend/public/latex-stubs for IEEEtran fallback)
COPY . .

# Create data directory with correct ownership
RUN mkdir -p /app/data && chown -R appuser:appuser /app /home/appuser/.local

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=15s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://localhost:%s/health' % os.environ.get('PORT', '8000'))" || exit 1

# Cloud Run injects PORT. --proxy-headers makes request.url.scheme follow X-Forwarded-Proto (https behind
# the proxy). With --forwarded-allow-ips='*' uvicorn takes request.client.host from the LEFTMOST
# X-Forwarded-For entry, which the client controls, so security-relevant code (compile rate limit) reads
# the rightmost hop itself instead of trusting request.client.
CMD ["sh", "-c", "exec uvicorn src.main:app --host 0.0.0.0 --port \"${PORT:-8000}\" --proxy-headers --forwarded-allow-ips='*'"]
