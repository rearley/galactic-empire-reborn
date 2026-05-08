# Tasks: Physics Polish — Tick & Bridge Consolidation

**Input**: Design documents from `/specs/019-physics-polish/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Tests are MANDATORY per Principle II. Each FR cluster has unit tests, an integration test against the in-memory tick, and AI-isolation tests where AI-driven. Tests written before or alongside implementation.

**Organization**: Tasks grouped by user story. Each story is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story tag (US1–US6)
- File paths are absolute from repo root

## Path Conventions

Web app layout: `backend/src/`, `frontend/src/`. Tests live next to the touched files under `backend/test/...` per existing convention; verify by inspecting neighboring `*.spec.ts` placement before creating new spec files.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm tick host extension surface; no new modules created here.

- [X] T001 Verify `TickService.subscribe(TickKind.SHIP_UPDATE, handler)` API exists in `backend/src/game/tick/tick.service.ts` and that `OnModuleInit` / `OnModuleDestroy` hooks are reachable on consumer services; record finding in PR description if any deviation from plan §Tick-host correction.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Stand up the shared `ShipTickService` host that US2, US3, US4 hang their per-ship work on. Do NOT add any per-ship logic here — story phases own that.

**⚠️ CRITICAL**: No US2/US3/US4 work begins until T003 lands.

- [X] T002 Add `ship-tick.service.spec.ts` covering: subscribes on `OnModuleInit`, unsubscribes on `OnModuleDestroy`, empty per-ship loop runs once per `TickKind.SHIP_UPDATE` fire, no work when no active ships, handler iterates over `ShipService` active ships in deterministic order. Path: `backend/test/game/ship/ship-tick.service.spec.ts` (or sibling to existing ship specs — match neighbor convention).
- [X] T003 Create `ShipTickService` class in `backend/src/game/ship/ship-tick.service.ts`. Subscribe to `TickKind.SHIP_UPDATE` in `OnModuleInit`; unsubscribe in `OnModuleDestroy`. Inject `ShipService`. Per-tick handler loops over active ships and delegates to a no-op `processShip(ship)` private method that subsequent stories will extend. JSDoc references `physics-tick.service.ts` as the parallel pattern.
- [X] T004 Wire `ShipTickService` as a provider in `backend/src/game/ship/ship.module.ts` and confirm it is constructed at boot (existing module bootstrap test or a new one).

**Checkpoint**: Foundation ready — US2, US3, US4 can begin attaching per-ship work.

---

## Phase 3: User Story 1 — Universe Boundary Wrap (Priority: P1) 🎯 MVP

**Goal**: Coordinates wrap modulo `MAXX`/`MAXY` after position integration, preserving all other ship state. Closes the correctness bug where sustained travel produces invalid coordinates.

**Independent Test**: Drive a ship across each boundary at warp 9 and confirm post-tick coordinates are in range, sector-transition event fires once with the post-wrap sector, heading/speed/cargo/locks unchanged.

### Tests for User Story 1

- [X] T005 [P] [US1] Unit tests for `wrapCoord(value, max)` in `backend/test/game/physics/physics-math.spec.ts`: positive overshoot, negative undershoot (just-below-zero), exact-boundary value, large multiple-wrap value, NaN/Infinity guard. Cover `MAXX=30` and `MAXY=15`. Tests must FAIL before T007.
- [X] T006 [P] [US1] Integration test in `backend/test/game/physics/physics-tick.wrap.spec.ts`: ship at (29.8, 7.0) heading east at warp 9 → post-tick x in `[0, 30)`; ship at (15, 0.1) heading south → post-tick y near 15; diagonal at corner wraps both axes; wrap preserves heading, speed, cargo, torpedo locks, **missile lock list, and sector-room membership of attached entities** (per spec.md edge case at L206); sector-transition event fires once with post-wrap sector; wrap is a no-op when `where > 1`. Must FAIL before T008.

### Implementation for User Story 1

- [X] T007 [P] [US1] Add pure `wrapCoord(value: number, max: number): number` to `backend/src/game/physics/physics-math.ts` per `GEFUNCS.C:651-705`. JSDoc with `@see GEFUNCS.C:651`. Implementation uses `((value % max) + max) % max` (or equivalent two-step subtract matching source).
- [X] T008 [US1] In `backend/src/game/physics/physics-tick.service.ts`, after position integration and before sector-transition event emission, call `wrapCoord` per axis when `ship.where <= 1`. Preserve all other state. JSDoc references `GEFUNCS.C:651-705` and notes the `telezip` non-wrap fallback is dead under our `univwrap=true` config.
- [X] T009 [P] [US1] (Optional, test-visibility) Add `PHYSICS_BOUNDARY_WRAPPED` event constant in `backend/src/game/physics/physics-events.ts` and emit from `physics-tick.service.ts` when wrap fires; payload per `data-model.md` §`PhysicsBoundaryWrappedEvent`. Skip if T006 covers wrap detection without this event.

**Checkpoint**: US1 complete — coordinates always in range after a full physics tick (SC-001).

---

## Phase 4: User Story 2 — Overspeed Engine Damage (Priority: P1)

**Goal**: Faithful port of `GEFUNCS.C:733-792` overspeed lottery → damage path; recovery branch resets `warncntr`.

**Independent Test**: A ship sustained at >150% rated topspeed accumulates `warncntr`, eventually crosses `warncntr > 4` threshold, takes `gernd()%20` damage, and emits `WARPBRK`. Dropping below threshold triggers recovery (`topspeed/warncntr`, `warncntr=0`) and `WARPSPD`.

### Tests for User Story 2

- [X] T010 [P] [US2] Unit tests for `decideOverspeed(ship, rng)` pure decision in `backend/test/game/ship/ship-overspeed.spec.ts`: lottery miss (no state change), escalation increments `warncntr` and returns `WARPFAST + warncntr`, threshold cross (`warncntr > 4`) returns engine-break decision with `damage += rng.intBelow(20)` and `topspeed=0`/`speed2b=0`, recovery branch (intspeed normalized) returns new `topspeed=floor(topspeed/warncntr)` and `warncntr=0` plus `WARPSPD`, `diff < 0` clamps to `5`. Inject deterministic RNG.
- [X] T011 [P] [US2] Integration test in `backend/test/game/ship/ship-tick.overspeed.spec.ts`: ship-update tick applies engine-break damage exactly once on threshold crossing, emits `WARPBRK` to that ship's socket, does not double-apply on subsequent ticks (gated by `topspeed=0`); recovery branch fires `WARPSPD` once when ship slows below threshold.

### Implementation for User Story 2

- [X] T012 [P] [US2] Create pure `decideOverspeed` in `backend/src/game/ship/ship-overspeed.ts` per the formula in `research.md` §R2 (mirrors `GEFUNCS.C:733-792`). Returns a tagged-union decision (`'noop' | 'warn' | 'break' | 'recover'`) carrying field deltas; no side effects. JSDoc `@see GEFUNCS.C:733`.
- [X] T013 [US2] In `backend/src/game/ship/ship-tick.service.ts` `processShip`, call `decideOverspeed`, apply the returned deltas to ship state, and emit the appropriate warning event (`WARPFAST + n`, `WARPBRK`, `WARPSPD`) on the ship's socket via the existing event-emitter route. Reuse the seeded RNG used by combat math.

**Checkpoint**: US2 complete — sustained overspeed produces damage with the correct probabilistic ramp (SC-002).

---

## Phase 5: User Story 3 — Auto-Repair Honors Player Setting (Priority: P2)

**Goal**: Per ship-update tick, when `autoRepair === true` and gates pass, queue a repair identical to `cmd_maint`. Tick layer never imports command-layer code — gate logic + cash debit + repair-queue mutation extracted into shared `MaintenanceService`.

**Independent Test**: Ship with `autoRepair=true`, damage, sufficient cash, not in combat lock, not in NZ (or piloted by Zygor) → next ship-update tick queues a repair and deducts cash exactly once. Negative cases (insufficient cash, combat lock, NZ-non-Zygor, undamaged) → no charge, no repair queued.

### Tests for User Story 3

- [X] T014 [P] [US3] Unit tests for `MaintenanceService.evaluateGates(ship)` and `MaintenanceService.runMaintenance(ship)` in `backend/test/game/ship/maintenance.service.spec.ts`: each gate (damage > 0, cash >= cost, `tagged === 0`, NZ rule with Zygor exception) returns the correct accept/reject; `runMaintenance` debits cash once and queues repair; idempotent against repeated calls if state unchanged after first call (no double-debit on the same already-queued repair). Cover Zygor branch separately.
- [X] T015 [P] [US3] Integration test in `backend/test/game/ship/ship-tick.auto-repair.spec.ts`: ship-update tick queues repair when `autoRepair=true` + gates pass; no-op when any gate fails; cash deducted exactly once per damage event; toggling `autoRepair=false` halts subsequent charges on the next applicable tick.
- [X] T016 [P] [US3] Regression test in `backend/test/game/commands/handlers/maint.handler.spec.ts` confirming the manual `maint` command still produces identical state (delegates to `MaintenanceService`) and still returns the same `CommandResult` message string as before extraction.

### Implementation for User Story 3

- [X] T017 [US3] Create `backend/src/game/ship/maintenance.service.ts` (`MaintenanceService`). Extract gate logic + cash debit + repair-queue mutation from current `MaintHandlerService`. Public API: `evaluateGates(ship): GateResult` and `runMaintenance(ship): MaintResult` — both pure-ish (mutate ship + cash but no I/O messages). JSDoc `@see GECMDS.C:cmd_maint`.
- [X] T018 [US3] Refactor `backend/src/game/commands/handlers/maint.handler.ts` to delegate to `MaintenanceService.runMaintenance` and keep message formatting + `CommandResult` shape locally. Remove duplicated gate/debit logic.
- [X] T019 [US3] In `backend/src/game/ship/ship-tick.service.ts` `processShip`, when `ship.autoRepair === true` call `MaintenanceService.evaluateGates`; if accepted call `runMaintenance`. Emit no player-facing message on success (silent automation). JSDoc note: tick layer never imports command handlers.
- [X] T020 [US3] Wire `MaintenanceService` into `backend/src/game/ship/ship.module.ts` providers; ensure `MaintHandlerService` and `ShipTickService` resolve it from the same module.

**Checkpoint**: US3 complete — `set auto-repair on` produces a queued repair on the next tick after damage (SC-003); `set auto-repair off` halts further charges.

---

## Phase 6: User Story 4 — Auto-Shield Honors Player Setting (Priority: P2)

**Goal**: Port-original QoL feature (no C source). When `autoShield === true`, shields are down, ship is not in combat lock, and a project-defined trigger fires (recently exited warp OR recently fired self-torpedo) → next ship-update tick raises shields. Trigger flags expire after consumption.

**Independent Test**: With `autoShield=true`, shields down, no combat lock, post warp-exit or post self-fired torpedo → next ship-update tick raises shields. Combat lock or absence of trigger → no-op.

### Tests for User Story 4

- [X] T021 [P] [US4] Unit tests for `decideAutoShield(ship)` pure decision in `backend/test/game/ship/auto-shield.spec.ts`: trigger flags (`recentlyWarpedExit`, `recentlySelfFiredTorp`) accept; combat lock (`tagged !== 0`) rejects; shields-already-up rejects; no-trigger rejects; flag is consumed (cleared) on accept so the next tick is a no-op.
- [X] T022 [P] [US4] Integration test in `backend/test/game/ship/ship-tick.auto-shield.spec.ts`: warp-exit path raises shields on the next ship-update tick; self-fired torpedo path raises shields on the next ship-update tick when not locked; combat-lock path leaves shields down; toggling `autoShield=false` halts.

### Implementation for User Story 4

- [X] T023 [P] [US4] Create pure `decideAutoShield(ship)` in `backend/src/game/ship/auto-shield.ts`. Returns `'raise' | 'noop'` plus the flag-clear deltas. JSDoc explicit "no C-source equivalent — port-original QoL feature, not a port from `GEFUNCS.C:shieldstat`" per spec US4 Note. Also add `recentlyWarpedExit` and `recentlySelfFiredTorp` as optional boolean fields to the `ShipState` type definition (in-memory only — no schema impact); these are the transient triggers consumed and cleared by `decideAutoShield`.
- [X] T024 [US4] Set the trigger flags at their source: warp-exit code path in `backend/src/game/physics/physics-tick.service.ts` (or wherever warp completion lives) sets `recentlyWarpedExit = true`; self-torpedo launch handler sets `recentlySelfFiredTorp = true`. Locate each by `git grep -n` for the existing warp-exit and torpedo-launch sites; cite the file:line in the PR.
- [X] T025 [US4] In `backend/src/game/ship/ship-tick.service.ts` `processShip`, when `ship.autoShield === true` and `!ship.shieldsUp` call `decideAutoShield`; on `'raise'` apply the shields-up state mutation and clear the trigger flag (idempotent on subsequent ticks).

**Checkpoint**: US4 complete — auto-shield raises on next tick after warp exit or self-torp, gated by combat lock (SC-004).

---

## Phase 7: User Story 5 — AI Kills Affect Player Score (Priority: P2)

**Goal**: Score deductions follow `floor((scr/100) * score_f2)` for PvP and `floor((scr/100) * score_f2 / 10)` for AI attacker; mutual-kill snapshot fix in `CombatTickService`; Cybertron attacker `kills` increment persisted; Droid attacker `kills` no-op.

**Independent Test**: AI-attributed `COMBAT_SHIP_DESTROYED` produces correct victim klscore/score deduction. PvP path unchanged. Mutual-kill same-tick AI death still attributes. Cybertron `kills` incremented in DB; Droid attacker not persisted.

### Tests for User Story 5

- [X] T026 [P] [US5] Unit tests for `score.config.ts` in `backend/test/game/player/score.config.spec.ts`: default = 100; reads `SCORE_F2` env var; rejects out-of-range values (< 0 or > 32700) at module init by throwing. Locked-in regression test pinned at default 100.
- [X] T027 [P] [US5] Unit tests for the deduction arithmetic in `backend/test/game/player/player-score.repository.spec.ts`: PvP `floor((scr/100) * score_f2)` and AI `floor((scr/100) * score_f2 / 10)` for `score_f2 ∈ {0, 1, 100, 32700}`; floor-at-zero invariant for both.
- [X] T028 [P] [US5] Unit test for `isAiUserid` (if not already covered) in `backend/test/game/player/is-ai-userid.spec.ts`: `Cybrg-N` and `@Droid-N` recognized; player userids and `null` not.
- [X] T029 [P] [US5] Integration test in `backend/test/game/player/player-score.service.ai.spec.ts`: synthetic Cybertron `COMBAT_SHIP_DESTROYED` → victim klscore/score deducted by AI 1/10 formula; synthetic Droid event → same deduction; PvP event → unchanged formula (regression). No victim death-counter increment.
- [X] T029a [P] [US5] Idempotency test in the same file (or a sibling `player-score.service.idempotency.spec.ts`): a single `COMBAT_SHIP_DESTROYED` event observed twice (simulating accidental dual handler registration on the event emitter) produces exactly **one** klscore decrement on the victim — closes spec.md edge case at L212-213 ("AI kill scoring must not double-count if the same destruction event is observed by both attacker-side and victim-side handlers").
- [X] T030 [P] [US5] Integration test in `backend/test/game/combat/combat-tick.mutual-kill.spec.ts`: two AI ships fire simultaneously, the killing AI dies on the same tick → victim klscore still updates correctly (snapshot taken pre-`removeFromGame`).
- [X] T031 [P] [US5] Repository test in `backend/test/game/cybertron/cybertron.repository.spec.ts`: `incrementKills(shipno)` performs an atomic Prisma `update` that increments `kills` by 1; concurrent calls produce expected final count.

### Implementation for User Story 5

- [X] T032 [P] [US5] Create `backend/src/game/player/score.config.ts` exporting `scoreF2: number` loaded from env `SCORE_F2`, default `100`, range `[0, 32700]`, throwing on out-of-range at module init. JSDoc `@see GEMAIN.C:603` (`numopt(SCRFACT, 0, 32700)`).
- [X] T033 [US5] Update `backend/src/game/player/player-score.repository.ts` `transferKillScore` to compute `floor((scr / 100) * score_f2)` for PvP and `floor((scr / 100) * score_f2 / 10)` for AI attacker, floored at zero. Add `isAiAttacker: boolean` parameter. JSDoc `@see GEFUNCS.C:1157-1185`, `@see GEFUNCS.C:1161` for the AI 1/10 branch.
- [X] T034 [US5] In `backend/src/game/player/player-score.service.ts` `handleShipDestroyed`, compute `isAiAttacker = isAiUserid(attackerUserid)` and pass through to `transferKillScore`. No new event field added.
- [X] T035 [US5] In `backend/src/game/combat/combat-tick.service.ts` `runKillResolution`, capture each victim's `attackerUserid` from a pre-removal snapshot of the attacker ship — done BEFORE any `removeFromGame()` runs on earlier victims in the same tick. JSDoc references `spec.md` §Plan-Phase Decisions. Verify `combat-tick.service.ts:213` (attacker resolution site) is the location modified.
- [X] T036 [P] [US5] Add `incrementKills(shipno: number): Promise<void>` to `backend/src/game/cybertron/cybertron.repository.ts`. Atomic Prisma `update` with `increment: 1`. JSDoc.
- [X] T037 [US5] In `PlayerScoreService.handleShipDestroyed` (same file as T034), when `isAiAttacker && attackerUserid.startsWith('Cybrg-')` call `cybertronRepository.incrementKills(shipno)` (parse `shipno` from the userid). For Droid attackers (`@Droid-`) explicit no-op with comment `// GEFUNCS.C:1253 — droid attacker kills not persisted`.

**Checkpoint**: US5 complete — 100% of AI-caused player deaths produce the matching klscore change (SC-005); Cybertron escalation continues to advance via persisted kills.

---

## Phase 8: User Story 6 — Droid Presence Visible to Players (Priority: P3)

**Goal**: `droid.spawned` and `droid.killed` events bridged through `GameGateway` mirroring `droid.annoy` routing. Frontend sector roster shows ephemeral droid entries; persisted roster queries never return droids.

**Independent Test**: Spawn a droid in a sector → connected sockets in that sector receive `droid.spawned` and frontend shows the entry tagged ephemeral. Kill the droid → sector + global sockets receive `droid.killed`; entry disappears. `Prisma.user.findMany(...)` never returns `@Droid-` rows.

### Tests for User Story 6

- [X] T038 [P] [US6] Unit tests for `DroidSpawnedPayload` / `DroidKilledPayload` shape in `backend/test/game/droid/droid-events.spec.ts` per `data-model.md` §Event shapes (incl. `ephemeral: true` flag and `@Droid-N` userid prefix).
- [X] T039 [P] [US6] Integration test in `backend/test/gateway/game.gateway.droid-bridge.spec.ts`: gateway emits `droid.spawned` to `sector:<x>:<y>` only on spawn; emits `droid.killed` to both `sector:<x>:<y>` and the global `kills` channel on kill; `mine kill` case (attacker undefined) routes correctly with `killedBy: null`.
- [X] T040 [P] [US6] Persistence-invariant test in `backend/test/game/droid/droid-roster.invariant.spec.ts`: spawn and kill a droid; `prisma.user.findMany({ where: { userid: { startsWith: '@Droid-' } } })` returns 0 rows.
- [X] T041 [P] [US6] Frontend Vitest spec in `frontend/src/features/sector-roster/sector-roster.spec.tsx` (or matching existing test path): on `droid.spawned`, droid appears in roster with `ephemeral` marker; on `droid.killed`, droid removed; ephemeral entries never write to any persisted store.

### Implementation for User Story 6

- [X] T042 [P] [US6] Confirm `backend/src/game/droid/droid-events.ts` exposes `DROID_SPAWNED` and `DROID_KILLED` event constants with payload types matching `data-model.md`; add `ephemeral: true` to spawn payload type if missing.
- [X] T043 [US6] In `backend/src/game/droid/droid-spawner.ts`, emit `DROID_SPAWNED` with the full payload (`shipId='@Droid-N'`, `shipname`, `shpclass`, `sector`, `ephemeral: true`, `spawnedAt`) at spawn time.
- [X] T044 [US6] In `backend/src/game/droid/droid-tick.service.ts`, emit `DROID_KILLED` with the full payload (`killedBy` from attacker resolution; `null` for mine kills) at droid death.
- [X] T045 [US6] In `backend/src/gateway/game.gateway.ts`, bridge `DROID_SPAWNED` → `server.to(sectorRoom).emit('droid.spawned', payload)`; bridge `DROID_KILLED` → both `server.to(sectorRoom).emit('droid.killed', payload)` and `server.to(globalKillsChannel).emit('droid.killed', payload)`. Mirror the existing `droid.annoy` routing exactly.
- [X] T046 [P] [US6] Update `frontend/src/features/sector-roster/` to listen for `droid.spawned` / `droid.killed` Socket.io events and render ephemeral droid entries (kept in component state only; never written to the persisted-roster store/query). Mark each entry with an `ephemeral` flag visible to dev tools.

**Checkpoint**: US6 complete — players in a sector see droids appear/disappear in real time; persistent roster invariant holds (SC-006, SC-007).

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation refresh, balance regression, manual smoke pass.

- [X] T047 [P] Update `docs/PROGRESS.md` with feature 019 entry: completed work, tests, decisions, next, known issues (per CLAUDE.md format).
- [X] T048 [P] Update `docs/GAME_MECHANICS.md`: add boundary wrap, overspeed engine break, auto-repair tick, auto-shield tick (with port-original note), AI kill scoring, droid presence bridge — each with C-source line references where applicable.
- [X] T049 [P] Update `docs/DECISIONS.md`: log the `score_f2 = 100` default (Clarification 2026-05-08), Cybertron-kills-persisted vs Droid-kills-noop split, and mutual-kill snapshot fix.
- [X] T050 [P] Update `docs/ARCHITECTURE.md`: add `ShipTickService` and `MaintenanceService` to the module map.
- [X] T051 Add a balance regression test pinning `scoreF2 === 100` alongside existing `MAXX`/`MAXY`/`TICKTIME`/`TICKTIME2` regression tests. Path: same test file as those constants live in (`git grep -n MAXX backend/test`).
- [ ] T052 Run `quickstart.md` end-to-end against a local docker-compose stack; record the run in the PR description (timestamps + observed event log). Capture any deviations as follow-up issues.
- [X] T053 Run full `cd backend && npm run test` and `cd frontend && npm run test`; ensure CI green before requesting review.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 — no dependencies.
- **Foundational (Phase 2)**: T002–T004 — depends on Setup. **BLOCKS US2, US3, US4** (they hang work off `ShipTickService`). US1, US5, US6 do NOT depend on Foundational and may begin in parallel with Phase 2.
- **User Stories**:
  - **US1** depends only on Setup.
  - **US2, US3, US4** depend on Foundational (Phase 2).
  - **US5** depends only on Setup.
  - **US6** depends only on Setup.
- **Polish (Phase 9)**: depends on all user stories merged.

### User Story Dependencies (cross-story)

- All six stories are independently testable. No story implementation depends on another. Any may ship in isolation.
- US3 and US4 both extend `ShipTickService.processShip` — sequence them or merge carefully (different decision branches; conflict surface is the single method body).
- US2 also extends `ShipTickService.processShip` — same coordination note as US3/US4.

### Within Each User Story

- Tests written before or alongside implementation; verify test FAILS before the implementation task lands.
- Pure helpers (`wrapCoord`, `decideOverspeed`, `decideAutoShield`) before tick wiring.
- `MaintenanceService` extracted before tick subscriber consumes it.
- `score.config.ts` before repo formula change before service `isAiAttacker` plumbing.

### Parallel Opportunities

- All `[P]` tests within a story may run in parallel.
- Across stories, after Foundational completes:
  - Dev A: US2 (overspeed)
  - Dev B: US3 (auto-repair) + US4 (auto-shield) sequentially (shared `processShip`)
  - Dev C: US5 (AI scoring) — fully independent file set
  - Dev D: US6 (droid bridge) — fully independent file set
  - US1 can be split off to anyone; touches `physics-tick.service.ts` + `physics-math.ts` only.

---

## Parallel Example: User Story 5

```bash
# Tests (all independent files):
Task: "Unit tests for score.config.ts in backend/test/game/player/score.config.spec.ts"
Task: "Unit tests for deduction arithmetic in backend/test/game/player/player-score.repository.spec.ts"
Task: "Integration test in backend/test/game/player/player-score.service.ai.spec.ts"
Task: "Mutual-kill integration test in backend/test/game/combat/combat-tick.mutual-kill.spec.ts"
Task: "Repository test in backend/test/game/cybertron/cybertron.repository.spec.ts"

# Implementation (T032 and T036 are independent):
Task: "Create backend/src/game/player/score.config.ts"
Task: "Add incrementKills to backend/src/game/cybertron/cybertron.repository.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 — boundary wrap)

1. T001 (Setup).
2. T005–T009 (US1 wrap). This is a correctness bug; it ships first regardless of staffing.
3. **STOP and VALIDATE** with the US1 portion of `quickstart.md`.
4. Deploy or continue.

### Incremental Delivery

1. US1 → ship (correctness bug closed).
2. Foundational T002–T004 → unblock tick stories.
3. US2 → ship (overspeed).
4. US3 → ship (auto-repair).
5. US4 → ship (auto-shield).
6. US5 → ship (AI scoring + mutual-kill fix). Independent of Foundational; can run in parallel with US2–US4.
7. US6 → ship (droid bridge). Also parallel-safe.
8. Polish → ship.

### Parallel Team Strategy

- One dev: US1 + Foundational (small).
- One dev: US2 → US3 → US4 (shared `processShip` body, sequential).
- One dev: US5 (independent files).
- One dev: US6 (independent files; touches frontend).

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks within the same phase.
- `[Story]` label maps task to its user story for traceability.
- All AI-isolation tests (Cybertron / Droid) MUST run without sockets or a live game world (Principle II).
- Verify each test FAILS before its implementation task lands.
- No Prisma migrations are added in this feature — confirm `backend/prisma/migrations/` is unchanged at PR time.
- Auto-shield is a port-original feature (no C source); JSDoc on every public method must say so.
- Commit after each task or logical group; preserve C-source `@see` references throughout.
