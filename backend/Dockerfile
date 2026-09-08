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
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
# The sysop tuning file. WORKDIR is /app and the entrypoint runs dist/src/main,
# so the resolver looks for /app/config/game.config.json. Omitting this does not
# fail: a missing file legitimately falls back to canon defaults, silently. That
# is how a UNIVMAX of 100 became a 601x601 galaxy in a container.
# @see test/unit/config/config-ships-in-image.spec.ts
COPY --from=builder /app/config ./config
COPY package*.json ./

# Build identity, reported on /public/stats. Read at RUNTIME here (unlike the
# frontend, where Vite inlines it at build time), so these are plain ENV.
ARG GIT_SHA=""
ARG APP_VERSION=""
ENV GIT_SHA=$GIT_SHA
ENV APP_VERSION=$APP_VERSION

# Copy and set entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
