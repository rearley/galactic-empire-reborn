# Tasks: Physics Tick Activation (006a)

**Input**: Design documents from `/specs/006a-physics-tick/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/physics-events.md, quickstart.md

**Tests**: MANDATORY per project constitution (Principle II: Testing is First Class). Pure-function unit tests for `physics-math`, integration tests for `PhysicsTickService` with Jest fake timers, balance-regression test pinning every consumed `GEMAIN.H` constant, performance bench gating SC-004 (100 ships <50 ms).

**Organization**: Grouped by user story (US1–US4) per spec.md. P1 stories are MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no dependency on other incomplete tasks
- **[Story]**: US1, US2, US3, US4 — maps back to spec.md user stories

## Path Conventions

Backend-only feature in the existing NestJS project at `backend/`. No frontend changes. No Prisma schema change.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Skeleton files and constants the rest of the feature consumes.

- [X] T001 Create directory `backend/src/game/physics/` with empty barrel `index.ts`
- [X] T002 [P] Add physics constants (`ACCENGAMT=120`, `MOVENGUSE=10`, `MOVENGMIN=3000`, `ROTENGUSE=30`, `WARP_THRESHOLD=1000`, `COORD_SCALE=65000`, plus re-export `TICKTIME=6`, `MAXX=30`, `MAXY=15`) to `backend/src/game/constants.ts` with `@see GEMAIN.H` JSDoc references
- [X] T003 [P] Create `backend/src/game/physics/physics-events.ts` exporting event name constants `PHYSICS_SECTOR_TRANSITION = 'physics.sector-transition'` and `PHYSICS_HYPERSPACE = 'physics.hyperspace'` plus the `PhysicsSectorTransitionEvent` and `PhysicsHyperspaceEvent` interfaces from `contracts/physics-events.md`
- [X] T004 Create `backend/src/game/physics/physics.module.ts` (NestJS module — providers/exports left empty, will be filled by foundational + story tasks) and register it in `backend/src/game/game.module.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `ShipClassCacheService` (consumed by both warp command and the physics tick) and the pure-math module shell. Both required before any user story implementation.

**⚠️ CRITICAL**: No user-story work may begin until this phase is complete.

- [X] T005 [P] Create `backend/src/game/physics/ship-class-cache.service.ts` — NestJS `@Injectable` provider with `onModuleInit()` that calls `prisma.shipClass.findMany()` once and stores `Map<number, { maxAcceleration: number; maxWarp: number }>`; expose `getMaxAcceleration(classNumber): number` and `getMaxWarp(classNumber): number` (both throw if class missing)
- [X] T006 [P] Unit test for `ShipClassCacheService` in `backend/test/game/physics/ship-class-cache.service.spec.ts` — mocks `PrismaService.shipClass.findMany`, asserts hydration on `onModuleInit`, asserts synchronous lookup returns expected values, asserts throw on unknown class
- [X] T007 Create `backend/src/game/physics/physics-math.ts` skeleton — empty exports for `rotationStep`, `accelerationStep`, `positionIntegration`, `tryEnergyDebit`, `sectorOf`, `normalizeHeading`; each function stub throws `'not implemented'`. Add file-level JSDoc citing `@see GEFUNCS.C` for each function
- [X] T008 Wire `ShipClassCacheService` into `physics.module.ts` providers and exports; import `PrismaModule` so the cache can resolve `PrismaService`

**Checkpoint**: Foundation ready — US1, US2, US3, US4 may proceed in parallel.

---

## Phase 3: User Story 1 — Ships move under impulse and warp (Priority: P1) 🎯 MVP

**Goal**: A non-orbit/non-docked ship with `speed2b > 0` advances coordinates and (if player) drains `MOVENGUSE` per tick; crossing the warp threshold emits `physics.hyperspace`; crossing a sector boundary emits `physics.sector-transition`.

**Independent Test**: Seed a player ship at `(5.0, 5.0)`, heading 90°, `speed=0`, `speed2b=1000`, `maxAcceleration=1000` on its class. Advance one physics tick. Assert: `speed` snapped to 1000, `xcoord` advanced by `1000 * sin(90°) / 65000`, `energy` debited by `ACCENGAMT + MOVENGUSE`, exactly one `physics.hyperspace` event with `direction: 'enter'` was emitted.

### Tests for User Story 1 (write first — must FAIL before implementation)

- [X] T009 [P] [US1] Pure-function unit tests for `accelerationStep` in `backend/test/game/physics/physics-math.spec.ts` — covers up-step (`+max_accel`), down-step (`-max_accel * 2`), snap when within step, threshold debit (zero below 1000, `ACCENGAMT` at/above 1000), hyperspace boundary detection both directions
- [X] T010 [P] [US1] Pure-function unit tests for `positionIntegration` in same `physics-math.spec.ts` — verifies `x += speed * sin(deg2rad(heading)) / 65000` and `y -= speed * cos(deg2rad(heading)) / 65000` for headings 0/90/180/270/45 with known fixtures, asserts `speed === 0` is a no-op
- [X] T011 [P] [US1] Pure-function unit tests for `tryEnergyDebit` and `sectorOf` in same file — `tryEnergyDebit` refuses when `energy - amount < floor` and returns `{ ok: false }`; `sectorOf({x: 9.95, y: 5.0}) === { x: 9, y: 5 }`
- [X] T012 [P] [US1] Integration test in `backend/test/game/physics/physics-tick.service.spec.ts` — boots `PhysicsTickService` with real `ShipStateService` against an in-memory seeded map, fires one `TickKind.PHYSICS` via the test-double `TickService`, asserts player ship at warp 1 advanced coordinates, drained `MOVENGUSE`, and emitted `physics.hyperspace` once
- [X] T013 [P] [US1] Integration test (same file) — seeds ship at `xcoord=9.95, ycoord=5.0, heading=90, speed=21000`, advances one tick, asserts exactly one `physics.sector-transition` event with `fromSector.x=9, toSector.x=10` and post-update `x` as the source of truth (matches `contracts/physics-events.md` test expectation)
- [X] T014 [P] [US1] Integration test (same file) — seeds an AI ship (`status=2`) at `speed > 0`, fires one tick, asserts `energy` did NOT decrement (FR-006 AI exclusion from `MOVENGUSE`)
- [X] T015 [P] [US1] Integration test (same file) — seeds ship `where >= 10` (in orbit), `speed > 0`, fires one tick, asserts coordinates and speed unchanged (rotate/accel/move/maintenance block skipped per FR-001)
- [X] T016 [P] [US1] Integration test (same file) — seeds ship with energy just above `MOVENGMIN`, fires enough ticks that `MOVENGUSE` debit drops energy below `MOVENGMIN`, asserts `speed2b` was forced to `0` (FR-006 floor cutoff) and ship is decelerating, not stopping instantly
- [X] T017 [P] [US1] Per-ship fault isolation test (same file) — seeds two ships, mutates one to `speed = NaN`, fires one tick, asserts the other ship still advanced, the faulted ship is logged with `shipId`/`tickAt`/stack, and the per-tick fault counter incremented (FR-015)

### Implementation for User Story 1

- [X] T018 [US1] Implement `accelerationStep` in `backend/src/game/physics/physics-math.ts` — pure function returning `{ newSpeed, energyDebit, hyperspaceEvent: 'enter'|'exit'|null }` per `research.md` R-2; `@see GEFUNCS.C:469-573 accel`
- [X] T019 [US1] Implement `positionIntegration` in `physics-math.ts` — pure function returning `{ x, y }`; `@see GEFUNCS.C:648-649 moveship`
- [X] T020 [US1] Implement `tryEnergyDebit` (per-debit floor gate matching `useenergy()`) and `sectorOf` (`{ x: floor(coord.x), y: floor(coord.y) }`) in `physics-math.ts`; `@see GEFUNCS.C:cdistance / coord1`
- [X] T021 [US1] Create `backend/src/game/physics/physics-tick.service.ts` — NestJS `@Injectable` that subscribes to `TickKind.PHYSICS` via `TickService.subscribe(...)` in `onModuleInit`, builds an ascending-`shipId`-sorted iteration of `ShipStateService.findAllShips()` per FR-015a, and per ship: skip if destroyed; if not orbit/docked run accel→move→maintenance; emit hyperspace + sector-transition events through `EventEmitter2` using the constants from T003
- [X] T022 [US1] Wrap each per-ship advancement in `try/catch` inside `physics-tick.service.ts` — logs `{ shipId, tickAt, stack }` at `error` level, increments an instance-level fault counter exposed via a `getFaultCount(): number` accessor (FR-015, R-8)
- [X] T023 [US1] Register `PhysicsTickService` in `physics.module.ts` providers; ensure `EventEmitterModule` is imported (or already global) and `TickService`/`ShipStateService` are reachable via the existing game module graph

**Checkpoint**: Player ships move on the tick, AI ships move without paying maintenance, sector + hyperspace events fire. MVP is shippable.

---

## Phase 4: User Story 2 — Heading chases the staged target each tick (Priority: P1)

**Goal**: Each tick advances `heading` toward `head2b` by `max_accel/10` degrees the short way around the circle, snapping when within one step, normalized to `[0, 360)`.

**Independent Test**: Set ship `heading=0, head2b=90, shpclass.max_accel=200` (step = 20°). Advance ticks. Assert heading = 20, 40, 60, 80, then snaps to 90 on the fifth tick.

### Tests for User Story 2 (write first — must FAIL before implementation)

- [X] T024 [P] [US2] Pure-function unit tests for `rotationStep` in `backend/test/game/physics/physics-math.spec.ts` — covers gradual approach, snap when within step, short-way rotation (350° → 10° via +20°), no-op when already on target, normalization to `[0, 360)`
- [X] T025 [P] [US2] Pure-function unit tests for `normalizeHeading` in same file — asserts `-10 → 350`, `370 → 10`, `360 → 0`
- [X] T026 [P] [US2] Integration test in `backend/test/game/physics/physics-tick.service.spec.ts` — seeds ship at `heading=350, head2b=10, max_accel=200`, fires one tick, asserts `heading === 10` (one step crosses 0/360 short way)
- [X] T027 [P] [US2] Integration test (same file) — seeds ship in orbit (`where >= 10`) with non-trivial `head2b`, fires one tick, asserts heading unchanged (rotation is part of the skipped block per FR-001)

### Implementation for User Story 2

- [X] T028 [US2] Implement `rotationStep(currentHeading, targetHeading, maxAccel)` and `normalizeHeading` in `backend/src/game/physics/physics-math.ts` — `@see GEFUNCS.C:441-460 rotship`; uses `maxAccel/10` as step per R-1
- [X] T029 [US2] Wire `rotationStep` into `physics-tick.service.ts` as the first action of the rotate/accel/move/maintenance block (before `accelerationStep`), reading `maxAccel` from `ShipClassCacheService.getMaxAcceleration(ship.shpclass)`

**Checkpoint**: Headings track `head2b` deterministically; commands like `rotate` from feature 003 now have visible effect on the tick.

---

## Phase 5: User Story 3 — Per-tick countdowns advance (Priority: P2)

**Goal**: `hypha` and `cantexit` decrement by 1 each tick for every non-destroyed ship, regardless of orbit/dock status, flooring at zero.

**Independent Test**: Seed two ships — one in normal space, one in orbit — both with `hypha=3, cantexit=5`. Fire one tick. Assert both ships now have `hypha=2, cantexit=4`. Fire 5 more ticks. Assert both at `0`, never negative.

### Tests for User Story 3 (write first — must FAIL before implementation)

- [X] T030 [P] [US3] Integration test in `backend/test/game/physics/physics-tick.service.spec.ts` — covers all four acceptance scenarios from spec US3: decrement to floor, no underflow at zero, runs in orbit, runs while moving

### Implementation for User Story 3

- [X] T031 [US3] Add countdown decrement step to `physics-tick.service.ts` — runs unconditionally for every non-destroyed ship after the (possibly skipped) rotate/accel/move/maintenance block: `hypha = max(0, hypha - 1)`, `cantexit = max(0, cantexit - 1)`. Routed through `ShipStateService.mutate(...)` so the dirty flag propagates to the existing 1-second flush.

**Checkpoint**: Hyper-phaser cooldown and post-combat exit lockout expire on schedule whether the ship is moving, in orbit, or docked.

---

## Phase 6: User Story 4 — Warp command gates correctly on class and topspeed (Priority: P2)

**Goal**: `warp` command routes through five gates (no-warp class, engines blown, negative, hard cap, overspeed warning) using `ShipClassCacheService.getMaxWarp(...)` plus `Ship.topspeed`.

**Independent Test**: For each of WARP01, WARPSPD2, WARP02, WARP03, WARP04, normal — issue a crafted `warp N` and assert the documented refusal/warning is produced and `speed2b` is or isn't updated. See quickstart §6 table.

### Tests for User Story 4 (write first — must FAIL before implementation)

- [X] T032 [P] [US4] Create `backend/test/game/physics/warp-gate.spec.ts` — five-outcome gate test covering all FR-012 paths against a fake `ShipClassCacheService` and an in-memory `ShipState`; asserts message id and `speed2b` mutation per outcome
- [X] T033 [P] [US4] Revise `backend/test/unit/handlers/warp.spec.ts` (existing from feature 003) — replace the `topspeed===0 → WARP01` proxy assertion with the corrected gate sequence (WARP01 from `maxWarp===0`, WARPSPD2 from `topspeed===0`, WARP02/03/04 unchanged)

### Implementation for User Story 4

- [X] T034 [US4] Modify `backend/src/game/commands/handlers/warp.handler.ts` — inject `ShipClassCacheService`, replace placeholder gate with the ordered sequence in research.md R-6 (class no-warp → engines blown → negative → hard cap → overspeed warning → normal), set `speed2b = 1000 * arg` on success/warning paths; `@see GECMDS.C:561-650 cmd_warp`

**Checkpoint**: All four user stories independently functional. SC-006 and SC-007 satisfied.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Balance pinning, performance budget, and documentation handoff. Required by FR-016, SC-004, SC-005, and the constitution's "living docs" rule.

- [X] T035 [P] Create `backend/test/game/physics/balance-regression.spec.ts` — pins `ACCENGAMT=120`, `MOVENGUSE=10`, `MOVENGMIN=3000`, `ROTENGUSE=30`, `TICKTIME=6`, `WARP_THRESHOLD=1000`, `COORD_SCALE=65000`, `MAXX=30`, `MAXY=15` with `@see GEMAIN.H:line` references; also pins the sum-of-classes for `maxAcceleration` and `maxWarp` against the `ShipClass` seed catalog (FR-016, SC-005)
- [X] T036 [P] Create `backend/test/game/physics/bench.spec.ts` — constructs an in-memory `Map` of 100 fake `ShipState` objects, calls `PhysicsTickService['advanceAll']()` once, asserts `process.hrtime.bigint()` delta `< 50_000_000n` (50 ms); skip when `process.env.CI_LOW_PERF === '1'` (SC-004, R-10)
- [X] T037 [P] Update `docs/ARCHITECTURE.md` — add the `PhysicsTickService` and `ShipClassCacheService` nodes to the module map; show the `TickService → PhysicsTickService → ShipStateService.mutate` flow and the `EventEmitter2` event publication
- [X] T038 [P] Update `docs/DECISIONS.md` — record (a) using `max_accel/10` for rotation step (not `ROTAMT`), (b) widening `MOVENGUSE` to `speed > 0` (with playtest-fallback note from research.md R-4), (c) ascending `shipId` ordering for determinism, (d) per-ship try/catch over quarantine
- [X] T039 [P] Update `docs/PROGRESS.md` — append "2026-05-02 — 006a Physics Tick" entry with completed scope, test coverage levels (unit/integration/balance/bench), known-issues placeholder, and "Next: 006b combat" pointer
- [X] T040 [P] Update `docs/GAME_MECHANICS.md` — add Movement section citing `GEFUNCS.C:rotship/accel/moveship` line numbers and the per-class `max_accel`/`max_warp` derivation
- [X] T041 Run quickstart.md steps 1–8 manually against a freshly booted dev backend; record observed event traces and energy decrements in PR description; report any deviation before merging
- [X] T042 Run full backend test suite (`pnpm --filter backend test`) and confirm SC-008: all previously-passing tests still pass, all new tests pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately. T002, T003 can run parallel; T004 depends on T001.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories. T005/T006/T007 parallel; T008 depends on T005.
- **User Stories (Phases 3–6)**: All depend on Phase 2 completion. Within capacity, US1, US2, US3, US4 may be developed in parallel; US2 and US3 modify the same `PhysicsTickService` orchestrator method as US1, so they should be merged sequentially or coordinated via clear method boundaries.
- **Polish (Phase 7)**: Depends on all four user stories complete.

### User Story Dependencies

- **US1 (P1)**: Foundational only. MVP — ships move + sector/hyperspace events.
- **US2 (P1)**: Foundational only. Touches the same orchestrator file as US1, so merge after US1 lands or behind a feature branch.
- **US3 (P2)**: Foundational only. Adds an unconditional countdown step at the end of the orchestrator loop — minimal collision with US1/US2.
- **US4 (P2)**: Foundational only. Modifies `warp.handler.ts` and one test file — fully independent of US1/US2/US3 once `ShipClassCacheService` exists.

### Within Each User Story

- Tests written and failing BEFORE implementation (constitution Principle II)
- Pure-math functions before orchestrator wiring
- Orchestrator logic before event emission glue
- Story complete and green before moving to next priority

### Parallel Opportunities

- **Setup**: T002, T003 run parallel (different files).
- **Foundational**: T005, T006, T007 run parallel.
- **US1 tests**: T009–T017 all `[P]` — different test files / non-overlapping fixtures, can run as a single batch.
- **US2 tests**: T024–T027 all `[P]`.
- **US4 tests**: T032 and T033 parallel (different files).
- **Polish**: T035–T040 all `[P]` (different files).
- **Cross-story**: With multiple developers, after Foundational closes, one dev takes US1+US2 (shared orchestrator file), one takes US3, one takes US4.

---

## Parallel Example: User Story 1

```bash
# Launch all US1 test tasks together (all different files / non-overlapping fixtures):
Task: "T009 Unit tests for accelerationStep in physics-math.spec.ts"
Task: "T010 Unit tests for positionIntegration in physics-math.spec.ts"
Task: "T011 Unit tests for tryEnergyDebit and sectorOf in physics-math.spec.ts"
Task: "T012 Integration test: warp-1 advance in physics-tick.service.spec.ts"
Task: "T013 Integration test: sector transition emission"
Task: "T014 Integration test: AI ship maintenance exclusion"
Task: "T015 Integration test: orbit/dock skip"
Task: "T016 Integration test: MOVENGMIN floor cutoff"
Task: "T017 Integration test: per-ship fault isolation"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 Setup
2. Phase 2 Foundational (CRITICAL — blocks every story)
3. Phase 3 US1 — Movement
4. **STOP and VALIDATE** — quickstart §3 + §4 manually
5. Demo: ships visibly moving, energy draining for players, AI ships moving free

### Incremental Delivery

1. Setup + Foundational → infrastructure ready
2. US1 → MVP — ships move, sector/hyperspace events fire
3. US2 → rotation completes the rotate/accel/move/maintenance loop
4. US3 → countdowns expire (unblocks downstream gameplay timers)
5. US4 → warp command tier distinction (unblocks 006b combat partial-tactical-scan stubs)
6. Polish → balance pinning, perf bench, docs

### Parallel Team Strategy

- After Foundational lands:
  - **Dev A**: US1 then US2 (shared orchestrator file)
  - **Dev B**: US3 (additive countdown step) and US4 (warp handler) in sequence
  - Polish phase split across both devs

---

## Notes

- `[P]` = different files, no dependency on incomplete tasks
- `[Story]` label maps every implementation/test task to a user story for traceability
- Every feature constant cited carries a `@see GEMAIN.H:<line>` JSDoc reference per constitution Principle IV
- Verify tests fail before implementing (constitution Principle II)
- Commit per task or per logical group; do not batch entire phases into one commit
- 006b combat MUST NOT begin until 006a is merged and quickstart §1–§8 pass
