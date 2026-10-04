# Arionear frontend — TanStack Start + Nitro (node-server) for Google Cloud Run
#
# Local Docker:
#   docker build --build-arg VITE_API_URL=https://api.arionear.id.vn/api/v1 -t arionear-web .
#
# Production (via Cloud Build — preferred; defaults already set in cloudbuild.yaml):
#   gcloud builds submit --config=frontend/cloudbuild.yaml
#
# Override domain (staging or alternative env):
#   gcloud builds submit --config=frontend/cloudbuild.yaml \
#     --substitutions=_VITE_API_URL=https://api.arionear.id.vn/api/v1,_IMAGE=REGION-docker.pkg.dev/PROJECT/arionear/frontend:latest

FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json .npmrc ./

# Exact lockfile install (the lockfile includes the Linux native bindings for rollup/lightningcss/oxide).
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
# Nitro listens on $PORT (default 3000); Cloud Run overrides it, plain `docker run` gets 8080.
ENV PORT=8080

# Nitro node-server output (TanStack Start): dist/server/index.mjs + static assets
COPY --from=builder /app/dist ./dist

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080)).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server/index.mjs"]
