#!/bin/sh
set -e

echo "[Entrypoint] Waiting for PostgreSQL..."
until pg_isready -h "${PGHOST:-postgres}" -U "${PGUSER:-ge}" -q; do
  sleep 1
done
echo "[Entrypoint] PostgreSQL is ready."

echo "[Entrypoint] Running migrations..."
npx prisma migrate deploy

echo "[Entrypoint] Running seed (idempotent — errors tolerated on re-run)..."
node dist/prisma/seed.js || echo "[Entrypoint] Seed skipped or already applied."

echo "[Entrypoint] Starting application..."
exec node dist/src/main.js
