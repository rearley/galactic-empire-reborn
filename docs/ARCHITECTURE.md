# Architecture

Current module map as of feature 001-prisma-schema.
Updated at the end of every implement session per CLAUDE.md.

## Repository layout

```
galactic-empire-reborn/
  backend/
    prisma/
      schema.prisma          ← Prisma schema (10 models, all C structs mapped)
      seed/
        ship-classes.ts      ← 18 ShipClass seed rows (static reference data)
    test/
      prisma-schema/         ← Integration test suite (250 tests, 14 suites)
    package.json             ← Backend deps + db:up/db:down/db:reset/test scripts
    tsconfig.json            ← TypeScript strict mode
    jest.config.ts
  docker/
    postgres/
      init.sql               ← Creates ge_test alongside ge on first container start
  docker-compose.yml         ← postgres:16-alpine service (db only; backend container deferred to 002)
  .env.example               ← DATABASE_URL and TEST_DATABASE_URL templates
  reference/
    ge-source/               ← Original C source (READ ONLY)
    wiki/                    ← Game wiki (READ ONLY)
  specs/
    001-prisma-schema/       ← Spec, plan, research, data-model, contracts, tasks
  docs/                      ← Living architecture docs (this file)
```

## Prisma layer

`backend/prisma/schema.prisma` is the single source of truth for the database
schema. There are no migration files yet — `prisma db push` is used during
feature 001 because the schema is still in flux and migrations are deferred.
Migration files will be introduced in a future feature.

`PrismaService` (NestJS injectable wrapping `PrismaClient`) does not exist yet —
that is the first task of feature 002. For now, test code instantiates
`PrismaClient` directly.

## Database

Postgres 16 runs as the `db` service in `docker-compose.yml`. Two databases:

- `ge` — development database (empty until feature 002 seeds the galaxy)
- `ge_test` — test database (reset on every `npm test` run via `globalSetup`)

Connection strings are provided via environment variables:
- `DATABASE_URL` — used by Prisma CLI and (eventually) the NestJS app
- `TEST_DATABASE_URL` — used by the Jest test harness

## What does not exist yet

- NestJS application (`backend/src/`) — feature 002
- `PrismaService` — feature 002
- `GameGateway` (Socket.io) — feature 002
- `TickService` (1s + 6s intervals) — feature 002
- Galaxy generator — feature 004
- Any runtime game logic
