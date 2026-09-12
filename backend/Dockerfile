FROM node:24-alpine AS builder

# Build context is the repo root (not ./backend) so this stage can reach
# packages/wire — @ge/wire is a workspace dependency resolved via
# `file:../packages/wire`, which npm can only follow from a root install.
WORKDIR /app

# Install deps (including devDeps — needed for nest build, prisma generate,
# ts-node seed, and building @ge/wire) via the workspace root lockfile, so the
# resolved tree matches what CI's backend test job runs against. Scoped to the
# backend and @ge/wire workspaces only — the frontend workspace (Vite,
# Playwright, Tailwind, React, ...) has nothing to do with this image, and
# `npm ci` across all three roughly doubled node_modules when tried unscoped.
COPY package*.json ./
COPY packages/wire/package.json ./packages/wire/package.json
COPY backend/package.json ./backend/package.json
RUN npm ci --workspace=backend --workspace=packages/wire

# Build @ge/wire before the app that imports it.
COPY packages/wire ./packages/wire
RUN npm run build --workspace=@ge/wire

WORKDIR /app/backend

# Generate Prisma client.
#
# prisma.config.ts comes too: Prisma 7 reads the schema path and the migration
# connection from it, not from package.json, and it sits beside prisma/ rather
# than inside it.
#
# DATABASE_URL is a placeholder scoped to this one RUN line. `prisma generate`
# never opens a connection — it reads the schema and writes TypeScript — but the
# config resolves the variable eagerly and fails loudly when it is unset, which
# is the behaviour wanted everywhere else. The real URL arrives in the
# environment at container start; nothing here is baked into the image.
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts ./prisma.config.ts
RUN DATABASE_URL="postgresql://generate-only:generate-only@127.0.0.1:1/generate-only" \
    npx prisma generate

# Build the NestJS application
COPY backend/tsconfig*.json backend/nest-cli.json ./
COPY backend/src ./src
COPY backend/config ./config
RUN npm run build

# The linter does not go to production.
#
# The runtime stage copies this whole tree, because `docker-entrypoint.sh` runs
# `prisma migrate deploy` at container start and the Prisma CLI is a
# devDependency. `oxlint` and `oxlint-tsgolint` ride along on that decision,
# bringing their platform binaries — about 52 MB of an 822 MB image, in a
# runtime that will never lint anything. Watchtower pulls a new `:latest` on
# every merge, so that is bandwidth and disk on every deploy.
#
# Removed by name rather than by an `--omit=dev` install, which cannot work
# until the runtime's own dependencies are classified as such: `@prisma/client`,
# `prisma` and `ts-node` all sit in devDependencies today, and the app requires
# the first at runtime. That reclassification is the larger fix.
# @see issue #7  @see test/unit/dockerfile-no-linters.spec.ts
RUN rm -rf /app/node_modules/oxlint /app/node_modules/oxlint-tsgolint \
           /app/node_modules/@oxlint /app/node_modules/@oxlint-tsgolint \
           /app/node_modules/.bin/oxlint /app/node_modules/.bin/oxlint-tsgolint

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM node:24-alpine

RUN apk add --no-cache postgresql-client openssl

WORKDIR /app/backend

# Copy compiled output, all node_modules (ts-node needed for prisma db seed), prisma artifacts
# --chown=node:node, not a later `chown -R`. This began as a Prisma 5 constraint:
# the engine checked that it could WRITE to node_modules/@prisma/engines before
# it would run, so a non-root container with root-owned node_modules failed
# `migrate deploy` outright — and the entrypoint is `set -e`, so that was a
# container that exits instead of a game that starts. Caught by booting the
# image, not by reading it.
#
# Prisma 7 is Rust-free and ships no engine binaries, so THAT specific check is
# gone. The ownership stays: `node` still has to read node_modules, and the CLI
# still writes under it. Kept deliberately rather than dropped on the grounds
# that the original reason expired.
#
# node_modules is hoisted to the workspace root by `npm ci`, and node's module
# resolution walks up from /app/backend looking for node_modules, so it is
# copied to /app/node_modules here rather than /app/backend/node_modules.
# node_modules/@ge/wire is a symlink to ../packages/wire (npm's workspace
# link), so packages/wire's built dist has to come along too or that symlink
# dangles — `require('@ge/wire')` would resolve to a target with no `dist/`.
COPY --from=builder --chown=node:node /app/node_modules /app/node_modules
COPY --from=builder --chown=node:node /app/packages/wire /app/packages/wire
# docker-entrypoint.sh below invokes `./node_modules/.bin/prisma` relative to
# WORKDIR (/app/backend); node_modules lives one level up at /app/node_modules
# (see above), so link it in rather than rewrite the entrypoint's paths.
RUN ln -s /app/node_modules /app/backend/node_modules
COPY --from=builder --chown=node:node /app/backend/dist ./dist
COPY --from=builder --chown=node:node /app/backend/prisma ./prisma
# The entrypoint runs `prisma migrate deploy`, and Prisma 7 finds the schema and
# the migration connection through this file. Without it the CLI reports no
# schema and the container exits before the game starts.
COPY --from=builder --chown=node:node /app/backend/prisma.config.ts ./prisma.config.ts
# The sysop tuning file. The entrypoint runs dist/src/main from /app/backend,
# so the resolver looks for /app/backend/config/game.config.json. Omitting this
# does not fail: a missing file legitimately falls back to canon defaults,
# silently. That is how a UNIVMAX of 100 became a 601x601 galaxy in a container.
# @see test/unit/config/config-ships-in-image.spec.ts
COPY --from=builder --chown=node:node /app/backend/config ./config
COPY --chown=node:node backend/package*.json ./

# Build identity, reported on /public/stats. Read at RUNTIME here (unlike the
# frontend, where Vite inlines it at build time), so these are plain ENV.
ARG GIT_SHA=""
ARG APP_VERSION=""
ENV GIT_SHA=$GIT_SHA
ENV APP_VERSION=$APP_VERSION

# Copy and set entrypoint
COPY backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Drop root. Nothing here writes to disk at runtime and 3000 needs no privilege,
# so there is nothing to give up — and root in the container is the difference
# between a remote-code bug being a bad day and a very bad one. `node` is
# created by the base image. AFTER the last RUN, so the build keeps the
# permissions it needs. @see docs/audits/2026-09-09-security-review.md
USER node

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
