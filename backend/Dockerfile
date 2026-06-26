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
RUN npm run build

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache postgresql-client openssl

WORKDIR /app

# Copy compiled output, all node_modules (ts-node needed for prisma db seed), prisma artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

# Copy and set entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
