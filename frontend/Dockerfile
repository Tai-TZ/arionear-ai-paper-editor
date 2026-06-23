# Arionear frontend — TanStack Start + Nitro (node-server) for Google Cloud Run
#
# Local Docker:
#   docker build --build-arg VITE_API_URL=https://YOUR-API.run.app/api/v1 -t arionear-web .
#
# Cloud Build (gcloud does not support --build-arg on builds submit; use cloudbuild.yaml):
#   gcloud builds submit --config=cloudbuild.yaml \
#     --substitutions=_VITE_API_URL=https://YOUR-API.run.app/api/v1,_IMAGE=REGION-docker.pkg.dev/PROJECT/arionear/frontend:latest

FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./

# Lockfile is often generated on Windows — reinstall deps so Linux native binaries resolve.
RUN rm -rf node_modules package-lock.json \
    && npm install --include=dev --legacy-peer-deps

COPY . .

# Baked into the client bundle — must match your Cloud Run backend URL.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ---- Production ----
FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production

# Nitro node-server output: .output/server/index.mjs + static assets
COPY --from=builder /app/.output ./.output

# Cloud Run injects PORT; Nitro reads process.env.PORT
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080)).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
