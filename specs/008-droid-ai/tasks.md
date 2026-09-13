# Tasks: Ephemeral Droid AI

**Input**: Design documents from `/specs/008-droid-ai/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/droid-events.md

**Tests**: Tests are MANDATORY per the project constitution (Principle II — Testing is First Class). Every task that lands behavior is paired with the test task that exercises it; tests are written before or alongside implementation, never after.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently against its acceptance criteria.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- All paths are relative to repo root

## Path Conventions

- Backend code: `backend/src/...`
- Backend tests: `backend/test/...`
- Prisma seed: `backend/prisma/seed/...`
- Reference C source (read-only): `reference/ge-source/GEDROIDS.C`, `GEMAIN.C`, `GEMAIN.H`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add new constants and ship-class seed rows that every later phase depends on.

- [X] T001 Add Droid constants to `backend/src/game/constants.ts`: `DROID_MAX_PER_CLASS = 2`, `DROID_SPAWN_TICK_CADENCE = 30`, `DROID_ANNOY_DENOM = 4`, `DROID_USERID_PREFIX = "@Droid-"`, and pin `CLASSTYPE_DROID = 3` if not already exported. Each constant carries a `@see` comment to its `GEMAIN.H` / `GEDROIDS.C` line.
- [X] T002 [P] Add `ShipClass` seed rows for classes 10 (Lydorian Garbage Scow), 11 (Murdonian Transport), 12 (Vakory Survey Drone) in `backend/prisma/seed/ship-classes.ts`. Values verbatim from the original C-source class table: `category = CLASSTYPE_DROID`, `tot_to_create = 2`, plus `scanRange`, `maxShields`, `maxPhaser`, `topspeed`, `hasTorpedo`/`hasMine`/`hasJammer` per data-model.md §"New ShipClass seed rows".
- [X] T003 [P] Re-run the seed script and confirm three new rows are present in `ge_dev`: `select classNumber, typename, category from "ShipClass" where classNumber in (10,11,12) order by classNumber;` returns the three Droid rows.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the ephemerality plumbing on `ShipState` and create the empty Droid module skeleton. These changes block every user story — US1 cannot spawn a Droid until `isEphemeral` exists and `flush()` skips it; US2 cannot run decision trees without the module wiring; US3's invariants cannot be verified without the field.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Add optional `isEphemeral?: boolean` field to `ShipState` in `backend/src/game/ship/ship-state.types.ts`. JSDoc references FR-001..FR-004 and notes the field is in-memory-only (not part of the Prisma schema, not part of the mappers).
- [X] T005 Modify `ShipStateService.flush()` in `backend/src/game/ship/ship-state.service.ts` to add a single early-`continue` when `state.isEphemeral === true`. JSDoc cites FR-002.
- [X] T006 Add unit test `backend/test/game/ship/ship-state.flush-skips-ephemeral.spec.ts` proving `flush()` issues zero Prisma calls for any state with `isEphemeral === true` (FR-002), and still flushes states without the flag.
- [X] T007 [P] Create empty Droid module shell `backend/src/game/droid/droid.module.ts` (NestJS `@Module`, imports `CybertronModule` so NestJS resolves `CombatModule` → `PhysicsModule` → `TickModule` ahead of it; exports nothing yet).
- [X] T008 [P] Create `backend/src/game/droid/droid.config.ts` exposing per-class tunables (`scanRange`, `topspeed`, `fightbackHyperspaceMaxDist=30000`, `confuseDenom_class11=10`, `alterVectorDenom_class12=20`, `vakoryDamageThreshold=75`) wired through NestJS `ConfigModule` env override; defaults verbatim from `GEDROIDS.C` and the C-source class table.
- [X] T009 [P] Create `backend/src/game/droid/droid-events.ts` exporting typed event-name const `DroidEvents` (`'droid.annoy'`, `'droid.spawned'`, `'droid.killed'`) and the three payload interfaces per `contracts/droid-events.md` — canonical fields are: `DroidAnnoyEvent { fromShipKey, fromShipname, toUserid, toShipno, message, sector, tickAt, classNumber, variant }` (where `classNumber` ∈ {10,11,12} and `variant` ∈ `'passive' | 'help'` — both are **published** fields, not test-only); `DroidSpawnedEvent { shipKey, classNumber, sector, tickAt }`; `DroidKilledEvent { shipKey, classNumber, attackerShipKey, sector, tickAt }`.
- [X] T010 [P] Create `backend/src/game/droid/droid-message-pool.ts` — typed static catalog partitioned by class (10/11/12) and variant (`'passive'` / `'help'`). Strings ported from the original `message.c` / `messages` catalog referenced by `GEDROIDS.C` (`DRDMSG1..15`, `DRDHLP1..15`, `DRDMSG6`). Export a `pickAnnoy(classNumber, variant, rng)` helper that draws uniformly from the matching slice.
- [X] T011 [P] Register `DroidModule` under `GameModule` (`backend/src/game/game.module.ts`) — import only; the module is a no-op until US1 wires the tick service.

**Checkpoint**: Foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 — PvE target appears in the wild for new players (Priority: P1) 🎯 MVP

**Goal**: Boot a fresh server, log in one human player, and within ~15 minutes the live world contains up to 6 Droid ships (2 per class) that scan-detect, behave as non-player ships, and on kill transfer cargo to the attacker via the existing 006b path.

**Independent Test**: Boot `ge_test`, log a player ship in, advance physics ticks (Jest fake timer in tests, or wall-clock in dev). Within two cadence rollovers the population reaches 6; `prisma.ship.findMany({ where: { shpclass: { in: [10,11,12] } } })` still returns `[]`; firing on a Murdonian Transport produces return phaser fire and, on kill, transfers its cargo to the attacker.

### Tests for User Story 1 *(write first; ensure they FAIL before implementation lands)*

- [X] T012 [P] [US1] Spawn-cap test in `backend/test/game/droid/spawn-cap.spec.ts` — drive `DroidTickService` past 30 ticks repeatedly with seeded PRNG; assert per-class population never exceeds `DROID_MAX_PER_CLASS=2` and total never exceeds 6 (FR-006).
- [X] T013 [P] [US1] Spawn-cadence test in `backend/test/game/droid/spawn-cadence.spec.ts` — assert the spawner runs only on the 30th physics tick rollover (FR-005), and skips entirely when zero `GESTAT_USER` ships are online (player-online gate, matches Cybertron pattern from 007).
- [X] T014 [P] [US1] Spawn-placement test in `backend/test/game/droid/spawn-placement.spec.ts` — under seeded PRNG, assert spawn coordinates are uniformly distributed in `[-19.8, 19.8]` per axis (FR-007), userid format is `@Droid-<n>`, `shipno=1`, `shpclass ∈ {10,11,12}`, `status = GESTAT_AUTO`, `isEphemeral = true`, and shield/phaser types initialize to per-class maxima (FR-010).
- [X] T015 [P] [US1] Loadout test in `backend/test/game/droid/loadout.spec.ts` — assert Murdonian receives the full random loadout band (FR-008: flux 0–49, decoys 0–249, torps 0–249, mines 0–99, jammers 0–99, missiles 0–99, ion 0–24, gold 0–249) and that Garbage Scow / Vakory receive the sparse band (FR-009: flux 0–49, decoys 0–24, mines 0–9, jammers 0–9; no torps/missiles/ion/gold).
- [X] T016 [P] [US1] Murdonian cargo-transfer-on-kill test in `backend/test/game/droid/murdonian-cargo-transfer.spec.ts` — spawn a Murdonian with known loot, simulate a player phaser kill via the existing 006b `firep` path, assert (a) attacker's items grew by victim's loot per the existing 006b loot rule (SC-004), (b) Droid removed from in-memory map, (c) zero Prisma `ship.delete` calls, (d) `droid.killed` event published with `attackerShipKey`.
- [X] T017 [P] [US1] Annoy-event integration test in `backend/test/game/droid/annoy-event.spec.ts` — drive a Murdonian with one in-range player, force the annoy roll to succeed under seeded PRNG, assert exactly one `droid.annoy` event published with the expected payload (`fromShipKey`, `fromShipname`, `toUserid`, `toShipno`, `message`, `sector`, `tickAt`, `classNumber`, `variant`), and that `GameGateway` emits to the player's socket and to the `sector:<x>:<y>` room (FR-030, FR-031).

### Implementation for User Story 1

- [X] T018 [US1] Implement `DroidSpawner` in `backend/src/game/droid/droid-spawner.ts` — pure helper that builds a `ShipState` with `isEphemeral: true`, randomized initial fields (`xcoord`/`ycoord = rndm(39.9) - 19.8`, `heading`, `head2b`, `speed2b`, `holdcourse` randomized first-action delay, `shieldtype = class.maxShields`, `phasrtype = class.maxPhaser`, `tick`, `status = GESTAT_AUTO`, `energy = 50000`), allocates a unique `@Droid-<n>` userid via `nextSlotIndex`, calls `ShipStateService.loadShip(state)`, and updates the `livePopulation` map. Exposes `randomMurdonianLoadout`, `randomGarbageScowLoadout`, `randomVakoryLoadout` as pure functions over the injected `Random` port. JSDoc cites `GEDROIDS.C:droid_init` (lines 100–180).
- [X] T019 [US1] Implement `DroidTickService` in `backend/src/game/droid/droid-tick.service.ts` — subscribes to `TickKind.PHYSICS` via existing `TickService.subscribe` API in `onModuleInit` (after `CybertronTickService`); maintains private `spawnTickCounter` modulo `DROID_SPAWN_TICK_CADENCE=30`, `livePopulation: Map<number, Set<string>>`, `nextSlotIndex`. On rollover: (a) gate on `≥1 GESTAT_USER ship online`; (b) for each class 10/11/12 below cap, call `DroidSpawner.spawn(class)` and publish `droid.spawned`; (c) iterate per-Droid actions (decision-tree dispatch is a no-op stub here — populated by US2). Per-Droid action calls are wrapped in `try/catch` so one fault cannot stall the batch. JSDoc cites `GEMAIN.C:2325-2400`.
- [X] T020 [US1] Wire `combat.ship-destroyed` consumer in `DroidTickService` — when victim userid matches `^@Droid-`, call `droid_died` path: publish `droid.killed`, free the slot in `livePopulation`, call `ShipStateService.removeFromGame(userid, shipno)` (no Prisma delete; FR-003, FR-028, FR-029). When attacker userid matches `^@Droid-`, run `droid_won`: set the **attacker-Droid's** `speed2b = rndm(5000.0)` per `GEDROIDS.C:534-538` (`ptr` in `droid_won(ptr)` is the winning Droid).
- [X] T021 [US1] Bridge `droid.annoy` in `backend/src/gateway/game.gateway.ts` — subscribe via `@OnEvent('droid.annoy')`; emit payload to the target player's socket (`to:<toUserid>:<toShipno>`) and broadcast to `sector:<x>:<y>` room. No Socket.io reference appears in `game/droid/`. JSDoc cites contracts/droid-events.md.
- [X] T022 [US1] Add a stub annoy emission in `DroidTickService` so US1's annoy-event integration test (T017) can drive end-to-end delivery: when the per-Droid pass scans an in-range non-jammed player and `gernd() % DROID_ANNOY_DENOM === 1`, draw a `'passive'` message via `pickAnnoy(...)` and publish `droid.annoy`. Full per-class decision dispatch is filled in by US2.
- [X] T023 [US1] Add dev-only `backend/src/game/droid/droid.debug.controller.ts` with a force-spawn endpoint (`POST /debug/droid/spawn?class=10`) gated behind `NODE_ENV !== 'production'` for QA per quickstart.md.

**Checkpoint**: At this point, US1 is fully functional. Acceptance scenarios 1, 2 (annoy + shield toggle landing in US2 — minimal annoy in this phase), 3 (return phaser fire lands in US2; minimum here is the kill-loop), and 4 (kill + cargo transfer + no-DB-write) all pass on the spawn-and-kill path. A player can engage and kill Droids; per-class flavor is sparse until US2.

---

## Phase 4: User Story 2 — Distinct behavior per Droid class (Priority: P2)

**Goal**: Each of the three classes follows its own decision tree faithfully — Garbage Scow never returns fire, Murdonian flees-or-fights with a 1-in-10 confuse roll, Vakory uses torpedoes / mines / jammers and a 1-in-20 alter-attack-vector roll.

**Independent Test**: Per-class behavior matrix in tests — for each class, exercise jammed / not-jammed / under-fire / >75%-damage states with seeded PRNG and assert the resulting state matches the original `droid_act_class_10/11/12` decision tree from `GEDROIDS.C`.

### Tests for User Story 2 *(write first; ensure they FAIL before implementation lands)*

- [X] T024 [P] [US2] Pure decisions tests in `backend/test/game/droid/droid-decisions.spec.ts` — exhaustive table-driven tests over `rollAnnoy` (denom 4), `rollConfuseHeading` (denom 10, returns `{head2b ∈ [0, 359.9), speed2b ∈ [0, 10000), holdcourse ∈ [3, 12]}`), `rollAlterAttackVector` (denom 20, ranges `[0, 5000)` / `[3, 12]`), `rollVakoryTorpedoVolley` (returns 0 or 1), `pickHoldCourseDuration` (jammed: `[10, 59]`; >75% damage flee: `[20, 49]`; missile-evade: `[5, 9]`).
- [X] T025 [P] [US2] Garbage Scow behavior matrix in `backend/test/game/droid/droid-act-class-10.spec.ts` — assert: jammed → random hold-course `[10,59]` + sub-warp speed, no fire (FR-012, FR-014); not-jammed + player in scan range → `pickAnnoy('passive')` rolled at 25%, shields up at impulse / down at warp (FR-011, FR-013); never returns fire under any condition (FR-014).
- [X] T026 [P] [US2] Murdonian behavior matrix in `backend/test/game/droid/droid-act-class-11.spec.ts` — assert: jammed → `speed2b = topspeed*1000`, random heading, hold-course `[10,59]` (FR-016); not-jammed scanning player → optional new sub-warp speed (only if not on held course), shield-by-speed toggle, annoy roll (FR-015); under attack same-zone hyperspace `ddist<30000` → phaser fire (FR-018); under attack normal-space + non-cloaked attacker → phaser fire + 1-in-10 confuse to `head2b ∈ [0,359.9)`, `speed2b ∈ [0,10000)`, hold-course `[3,12]` (FR-019); hyperspace + missile-locked → exit hyperspace (`speed2b = rndm(999.0)`, hold-course `[5,19]`) (FR-020); call-for-help annoy on `cantexit > 0` with `lastfired >= 0` (FR-017). The `lastfired >= 0` condition (note: `>=`, not `>`) is asserted explicitly per spec edge case.
- [X] T027 [P] [US2] Vakory behavior matrix in `backend/test/game/droid/droid-act-class-12.spec.ts` — assert: jammed → top-warp flee (FR-022); same-zone hyperspace `ddist<30000` → phaser fire (FR-023); normal-space + non-cloaked attacker → phaser fire + `rollVakoryTorpedoVolley` (0 or 1) torpedo via 006b `torp` (FR-024); >75% damage with at least one mine and one jammer → `laymine` + `jam` + top-warp flee with hold-course `[20,49]` (FR-025, SC-007); missile-locked → `speed2b ∈ [5000, 10900)`, hold-course `[5,9]` (FR-026); 1-in-20 alter-attack-vector branch (FR-027); fight-back trigger requires `lastfired > 0` strictly (note the `>`, not `>=`) so attacker at slot 0 cannot trigger fight-back (spec edge case). Includes a named test case **"fires torpedo even when torpedo inventory is zero (GEDROIDS.C:480 replenishment)"** — Vakory in fight-back mode against a non-cloaked normal-space attacker with `items[I_TORPEDO] = 0` and the volley roll forced to succeed under seeded PRNG: assert exactly one `torp` invocation against the attacker, confirming the pre-`torp` inventory replenishment from `GEDROIDS.C:480`.
- [X] T028 [P] [US2] Annoy message-pool test in `backend/test/game/droid/annoy-pool.spec.ts` — assert each class × variant slice is non-empty, that `pickAnnoy` only draws from the matching slice (FR-031), and that fight-back call-for-help variant is selected when `cantexit > 0` (FR-017).

### Implementation for User Story 2

- [X] T029 [P] [US2] Implement pure-function decision module `backend/src/game/droid/droid-decisions.ts` — exports `rollAnnoy`, `pickFightBackBranch`, `randomMurdonianLoadout`, `randomGarbageScowLoadout`, `randomVakoryLoadout`, `pickHoldCourseDuration`, `rollConfuseHeading`, `rollAlterAttackVector`, `rollVakoryTorpedoVolley`. All randomness flows through the injected `Random` port from 006b. JSDoc on each function cites the exact `GEDROIDS.C` line(s) and the verbatim C random expression (e.g., `gernd()%10 + 3`).
- [X] T030 [P] [US2] Implement `backend/src/game/droid/droid-act-class-10.ts` — Lydorian Garbage Scow decision tree per `GEDROIDS.C:droid_act_class_10`. Composes `shieldup`/`shielddn` from 006b but never `firep`/`torp`. Returns the new `ShipState` patch (caller applies).
- [X] T031 [P] [US2] Implement `backend/src/game/droid/droid-act-class-11.ts` — Murdonian Transport decision tree per `GEDROIDS.C:droid_act_class_11`. Composes `firep`/`firehp`/`shieldup`/`shielddn` from 006b. Calls `pickAnnoy(11, 'help')` on `cantexit > 0` first-time entry.
- [X] T032 [P] [US2] Implement `backend/src/game/droid/droid-act-class-12.ts` — Vakory Survey Drone decision tree per `GEDROIDS.C:droid_act_class_12`. Composes `firep`/`firehp`/`torp`/`laymine`/`jam`/`shieldup`/`shielddn` from 006b. Replenishes `items[I_TORPEDO]` pre-`torp` per `GEDROIDS.C:480` so the AI is not gated by torp inventory.
- [X] T033 [US2] Replace the US1 annoy stub in `DroidTickService` with the full per-class dispatch — for each Droid in the live population, look up its class and invoke `droidActClass10` / `11` / `12`, applying the returned patch and any emitted `droid.annoy` events. Per-ship action wrapped in `try/catch` (fault isolation).
- [X] T034 [US2] Wire `missl_attached(state)` helper in `backend/src/game/droid/droid-decisions.ts` — predicate over `lmisslDistance[i] > 0` per `GEDROIDS.C:missl_attached`. Used by Murdonian hyperspace-evade and Vakory missile-evade branches.

**Checkpoint**: All three classes behave faithfully. Acceptance scenarios under US2 pass; US1 acceptance scenario 2 (annoy + shield toggle) and scenario 3 (return phaser fire + course alteration) now pass end-to-end.

---

## Phase 5: User Story 3 — Ephemerality (no persistence, no DB clutter) (Priority: P2)

**Goal**: Verify and pin the foundational invariant that classes 10/11/12 never write to `Ship` or `User`, never appear in daily score recalculation, and never survive a server restart. The mechanism (the `isEphemeral` flag and `flush()` skip) was put in place in Phase 2; this phase locks the invariant with regression tests.

**Independent Test**: Spawn → kill → restart cycles against a real test DB with `prisma.ship.findMany({ where: { shpclass: { in: [10,11,12] } } })` returning `[]` at every checkpoint.

### Tests for User Story 3 *(mandatory regression pins)*

- [X] T035 [P] [US3] Ephemerality regression test in `backend/test/game/droid/ephemerality.spec.ts` — drives spawn → action ticks → kill → restart cycle against a real test database. Asserts at every checkpoint: (a) zero rows in `Ship` for `shpclass IN (10,11,12)` (FR-001, FR-004, SC-003); (b) `ShipStateService.flush()` issues zero Prisma calls for ephemeral states (FR-002); (c) `removeFromGame` issues zero Prisma deletes for ephemeral states (FR-003); (d) zero rows in `User` for `userid LIKE '@Droid-%'`; (e) after a simulated restart (`DroidTickService` re-instantiated, `ShipStateService` map cleared and re-hydrated from DB), in-memory Droid count is exactly zero before the next spawn evaluation (FR-004).
- [X] T036 [P] [US3] Jammed-no-fire-no-annoy invariant test in `backend/test/game/droid/jammed-invariants.spec.ts` — pin SC-006: a jammed Droid (`jammer > 0`) emits zero `droid.annoy` events and fires zero weapons across 100 cadence rollovers; only `speed2b` and `holdcourse` change.
- [X] T037 [P] [US3] Two-simultaneous-kills test — extend `ephemerality.spec.ts` (or new file) to assert two Droid kills resolved in the same tick each clean up independently with no DB delete attempted (spec edge case "Two Droid kills resolving in the same tick").

**Checkpoint**: Persistence invariants are pinned. US1, US2, and US3 are all independently functional.

---

## Phase 6: User Story 4 — Cybertron spawn-visibility patch (Priority: P3)

**Goal**: The pre-existing Cybertron spawn-visibility defect (newly created Cybertrons not loaded into in-memory state until restart) is already fixed in code (commit `b01c009`). This phase adds the regression test that pins the fix so future refactors cannot reintroduce the defect.

**Independent Test**: Drive `CybertronRepository.createSpawn` against a real test DB and assert `ShipStateService.get(userid, shipno)` returns the new ship in the same operation, before any restart or re-hydrate.

### Tests for User Story 4

- [X] T038 [P] [US4] Cybertron spawn-visibility regression test in `backend/test/game/cybertron/createSpawn-visibility.spec.ts` — calls `cybertronRepository.createSpawn(...)` with a live `ShipStateService`; asserts the returned ship is present in the in-memory map keyed by `(userid, shipno)` synchronously after the spawn transaction commits, with all expected fields populated (FR-032, SC-005). No production code change is required for US4.

**Checkpoint**: All four user stories are independently functional and verified.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Statistical balance verification, fault isolation, documentation, and quickstart validation.

- [X] T039 [P] Balance regression test in `backend/test/game/droid/balance-regression.spec.ts` — pins every constant the feature depends on: `DROID_MAX_PER_CLASS=2`, `DROID_SPAWN_TICK_CADENCE=30`, `DROID_ANNOY_DENOM=4`, `DROID_USERID_PREFIX="@Droid-"`, `CLASSTYPE_DROID=3`, `fightbackHyperspaceMaxDist=30000`, `confuseDenom_class11=10`, `alterVectorDenom_class12=20`, `vakoryDamageThreshold=75`. Test fails on any change so balance drift requires an explicit decision.
- [X] T040 [P] Annoy-rate statistical test in `backend/test/game/droid/annoy-rate-stat.spec.ts` — runs 100 annoy evaluations under seeded PRNG; assert successes ∈ `[15, 35]` (SC-002).
- [X] T041 [P] Fault-isolation test in `backend/test/game/droid/fault-isolation.spec.ts` — inject one Droid whose action throws; assert the remaining Droids still process their tick and the spawner still runs.
- [X] T042 [P] SC-001 cold-boot fill test in `backend/test/game/droid/cold-boot-fill.spec.ts` — from empty population with ≥1 player online, assert population reaches cap of 6 within 2 spawn-cadence rollovers (~60 physics ticks ≈ 6 minutes wall clock at `TICKTIME=6`), and assert exactly one Droid per class is created per rollover (FR-007).
- [ ] T043 Run `quickstart.md` end-to-end against `ge_test`: log a player in, advance two cadence rollovers, scan a Droid, fire on a Murdonian, kill it, restart server, confirm population reset. Capture observed timings and update quickstart if needed.
- [X] T044 Update `docs/ARCHITECTURE.md` with the new `game/droid/` module map and its tick subscription order (after Cybertron, after combat, after physics).
- [X] T045 Update `docs/DECISIONS.md` with: (a) ephemerality via in-memory `isEphemeral` flag rather than a separate Prisma model; (b) 30-tick cadence drives both spawn and per-Droid action evaluation (single counter); (c) Droid class numbers 10/11/12 chosen to match `GEDROIDS.C` source.
- [X] T046 Update `docs/PROGRESS.md` with the 008 completion entry — what was built, test counts, decisions, next feature (009 midnight job), known issues (Droid kill-score impact deferred to 009).
- [X] T047 Update `docs/GAME_MECHANICS.md` with the three Droid classes and their decision-tree summaries (each entry cites `GEDROIDS.C:droid_act_class_*`).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user stories.
- **US1 (Phase 3)**: Depends on Foundational. Delivers the MVP — spawn lifecycle + kill loop + minimal annoy.
- **US2 (Phase 4)**: Depends on US1 (the tick service and dispatch hook must exist). Adds full per-class decision trees.
- **US3 (Phase 5)**: Depends on Foundational only — could in principle run in parallel with US1/US2, but its regression tests are most meaningful once US1's spawn path exists. Practical order: after US1.
- **US4 (Phase 6)**: Depends on Foundational only. Independent of US1/US2/US3 — can run in parallel with any of them.
- **Polish (Phase 7)**: Depends on US1+US2+US3 being complete (US4 is not gating).

### Within Each User Story

- Tests written first; implementation lands once tests fail.
- Pure-decision modules (US2 T029) before per-class action modules (T030/T031/T032).
- Per-class action modules before the dispatch hook (T033).
- Service modifications (T019, T020) before gateway bridge (T021) before US1 stub annoy (T022).

### Parallel Opportunities

- **Phase 1**: T002 and T003 in parallel (T002 is the seed change; T003 is the verify step that depends on T002 — sequential within the pair).
- **Phase 2**: T004 → T005 → T006 sequential (same `ShipState` / flush surface). T007–T011 all in parallel after T006 — different new files.
- **Phase 3 (US1)**: T012–T017 in parallel (different test files). T018 and T019 sequential (T019 depends on T018). T020/T021/T022 sequential after T019 (same service file). T023 in parallel with T020/T021/T022.
- **Phase 4 (US2)**: T024–T028 in parallel (different test files). T029 first; T030/T031/T032 in parallel after T029. T033 after T030/T031/T032. T034 in parallel with T030/T031/T032.
- **Phase 5 (US3)**: T035/T036/T037 all in parallel.
- **Phase 6 (US4)**: T038 alone.
- **Phase 7**: T039–T042 all in parallel; T043 sequential after T042; T044–T047 all in parallel after T043.

---

## Parallel Example: User Story 1

```bash
# All US1 tests can be authored in parallel:
Task: "Spawn-cap test in backend/test/game/droid/spawn-cap.spec.ts"
Task: "Spawn-cadence test in backend/test/game/droid/spawn-cadence.spec.ts"
Task: "Spawn-placement test in backend/test/game/droid/spawn-placement.spec.ts"
Task: "Loadout test in backend/test/game/droid/loadout.spec.ts"
Task: "Murdonian cargo-transfer test in backend/test/game/droid/murdonian-cargo-transfer.spec.ts"
Task: "Annoy-event integration test in backend/test/game/droid/annoy-event.spec.ts"
```

```bash
# After T029 (decisions module), the three per-class action modules can be authored in parallel:
Task: "Implement droid-act-class-10.ts (Lydorian Garbage Scow)"
Task: "Implement droid-act-class-11.ts (Murdonian Transport)"
Task: "Implement droid-act-class-12.ts (Vakory Survey Drone)"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1: Setup (constants + seed rows).
2. Phase 2: Foundational (`isEphemeral` field, `flush()` skip, module shells).
3. Phase 3: US1 — spawn lifecycle, kill loop, minimal annoy.
4. **STOP & VALIDATE**: Run the US1 acceptance test from spec.md §"Independent Test". The world fills with Droids; Murdonian kill transfers cargo; zero DB rows.
5. Optional demo / merge to main as the MVP increment.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → spawn + kill works; minimal flavor. Demo/merge.
3. US2 → full per-class behavior. Demo/merge.
4. US3 → ephemerality regression pins. Merge (no user-visible change; pure invariant lock).
5. US4 → Cybertron regression pin. Merge (the production fix is already shipped; this just locks it).
6. Polish → balance + statistical + docs.

### Parallel Team Strategy

After Foundational (Phase 2):

- **Developer A**: US1 (spawn + kill + minimal annoy) — primary path.
- **Developer B**: US4 (Cybertron regression test) — fully independent.
- **Developer C**: Begin US2 pure-decision module (T029) and per-class tests (T024–T028) in parallel with US1, but defer per-class action modules until US1's `DroidTickService` lands.

US3 regression tests author after US1's spawn path is in code (otherwise the assertions have nothing to assert against).

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks.
- `[Story]` label maps each task to the user story it serves; tasks without a story label belong to Setup, Foundational, or Polish.
- Tests MUST be written before or alongside implementation. Verify tests fail before the implementation lands (TDD per constitution Principle II).
- Every public service method written in Phases 3–6 carries a JSDoc `@see GEDROIDS.C:<line>` reference to the original C source.
- Commit at logical groupings — typically per-file or per per-class boundary. The spec-kit hook will offer a commit prompt at phase boundaries.
- Stop at any checkpoint to validate the user story independently against the spec's "Independent Test" criterion.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence (the only acceptable cross-story dependency in this plan is US2 → US1 because US2's dispatch hook replaces US1's stub annoy on the same `DroidTickService` surface).
