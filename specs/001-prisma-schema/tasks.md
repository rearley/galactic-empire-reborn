---
description: "Task list for feature 001-prisma-schema"
---

# Tasks: Prisma Database Schema

**Input**: Design documents from `/specs/001-prisma-schema/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: MANDATORY per Constitution Principle II. Every persisted entity gets a Jest integration test against a real Postgres 16 container before or alongside the schema definition.

**Organization**: Tasks are grouped by user story (from spec.md) so each story is independently implementable and testable. US1 + US2 are P1 (MVP). US3 + US4 are P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User-story label (US1, US2, US3, US4) — only on tasks within a story phase
- File paths are absolute-from-repo-root unless noted

## Path conventions

Repo root has `docker-compose.yml`, `.env.example`, `docker/`. Backend code lives in `backend/`. Schema at `backend/prisma/schema.prisma`. Tests at `backend/test/prisma-schema/`. The frontend tree is not touched in this feature.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project bootstrap, Docker Postgres, npm scripts. The dev machine has no local Postgres — this phase makes `npm test` runnable on a fresh clone.

- [x] T001 Create `backend/` directory and `backend/package.json` with `name`, `version`, `private: true`, and devDependencies: `prisma@^5`, `@prisma/client@^5`, `typescript@^5`, `jest@^29`, `ts-jest@^29`, `@types/jest`, `@types/node`
- [x] T002 [P] Add `backend/tsconfig.json` with `strict: true`, `target: "ES2022"`, `module: "commonjs"`, `moduleResolution: "node"`, `esModuleInterop: true`, `resolveJsonModule: true`, `skipLibCheck: true`, `noImplicitAny: true`
- [x] T003 [P] Add `backend/jest.config.ts` configured for `ts-jest`, test root `<rootDir>/test`, `globalSetup: "<rootDir>/test/prisma-schema/helpers/global-setup.ts"`, `testTimeout: 30000`
- [x] T004 [P] Add `backend/.gitignore` covering `node_modules/`, `dist/`, `.env`, `prisma/migrations/` (placeholder), `coverage/`
- [x] T005 [P] Create `docker-compose.yml` at the repo root with one service `db` using `postgres:16-alpine`, ports `5432:5432`, env `POSTGRES_USER=ge`, `POSTGRES_PASSWORD=ge`, `POSTGRES_DB=ge`, healthcheck `pg_isready -U ge`, named volume `ge_pgdata`, and a bind mount for `./docker/postgres:/docker-entrypoint-initdb.d`
- [x] T006 [P] Create `docker/postgres/init.sql` that runs `CREATE DATABASE ge_test OWNER ge;` so the test DB exists alongside the dev DB
- [x] T007 [P] Create `.env.example` at the repo root with `DATABASE_URL=postgresql://ge:ge@localhost:5432/ge?schema=public` and `TEST_DATABASE_URL=postgresql://ge:ge@localhost:5432/ge_test?schema=public`
- [x] T008 Add npm scripts to `backend/package.json`: `db:up` (`docker compose -f ../docker-compose.yml up -d db && docker compose -f ../docker-compose.yml exec -T db pg_isready -U ge`), `db:down` (`docker compose -f ../docker-compose.yml down`), `db:reset` (`docker compose -f ../docker-compose.yml down -v && npm run db:up`), `test` (`jest`), `prisma:generate` (`prisma generate`), `prisma:push` (`prisma db push --skip-generate`)
- [x] T009 Initialize Prisma scaffolding: create `backend/prisma/schema.prisma` with only the `datasource db` (provider=`postgresql`, url=`env("DATABASE_URL")`) and `generator client` (provider=`prisma-client-js`) blocks. No models yet.
- [x] T010 Verify the bootstrap end-to-end: from a clean state run `npm run db:up`, `DATABASE_URL=$TEST_DATABASE_URL npm run prisma:push`, confirm `ge_test` is reachable. Capture in commit message.

**Checkpoint**: Postgres container starts cleanly, `ge` and `ge_test` databases exist, Prisma can connect.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Test harness that every user-story phase will use. Until this is in place, no story-specific test file can run.

**⚠️ CRITICAL**: All user-story phases (US1–US4) depend on Phase 2 completion.

- [x] T011 Create `backend/test/prisma-schema/helpers/prisma-test-client.ts` exporting a singleton `PrismaClient` constructed with `datasources: { db: { url: process.env.TEST_DATABASE_URL } }`, plus a `truncateAll()` helper that issues `TRUNCATE "User", "Ship", "Sector", "Planet", "Wormhole", "Team", "Mail", "MailStat", "ShipClass", "Mine" RESTART IDENTITY CASCADE` (table list updated as models land)
- [x] T012 Create `backend/test/prisma-schema/helpers/global-setup.ts` that, before the suite runs, ensures `TEST_DATABASE_URL` is set, then shells out to `npx prisma db push --force-reset --skip-generate --schema=prisma/schema.prisma` against that URL
- [x] T013 [P] Create `backend/test/prisma-schema/helpers/constants.ts` exporting the pinned `GEMAIN.H` constants used by the schema: `UIDSIZ=30`, `MAXTORPS=3`, `MAXMISSL=3`, `MAXDECOY=10`, `NUMITEMS=14`, `MAXX=30`, `MAXY=15`, `MAXTEAMS=50`, `BEACONMSGSZ=75`. Each as a typed `as const` named export. These power the balance-regression assertions (Constitution II).
- [x] T014 [P] Create `backend/test/prisma-schema/helpers/sentinel-builders.ts` with helper functions that build "non-default-value" fixtures for every entity (used by round-trip tests so we never accidentally round-trip a default zero). One builder per entity: `buildUserSentinel()`, `buildShipSentinel()`, `buildSectorSentinel()`, `buildPlanetSentinel()`, `buildWormholeSentinel()`, `buildTeamSentinel()`, `buildMailSentinel()`, `buildMailStatSentinel()`, `buildMineSentinel()`. Each returns a fully-specified `Prisma.<Model>CreateInput`.
- [x] T015 Smoke-test the harness: write `backend/test/prisma-schema/harness.spec.ts` that connects, runs `truncateAll()`, and asserts no error. Until any model exists this is just a connectivity probe; once models land, this file becomes the import-graph entry point that catches a broken Prisma client generation.

**Checkpoint**: Test harness boots, applies schema to the test DB, and tears tables down between tests.

---

## Phase 3: User Story 1 — Persist Player and Ship State (P1) 🎯 MVP

**Goal**: A `User` row and one or more `Ship` rows survive a backend restart with byte-equivalent state for every field in `WARUSR` / `WARSHP`.

**Independent Test**: Seed one user with non-default values for every column; create two ships for that user with non-default values for every `WARSHP` column including the parallel-array slots; truncate Prisma's in-memory state by recreating the client; re-read both records and assert deep equality.

### Tests for User Story 1 *(write first; expect failures until models exist)*

- [x] T016 [P] [US1] Write `backend/test/prisma-schema/user.spec.ts` covering FR-001..FR-003: round-trip every field of `User` (sentinel values), assert `userid` uniqueness rejects duplicates, write `cash` / `score` / `population` values larger than `2_147_483_647n` to confirm `BigInt` columns (FR-036), assert `options` array length is exactly 30 (`UIDSIZ`/`NUMITEMS`-style guard via `constants.ts`)
- [x] T017 [P] [US1] Write `backend/test/prisma-schema/ship.spec.ts` covering FR-004..FR-010: round-trip every `WARSHP` field, assert composite PK `(userid, shipno)` rejects duplicates (FR-009), assert all parallel-array columns (`ltorpsChannel`/`ltorpsDistance`, `lmisslChannel`/`lmisslDistance`/`lmisslEnergy`, `decout`, `freq`, `items`) round-trip at exactly `MAXTORPS=3`, `MAXMISSL=3`, `MAXDECOY=10`, length 3, and `NUMITEMS=14` respectively (FR-034, FR-035), assert `Ship.userid → User.userid` FK is enforced (creating a Ship with a missing userid fails)

### Implementation for User Story 1

- [x] T018 [US1] Add `model User` to `backend/prisma/schema.prisma` per `data-model.md` "User" section: `userid String @id`, `score/cash/debt/plscore/klscore/population BigInt`, `noships/topshipno/kills/rospos/planets Int`, `options Int[]`, `teamcode BigInt?`, plus `ships Ship[]`, `mails Mail[]`, `mailStats MailStat[]` relations
- [x] T019 [US1] Add `model Ship` per `data-model.md` "Ship" section with `@@id([userid, shipno])` and `user User @relation(fields: [userid], references: [userid])`. Include all scalar fields, `Float` coords/heading/speed/damage/energy/phasr (FR-033), `BigInt[] items`, parallel `Int[]` arrays for ltorps/lmissl/decout/freq, and update the `User.ships` back-relation
- [x] T020 [US1] Update `truncateAll()` in `prisma-test-client.ts` to include `"User"` and `"Ship"` (tables exist now)
- [x] T021 [US1] Run `npm run prisma:generate`, then `DATABASE_URL=$TEST_DATABASE_URL npm run prisma:push`, then `npm test -- user.spec ship.spec`. All US1 tests pass.

**Checkpoint**: User + Ship persist with full WARUSR/WARSHP fidelity. The spec's User Story 1 acceptance criteria are met.

---

## Phase 4: User Story 2 — Persist the Galaxy (P1)

**Goal**: 450 sectors, planets-with-economy, and wormholes round-trip losslessly. Composite key `(xsect, ysect, plnum)` enforced.

**Independent Test**: Insert `MAXX*MAXY=450` sectors; for one sector insert two planets (`plnum=1` and `plnum=2`) with full `GALPLNT` + 14-slot `ITEM` parallel arrays + 75-char beacon; insert a wormhole with destination coord; re-read all three entity types, assert deep equality, assert duplicate `(xsect,ysect)` is rejected for Sector, duplicate `(xsect,ysect,plnum)` is rejected for Planet/Wormhole.

### Tests for User Story 2

- [x] T022 [P] [US2] Write `backend/test/prisma-schema/sector.spec.ts` covering FR-011..FR-013, SC-005: insert 450 sectors (cardinality check), assert duplicate `(xsect, ysect)` violates the composite PK
- [x] T023 [P] [US2] Write `backend/test/prisma-schema/planet.spec.ts` covering FR-014..FR-016: round-trip a planet with non-default values for every column including all six `items*` parallel arrays each at length `NUMITEMS=14`, assert `beacon` accepts `BEACONMSGSZ=75` characters and round-trips, assert composite PK `(xsect, ysect, plnum)` rejects duplicates, assert two planets in the same sector with different `plnum` coexist
- [x] T024 [P] [US2] Write `backend/test/prisma-schema/wormhole.spec.ts` covering FR-017: round-trip including `destXcoord`/`destYcoord` distinct from origin coords, including a destination outside the 30×15 grid (edge case from spec)

### Implementation for User Story 2

- [x] T025 [US2] Add `model Sector` to `schema.prisma` per `data-model.md`: `xsect/ysect/plnum/type/numplan Int`, `@@id([xsect, ysect])`
- [x] T026 [P] [US2] Add `model Planet` per `data-model.md`: composite PK `(xsect, ysect, plnum)`, `cash/debt/tax/teamcode BigInt`, six `items*` parallel arrays (5× `Int[]` + 2× `BigInt[]`), `beacon String` (length 75 documented in `///` doc comment), `userid String?` with no FK (R-3), `lastattack`/`spyowner` plain strings
- [x] T027 [P] [US2] Add `model Wormhole` per `data-model.md`: composite PK, both origin `xcoord/ycoord` and `destXcoord/destYcoord` as `Float`
- [x] T028 [US2] Update `truncateAll()` to add `"Sector"`, `"Planet"`, `"Wormhole"`
- [x] T029 [US2] `prisma:push`; run `npm test -- sector.spec planet.spec wormhole.spec`. All US2 tests pass.

**Checkpoint**: The galaxy persists with full GALSECT/GALPLNT/GALWORM fidelity. Combined with Phase 3, the MVP is complete.

---

## Phase 5: User Story 3 — Persist Teams and Player Mail (P2)

**Goal**: 50-team capacity, both `MAIL` and `MAILSTAT` shapes persist with composite key `(userid, class, msgno)`, all five known mail classes accepted.

**Independent Test**: Create 50 teams (FR-019); assign two users via `WARUSR.teamcode`; for each user insert one row per `MAIL_CLASS_*` constant including a `MAILSTAT` row with full `itemqty[14]`; query each user's inbox by `userid`, assert ordering by `(class, msgno)` is queryable, assert duplicate `(userid, class, msgno)` rejected.

### Tests for User Story 3

- [x] T030 [P] [US3] Write `backend/test/prisma-schema/team.spec.ts` covering FR-018..FR-019: round-trip a team, insert 50 teams (`MAXTEAMS`), assert duplicate `teamcode` rejected
- [x] T031 [P] [US3] Write `backend/test/prisma-schema/mail.spec.ts` covering FR-020, FR-022..FR-023: round-trip a `Mail` row with non-default values for every column, assert all five class constants (`MAIL_CLASS_DISTRESS=1`, `MAIL_CLASS_MAXOUT=2`, `MAIL_CLASS_PRODRPT=3`, `MAIL_CLASS_GAMESTATS=4`, `MAIL_CLASS_PLSTATS=5`) insert, assert composite PK rejects duplicates, assert `Mail.userid → User.userid` FK enforced. Add an inbox-query test that inserts mixed classes for one user and reads them back ordered by `(class, msgno)`.
- [x] T032 [P] [US3] Write `backend/test/prisma-schema/mail-stat.spec.ts` covering FR-021: round-trip a `MailStat` row with `itemqty` of length `NUMITEMS=14` containing values > 2³¹ to verify `BigInt[]`, assert FK to User enforced

### Implementation for User Story 3

- [x] T033 [US3] Add `model Team` per `data-model.md`: `teamcode BigInt @id`, `teamname String` (31), `teamcount Int`, `teamscore BigInt`, `password String` (11), `secret String` (11), `flag Int`
- [x] T034 [P] [US3] Add `model Mail` per `data-model.md`: `@@id([userid, class, msgno])`, `class/type/stamp/int1/int2/int3 Int`, `msgno/long1/long2/long3 BigInt`, all string columns, FK to User
- [x] T035 [P] [US3] Add `model MailStat` per `data-model.md`: `@@id([userid, class, msgno])`, `cash/debt/tax/msgno BigInt`, `itemqty BigInt[]`, FK to User
- [x] T036 [US3] Update `truncateAll()` to add `"Team"`, `"Mail"`, `"MailStat"`
- [x] T037 [US3] `prisma:push`; run `npm test -- team.spec mail.spec mail-stat.spec`. All US3 tests pass.

**Checkpoint**: Teams and the dual-shape mail system persist faithfully.

---

## Phase 6: User Story 4 — Look Up Ship Class Definitions (P2)

**Goal**: All 18 ship class definitions seedable; lookup by `classNumber` returns the full wiki stat sheet.

**Independent Test**: Insert all 18 seeded classes (10 player + 5 CPU combative + 3 droid); for each class run `findUnique({ where: { classNumber } })` and assert every column matches the wiki value; spot-check classes 1, 22, 32, 34 per spec acceptance scenarios.

### Tests for User Story 4

- [x] T038 [P] [US4] Write `backend/test/prisma-schema/ship-class.spec.ts` covering FR-024..FR-027, SC-002, SC-004: import `SHIP_CLASSES` from the seed file, assert `length === 18` and the class-number set equals `{1,2,3,4,5,6,7,8,9,34,21,22,23,24,25,31,32,33}`, insert all via `createMany`, then for each class assert deep field equality with the seed; explicit spot-checks on class 1 (Interceptor), class 22 (Cyberquad — `make=5`, `tough=1`, `category="CPU_COMBATIVE"`), class 32 (Murdonian Transport — `category="CPU_DROID"`), class 34 (Sysopian Death Star — `maxWarp=255`, `maxTons=100_000_000`, `maxPrice=32_000_000n`)

### Implementation for User Story 4

- [x] T039 [US4] Add `model ShipClass` to `schema.prisma` per `data-model.md`: `classNumber Int @id`, `category String`, all 24 stat columns (booleans for has-flags, `BigInt maxPrice`, `Int` everywhere else), `make`/`tough` columns
- [x] T040 [US4] Create `backend/prisma/seed/ship-classes.ts` exporting `interface ShipClassSeed` and `export const SHIP_CLASSES: readonly ShipClassSeed[]` containing exactly 18 entries: classes 1, 2, 3, 4, 5, 6, 7, 8, 9, 34 from `reference/wiki/player-ships.md` and classes 21, 22, 23, 24, 25, 31, 32, 33 from `reference/wiki/cpu-ships.md`. Normalize "5k"/"1m" suffixes to integers; `Y`/`N` to booleans; preserve `###` suffix in `shipNameTemplate` literally; CPU-only fields (`make`, `tough`) zeroed for player rows; player-only fields (`maxPrice`, `cybCanAttack`, `cybLowestClassAttacks`) zeroed/false for CPU rows
- [x] T041 [US4] Update `truncateAll()` to add `"ShipClass"`
- [x] T042 [US4] `prisma:push`; run `npm test -- ship-class.spec`. All 18 classes seed and round-trip.

**Checkpoint**: Combat / purchase / AI / display logic in later features can resolve `WARSHP.shpclass` to a complete stat sheet.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Mine entity (FR-028..030, no user story attached), full-fidelity audit, balance regression tests, schema-fidelity report, and documentation handoff.

- [x] T043 [P] Write `backend/test/prisma-schema/mine.spec.ts` covering FR-028..FR-030: round-trip a `Mine` with `channel`, `timer`, `xcoord`/`ycoord`, plus the modernization fields `deployedBy` and `deployedAt`; assert `id` is auto-assigned; assert two mines at the same coordinates with different `id` coexist (the original game allows multiple mines stacked)
- [x] T044 Add `model Mine` to `schema.prisma` per `data-model.md`: `id Int @id @default(autoincrement())`, `channel/timer Int`, `xcoord/ycoord Float`, `deployedBy String`, `deployedAt DateTime @default(now())`. Add `"Mine"` to `truncateAll()`.
- [x] T045 [P] Write `backend/test/prisma-schema/balance-constants.spec.ts` covering Constitution II: import `constants.ts` and assert each `GEMAIN.H` constant value matches the comment in the C source (`MAXX=30`, `MAXY=15`, `MAXTORPS=3`, `MAXMISSL=3`, `MAXDECOY=10`, `NUMITEMS=14`, `MAXTEAMS=50`, `BEACONMSGSZ=75`, `UIDSIZ=30`). A deliberate constant change MUST break this test.
- [x] T046 [P] Write `backend/test/prisma-schema/fidelity-audit.spec.ts` covering SC-001, SC-002, SC-006: load Prisma DMMF (`Prisma.dmmf.datamodel`), and for each model in `data-model.md` enumerate the required field names from a hard-coded list (the contract in `data-model.md`) and assert every name exists with the expected scalar type and list-ness. This locks the schema surface against silent drift.
- [x] T047 [P] Write `backend/test/prisma-schema/bigint-overflow.spec.ts` covering FR-036: for every `BigInt` and `BigInt[]` column listed in `contracts/schema.prisma.contract.md`, write a value greater than `2_147_483_647n` and assert it round-trips. This is the FR-036 acceptance test consolidated.
- [x] T048 Run the full suite end-to-end on a fresh database: `npm run db:reset && DATABASE_URL=$TEST_DATABASE_URL npm run prisma:push && npm run prisma:generate && npm test`. All specs green. Capture the test-count summary in the commit message.
- [x] T049 [P] Update `docs/PROGRESS.md` with the feature-001 completion entry per `CLAUDE.md` "Living Documentation" format (Completed / Tests / Decisions made / Next / Known issues). Create the `docs/` directory if missing.
- [x] T050 [P] Update `docs/DATA_MODEL.md` with a plain-English summary of the 10 entities and their relationships, mirroring `data-model.md` but in narrative form for human readers
- [x] T051 [P] Update `docs/DECISIONS.md` with one entry per non-obvious decision from `research.md`: BigInt selection (R-1), parallel-array storage (R-2), FK strictness (R-3), Mine surrogate key (R-4)
- [x] T052 [P] Update `docs/ARCHITECTURE.md` with the Prisma layer position: schema at `backend/prisma/schema.prisma`, no `PrismaService` yet (deferred to feature 002)

**Final checkpoint**: Schema delivered, 11 spec files green, docs in sync.

---

## Dependencies

Story-level execution order (most stories are independent once Phase 2 lands):

```text
Phase 1 (Setup, T001–T010)
        │
        ▼
Phase 2 (Foundational test harness, T011–T015)
        │
        ├─────────────────┬─────────────────┬─────────────────┐
        ▼                 ▼                 ▼                 ▼
Phase 3 US1 (P1)    Phase 4 US2 (P1)  Phase 5 US3 (P2)  Phase 6 US4 (P2)
T016–T021           T022–T029         T030–T037         T038–T042
        │                 │                 │                 │
        └─────────────────┴────────┬────────┴─────────────────┘
                                   ▼
                       Phase 7 Polish (T043–T052)
```

**Inter-story coupling notes**:
- US3 (Mail/MailStat) **requires** US1's `User` model existing in the schema before its FK can compile. If US3 starts before US1 has landed, mark US3 tasks as blocked until T018 is complete.
- US2, US4 are fully independent of US1 and US3.
- T044 (`Mine` model) does not depend on any user story but is convenient to add in Polish since no story references it.

---

## Parallel execution opportunities

After Phase 2 completes, all four story phases can be developed by parallel agents:

```bash
# Parallel batch A — independent, no shared files
[Agent-1] T016, T017, T018–T021    # US1 User+Ship
[Agent-2] T022, T023, T024, T025–T029  # US2 Galaxy
[Agent-4] T038, T039–T042          # US4 ShipClass
```

US3 (Phase 5) can start in parallel as soon as T018 (`User` model) is committed — it only needs the User table to attach FKs.

Within the Polish phase, T043+T045+T046+T047+T049+T050+T051+T052 are all `[P]` — different files, no shared mutable state.

---

## Implementation strategy

**MVP scope** (what ships first): Phase 1 + Phase 2 + Phase 3 (US1) + Phase 4 (US2). After these, the game can persist players, ships, and the galaxy across restarts — the load-bearing slice the rest of the project depends on.

**Increments**:
1. MVP (above) — covers spec acceptance criteria for US1 and US2 (both P1).
2. +Phase 5 (US3) — adds team play and the mail system needed for the midnight job (feature 009).
3. +Phase 6 (US4) — unlocks combat math (feature 006) and ship purchase (feature 005).
4. +Phase 7 (Polish) — adds Mine persistence (feature 006 dep), balance regression coverage, and the docs handoff that `CLAUDE.md` requires at the end of every implement session.

**Test-first cadence**: For each user-story phase, the test files (e.g. T016–T017 for US1) MUST be written and committed before the corresponding model lands. Per Constitution Principle II, the test failing first is the proof that it actually exercises the schema.

---

## Format validation

All 52 tasks above follow the strict checklist format: `- [x] TNNN [P?] [US?] Description with file path`. Phase 1, Phase 2, and Phase 7 tasks have no `[US]` label per the template. Phase 3–6 tasks all carry their `[US1]`/`[US2]`/`[US3]`/`[US4]` label.
