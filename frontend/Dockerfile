FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json vite.config.ts postcss.config.cjs ./
COPY index.html ./
COPY src ./src

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

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
