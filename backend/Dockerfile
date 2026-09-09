FROM node:20-alpine AS builder

WORKDIR /app

# Install all deps (including devDeps — needed for nest build, prisma generate, ts-node seed)
COPY package*.json ./
RUN npm ci

# Generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# Build the NestJS application
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
COPY config ./config
RUN npm run build

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache postgresql-client openssl

WORKDIR /app

# Copy compiled output, all node_modules (ts-node needed for prisma db seed), prisma artifacts
# --chown=node:node, not a later `chown -R`: Prisma checks that it can WRITE to
# /app/node_modules/@prisma/engines before it will run, so a non-root container
# with root-owned node_modules fails `migrate deploy` outright — the entrypoint
# is `set -e`, so that is a container that exits instead of a game that starts.
# Caught by booting the image, not by reading it.
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/prisma ./prisma
# The sysop tuning file. WORKDIR is /app and the entrypoint runs dist/src/main,
# so the resolver looks for /app/config/game.config.json. Omitting this does not
# fail: a missing file legitimately falls back to canon defaults, silently. That
# is how a UNIVMAX of 100 became a 601x601 galaxy in a container.
# @see test/unit/config/config-ships-in-image.spec.ts
COPY --from=builder --chown=node:node /app/config ./config
COPY --chown=node:node package*.json ./

# Build identity, reported on /public/stats. Read at RUNTIME here (unlike the
# frontend, where Vite inlines it at build time), so these are plain ENV.
ARG GIT_SHA=""
ARG APP_VERSION=""
ENV GIT_SHA=$GIT_SHA
ENV APP_VERSION=$APP_VERSION

# Copy and set entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Drop root. Nothing here writes to disk at runtime and 3000 needs no privilege,
# so there is nothing to give up — and root in the container is the difference
# between a remote-code bug being a bad day and a very bad one. `node` is
# created by the base image. AFTER the last RUN, so the build keeps the
# permissions it needs. @see docs/audits/2026-09-09-security-review.md
USER node

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
