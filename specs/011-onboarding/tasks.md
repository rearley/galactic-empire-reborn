---
description: "Task list for 011-onboarding — auth, cmd_new, cmd_rename"
---

# Tasks: Player Onboarding — auth, cmd_new, cmd_rename

**Input**: Design documents from `/specs/011-onboarding/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: MANDATORY per project constitution (Principle II: Testing is First Class). Tests written before or alongside implementation.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps to user stories (US1, US2, US3) from spec.md

## Path Conventions

Web app: `backend/src/`, `backend/prisma/`, `backend/test/`, `frontend/src/`, `frontend/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and bootstrap the new modules required by all stories.

- [X] T001 [P] Add backend deps: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt`, `@types/passport-jwt`, `@types/bcrypt` in `backend/package.json`
- [X] T002 [P] Add `JWT_SECRET`, `JWT_EXPIRES_IN`, `BCRYPT_COST`, `SPAWN_SECTOR_X`, `SPAWN_SECTOR_Y` to `backend/.env.example` and `docker-compose.yml` env block
- [X] T003 [P] Create `backend/src/auth/` module skeleton (`auth.module.ts`, `auth.controller.ts`, `auth.service.ts`, `dto/`) — empty stubs so tests can import
- [X] T004 [P] Create `backend/src/game/onboarding/` module skeleton (`onboarding.module.ts`, `onboarding.service.ts`, `name-validator.ts`) — empty stubs
- [X] T005 [P] Create `frontend/src/auth/` and `frontend/src/onboarding/` directory skeletons with placeholder `index.ts` files

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema migration, auth primitives, JWT plumbing, and ship-class seed verification — every user story depends on these.

**⚠️ CRITICAL**: No user story work begins until Phase 2 is complete.

### Database

- [X] T006 Add `username` (String, nullable initially), `passwordHash` (String, nullable), `createdAt` (DateTime @default(now())) to `User` in `backend/prisma/schema.prisma` per data-model.md
- [X] T007 Add `@@unique([userid])` to `Ship` model in `backend/prisma/schema.prisma`
- [X] T008 Generate migration `prisma migrate dev --name 011_onboarding_auth`. Migration SQL must: (a) add `username` and `passwordHash` as nullable, `createdAt` with default `now()`; (b) backfill `username = userid` for existing rows (no source exists for `passwordHash` — pre-existing rows will be left with `NULL` and cannot log in; this is acceptable per data-model.md "Migration safety" section because no production data exists yet, dev DBs are wiped freely, and the policy is recorded in `docs/DECISIONS.md` per T065); (c) `ALTER COLUMN "username" SET NOT NULL`; (d) leave `passwordHash` nullable at the DB level — `AuthService.login` rejects users with a NULL `passwordHash` as `INVALID_CREDENTIALS`; (e) `CREATE UNIQUE INDEX "User_username_lower_idx" ON "User" (LOWER("username"))` and `CREATE UNIQUE INDEX "Ship_shipname_lower_idx" ON "Ship" (LOWER("shipname"))`. Add a header SQL comment in the migration file restating points (b)–(d). File: `backend/prisma/migrations/<ts>_011_onboarding_auth/migration.sql`
- [X] T009a Author seed runner `backend/prisma/seed.ts` that imports `SHIP_CLASSES` from `seed/ship-classes.ts` and `prisma.shipClass.upsert({ where: { classNumber }, create: row, update: row })` for each row. (Verified during pre-analysis: the existing `seed/ship-classes.ts` only exports the data array — no runner currently writes it to the DB.)
- [X] T009b Add `prisma.seed` entry to `backend/package.json` pointing at the runner (`"prisma": { "seed": "ts-node prisma/seed.ts" }`) so `prisma db seed` works locally and in CI
- [X] T009c Idempotency unit test in `backend/test/unit/seed/ship-classes.seed.spec.ts` — run the seed twice against a fresh DB and assert row count + content unchanged after the second run

### Auth primitives

- [X] T010 [P] Implement `backend/src/auth/dto/register.dto.ts` with class-validator decorators: `username` matches `/^[\x21-\x7E]{3,16}$/`, `password` length 8–72 bytes
- [X] T011 [P] Implement `backend/src/auth/dto/login.dto.ts` (same validation rules as register)
- [X] T012 [P] Implement `backend/src/auth/auth.constants.ts` exporting `BCRYPT_COST = 12`, `JWT_EXPIRES_IN = '30d'`, `DUMMY_BCRYPT_HASH` constant for constant-time login
- [X] T013 [P] Unit test bcrypt hash/compare round-trip in `backend/test/unit/auth/bcrypt.spec.ts`
- [X] T014 Implement `AuthService` (`backend/src/auth/auth.service.ts`): `register(dto)`, `login(dto)`, `issueJwt(userid, username)`, `verifyJwt(token)`. Uses `PrismaService`, `JwtService`, bcrypt; constant-time login via dummy hash; case-insensitive username lookup via `mode: 'insensitive'`; maps Postgres `23505` to `USERNAME_TAKEN` (409). JSDoc `@see GECMDS.C` for handle semantics.
- [X] T015 Implement `JwtStrategy` (`backend/src/auth/jwt.strategy.ts`) using `passport-jwt`, secret from `ConfigService.get('JWT_SECRET')`, fail-fast at boot if missing
- [X] T016 Wire `AuthModule` (`backend/src/auth/auth.module.ts`): imports `JwtModule.registerAsync` (secret from config), exports `AuthService`, `JwtModule`. Register in `AppModule`.
- [X] T017 Unit test `AuthService.register/login/issueJwt/verifyJwt` in `backend/test/unit/auth/auth.service.spec.ts` (mocked Prisma)

### WebSocket auth guard

- [X] T018 Implement `WsAuthGuard` (`backend/src/auth/ws-auth.guard.ts`) that reads `socket.handshake.auth.token`, calls `AuthService.verifyJwt`, sets `socket.data.userid`/`username`. On failure: emit `error { code: 'AUTH_REQUIRED' }` and disconnect.
- [X] T019 Unit test `WsAuthGuard` (valid token, missing token, expired token, invalid signature) in `backend/test/unit/auth/ws-auth.guard.spec.ts`

### Shared validators

- [X] T020 [P] Implement `name-validator.ts` (`backend/src/game/onboarding/name-validator.ts`) exporting `isValidShipName(s)` (1–19 printable ASCII per `GECMDS.C:5002`) and unit tests in `backend/test/unit/onboarding/name-validator.spec.ts`

### Command-pipeline hardening (BLOCKS US1)

Pre-analysis confirmed `game.gateway.ts:90` currently reads `userid` from `handshake.query` (the `LOCAL_USERID = 'DEV'` dev path). The `command` handler at line 173 implicitly rejects onboarding sockets via the `activeShipNo === undefined` check, but `sector:join` (line 220) and `sector:leave` (line 240) need explicit audit.

- [X] T020a Audit every `@SubscribeMessage` handler in `backend/src/gateway/game.gateway.ts` (`command`, `sector:join`, `sector:leave`, plus any added since this audit) and confirm each rejects sockets that lack `client.data.userid` (post-`WsAuthGuard`) AND rejects onboarding sockets (`!ConnectedShipsRegistry.isBound(socket)`) before performing any state mutation. Add explicit guard returns where missing.
- [X] T020b Integration test in `backend/test/integration/gateway/handler-auth-posture.spec.ts`: for each `@SubscribeMessage`, assert that an authenticated-but-unbound (onboarding) socket emitting that message receives a `command:result` / `error` rejection and produces no state change.

**Checkpoint**: Schema migrated, auth primitives + JWT verified, command pipeline hardened — user story phases unblock.

---

## Phase 3: User Story 1 - First-time player creates a ship (Priority: P1) 🎯 MVP

**Goal**: Authenticated user with no Ship row is driven through `prompt:class-list` → `prompt:ship-name`, transactionally creates Ship + loads into `ShipStateService`, and is bound for normal play.

**Independent Test**: From a fresh `localStorage`, register `Goliath` → terminal renders class list → submit class → submit ship name `Falcon` → welcome line + `report`/`scan` work. Asserted by E2E spec and gateway integration tests.

### Tests for User Story 1 *(write first; ensure FAIL before implementation)*

- [X] T021 [P] [US1] Contract test for `POST /auth/register` (201, 400 INVALID_USERNAME, 400 INVALID_PASSWORD, 409 USERNAME_TAKEN) in `backend/test/integration/auth/register.spec.ts` using Supertest
- [X] T022 [P] [US1] Contract test for `POST /auth/login` (200, 401 INVALID_CREDENTIALS, constant-time path executed for unknown user) in `backend/test/integration/auth/login.spec.ts`
- [X] T023 [P] [US1] Gateway integration test: connect with valid JWT and no Ship → server emits `prompt:class-list` payload matching contract; replying with invalid class re-emits with `error`; replying with valid class emits `prompt:ship-name`. File: `backend/test/integration/onboarding/cmd-new-prompt-flow.spec.ts`
- [X] T024 [P] [US1] Gateway integration test: full happy path replies → server creates Ship + User in single tx, loads `ShipStateService`, places at spawn (0,0), emits welcome `command:result` + `player.snapshot` + `player.joined`, clears `client.data.onboarding`. File: `backend/test/integration/onboarding/cmd-new-finalize.spec.ts`
- [X] T025 [P] [US1] Gateway integration test: connect WITHOUT token → `error { code: 'AUTH_REQUIRED' }` and disconnect. File: `backend/test/integration/onboarding/handshake-auth.spec.ts`
- [X] T026 [P] [US1] Race-uniqueness integration test: 10 concurrent finalize requests with same ship name → exactly one Ship row, nine receive `name-taken` re-prompt. File: `backend/test/integration/onboarding/race-uniqueness.spec.ts`
- [X] T026a [P] [US1] Gateway integration test (spawn fail-fast): configure `SPAWN_SECTOR_X`/`SPAWN_SECTOR_Y` to coordinates not present in the test galaxy → finalize emits `error { code: 'SPAWN_MISSING' }`, the Prisma tx is rolled back (no Ship row, no `ShipStateService` entry, no `ConnectedShipsRegistry` registration), and the socket remains in `AWAITING_NAME` (no silent fallback). File: `backend/test/integration/onboarding/spawn-missing.spec.ts`. Covers spec edge case "configured spawn sector is missing" and FR-007 fail-fast clause.
- [X] T026b [P] [US1] Gateway integration test (disconnect mid-onboarding): connect with valid JWT and no Ship → receive `prompt:class-list` → reply with valid class → receive `prompt:ship-name` → disconnect before replying. Assert: zero Ship rows, zero changes to the User row, no `ShipStateService` entry, no `ConnectedShipsRegistry` entry. Then reconnect with the same JWT and assert `prompt:class-list` is re-emitted (flow restarts cleanly, no resume of `AWAITING_NAME` from the prior socket). File: `backend/test/integration/onboarding/disconnect-mid-flow.spec.ts`. Covers spec edge case "player disconnects mid-onboarding" and SC-003 disconnect-mid-flow clause.
- [X] T027 [P] [US1] E2E test: register → connect → cmd_new → first `report` returns expected status. File: `backend/test/e2e/onboarding.e2e-spec.ts`
- [X] T028 [P] [US1] Frontend Vitest: `tokenStore` get/set/clear in `frontend/tests/auth/tokenStore.spec.ts`
- [X] T029 [P] [US1] Frontend Vitest: `AuthScreen` register tab POSTs to `/auth/register`, stores token, transitions to terminal. File: `frontend/tests/auth/AuthScreen.register.spec.tsx`
- [X] T030 [P] [US1] Frontend Vitest: `ClassPickerPrompt` renders class list payload and emits `prompt:reply` with chosen `classNumber`. File: `frontend/tests/onboarding/ClassPickerPrompt.spec.tsx`
- [X] T031 [P] [US1] Frontend Vitest: `ShipNamePrompt` renders, validates locally, emits `prompt:reply` with name; renders error on re-prompt. File: `frontend/tests/onboarding/ShipNamePrompt.spec.tsx`

### Implementation for User Story 1 — Backend

- [X] T032 [US1] Implement `AuthController` (`backend/src/auth/auth.controller.ts`) with `POST /auth/register` and `POST /auth/login` per `contracts/http-auth.md`; map service errors to 400/401/409
- [X] T033 [US1] Modify `backend/src/gateway/game.gateway.ts` connect handler: apply `WsAuthGuard`, look up User → Ship; if no Ship, set `socket.data.onboarding = { step: 'AWAITING_CLASS' }` and emit `prompt:class-list` (do NOT register in `ConnectedShipsRegistry`, do NOT join sector room). Remove `LOCAL_USERID = 'DEV'` / `query.userid` path entirely.
- [X] T034 [US1] Implement `OnboardingService` (`backend/src/game/onboarding/onboarding.service.ts`): `buildClassListPayload()`, `validateClassReply(n)`, `validateNameReply(s)`, `finalize(socket, userid, classNumber, name)` running a single Prisma tx that creates the Ship row + initial loadout from `ShipClass` (no magic numbers; spawn coordinates read from `ConfigService.get('SPAWN_SECTOR_X')` / `SPAWN_SECTOR_Y` declared in T002, defaulting to neutral-zone origin (0,0)), then calls `ShipStateService.load()` + `ConnectedShipsRegistry.register()`. Before creating the Ship, look up the spawn sector in the galaxy; if absent, throw `SpawnSectorMissingError` so the tx aborts and the gateway emits `error { code: 'SPAWN_MISSING' }` to the socket — never silently fall back. The User row is **not** created here (it already exists from `POST /auth/register`). JSDoc `@see GECMDS.C:4534` (cmd_new).
- [X] T035 [US1] Add `@SubscribeMessage('prompt:reply')` handler in `game.gateway.ts`: dispatch by `socket.data.onboarding.step`; on invalid → re-emit current prompt with `error`; on valid AWAITING_NAME → call `OnboardingService.finalize`, then run existing welcome sequence and clear `socket.data.onboarding`; reject if no onboarding state with `NOT_IN_ONBOARDING`
- [X] T036 [US1] Disambiguate Postgres `23505` collisions inside `OnboardingService.finalize` by inspecting the violated constraint name: `Ship_shipname_lower_idx` → re-emit `prompt:ship-name` with `error: 'name-taken'` (preserve `selectedClass`); `Ship_userid_unique` → emit `error { code: 'ALREADY_HAS_SHIP' }` and trigger the existing-ship branch (hydrate + bind to the row that won the race) so the loser converges with US2 semantics rather than seeing a misleading "name-taken" message. Cover both branches in `cmd-new-finalize.spec.ts` (T024) and the race test (T026).
- [X] T037 [US1] Wire `OnboardingModule` (imports `AuthModule`, `PrismaModule`, `ShipStateModule`, `ConnectedShipsModule`) into `AppModule` / `GameGateway`

### Implementation for User Story 1 — Frontend

- [X] T038 [P] [US1] Implement `frontend/src/auth/tokenStore.ts` (localStorage wrapper: `getToken`, `setToken`, `clearToken`)
- [X] T039 [P] [US1] Implement `frontend/src/auth/authClient.ts` with `register({username,password})` and `login(...)` posting to backend
- [X] T040 [US1] Implement `frontend/src/auth/AuthScreen.tsx` (login + register tabs) — calls `authClient`, stores token, signals app to mount terminal
- [X] T041 [US1] Modify `frontend/src/socket/socketClient.ts`: remove `LOCAL_USERID`; pass `auth: { token: getToken() }` on connect; on `error { code: 'AUTH_REQUIRED' | 'SESSION_REPLACED' }` clear local socket state and surface to UI
- [X] T042 [US1] Modify `frontend/src/socket/useSocket.ts` to consume token from `tokenStore`; do not connect until token present
- [X] T043 [US1] Implement `frontend/src/onboarding/ClassPickerPrompt.tsx` — listens for `prompt:class-list`, renders rows, emits `prompt:reply { value: classNumber }`
- [X] T044 [US1] Implement `frontend/src/onboarding/ShipNamePrompt.tsx` — listens for `prompt:ship-name`, accepts free-text input, validates 1–19 printable ASCII locally, emits `prompt:reply { value: name }`, displays server `error` on re-prompt
- [X] T045 [US1] Modify `frontend/src/App.tsx` — gate route on `tokenStore.getToken()`; render `AuthScreen` when absent, terminal otherwise; while `prompt:class-list`/`prompt:ship-name` are active, render onboarding prompt component instead of normal command input

**Checkpoint**: US1 fully functional — fresh client can register, complete onboarding, and play.

---

## Phase 4: User Story 2 - Returning player resumes their ship (Priority: P1)

**Goal**: Authenticated user with existing Ship row reconnects directly into bound play; no class-list flow; ship hydrated from DB into `ShipStateService` if cold.

**Independent Test**: After completing US1, reload browser → terminal mounts directly with welcome line referencing the existing ship name; `report` shows the same sector/loadout as before.

### Tests for User Story 2 *(write first; ensure FAIL before implementation)*

- [X] T046 [P] [US2] Gateway integration test: JWT-authed connect with existing Ship → no `prompt:class-list`, hydrates ShipState if absent, registers in `ConnectedShipsRegistry`, runs welcome sequence. File: `backend/test/integration/onboarding/returning-player.spec.ts`
- [X] T047 [P] [US2] Gateway integration test: ShipState already loaded (warm) → second connect path skips re-hydration, still binds. Same file as T046 with second `describe`.
- [X] T048 [P] [US2] Gateway integration test (latest-wins): same JWT connects on second socket while first still live → first socket receives `error { code: 'SESSION_REPLACED' }` + `disconnect`, registry now binds second socket. File: `backend/test/integration/onboarding/session-replaced.spec.ts`
- [X] T049 [P] [US2] Frontend Vitest: app boots with token in localStorage → `AuthScreen` not rendered, socket connects directly. File: `frontend/tests/auth/AuthScreen.returning.spec.tsx`

### Implementation for User Story 2

- [X] T050 [US2] In `game.gateway.ts` connect handler (continuing T033), implement existing-Ship branch: hydrate via `ShipStateService.loadIfAbsent(shipId)`, check `ConnectedShipsRegistry` for prior socket on same `shipId` → emit `error { code: 'SESSION_REPLACED' }` + `disconnect(true)` on prior socket and emit `player.left`, then register new socket and run welcome sequence (`command:result` welcome line, `player.snapshot`, `player.joined`)
- [X] T051 [US2] Add `loadIfAbsent(shipId)` to `ShipStateService` if not already present, with unit test `backend/test/unit/ship/loadIfAbsent.spec.ts` (idempotent on warm cache)
- [X] T052 [US2] Frontend: on app mount, if `tokenStore.getToken()` returns a JWT, skip `AuthScreen` and connect immediately (`App.tsx`)

**Checkpoint**: US1 and US2 both work independently. New + returning players both supported.

---

## Phase 5: User Story 3 - Player renames their ship (Priority: P2)

**Goal**: Bound player issues `rename <name>`; server validates, atomically updates Ship row + `ShipState`, broadcasts `ship.renamed` to sector room.

**Independent Test**: With a bound ship, send `rename Phoenix`; verify Ship row, in-memory state, and that another client in the same sector receives `ship.renamed { oldName: 'Falcon', newName: 'Phoenix' }`.

### Tests for User Story 3 *(write first; ensure FAIL before implementation)*

- [ ] T053 [P] [US3] Unit test for `RenameService.validate(name, ownShipId)` — same charset/length rules as cmd_new; own ship excluded from uniqueness; casing-only allowed. File: `backend/test/unit/onboarding/rename.service.spec.ts`
- [ ] T054 [P] [US3] Gateway integration test: bound socket sends `command rename Phoenix` → DB row updated, ShipState updated, sector room receives `ship.renamed { shipId, oldName, newName }`, issuer receives `command:result` confirmation + fresh `player.snapshot`. File: `backend/test/integration/onboarding/cmd-rename.spec.ts`
- [ ] T055 [P] [US3] Gateway integration test: rename to taken name → `command:result` error, no DB write, no broadcast. Same file as T054.
- [ ] T056 [P] [US3] Gateway integration test: rename to same name (case-identical) → no-op success, no broadcast, no DB write. Same file as T054.
- [ ] T057 [P] [US3] Gateway integration test: rename casing-only variant ("Falcon" → "FALCON") → DB updated, broadcast emitted. Same file as T054.
- [ ] T058 [P] [US3] Gateway integration test: `rename` from non-bound (onboarding) socket → standard `command:result` error; no state change. Same file as T054.

### Implementation for User Story 3

- [ ] T059 [US3] Implement `RenameService` (`backend/src/game/onboarding/rename.service.ts`) — JSDoc `@see GECMDS.C:5002` (cmd_rename); shares `name-validator` with cmd_new; uniqueness query excludes own `shipId`; runs Prisma tx wrapping in-memory mutation
- [ ] T060 [US3] Register `rename` command in `CommandRouterService` (`backend/src/game/commands/`) — pre-condition `ConnectedShipsRegistry.isBound(socket)`; route to `RenameService.handle(socket, args)`
- [ ] T061 [US3] After successful rename, emit `ship.renamed` to bound ship's current sector room and re-emit `player.snapshot` to all (per contracts/websocket-events.md)
- [X] T062 [US3] Frontend: subscribe to `ship.renamed` in `useSocket.ts` and update player-list / sector-view component state without full sector refresh
- [X] T063 [P] [US3] Frontend Vitest: receiving `ship.renamed` updates rendered ship name in player list. File: `frontend/tests/onboarding/ship-renamed.spec.tsx`

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T064 [P] Update `docs/ARCHITECTURE.md` with `AuthModule` and `OnboardingModule`
- [X] T065 [P] Update `docs/DECISIONS.md` with: bcrypt cost 12, JWT 30-day expiry, latest-wins single-session, dev-DB password-hash backfill policy
- [X] T066 [P] Update `docs/PROGRESS.md` with feature 011 completion summary
- [X] T067 [P] Update `docs/DATA_MODEL.md` reflecting User schema changes and new unique indexes
- [X] T068 [P] Update `docs/GAME_MECHANICS.md` with cmd_new / cmd_rename behavior referencing `GECMDS.C:4534` and `GECMDS.C:5002`
- [ ] T069 Run quickstart.md Paths 1–6 manually in dev environment; capture results in PR description
- [X] T070 Verify no `LOCAL_USERID` / `query.userid` references remain anywhere in `backend/` or `frontend/` (`grep -r LOCAL_USERID`)
- [X] T071 Confirm no magic numbers in onboarding code path — every starting stat traces to `ShipClass` or `GEMAIN.H` constant (review pass). Found and fixed: `energy` now uses `ENGYMAX` constant (50000, @see GEFUNCS.C:initshp), `phasr` now `100` (100% charge), `shield` now `0` (shields down at spawn per GEFUNCS.C:initshp).
- [X] T072 Verify all new commits include Prisma migration files (no `prisma/migrations/` in `.gitignore`); migration `20260506000000_011_onboarding_auth` present and committed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: After Setup; BLOCKS all user stories
- **US1 (Phase 3)**: After Foundational
- **US2 (Phase 4)**: After Foundational; **shares the gateway connect handler with US1** — coordinate edits to `game.gateway.ts` (T033, T050) sequentially
- **US3 (Phase 5)**: After Foundational; independent of US1/US2 implementation files (different services + command handler) but logically requires a bound ship to test (use US1 setup in fixtures)
- **Polish (Phase 6)**: After all desired user stories

### Within Each User Story

- Tests written and FAILING before implementation
- DTOs/validators → services → controllers/handlers → gateway wiring
- Backend ready before frontend integration in US1

### Parallel Opportunities

- Phase 1 (T001–T005) all in parallel
- Phase 2 DTOs/constants (T010–T013) parallel with each other; auth service + strategy + module sequential after
- All US1 tests (T021–T031) parallel
- Frontend US1 components (T038, T039, T043, T044) parallel; `App.tsx`/`socketClient.ts` edits sequential
- All US3 tests (T053–T058) parallel
- All Polish docs updates (T064–T068) parallel

---

## Parallel Example: User Story 1 Tests

```bash
# Launch all US1 backend integration tests concurrently:
Task: "Contract test for /auth/register in backend/test/integration/auth/register.spec.ts"
Task: "Contract test for /auth/login in backend/test/integration/auth/login.spec.ts"
Task: "Gateway prompt-flow test in backend/test/integration/onboarding/cmd-new-prompt-flow.spec.ts"
Task: "Race-uniqueness test in backend/test/integration/onboarding/race-uniqueness.spec.ts"

# Launch frontend US1 component tests concurrently:
Task: "tokenStore tests in frontend/tests/auth/tokenStore.spec.ts"
Task: "ClassPickerPrompt tests in frontend/tests/onboarding/ClassPickerPrompt.spec.tsx"
Task: "ShipNamePrompt tests in frontend/tests/onboarding/ShipNamePrompt.spec.tsx"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Phase 1 + Phase 2 complete
2. Phase 3 (US1) complete → fresh players can register and play
3. Validate via quickstart Path 1 + Path 6
4. Demo / merge

### Incremental Delivery

1. Setup + Foundational → infra ready
2. + US1 → MVP (new-player onboarding)
3. + US2 → returning-player resume + latest-wins
4. + US3 → rename
5. Polish + docs

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Verify integration tests fail before implementing their handlers
- Commit after each task or logical group; migration files committed alongside the schema change
- T033 and T050 both edit `game.gateway.ts` — must run sequentially
- Every starting ship value must trace to `ShipClass` row data or a `GEMAIN.H` constant — no magic numbers (FR-008)
