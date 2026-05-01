# Tasks: Tick Engine & Real-time Foundation

**Input**: Design documents from `/specs/002-tick-engine/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/websocket-events.md, quickstart.md

**Tests**: MANDATORY per Constitution Principle II. Unit tests use Jest fake timers; integration tests use real `socket.io-client`; e2e boots a real Nest app on an ephemeral port. SC-006 requires 100% pass.

**Organization**: Tasks grouped by user story. Each story is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no dependency on incomplete tasks
- **[Story]**: US1 / US2 / US3 — maps to spec.md user stories

## Path Conventions

Web app structure. All paths absolute from repo root: `backend/src/...`, `backend/test/...`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add Nest/Socket.io dependencies and bootstrap files; reconfigure Jest to pick up new test trees without breaking the existing 250 Prisma schema tests.

- [X] T001 Update `backend/package.json` to add runtime deps `@nestjs/core@^10`, `@nestjs/common@^10`, `@nestjs/platform-socket.io@^10`, `@nestjs/websockets@^10`, `socket.io@^4`, `rxjs@^7`, `reflect-metadata@^0.2`, and dev dep `socket.io-client@^4`. Do NOT add `@nestjs/schedule` (reserved for feature 009). Add scripts: `start`, `start:dev` (`nest start --watch`), `build`. Run `npm install`.
- [X] T002 [P] Create `backend/nest-cli.json` with default monorepo: false config so `nest start` works.
- [X] T003 Update `backend/tsconfig.json` to enable `experimentalDecorators`, `emitDecoratorMetadata`, and `esModuleInterop` (verify strict mode remains on; add only if missing).
- [X] T004 Update `backend/jest.config.ts` to add new `roots`/`testMatch` entries for `backend/test/unit`, `backend/test/integration`, and `backend/test/e2e` while preserving `backend/test/prisma-schema`. Confirm existing 250 tests still discover. Added `maxWorkers: 1` to prevent DB race conditions between test files sharing `ge_test`.
- [X] T005 Create `backend/src/main.ts` that bootstraps `AppModule`, calls `app.enableShutdownHooks()`, and listens on `process.env.PORT ?? 3000`. Log `[Bootstrap] Listening on http://localhost:<port>` on success.
- [X] T006 Create `backend/src/app.module.ts` as the root module wiring `PrismaModule`, `TickModule`, and `GatewayModule` (modules will be created in Phase 2).

**Checkpoint**: `npm install` succeeds, `npm test` still green (250 + 0 new), nothing depends on these in isolation.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Stand up the empty modules and shared types that every user story plugs into. No story-specific behavior here — just the skeleton.

**⚠️ CRITICAL**: All user stories below depend on this phase.

- [X] T007 [P] Create `backend/src/prisma/prisma.module.ts` exporting `PrismaService` as a `@Global()` provider.
- [X] T008 [P] Create `backend/src/prisma/prisma.service.ts` — class `PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy` with empty `onModuleInit`/`onModuleDestroy` bodies (filled in US1).
- [X] T009 [P] Create `backend/src/game/tick/tick.types.ts` defining `TickKind` enum (`SHIP_UPDATE`, `PHYSICS`), `TickContext` interface (`kind`, `tickNumber`, `firedAt`), `TickHandler` type (`(ctx: TickContext) => void | Promise<void>`), and `Unsubscribe` type (`() => void`). JSDoc each with `@see GEMAIN.H TICKTIME / TICKTIME2` and `@see GEMAIN.C` main-loop reference.
- [X] T010 [P] Create `backend/src/game/tick/tick.module.ts` exporting `TickService` as a global provider so feature 003+ can inject without re-importing.
- [X] T011 [P] Create `backend/src/game/tick/tick.service.ts` — `@Injectable()` class implementing `OnModuleInit, OnModuleDestroy` with empty hook bodies and an empty `subscribe(kind, handler): Unsubscribe` method that returns a no-op for now (filled in US1/US3).
- [X] T012 [P] Create `backend/src/gateway/gateway.module.ts` exporting `GameGateway` provider.
- [X] T013 [P] Create `backend/src/gateway/game.gateway.ts` — `@WebSocketGateway({ cors: true })` class with empty `handleConnection`/`handleDisconnect` and empty `@SubscribeMessage('sector:join')` and `@SubscribeMessage('sector:leave')` methods (filled in US2).

**Checkpoint**: `npm run build` compiles cleanly. `npm test` still 250 green. `npm run start` boots and exits without errors.

---

## Phase 3: User Story 1 - Server starts and stays alive (Priority: P1) 🎯 MVP

**Goal**: Boot a NestJS process that connects to Postgres, opens a Socket.io endpoint, fires the 1 s and 6 s heartbeats reliably, and shuts down cleanly with no leaked timers.

**Independent Test**: `npm run start:dev` produces the four-log boot sequence within 5 s; over a synthetic 60 s of fake time, SHIP_UPDATE fires ~60 times and PHYSICS ~10 times; `Ctrl+C` exits within 3 s with no orphaned timers (verified by Jest's `jest.getTimerCount() === 0` after shutdown).

### Tests for User Story 1 *(write first; ensure they FAIL before implementation)*

- [X] T014 [P] [US1] Write `backend/test/unit/tick.service.spec.ts` — uses `jest.useFakeTimers()`. Cases: (a) after `onModuleInit`, advancing 1000 ms invokes the SHIP_UPDATE callback once with `tickNumber=1`; (b) advancing 60 000 ms produces exactly 60 SHIP_UPDATE invocations and 10 PHYSICS invocations; (c) after `onModuleDestroy`, no further invocations occur and `jest.getTimerCount()` is 0; (d) `tickNumber` resets to 0 across module init/destroy/init cycle (FR-005); (e) `firedAt` is a `Date`. Also includes G4 slow/async handler cases.
- [X] T015 [P] [US1] Write `backend/test/integration/prisma-lifecycle.spec.ts` — boots a Nest testing module with `PrismaModule`, calls `app.init()`, asserts `$connect()` ran, asserts `$disconnect()` is called on close (via spy). G3: bogus DATABASE_URL causes app.init() to reject.
- [X] T016 [P] [US1] Write `backend/test/e2e/boot.e2e.spec.ts` — calls `NestFactory.create(AppModule)`, `app.listen(0)` in a timer asserting < 5000ms (G1); `app.close()` in a timer asserting < 3000ms (G2); connects with `socket.io-client`, asserts `connect` fires within 2 s, asserts no leaked connections after disconnect.

### Implementation for User Story 1

- [X] T017 [US1] Implement `backend/src/game/tick/tick.service.ts`: setInterval(1000)/setInterval(6000) in onModuleInit, clearInterval in onModuleDestroy, tickNumber per kind, fire-and-forget async handler dispatch with try/catch, getStats() for debug endpoint.
- [X] T018 [US1] Implement `backend/src/prisma/prisma.service.ts` lifecycle: `onModuleInit` → `await this.$connect()`; `onModuleDestroy` → `await this.$disconnect()`. Logger lines match `quickstart.md`.
- [X] T019 [US1] Wire `main.ts` fail-fast: bootstrap error propagates and exits non-zero. IoAdapter wired for Socket.io.
- [X] T020 [US1] Run `npm test` — 288 tests pass (250 existing + 38 new). maxWorkers=1 added to prevent DB race conditions.

**Checkpoint**: US1 complete. `npm run start:dev` shows the four-log boot sequence and the heartbeats are observable. The server has no real game behavior yet but is provably alive. MVP candidate.

---

## Phase 4: User Story 2 - Client joins and leaves a sector room (Priority: P1)

**Goal**: A connected Socket.io client can `sector:join` and `sector:leave` valid sectors, gets `OUT_OF_BOUNDS` / `INVALID_PAYLOAD` errors for bad inputs, and has all room memberships released on disconnect.

**Independent Test**: With the server running, a `socket.io-client` instance can join (5,5), receive `sector:joined`, leave, receive `sector:left`, attempt (99,99) and receive the `OUT_OF_BOUNDS` error contract from `contracts/websocket-events.md`, then disconnect — and `io.sockets.adapter.rooms` shows no leaked memberships across 100 cycles (SC-004).

### Tests for User Story 2 *(write first; ensure they FAIL before implementation)*

- [X] T021 [P] [US2] Write `backend/test/integration/game-gateway.spec.ts` — boots a Nest testing module with `GatewayModule`, `app.listen(0)`, connects a real `socket.io-client`. Cases:
  - **join valid** (5,5) → receives `sector:joined` `{x:5,y:5,room:"sector:5:5"}`; server-side `io.sockets.adapter.rooms.get("sector:5:5")` contains the socket id.
  - **join idempotent** — same client joins (5,5) twice → only one membership; second join still echoes `sector:joined`.
  - **leave** → receives `sector:left`; room no longer contains the socket id.
  - **leave never-joined** → receives `sector:left`, no `error` (no-op per contract).
  - **out-of-bounds** join (0,5), (31,5), (5,0), (5,16) → each emits `error` matching the `OUT_OF_BOUNDS` shape and the socket is in zero rooms beyond its own id.
  - **invalid payload** (`{}`, `{x:"a",y:5}`, `{x:1.5,y:5}`) → emits `error` with `INVALID_PAYLOAD`.
  - **disconnect cleanup** — join three sectors, disconnect, assert all three rooms no longer contain the socket id (FR-008).
  - **100-cycle leak test** — repeat join/leave 100×, assert no growth in adapter room count (SC-004).

### Implementation for User Story 2

- [X] T022 [US2] Implement `backend/src/gateway/game.gateway.ts`:
  - Inject `Logger`. `@WebSocketServer() server: Server`.
  - `handleConnection(client)` logs `connection <id>`.
  - `handleDisconnect(client)` logs `disconnect <id>` (Socket.io clears rooms automatically).
  - `@SubscribeMessage('sector:join')` validates the payload (integers in range), joins `client` to `sector:${x}:${y}`, emits `sector:joined` to `client` only. On invalid → emit `error` per `GatewayError` shape.
  - `@SubscribeMessage('sector:leave')` validates the payload, calls `client.leave(...)` (no-op if not joined), emits `sector:left`. Out-of-bounds / malformed → `error`.
  - Build a small private `validateCoord(payload)` helper returning a `{ ok: true, x, y } | { ok: false, code, message }` discriminated union. Constants `MAXX=30`, `MAXY=15` imported from a shared `backend/src/game/constants.ts` (create if absent) with JSDoc `@see GEMAIN.H`.
- [X] T023 [US2] Run `npm test` — confirm T021 passes and prior tests still green.

**Checkpoint**: US1 + US2 both functional. The real-time contract from `contracts/websocket-events.md` is locked in for feature 003+.

---

## Phase 5: User Story 3 - Future systems can subscribe to the heartbeat (Priority: P2)

**Goal**: Provide a typed `tickService.subscribe(kind, handler): Unsubscribe` API. Each tick fires registered handlers in registration order; one handler throwing does NOT stop siblings or the next firing (FR-011).

**Independent Test**: A test subscriber registers against SHIP_UPDATE, advances 5 s of fake time, asserts the subscriber was invoked 5×; a second subscriber that throws every call does NOT reduce the firing count of the first subscriber over a further 60 s window (SC-005); calling the returned `unsubscribe()` stops further invocations and is idempotent.

### Tests for User Story 3 *(write first; ensure they FAIL before implementation)*

- [X] T024 [P] [US3] Added `tick.service.subscribers.spec.ts` with all required cases plus G4 slow/async handler cases:
  - **register + fire** — handler registered for SHIP_UPDATE; advance 3000 ms; handler called 3× with `kind=SHIP_UPDATE` and `tickNumber=1,2,3`.
  - **unsubscribe** — call returned `Unsubscribe`; advance further; handler not called again.
  - **idempotent unsubscribe** — call `Unsubscribe` twice; second call is a no-op (no throw).
  - **idempotent register** — register the same handler reference twice for the same kind; advance 1000 ms; handler called only once.
  - **error isolation (FR-011 / SC-005)** — register a throwing handler and a counting handler for the same kind; advance 60 000 ms; counting handler called exactly 60×; throwing handler called every tick (no skipping); subsequent ticks continue firing.
  - **kind isolation** — handler registered for PHYSICS only is not invoked on SHIP_UPDATE ticks.

### Implementation for User Story 3

- [X] T025 [US3] Extended `backend/src/game/tick/tick.service.ts`:
  - Replace the stub `subscribe` with a real implementation backed by `private readonly handlers: Map<TickKind, Set<TickHandler>>`.
  - `subscribe(kind, handler)` adds to the set (idempotent because `Set` semantics) and returns an `Unsubscribe` closure that deletes it (idempotent — `Set#delete` returns false safely).
  - The `dispatch(kind, ctx)` private method iterates the set and wraps each handler call in `try/catch`, logging caught errors via `Logger` with the handler index and `kind`. Async handlers: do NOT await — fire-and-forget with a `.catch()` attached so a rejected promise is logged but does not block the next handler or the next tick (FR-011, FR-012).
  - JSDoc with `@see GEMAIN.C` for the main-loop dispatch analogue.
- [X] T026 [US3] Run `npm test` — confirm T024 passes and US1/US2 tests still green.

**Checkpoint**: All three user stories independently functional. Feature 003 can now `tickService.subscribe(TickKind.PHYSICS, ...)` without touching this module.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Operator-facing affordances, docs, and the manual soak hook called out in `quickstart.md`.

- [X] T027 [P] Created `backend/src/debug/debug.controller.ts` with `GET /debug/tick-stats → { shipUpdate, physics }`. Wired into AppModule. @nestjs/platform-express included as dep.
- [X] T028 [P] Updated `docs/ARCHITECTURE.md` with full module map, subscriber registry explanation, sector room format, and updated repo layout.
- [X] T029 [P] Appended three entries to `docs/DECISIONS.md`: setInterval rationale, single-process constraint, hand-rolled subscriber registry.
- [X] T030 [P] Appended `## 2026-05-01 — 002-tick-engine` block to `docs/PROGRESS.md`.
- [X] T031 SKIPPED (manual operator step per user note 7). Procedure already documented in `specs/002-tick-engine/quickstart.md`.
- [X] T032 Final `npm test` (288/288 pass) + `npm run build` (clean). Feature complete (SC-006). Also added `backend/test/unit/constants.spec.ts` pinning TICKTIME=6, TICKTIME2=1, MAXX=30, MAXY=15 (G5).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1. Blocks Phases 3–5.
- **Phase 3 (US1)**: Depends on Phase 2. Independently testable once complete.
- **Phase 4 (US2)**: Depends on Phase 2. Independent of US1 (different files: gateway vs tick/prisma). Can run in parallel with US1.
- **Phase 5 (US3)**: Depends on Phase 3 (extends `TickService`). Cannot fully overlap with US1's T017.
- **Phase 6 (Polish)**: Depends on US1 (T027 needs `TickService.getStats`); docs (T028–T030) can start any time after Phase 5.

### Within Each User Story

- Tests (T014–T016, T021, T024) MUST be written first and observed to FAIL before the corresponding implementation tasks land.
- Models / types (Phase 2) before services; services before gateway routes.
- Each story finishes with a green `npm test` checkpoint.

### Parallel Opportunities

- All Phase 2 tasks (T007–T013) are in different files → all `[P]`.
- US1 tests (T014, T015, T016) are in different files → all `[P]`.
- US1 implementation: T017 (tick) and T018 (prisma) touch different files → both can run in parallel; T019 (main.ts) depends on T018.
- US2 has only one impl task (T022) editing one file → no internal parallelism.
- US3 extends T017's file → cannot run in parallel with T017.
- Polish tasks T027–T030 touch different files → all `[P]`.

---

## Parallel Example: Phase 2 Foundational

```bash
# All seven module-skeleton files can be created simultaneously:
Task: "Create backend/src/prisma/prisma.module.ts"
Task: "Create backend/src/prisma/prisma.service.ts"
Task: "Create backend/src/game/tick/tick.types.ts"
Task: "Create backend/src/game/tick/tick.module.ts"
Task: "Create backend/src/game/tick/tick.service.ts"
Task: "Create backend/src/gateway/gateway.module.ts"
Task: "Create backend/src/gateway/game.gateway.ts"
```

## Parallel Example: User Story 1 Tests

```bash
# Three different test files, no dependencies between them:
Task: "Write backend/test/unit/tick.service.spec.ts (fake-timer cadence + lifecycle)"
Task: "Write backend/test/integration/prisma-lifecycle.spec.ts (connect/disconnect)"
Task: "Write backend/test/e2e/boot.e2e.spec.ts (full Nest boot + socket connect)"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 → Phase 2 → Phase 3.
2. **STOP and VALIDATE**: server boots, heartbeats observable, clean shutdown. SC-001/SC-003/SC-006 (partial) green.
3. Demo: this is the foundation feature 003+ will build on.

### Incremental Delivery

1. Setup + Foundational → skeleton boots.
2. + US1 → server alive + heartbeats firing → MVP demoable.
3. + US2 → real-time contract locked in → feature 003 unblocked for sector-scoped broadcasts.
4. + US3 → subscriber registry → feature 003 can hook into the tick without modifying this module.
5. + Polish → soak run + docs updated → feature shippable.

### Parallel Team Strategy

After Phase 2 completes:

- Dev A: US1 (tick + prisma lifecycle + e2e boot).
- Dev B: US2 (gateway + sector room contract). Can start immediately — only touches `backend/src/gateway/` and `backend/test/integration/game-gateway.spec.ts`.
- Dev A continues into US3 once T017 is merged (US3 extends `TickService`).

---

## Notes

- `[P]` = different files, no incomplete-task dependencies.
- Every task lists explicit absolute file paths.
- Constants `MAXX=30`, `MAXY=15`, `TICKTIME=6`, `TICKTIME2=1` come from `reference/ge-source/GEMAIN.H` and MUST be cited in JSDoc per Constitution Principle IV.
- `@nestjs/schedule` is intentionally NOT installed in this feature — held back for feature 009's midnight `@Cron` (research.md Decision 1).
- Commit after each task or logical pair. Don't squash the test-first / impl pair — preserving the failing-test commit makes Principle II auditable.
- Stop at any checkpoint to validate the story independently before continuing.
