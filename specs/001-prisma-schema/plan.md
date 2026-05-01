# Implementation Plan: Prisma Database Schema

**Branch**: `001-prisma-schema` | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-prisma-schema/spec.md`

## Summary

Translate the load-bearing C structs from `reference/ge-source/GEMAIN.H` (`WARUSR`,
`WARSHP`, `GALSECT`, `GALPLNT`, `GALWORM`, `TEAM`, `MAIL`, `MAILSTAT`, `MINE`) and
the static ship class tables in `reference/wiki/player-ships.md` and
`reference/wiki/cpu-ships.md` into a Prisma schema for PostgreSQL 16. Ship out
two artifacts only: a `schema.prisma` and a TypeScript seed file containing the
18 `ShipClass` rows. No migrations, no NestJS wiring, no Prisma client usage in
application code yet. Acceptance is verified by a Jest test suite that runs
against a real Postgres test database (started via Docker Compose) and exercises
every FR — round-trip fidelity, native array column lengths, BigInt range,
uniqueness constraints, and the 18 seeded `ShipClass` records.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 LTS
**Primary Dependencies**: Prisma 5.x (`prisma`, `@prisma/client`), Jest 29.x, `ts-jest`, `@types/node`
**Storage**: PostgreSQL 16 (Docker container for tests; same image used in dev/prod per `CLAUDE.md`)
**Testing**: Jest with `ts-jest`; Postgres container started via `docker compose up -d` against the repo-root `docker-compose.yml` defined in this feature; schema applied per-suite with `prisma db push --force-reset --skip-generate` (no migration files yet — migrations are out of scope for this feature)

**Local environment bootstrap (this feature delivers)**: The dev machine has no Postgres installed. This feature sets up the database side of the dev/test environment so the Jest suite can run end-to-end on a fresh clone. Backend application containerization is **deferred** — only the database is in scope here.

- `docker-compose.yml` at the **repo root** (not `backend/`) with a single `postgres:16-alpine` service named `db`. Volume-mounted for persistence; healthcheck defined; port published on `5432:5432`. (No backend service yet — feature 002 will add it.)
- `.env.example` at the repo root documenting `DATABASE_URL=postgresql://ge:ge@localhost:5432/ge?schema=public` and `TEST_DATABASE_URL` (which can point at the same instance using a separate database name `ge_test`).
- `backend/package.json` npm scripts:
  - `db:up` → `docker compose -f ../docker-compose.yml up -d db && docker compose -f ../docker-compose.yml exec -T db pg_isready -U ge`
  - `db:down` → `docker compose -f ../docker-compose.yml down`
  - `db:reset` → `docker compose -f ../docker-compose.yml down -v && npm run db:up`
- The Jest suite runs against database `ge_test` (auto-created by an init SQL script in `docker/postgres/init.sql` mounted into `/docker-entrypoint-initdb.d/`). This avoids a separate test container — one Postgres instance hosts both `ge` (dev) and `ge_test` (test) databases.

This supersedes the earlier "separate `docker-compose.test.yml`" sketch — a single root `docker-compose.yml` is simpler and is what the project will ship long-term per `CLAUDE.md`.
**Target Platform**: Linux server (NestJS backend host); test DB is local Docker
**Project Type**: Web application (backend/ + frontend/ per `CLAUDE.md`); this feature touches `backend/` only
**Performance Goals**: N/A for this feature — schema definition is not on the hot path. The hot path (tick engine reading/writing ship state) is the concern of feature 002.
**Constraints**:
- BigInt for unbounded accumulators (`User.cash/debt/score/plscore/klscore/population`, `Planet.cash/debt/tax`) per FR-036.
- Fixed-size C arrays persisted as native PostgreSQL arrays via Prisma scalar lists per FR-034. No JSON columns. No child tables for these arrays.
- `MAXTORPS`/`MAXMISSL`/`MAXDECOY`/`NUMITEMS` array lengths enforced by tests, not by Postgres (Postgres `Int[]` does not enforce length; that is acceptable per FR-034 phrasing — fidelity to the original C struct is verified at runtime).
- Every column traces to `GEMAIN.H` or wiki except the two FR-029 modernization fields (`Mine.deployedBy`, `Mine.deployedAt`).
**Scale/Scope**: Steady-state row counts are small — 450 sectors, ≤50 teams, 18 ship classes, hundreds of users, low thousands of ships, low thousands of planets, low tens of thousands of mails. No partitioning concerns.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.0.0 — `.specify/memory/constitution.md`.

| Principle | Applies? | How this plan satisfies it |
|---|---|---|
| **I. Fidelity** | YES | Every column traces to a named field in `GEMAIN.H` (`WARUSR`, `WARSHP`, `GALSECT`, `GALPLNT`, `GALWORM`, `TEAM`, `MAIL`, `MAILSTAT`, `MINE`, `COORD`, `TORPEDO`, `MISSILE`, `ITEM`) or a column in the two wiki ship tables. The single deviation — `Mine.deployedBy` / `Mine.deployedAt` — is documented in spec FR-029. `filler` and `waste` C padding fields are excluded per FR-003/FR-010/FR-013/FR-032. The reference C source is read-only and is not modified. |
| **II. Testing First Class** | YES | The Jest test suite is a first-class deliverable, sized to verify every FR (round-trip, array lengths, BigInt overflow, uniqueness, 18 seed rows). Tests run against a real Postgres container, not a mock. There is no production logic in this feature, so unit/integration/E2E split collapses to integration tests against the schema. Balance regression tests for `GEMAIN.H` constants used by the schema (`MAXTORPS=3`, `MAXMISSL=3`, `MAXDECOY=10`, `NUMITEMS=14`, `MAXX=30`, `MAXY=15`, `MAXTEAMS=50`, `BEACONMSGSZ=75`, `UIDSIZ=30`) are encoded as named constants in the test file and asserted against the schema's array-column behavior so a deliberate constant change forces a test edit. |
| **III. Architecture** | YES | PostgreSQL 16 + Prisma is the durable store, as mandated. No Redis. No alternative ORM. Schema lives at `backend/prisma/schema.prisma` per the NestJS module structure already documented in `CLAUDE.md`. No NestJS module wiring yet — that is feature 002. Spec-Driven Development: this is the `/speckit-plan` step on branch `001-prisma-schema`. |
| **IV. Quality** | YES | TypeScript strict mode in test code (no `any`, no implicit types). Seed file and tests will both compile under `tsc --noEmit --strict`. No Prisma migration files are created in this feature, so the "migrations are immutable" rule is trivially satisfied. CI gate: lint + typecheck + jest must pass before this branch merges. |

**Result**: PASS — no violations to track in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-prisma-schema/
├── plan.md              # This file
├── spec.md              # Feature specification (already exists)
├── research.md          # Phase 0 — type mapping decisions, FK strictness, array storage
├── data-model.md        # Phase 1 — entity-by-entity column → C-source citation
├── quickstart.md        # Phase 1 — how to run the test suite locally
└── contracts/
    └── schema.prisma.contract.md   # Phase 1 — required model surface (model names, fields, types, keys)
```

### Source Code (repository root)

```text
# repo root
docker-compose.yml                         # ← deliverable: postgres:16 service (db only, no backend yet)
.env.example                               # ← deliverable: documents DATABASE_URL + TEST_DATABASE_URL
docker/
└── postgres/
    └── init.sql                           # creates ge_test database alongside ge

backend/
├── prisma/
│   ├── schema.prisma                      # ← deliverable: Prisma schema
│   └── seed/
│       └── ship-classes.ts                # ← deliverable: 18 ShipClass rows
├── test/
│   └── prisma-schema/
│       ├── helpers/
│       │   └── prisma-test-client.ts      # creates test client + db push + reset utilities
│       ├── user.spec.ts                   # FR-001..003 round-trip + BigInt range
│       ├── ship.spec.ts                   # FR-004..010 round-trip + array lengths
│       ├── sector.spec.ts                 # FR-011..013 + uniqueness on (xsect,ysect)
│       ├── planet.spec.ts                 # FR-014..016 + ITEM parallel arrays + 75-char beacon
│       ├── wormhole.spec.ts               # FR-017
│       ├── team.spec.ts                   # FR-018..019 + 50-team capacity + unique teamcode
│       ├── mail.spec.ts                   # FR-020..023 + (userid,class,msgno) uniqueness + 5 classes
│       ├── ship-class.spec.ts             # FR-024..027 + 18 seed rows + lookup by class number
│       ├── mine.spec.ts                   # FR-028..030 + modernization fields
│       └── fidelity-audit.spec.ts         # SC-001/SC-002/SC-006 — every C field accounted for
├── package.json                           # adds prisma, @prisma/client, jest, ts-jest; db:up/db:down/db:reset scripts
├── tsconfig.json                          # strict: true
└── jest.config.ts

# (existing, untouched in this feature)
reference/
└── ge-source/
└── wiki/
specs/
CLAUDE.md
```

**Structure Decision**: Web-application layout (`backend/` + `frontend/`) per `CLAUDE.md`. This feature is backend-only; the frontend tree is not touched. Prisma assets live under `backend/prisma/` to align with NestJS conventions and the planned `PrismaService` location (`backend/src/prisma/`, feature 002).

## Complexity Tracking

> No Constitution Check violations. This section is intentionally empty.
