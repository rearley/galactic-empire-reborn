FROM node:24-alpine AS builder

# Build context is the repo root (not ./frontend) so this stage can reach
# packages/wire — @ge/wire is a workspace dependency resolved via
# `file:../packages/wire`, which npm can only follow from a root install.
WORKDIR /app

# Install deps via the workspace root lockfile, so the resolved tree matches
# what CI's frontend test job runs against. Scoped to the frontend and @ge/wire
# workspaces only — the backend workspace (Nest, Prisma, the Prisma CLI,
# Vitest, ...) has nothing to do with a `tsc && vite build`, and an unscoped
# `npm ci` here installed all of it to produce a static bundle.
COPY package*.json ./
COPY packages/wire/package.json ./packages/wire/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace=frontend --workspace=packages/wire

# Build @ge/wire before the app that imports it.
COPY packages/wire ./packages/wire
RUN npm run build --workspace=@ge/wire

WORKDIR /app/frontend

COPY frontend/tsconfig*.json frontend/vite.config.ts frontend/postcss.config.cjs ./
COPY frontend/index.html ./
COPY frontend/src ./src

# Build identity, shown in the UI. Deploys are hands-off — push, Actions, ghcr,
# watchtower — so without this there is no way to tell whether the page in front
# of you is the change you just pushed. Vite only exposes VITE_-prefixed vars to
# the bundle, and it must be set BEFORE the build: it is baked in, not read at
# runtime. Absent, the UI shows "dev".
ARG GIT_SHA=""
ARG APP_VERSION=""
ENV VITE_GIT_SHA=$GIT_SHA
ENV VITE_APP_VERSION=$APP_VERSION

RUN npm run build

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
