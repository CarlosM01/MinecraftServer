# Build context: repository root (see docker-compose.yml)

# ── Frontend build ────────────────────────────────────────────
FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY webapp/frontend/package*.json ./
RUN npm ci
COPY webapp/frontend/ ./
RUN npm run build

# ── Backend dependencies (better-sqlite3 may need compiling) ──
FROM node:22-bookworm-slim AS backend-deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY webapp/backend/package*.json ./
RUN npm ci --omit=dev

# ── Runtime ───────────────────────────────────────────────────
FROM node:22-bookworm-slim

# Backup scripts need python3, rsync, tar and the docker CLI
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 rsync tar ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker

WORKDIR /opt/panel/webapp/backend
COPY --from=backend-deps /build/node_modules ./node_modules
COPY webapp/backend/ ./
COPY scripts/*.py /opt/panel/scripts/
COPY --from=frontend /build/dist /opt/panel/webapp/frontend/dist

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "server.js"]
