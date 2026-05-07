---
description: "Task list for feature 013-ship-management"
---

# Tasks: Ship Management Commands

**Input**: Design documents from `/specs/013-ship-management/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/commands.md, contracts/tick-hooks.md

**Tests**: MANDATORY (Constitution II). Every handler ships with a Jest unit spec; tick hooks ship with fake-timer integration specs; balance regressions pin canonical constants.

**Organization**: Tasks are grouped by user story (US1–US7) per spec.md priorities (P1 → P3). Each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User-story label (US1..US7); Setup / Foundational / Polish phases carry no story label

## Path Conventions

Single-backend NestJS layout per `plan.md` § Project Structure. All paths are relative to repo root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema additions and configuration scaffolding required before any handler can land.

- [X] T001 Add `autoShield Boolean @default(false)` and `autoRepair Boolean @default(false)` columns to the `Ship` model in `backend/prisma/schema.prisma`
- [X] T002 Generate the Prisma migration via `pnpm --filter backend prisma migrate dev --name ship_auto_flags`, producing `backend/prisma/migrations/20260506xxxxxx_ship_auto_flags/migration.sql`; commit the migration file
- [X] T003 [P] Add `autoShield: boolean` and `autoRepair: boolean` to `ShipState` in `backend/src/game/ship/ship-state.types.ts`
- [X] T004 [P] Map the two new fields in `backend/src/game/ship/ship-state.mappers.ts` (Prisma row → ShipState and ShipState → Prisma update payload)
- [X] T005 [P] Create `backend/src/game/commands/_ship-management-constants.ts` exporting `COUNTDOWN = 20`, `MAINT_COST_NORMAL = 200`, `MAINT_COST_NEUTRAL = 2500`, cloak ramp values `CLOAK_RAMP_INIT = 1`, `CLOAK_RAMP_MID = 2`, `CLOAK_RAMP_FULL = 10`, the abandoned-ship status sentinel, and `DESTRUCT_SCORE_PENALTY` (verify against `GEFUNCS.C:destruct`)
- [X] T006 [P] Create `backend/src/game/commands/cloak.config.ts` with a `CLOAK_ENERGY_USE` injection token and factory provider that reads env `CLOAK_ENERGY_USE` (default `50`, clamp `1..32000`), mirroring `backend/src/game/midnight/midnight.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting wiring required by every command handler in this feature. **No US tasks may begin until this phase is complete.**

⚠️ **CRITICAL**: All eight handlers depend on T007 (router gating) and T008 (event/broadcast plumbing reuse).

- [X] T007 In the existing `CommandRouterService` dispatch path (`backend/src/game/commands/command-router.service.ts`), confirm and (if missing) add the FR-803 active-ship gate so any keyword registered by this feature is rejected when the captain has no active ship or their ship is in `abandoned` status; add a unit assertion in `backend/tests/game/commands/command-router.spec.ts`
- [X] T008 [P] Confirm the `event.log` Socket.io broadcast helpers used by feature-012 handlers expose per-captain (user room) and sector-room emit signatures; if a per-user emit helper is missing, add it to the existing event broadcaster in `backend/src/gateway/` (no new gateway events) and document in `backend/src/gateway/README.md` if one exists
- [X] T009 [P] Wire `cloakTick` and `destructTick` placeholders into `backend/src/game/tick/tick.service.ts` (call sites only, inside the existing per-ship loop in `physicsTick()`); functions can be empty stubs at this stage — they will be filled in by US1 (cloak) and US6 (destruct)
- [X] T010 [P] Register the eight handler service tokens (empty class shells acceptable for now) as `providers` in `backend/src/game/commands/commands.module.ts` and add them to the `register(...)` array passed to `CommandRouterService`; ensure module compiles even before handler logic lands

**Checkpoint**: Foundation ready — all user stories may now proceed in parallel.

---

## Phase 3: User Story 1 — Cloak (Priority: P1) 🎯 MVP

**Goal**: `cloak on/off` toggles `ShipState.cloak`, debits `CLOAK_ENERGY_USE` on activation and per physics tick, ramps `1 → 2 → 10` over two ticks, auto-decloaks on energy starvation. Unblocks four pre-existing dead-code paths (torpedo lock, report visibility, three Cybertron AI branches).

**Independent Test**: Captain types `cloak on`; assert `cloak == 1`, energy debited, "cloak engaged" event. Run two physics ticks; assert ramp to `10`. A second captain in the sector running `report` no longer sees the cloaked ship; torpedo lock against the cloaked ship fails. `cloak off` restores visibility.

### Tests for User Story 1 *(write first, ensure they FAIL before implementation)*

- [X] T011 [P] [US1] Unit spec for `cloak.handler.ts` covering all sub-forms in contracts/commands.md (on/off happy paths, already-engaged/already-down, insufficient energy, energy exactly equal to CLOAK_ENERGY_USE → succeeds, ship energy becomes 0 after activation (boundary case from spec.md Edge Cases), damaged `cloak < 0`, hyperspace `where == 1`, usage error) in `backend/tests/game/commands/handlers/cloak.handler.spec.ts`. MUST include an explicit assertion that a player-visible event-log entry is emitted on the happy path (SC-007).
- [X] T012 [P] [US1] Tick integration spec for cloak ramp 1→2→10 across two physics ticks with sufficient energy in `backend/tests/game/tick/cloak-ramp.integration.spec.ts` (Jest `useFakeTimers()`)
- [X] T013 [P] [US1] Tick integration spec for cloak per-tick drain and auto-decloak when `energy < CLENGUSE` (asserts `cloak = 0`, "cloak collapsed" per-captain event) in `backend/tests/game/tick/cloak-drain.integration.spec.ts`
- [X] T014 [P] [US1] Existing-path reachability tests proving the four `ship.cloak === 10` call sites are now exercised end-to-end via `cmd_cloak`: torpedo target acquisition denial, `cmd_report` omission, and three Cybertron AI threat-assessment branches (extend the relevant existing specs under `backend/tests/game/combat/`, `backend/tests/game/commands/handlers/report.handler.spec.ts`, `backend/tests/game/ai/cybertron/`)
- [X] T015 [P] [US1] Balance regression: `CLOAK_ENERGY_USE` default is `50` and the cloak ramp constants are `1, 2, 10` in `backend/tests/balance/cloak.balance.spec.ts`

### Implementation for User Story 1

- [X] T016 [US1] Implement `CloakHandler` in `backend/src/game/commands/handlers/cloak.handler.ts` (canonical anchor `GECMDS.C:3188`); inject `ShipStateService` and the `CLOAK_ENERGY_USE` token; emit per-captain reply + sector decloak broadcast per contracts/commands.md
- [X] T017 [US1] Implement `cloakTick(ship)` in `backend/src/game/tick/tick.service.ts` per contracts/tick-hooks.md (energy-starvation auto-decloak, ramp `1→2→10`, mark dirty); canonical anchor `GEFUNCS.C:1366`
- [X] T018 [US1] Register `cloak` keyword (alias `clo`, `minArgs: 1`) with the router in `backend/src/game/commands/commands.module.ts`

**Checkpoint**: US1 standalone validates SC-001. Cloak is fully functional and the four downstream call sites are now reachable.

---

## Phase 4: User Story 2 — Maintenance (Priority: P1)

**Goal**: `maint` repairs damaged ships at a friendly inhabited planet by debiting cash and queuing a repair amount of `(damage / 3) + 1`. Cost is `200` cr at normal planets, `2500` cr at Zygor (planet index 1 or 2 in the neutral zone). All canonical rejection gates enforced.

**Independent Test**: Place a damaged ship in orbit at an inhabited friendly planet with known `User.cash`; run `maint`; assert `User.cash` decremented by the price, `ShipState.repair = (damage/3)+1`, "maintenance complete" event. Then drive each FR-206/207/208/209 rejection path with a ship in the corresponding state and assert no state change.

### Tests for User Story 2 *(write first, ensure they FAIL before implementation)*

- [X] T019 [P] [US2] Unit spec for `maint.handler.ts` covering happy path (normal planet, Zygor neutral-zone planet) and all rejection paths from contracts/commands.md (`where < 10`, uninhabited / `men < 25000`, `cantexit > 0`, neutral-zone non-Zygor, `damage == 0`, insufficient cash) in `backend/tests/game/commands/handlers/maint.handler.spec.ts`. MUST include an explicit assertion that a player-visible event-log entry is emitted on the happy path (SC-007).
- [X] T020 [P] [US2] Balance regression: `MAINT_COST_NORMAL = 200`, `MAINT_COST_NEUTRAL = 2500`, repair formula `(damage/3) + 1` in `backend/tests/balance/maint.balance.spec.ts`

### Implementation for User Story 2

- [X] T021 [US2] Implement `MaintHandler` in `backend/src/game/commands/handlers/maint.handler.ts` (canonical anchor `GECMDS.C:4452`); inject `ShipStateService`, `PlanetService`, and `UserService`; atomic update of `User.cash` + `ShipState.repair` in a Prisma transaction with the in-memory write
- [X] T022 [US2] Register `maint` keyword (alias `mai`, `minArgs: 0`) with the router in `backend/src/game/commands/commands.module.ts`

**Checkpoint**: US2 standalone validates SC-002. Mid-flight repair is available.

---

## Phase 5: User Story 3 — Transfer (Priority: P2)

**Goal**: `transfer <amt> <itemkw|gold> <target-shipid>` atomically moves cargo or gold between two online ships in the same sector.

**Independent Test**: Two test ships in the same sector with known item counts and gold balances; issue `transfer 100 gold <B>`; assert A's gold decreases by 100, B's increases by 100, both captains see transfer events. Drive each rejection path (self, offline, different sector, insufficient cargo) and assert atomicity (zero net loss/duplication, SC-003).

### Tests for User Story 3 *(write first, ensure they FAIL before implementation)*

- [X] T023 [P] [US3] Unit spec for `transfer.handler.ts` covering happy path (cargo + gold) and rejection paths (target self, offline, different sector, insufficient cargo, insufficient gold) plus an atomicity assertion that on rejection neither ship's state changes, in `backend/tests/game/commands/handlers/transfer.handler.spec.ts`. MUST include an explicit assertion that a player-visible event-log entry is emitted on the happy path (SC-007).
- [X] T024 [P] [US3] Conservation test: across 100 randomized transfers between two ships, total `items[i]` and total gold are invariant in `backend/tests/game/commands/handlers/transfer.conservation.spec.ts` (SC-003)

### Implementation for User Story 3

- [X] T025 [US3] Implement item-keyword resolution helper (case-insensitive prefix match against canonical `kwrd[]` from `GEMAIN.H`, with `gold` synonym for `I_GOLD = 12`) in `backend/src/game/commands/handlers/_item-keywords.ts` (or extend an existing keyword util if one exists)
- [X] T026 [US3] Implement `TransferHandler` in `backend/src/game/commands/handlers/transfer.handler.ts` (canonical anchor `GECMDS.C:3271`, deviation D1 in research.md); inject `ShipStateService.sameSectorShips()`; emit per-captain reply + per-user broadcast to recipient
- [X] T027 [US3] Register `transfer` keyword (alias `tra`, `minArgs: 3`) with the router in `backend/src/game/commands/commands.module.ts`

**Checkpoint**: US3 standalone validates SC-003. Inter-ship cooperation works.

---

## Phase 6: User Story 4 — Jettison (Priority: P2)

**Goal**: `jettison <amt|ALL> <itemkw>` removes cargo from inventory with no recovery path.

**Independent Test**: Set ship `items[i]` to a known value; run `jet 50 ore`; assert `items[i] -= 50`, jettison event emitted; verify no other ship/planet/sector gained the items.

### Tests for User Story 4 *(write first, ensure they FAIL before implementation)*

- [X] T028 [P] [US4] Unit spec for `jettison.handler.ts` covering happy path (numeric amt, `ALL`), rejection paths (unknown item, `amt > items[i]`, `amt <= 0`), and a non-recovery assertion that no other ship/planet/sector inventory changes, in `backend/tests/game/commands/handlers/jettison.handler.spec.ts`. MUST include an explicit assertion that a player-visible event-log entry is emitted on the happy path (SC-007).

### Implementation for User Story 4

- [X] T029 [US4] Implement `JettisonHandler` in `backend/src/game/commands/handlers/jettison.handler.ts` (canonical anchor `GECMDS.C:6102`); reuse the item-keyword helper from T025
- [X] T030 [US4] Register `jettison` keyword (alias `jet`, `minArgs: 2`) with the router in `backend/src/game/commands/commands.module.ts`

**Checkpoint**: US4 standalone passes.

---

## Phase 7: User Story 5 — Set (Priority: P3)

**Goal**: `set <auto-shield|auto-repair> <on|off>` updates the corresponding `ShipState` flag and persists across sessions; `set ?` lists current values.

**Independent Test**: `set auto-shield on`; assert `ShipState.autoShield === true`; flush and reload from Postgres; assert flag persists. Also test `set auto-repair`, `set ?`, unknown option rejection.

### Tests for User Story 5 *(write first, ensure they FAIL before implementation)*

- [X] T031 [P] [US5] Unit spec for `set.handler.ts` covering both options on/off, `set ?` listing, unknown option, and missing/invalid `<on|off>` in `backend/tests/game/commands/handlers/set.handler.spec.ts`. MUST include an explicit assertion that a player-visible event-log entry is emitted on the happy path (SC-007).
- [X] T032 [P] [US5] Persistence integration test: `set auto-shield on` → flush → reload from DB → assert flag present, in `backend/tests/game/commands/handlers/set.persistence.spec.ts` (SC-006)

### Implementation for User Story 5

- [X] T033 [US5] Implement `SetHandler` in `backend/src/game/commands/handlers/set.handler.ts` (canonical anchor `GECMDS.C:5190`, deviation D4 in research.md); mark dirty so existing `ShipStateService.flush()` persists
- [X] T034 [US5] Register `set` keyword (no alias, `minArgs: 1`) with the router in `backend/src/game/commands/commands.module.ts`

**Checkpoint**: US5 standalone validates SC-006.

---

## Phase 8: User Story 6 — Destruct & Abort (Priority: P3)

**Goal**: `destruct` starts a `COUNTDOWN = 20` self-destruct timer that decrements every physics tick (6 s); on every tick a sector warning broadcasts; on expiration the ship is destroyed and the captain's score is penalized. `abort` clears the active countdown.

**Independent Test**: Issue `destruct`; assert `ShipState.destruct === 20`, sector warning emitted. Run 20 physics ticks; assert per-tick warnings (with canonical SELFD3 wording at thresholds 10/5/2), assert ship destroyed at tick 20, score penalty applied. Separately: `destruct` then `abort` before tick 20 → countdown clears, ship survives.

### Tests for User Story 6 *(write first, ensure they FAIL before implementation)*

- [X] T035 [P] [US6] Unit spec for `destruct.handler.ts` covering happy path, neutral-zone rejection, and "already counting down" rejection in `backend/tests/game/commands/handlers/destruct.handler.spec.ts`. MUST include an explicit assertion that a player-visible event-log entry is emitted on the happy path (SC-007).
- [X] T036 [P] [US6] Unit spec for `abort.handler.ts` covering happy path (with the SELFD4A `< 10` sector broadcast condition) and "no active self-destruct" rejection in `backend/tests/game/commands/handlers/abort.handler.spec.ts`. MUST include an explicit assertion that a player-visible event-log entry is emitted on the happy path (SC-007).
- [X] T037 [P] [US6] Tick integration spec for destruct countdown: `destruct = 20` → 20 fake-timer ticks → ship destroyed, score penalty applied, sector warning every tick (FR-604 / SC-004) in `backend/tests/game/tick/destruct-countdown.integration.spec.ts`
- [X] T038 [P] [US6] Tick integration spec: `destruct = 5` then `cmd_abort` → tick is no-op, ship survives (SC-005), in `backend/tests/game/tick/destruct-abort.integration.spec.ts`
- [X] T039 [P] [US6] Balance regression: `COUNTDOWN = 20` and `DESTRUCT_SCORE_PENALTY` value pinned, in `backend/tests/balance/destruct.balance.spec.ts`

### Implementation for User Story 6

- [X] T040 [US6] Implement `DestructHandler` in `backend/src/game/commands/handlers/destruct.handler.ts` (canonical anchor `GECMDS.C:5025`); set `destruct = COUNTDOWN`, mark dirty, broadcast sector warning
- [X] T041 [US6] Implement `AbortHandler` in `backend/src/game/commands/handlers/abort.handler.ts` (canonical anchor `GECMDS.C:5044`); SELFD4A sector broadcast condition (only when `destruct < 10` at abort time)
- [X] T042 [US6] Implement `destructTick(ship)` in `backend/src/game/tick/tick.service.ts` per contracts/tick-hooks.md (canonical anchor `GEFUNCS.C:1820`); decrement, broadcast per-tick warning with SELFD3 wording at thresholds 10/5/2, invoke existing ship-destruction routine on reaching 0 (which applies `DESTRUCT_SCORE_PENALTY` to `User.score` and removes ship from active registry)
- [X] T043 [US6] Register `destruct` (alias `des`, `minArgs: 0`) and `abort` (alias `abo`, `minArgs: 0`) keywords with the router in `backend/src/game/commands/commands.module.ts`

**Checkpoint**: US6 standalone validates SC-004 and SC-005.

---

## Phase 9: User Story 7 — Abandon (Priority: P3)

**Goal**: `abandon` detaches the captain from their current ship, marks the ship status `abandoned`, broadcasts a sector event, and routes the captain back through the feature-011 onboarding flow on their next gameplay command (FR-704).

**Independent Test**: Captain on an active ship issues `abandon`; assert ship status `abandoned`, captain detached. Issue any other gameplay command from the same captain; assert it returns the "no active ship — please create one" message until onboarding completes.

### Tests for User Story 7 *(write first, ensure they FAIL before implementation)*

- [X] T044 [P] [US7] Unit spec for `abandon.handler.ts` covering happy path (ship marked abandoned, captain detached, sector broadcast, per-captain reply) in `backend/tests/game/commands/handlers/abandon.handler.spec.ts`. MUST include an explicit assertion that a player-visible event-log entry is emitted on the happy path (SC-007).
- [X] T045 [P] [US7] Integration spec: after `abandon`, the next gameplay command is rejected by the FR-803 router gate; running the feature-011 onboarding flow re-attaches a fresh ship and gameplay resumes, in `backend/tests/game/commands/handlers/abandon.onboarding.integration.spec.ts`
- [X] T046 [P] [US7] Edge-case test: `abandon` while `destruct > 0` clears the countdown and takes precedence (per spec.md Edge Cases), in `backend/tests/game/commands/handlers/abandon.destruct-precedence.spec.ts`

### Implementation for User Story 7

- [X] T047 [US7] Implement `AbandonHandler` in `backend/src/game/commands/handlers/abandon.handler.ts` (canonical anchor `GECMDS.C:3420`, deviation D2 in research.md); set `ShipState.status` to abandoned sentinel from `_ship-management-constants.ts`, clear any active `destruct`, detach the captain in the gateway session map
- [X] T048 [US7] Update gateway middleware (or `CommandRouterService` pre-dispatch) so a shipless captain is funneled into the feature-011 onboarding flow on their next command, in `backend/src/gateway/` (extend existing onboarding routing — do not duplicate it)
- [X] T049 [US7] Register `abandon` keyword (alias `aba`, `minArgs: 0`) with the router in `backend/src/game/commands/commands.module.ts`

**Checkpoint**: US7 standalone passes; FR-704 onboarding loop verified.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T050 [P] Router-dispatch integration test exercising every new keyword (cloak, maint, transfer, jettison, set, destruct, abort, abandon) and their aliases, plus the unknown-keyword and insufficient-args branches, in `backend/tests/game/commands/command-router.dispatch.spec.ts` (validates SC-007)
- [X] T051 [P] Add JSDoc with `@see GECMDS.C:<line>` / `@see GEFUNCS.C:<line>` anchors on every new handler service public method (eight handlers + two tick callbacks) per Constitution IV
- [X] T052 [P] Update `docs/ARCHITECTURE.md` (commands module additions, tick-hook additions), `docs/PROGRESS.md` (013-ship-management entry), `docs/GAME_MECHANICS.md` (cloak ramp, maint formula, destruct countdown), and `docs/DECISIONS.md` (D1–D4 deviations from research.md)
- [X] T053 Run `quickstart.md` end-to-end manually (or via the scripted path it documents) and confirm all eight commands behave per contract; record completion in `docs/PROGRESS.md`
- [X] T054 Final `pnpm --filter backend test` run — confirm all unit + integration + balance regression suites pass; confirm the new test count is reflected in CI output

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** — no dependencies; T001 → T002 (migration depends on schema), T003/T004/T005/T006 [P] after T001
- **Foundational (Phase 2)** — depends on Setup; T007 must land before any handler dispatches; T008/T009/T010 can run in parallel after T007
- **User Stories (Phases 3–9)** — all depend on Foundational completion; can run in parallel by different developers
- **Polish (Phase 10)** — depends on every user story being complete

### User Story Dependencies

- **US1 (Cloak, P1)** — independent; closes dead-code gap, ship first
- **US2 (Maint, P1)** — independent; depends only on Foundational
- **US3 (Transfer, P2)** — independent; T025 (item-keyword helper) is reused by US4
- **US4 (Jettison, P2)** — reuses T025 from US3; if US3 not yet started, US4 can build T025 itself and US3 picks it up
- **US5 (Set, P3)** — independent; depends on T003/T004 (Setup)
- **US6 (Destruct + Abort, P3)** — independent; depends on T009 (destructTick stub from Foundational)
- **US7 (Abandon, P3)** — independent; depends on existing feature-011 onboarding code paths

### Within Each User Story

- Tests (where listed) MUST be written first and MUST fail before implementation lands (Constitution II)
- Handler implementation → router registration (registration last, so router-dispatch tests don't accidentally pass against an empty handler)

### Parallel Opportunities

- All Phase 1 tasks except T001/T002 are [P]
- Phase 2: T008, T009, T010 [P] after T007
- All five test tasks within US1 (T011–T015) are [P]
- US2 tests T019/T020 [P]
- US3 tests T023/T024 [P]
- US6 tests T035–T039 [P]
- US7 tests T044–T046 [P]
- Phase 10 polish tasks T050/T051/T052 [P]
- Once Foundational completes, all seven user stories can be worked in parallel by different developers

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests in parallel:
Task: "Cloak handler unit spec in backend/tests/game/commands/handlers/cloak.handler.spec.ts"
Task: "Cloak ramp tick integration in backend/tests/game/tick/cloak-ramp.integration.spec.ts"
Task: "Cloak drain tick integration in backend/tests/game/tick/cloak-drain.integration.spec.ts"
Task: "Cloak reachability tests across torpedo / report / Cybertron"
Task: "Cloak balance regression in backend/tests/balance/cloak.balance.spec.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

Both US1 and US2 are P1 in spec.md. Cloak unblocks four pre-existing dead-code paths (SC-001) and is the highest-leverage work; maint is the canonical mid-flight repair mechanism (SC-002). Land both before any P2/P3 work.

1. Setup (Phase 1)
2. Foundational (Phase 2)
3. US1 (Cloak) → validate independently → demo
4. US2 (Maint) → validate independently → demo
5. **STOP and VALIDATE**: SC-001 + SC-002 met

### Incremental Delivery

After MVP, ship US3 (Transfer) → US4 (Jettison) → US5 (Set) → US6 (Destruct/Abort) → US7 (Abandon). Each story tested and merged independently before the next begins.

### Parallel Team Strategy

Once Foundational is done:

- Developer A: US1 (Cloak) + US6 (Destruct) — both touch tick.service.ts; sequence them on the same person to avoid merge churn
- Developer B: US2 (Maint) + US7 (Abandon) — both touch session/onboarding plumbing
- Developer C: US3 (Transfer) + US4 (Jettison) — share the item-keyword helper (T025)
- Developer D: US5 (Set) + Phase 10 polish

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- Every handler's JSDoc must reference the canonical C function with line anchors (Constitution IV); deviations recorded in `research.md` (D1–D4)
- Balance regressions (T015, T020, T039) lock canonical constants per Constitution II / SC-008
- Strict TypeScript — no `any`; new `ShipState` fields are explicit booleans
- All broadcasts reuse the existing `event.log` Socket.io event — no new gateway events
- Commit after each task or logical group; do not skip the docs update in T052
