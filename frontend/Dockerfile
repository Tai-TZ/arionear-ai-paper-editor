# Arionear frontend — TanStack Start + Nitro (node-server) for Google Cloud Run
#
# Build (set backend API URL at build time):
#   docker build --build-arg VITE_API_URL=https://YOUR-API.run.app/api/v1 -t arionear-web .
#
# Run locally:
#   docker run -p 8080:8080 -e PORT=8080 arionear-web

FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Baked into the client bundle — must match your Cloud Run backend URL.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ---- Production ----
FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production

# Nitro node-server output: dist/server/index.mjs + dist/client static assets
COPY --from=builder /app/dist ./dist

# Cloud Run injects PORT; Nitro reads process.env.PORT
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080)).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server/index.mjs"]
