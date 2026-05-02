# Tasks: Planet System

**Input**: Design documents from `/specs/005-planet-system/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (commands, planet-state-service, planet-tick), quickstart.md

**Tests**: MANDATORY per Constitution Principle II (Testing is First Class). Every behaviour-bearing task ships with a test task; tests are written before or alongside the implementation, never after.

**Organization**: Tasks are grouped by user story (US1–US5 from spec.md) so each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file from prior tasks in the same phase, no dependency on still-incomplete tasks → safe to run in parallel.
- **[Story]**: User story tag (US1, US2, …); omitted in Setup, Foundational, and Polish phases.

## Path Conventions

Web-application layout (Option 2). All backend paths are under `backend/`. No frontend changes in this feature.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Sanity verification only — this is an established project on a feature branch. No project init, no dependency installs.

- [X] T001 Verify `backend/prisma/schema.prisma` Planet model exposes every column listed in `data-model.md` § "Schema delta". If any column is missing, STOP — re-open planning. (No migration is created or run by this feature.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Constants, types, the `PLANET_UPDATE` tick scaffold, and the `PlanetStateService` skeleton (hydration + serializer; no mutation methods yet). Every user-story phase depends on this phase being complete.

**⚠️ CRITICAL**: No user-story work begins until T002–T014 are merged.

- [X] T002 [P] Create `backend/src/game/constants/items.ts` with `NUMITEMS=14`, item index constants (`I_MEN`..`I_SPY`), and frozen arrays `ITEM_NAMES`, `BASEPRICE`, `MANHOURS`, `MAXPL`, `ITEM_TONS` (values per `data-model.md` § "Constants added"). Hardcoded — NOT env-configurable (research Decision 9).
- [X] T003 [P] Append `PLANTOCK_SECONDS = 1800` and `PLANTIME_MIN_SECONDS = 4` to `backend/src/game/constants.ts` (with `@see GEMAIN.C:469, 658` JSDoc anchors).
- [X] T004 Add `backend/test/unit/balance-planet.spec.ts` pinning `NUMITEMS`, `PLANTOCK_SECONDS`, `PLANTIME_MIN_SECONDS`, and the five frozen item arrays (one snapshot expectation per array). Each value-change MUST fail this test (FR-028).
- [X] T005 Extend `backend/src/game/tick/tick.types.ts` to add `TickKind.PLANET_UPDATE = 'PLANET_UPDATE'`.
- [X] T006 Extend `backend/src/game/tick/tick.service.ts` with: a third `planetUpdateTimer` field, `startPlanetUpdateTimer(intervalMs: number): void` method (idempotent: clear-and-restart), `onModuleDestroy` clears it alongside the other two, `getStats()` includes the new kind. JSDoc: `@see GEMAIN.C:656 plantime = plantock / numrecs`.
- [X] T007 [P] Add `backend/test/unit/tick-planet-update.spec.ts`: `startPlanetUpdateTimer` is idempotent (calling twice swaps the timer); fires on the configured interval under Jest fake timers; subscribers receive `PLANET_UPDATE` `TickContext`.
- [X] T008 [P] Create `backend/src/game/planet/planet-state.types.ts` with `PlanetItem`, `PlanetState`, `planetKey(xsect, ysect, plnum)`, and the `AdminChange` discriminated union (per `contracts/planet-state-service.md`).
- [X] T009 [P] Create `backend/src/game/planet/planet-state.mappers.ts` exporting `prismaPlanetToState(row: Planet): PlanetState` and `stateToPrismaUpdate(state: PlanetState): Prisma.PlanetUpdateInput`. Explodes / re-assembles the six parallel `items*` arrays.
- [X] T010 Create `backend/src/game/planet/planet-state.service.ts` SKELETON ONLY: `OnModuleInit` hydrates from `prisma.planet.findMany`, populates `Map<planetKey, PlanetState>`, logs `hydrated <N> planets from Postgres`, exposes `get`, `all`, `size`. Implements the `runSerialized<T>(key, fn)` per-planet promise-chain mutex (per research Decision 2). Public mutation methods are stubs that throw `NotImplemented` for now.
- [X] T011 Create `backend/src/game/planet/planet.module.ts` registering `PlanetStateService`. Imports `PrismaModule`, `GalaxyModule` (DI ordering: GalaxyService.onModuleInit must finish first), `TickModule`, `ShipModule`. Exports `PlanetStateService`.
- [X] T012 Wire `PlanetModule` into `backend/src/app.module.ts` imports list (after `GalaxyModule`).
- [X] T013 [P] Add `backend/test/unit/planet-state.spec.ts` (skeleton coverage): hydration count matches seeded planet rows; `get` returns the right state; `all`/`size` report consistent counts; `runSerialized` preserves FIFO under interleaved `setTimeout`-resolved promises.
- [X] T014 Add `backend/test/integration/planet-bootstrap.spec.ts`: boot the full `AppModule`, assert `PlanetStateService.size() === prisma.planet.count()`, no errors logged. Tears down cleanly via `OnModuleDestroy`.

**Checkpoint**: Foundation ready. PlanetStateService is a read-only service with hydration + serializer. User stories may now proceed in parallel where dependencies allow.

---

## Phase 3: User Story 1 — Claim a Planet by Landing (Priority: P1) 🎯 MVP

**Goal**: A pilot enters orbit, lands on an unowned planet, supplies a name, and becomes the planet's owner. Ownership and name are durable across restart.

**Independent Test**: Run `command-roundtrip` test that issues `orbit` → `land` → `<name>` against a seeded unowned planet; verify `prisma.planet.findUnique` after restart returns `userid` set to the test user and `name` set to the supplied value.

### Tests for User Story 1 *(write first — must FAIL before T024–T026)*

- [X] T015 [P] [US1] Add `backend/test/unit/handlers/orbit.spec.ts`: covers `orb` already-in-orbit, no-planet, single-planet auto-orbit, multi-planet pick-list, picking an invalid plnum, success path sets `where = 10 + plnum` and zeroes `speed`/`speed2b`.
- [X] T016 [P] [US1] Add `backend/test/unit/handlers/land.spec.ts`: not-in-orbit refusal, claim happy path (calls `PlanetStateService.claim` with trimmed name), invalid-name (empty / non-printable / >19 chars), owner-self landing (no password), non-owner with no/none password (refused), non-owner with correct password, non-owner with wrong password, `password=="team"` + matching teamcode, `password=="team"` + mismatching teamcode.
- [X] T017 [P] [US1] Extend `backend/test/unit/planet-state.spec.ts` with a `claim()` block: happy path mutates in-memory + writes through to Postgres (mock `prisma.planet.update`), refuses if already-owned (returns `OWNED`), refuses on invalid name (returns `INVALID_NAME`), `NOT_FOUND` for unknown key, serialized against concurrent same-key claim attempts.

### Implementation for User Story 1

- [X] T018 [US1] Add `MessageId.ORBIT01, ORBITALR, ORBITNO, ORBITPK, LAND_NOT_ORBIT, LAND_NAME_PROMPT, LAND_INVALID_NAME, LAND_CLAIMED, LAND_OK, LAND_REFUSED, LAND_PASSFAIL` to `backend/src/game/commands/messages.ts` (per `contracts/commands.md`).
- [X] T019 [US1] Implement `PlanetStateService.claim(xsect, ysect, plnum, userid, name)` in `backend/src/game/planet/planet-state.service.ts`: validate name (1–19 printable ASCII, trimmed), refuse if already owned, set `state.userid`/`state.name`, call `prisma.planet.update` synchronously inside `runSerialized`. Per FR-002 the claim flushes immediately, not on a tick.
- [X] T020 [US1] Implement `backend/src/game/commands/handlers/orbit.handler.ts` per the `orbit` block of `contracts/commands.md`. Inject `GalaxyService` for sector→planet lookup, `ShipStateService.mutate` for `where`/`speed` updates.
- [X] T021 [US1] Implement `backend/src/game/commands/handlers/land.handler.ts` per the `land` block. Inject `PlanetStateService` and `ShipStateService`. State machine for the name-prompt branch: when no name arg supplied on an unowned planet, return `{ lines: [{ text: LAND_NAME_PROMPT, category: 'system' }], expectFollowup: 'land' }` (treat as a one-shot redispatch — re-running `land <name>` finishes the claim). Document the redispatch contract inline.
- [X] T022 [US1] Register `OrbitHandlerService` and `LandHandlerService` in `backend/src/game/commands/commands.module.ts` (provider list + `register` calls in the module's `onModuleInit`).
- [X] T023 [US1] Add `backend/test/integration/planet-claim.spec.ts`: bootstraps full AppModule, runs `orbit` → `land` → name supply on a seeded unowned planet, asserts `prisma.planet.findUnique` shows the expected ownership AND simulates a restart (re-instantiate `PlanetStateService`) and re-asserts state.

**Checkpoint**: US1 fully functional. Players can claim planets. The MVP for this feature.

---

## Phase 4: User Story 2 — Trade with a Planet (Priority: P1)

**Goal**: A landed pilot can buy items from a planet (planet inventory and cash mutate; neutral-zone exception preserved) and sell items at neutral-zone Zygor-3 (galactic-market sink — items leave the universe; planet state untouched).

**Independent Test**: Buy 30 of an item from a non-neutral planet, verify ship cargo +30, ship cash debited, planet inventory −30, planet cash credited. Sell 10 of an item at Zygor-3, verify ship cargo −10, ship cash credited by `baseprice*10 - fee`, planet inventory and cash UNCHANGED. Both restart-survivable.

### Tests for User Story 2 *(write first)*

- [X] T024 [P] [US2] Add `backend/test/unit/planet-trade.spec.ts`: covers `computeBuyOutcome` for owner price (`baseprice`), non-owner price (`markup2a`), reserve cap, capacity cap, sell-flag-off refusal, password gating not in scope (handler concern), neutral-zone branch sets `mutatePlanet=false` but `transferred>0`. Covers `computeSellOutcome` fee `1 + doll/1000`, clamp `if (doll-fee) < 0 → fee = doll`, refusal when ship qty < requested.
- [X] T025 [P] [US2] Add `backend/test/unit/handlers/buy.spec.ts`: `where < 10` → BUY1; password-gating refusals (BUYPAS1/BUYPAS3); team-pass match (BUYPAS4); each pure-math refusal mapped to BUY3/BUY4/BUY5; happy path calls `PlanetStateService.buy` with computed remaining capacity and emits `BUY2`.
- [X] T026 [P] [US2] Add `backend/test/unit/handlers/sell.spec.ts`: `where < 10` → SELL1; not-in-neutral-zone → SELL1; not-on-plnum-1 → SELLFMT; insufficient cargo → SELL3; happy path calls `PlanetStateService.sell` (which is responsible for the ship-cargo decrement) and the handler itself ONLY credits `user.cash` and emits `SELL2 fee proceeds qty itemName` — the test asserts the handler does NOT call `ShipStateService.mutate` to decrement cargo.
- [X] T027 [P] [US2] Extend `backend/test/unit/planet-state.spec.ts` with `buy`/`sell` blocks. For `buy`: each mutation calls `prisma.planet.update` (skipped for the neutral-zone branch) AND `prisma.user.update` AND `ShipStateService.mutate` exactly once per call, all inside `runSerialized`. For `sell`: NO `prisma.planet.update`; `ShipStateService.mutate` (cargo decrement) IS called inside `runSerialized`; `prisma.user.update` is NOT called by `sell()` itself — the test asserts that. PLUS a concurrency case: spawn two simultaneous `sell` calls for amounts that, summed, exceed available cargo; assert exactly one returns `ok:true` and the other `INSUFFICIENT_CARGO`. This proves the sufficiency-check + deduction are co-located in the critical section (no double-spend).

### Implementation for User Story 2

- [X] T028 [US2] Add MessageIds `BUYFMT, BUY1..BUY5, BUYPAS1, BUYPAS3, BUYPAS4, SELLFMT, SELL1, SELL2, SELL3` to `backend/src/game/commands/messages.ts`.
- [X] T029 [US2] Create `backend/src/game/planet/planet-trade.ts` PURE module exporting `computeBuyOutcome(input): BuyOutcome` and `computeSellOutcome(input): SellOutcome`. NO Prisma, NO mutation. Source citations: `@see GECMDS.C:4201 cmd_buy`, `@see GECMDS.C:4147 sell`.
- [X] T030 [US2] Implement `PlanetStateService.buy(planetKey, buyerUserid, itemIndex, requestedQty, capacityRemaining)`: snapshot state → call `computeBuyOutcome` → if `outcome.mutatePlanet` apply `items[i].qty -= transferred` and `cash += totalCost` → flush `prisma.planet.update` (only when planet mutated). Caller is responsible for ship/user mutations? — NO: this method also performs the buyer-side mutation via `ShipStateService.mutate` and `prisma.user.update` so all three writes happen inside the same `runSerialized` critical section (per `contracts/planet-state-service.md`).
- [X] T031 [US2] Implement `PlanetStateService.sell(planetKey, sellerUserid, sellerShipno, itemIndex, requestedQty)` per the following critical-section contract:
    1. Acquire `runSerialized(planetKey)`.
    2. Validate planet is in neutral zone with `plnum=1` — else `NOT_NEUTRAL_ZONE` / `NOT_PLNUM_1` (FR + research Decision 4).
    3. Read the seller's current ship cargo via `ShipStateService.get(sellerUserid, sellerShipno)` and call `computeSellOutcome` with `sellerShipQty = ship.items[itemIndex]`.
    4. If `outcome.ok === false` (e.g. `INSUFFICIENT_CARGO`) — return without mutation.
    5. **Inside the same critical section**, call `ShipStateService.mutate(...)` to decrement `ship.items[itemIndex] -= transferred`. Cargo-sufficiency check and cargo deduction MUST be co-located here so that two concurrent sell requests cannot both pass the sufficiency check before either deducts (lost-update / double-spend prevention).
    6. NO planet row flush (galactic-market sink — planet inventory and cash unchanged).
    7. Return `{ ok: true, transferred, proceeds, fee }` to the caller.
    8. Release lock.
    The handler (T033) is responsible only for the cash credit on `user.cash += proceeds` (and its `prisma.user.update` flush) and for emitting the `SELL2` line. Document this asymmetry — "planet write skipped, ship write owned by service, user write owned by handler" — in the method's JSDoc.
- [X] T032 [US2] Implement `backend/src/game/commands/handlers/buy.handler.ts` per `contracts/commands.md` § `buy`. Resolve item keyword via `genearas`-equivalent helper (case-insensitive prefix match against the original short keywords + `ITEM_NAMES`). Compute `capacityRemaining = maxTons - sum(items[i] * ITEM_TONS[i])` from `ship.items` and ship class.
- [X] T033 [US2] Implement `backend/src/game/commands/handlers/sell.handler.ts` per `contracts/commands.md` § `sell`. On `PlanetStateService.sell` success the handler applies ONLY the user-cash credit (`user.cash += proceeds`, `prisma.user.update`) and emits `SELL2`. The ship cargo deduction has already been performed by the service inside its critical section (T031) — the handler must NOT decrement `ship.items[item]` again.
- [X] T034 [US2] Register `BuyHandlerService` and `SellHandlerService` in `commands.module.ts`.
- [X] T035 [US2] Add `backend/test/integration/planet-trade-persistence.spec.ts`: buy → simulate restart → verify ship cargo, ship cash, planet inventory, planet cash all match the post-buy ledger.
- [X] T036 [US2] Add `backend/test/integration/planet-trade-concurrent.spec.ts`: launch two `PlanetStateService.buy` calls in parallel against the same planet/item, await both, assert the final state matches a serial replay of the two outcomes (SC-005). Use real promise scheduling, not fake timers.

**Checkpoint**: US1 + US2 fully functional. Players can claim planets and trade.

---

## Phase 5: User Story 3 — Productive Planet Economy Over Time (Priority: P1)

**Goal**: A new third tick (`PLANET_UPDATE`) processes planets in round-robin so production grows inventory and population while no one watches. Cadence is derived from `PLANTOCK / planetCount`.

**Independent Test**: Seed a planet with known population + rate. Advance Jest fake timers by `cadence * 1` and assert `multiply()`-formula growth on inventory and tax accrual.

### Tests for User Story 3 *(write first)*

- [X] T037 [P] [US3] Add `backend/test/unit/planet-economy.spec.ts`: golden-value test against a hand-calculated input; men-starvation triggers when `troops/100 > food.qty`; food eating; gold-to-cash conversion zeros `items[I_GOLD].qty`; tax accrual `tax += taxrate/1200 * men.qty`; zero-population planet produces zero (FR-017); `taxfact = 1 - taxrate/120` reduces production. Revolt and `check_spy` are NOT in scope (research Decision 6).
- [X] T038 [P] [US3] Add `backend/test/unit/planet-tick-cadence.spec.ts`: `floor(PLANTOCK_SECONDS / numrecs)` clamped to `>= PLANTIME_MIN_SECONDS` for representative N (1, 5, 100, 200, 450, 1800, 999999).
- [X] T039 [P] [US3] Extend `backend/test/unit/planet-state.spec.ts` with a `runEconomicTickFor` block: produces the expected new state, calls `prisma.planet.update` once, refuses on `NOT_FOUND` silently (no throw — handler logs).

### Implementation for User Story 3

- [X] T040 [US3] Create `backend/src/game/planet/planet-economy.ts` PURE module exporting `applyEconomyTick(state: PlanetState): PlanetState`. Ports `GEPLANET.C:multiply` lines 195–340 (stop at end of tax accrual; revolt + check_spy deferred). Uses `BASEPRICE`, `MANHOURS`, `MAXPL` from `constants/items.ts`. NO I/O.
- [X] T041 [US3] Implement `PlanetStateService.runEconomicTickFor(planetKey)` inside `runSerialized`: snapshot → call `applyEconomyTick` → write the returned new state back to the in-memory map → `prisma.planet.update`. Catch + log `NOT_FOUND`.
- [X] T042 [US3] Create `backend/src/game/planet/planet-tick.service.ts` per `contracts/planet-tick.md`: `OnModuleInit` snapshots planet keys, computes `intervalSec = max(PLANTIME_MIN_SECONDS, floor(PLANTOCK_SECONDS / max(1, count)))`, logs the cadence, subscribes to `TickKind.PLANET_UPDATE`, calls `tickService.startPlanetUpdateTimer(intervalSec * 1000)`. Round-robin cursor advances each firing.
- [X] T043 [US3] Register `PlanetTickService` in `planet.module.ts` (after `PlanetStateService`).
- [X] T044 [US3] Add `backend/test/integration/planet-tick-roundrobin.spec.ts`: seed N planets, advance Jest fake timers by `intervalMs * N`, assert each planet's `runEconomicTickFor` was invoked exactly once. A single isolated planet keeps producing across many cycles.
- [X] T045 [US3] Add `backend/test/integration/planet-tick-zeropop.spec.ts`: a planet with `items[I_MEN].qty = 0` advances 100 ticks and reports zero growth on every numeric (FR-017).

**Checkpoint**: US1 + US2 + US3 functional. The world produces while no one is watching.

---

## Phase 6: User Story 4 — Owner Administration (Priority: P2)

**Goal**: Owners adjust per-item rate / markup / sell-flag / reserve, set a planet-wide tax rate (population levy on the tick + production penalty), set beacon and password, and withdraw the accumulated tax pool to their ship.

**Independent Test**: As planet owner, change `rate` for `food` from X to Y, verify in-memory + Postgres reflect the change immediately, then run one `runEconomicTickFor` and assert the new rate was used in the formula. Set a beacon, scan from a different ship in-sector, see it. Withdraw tax, assert planet `tax` zeroes and user `cash` increases by the same amount.

### Tests for User Story 4 *(write first)*

- [X] T046 [P] [US4] Add `backend/test/unit/handlers/admin.spec.ts`: not-landed → ADM_NOT_LANDED; non-owner → ADM_NOT_OWNER; menu (no args) emits ADM_MENU; `admin rate <item> <n>`, `admin markup <item> <n>`, `admin sellflag <item> on|off`, `admin reserve <item> <n>`, `admin tax <0..119>` (clamp), `admin beacon <text>` (≤75 chars), `admin password <text>|none` (≤10 chars). Each invokes `PlanetStateService.applyAdminChange` with the right typed `AdminChange`.
- [X] T047 [P] [US4] Add `backend/test/unit/handlers/withdraw.spec.ts`: not-landed, non-owner, zero-tax (WTHDR_NONE), happy path (WTHDR_OK) with user.cash += amount and planet.tax = 0.
- [X] T048 [P] [US4] Extend `backend/test/unit/planet-state.spec.ts` with `applyAdminChange` block (one expectation per AdminChange variant, plus non-owner refusal) and `withdrawTax` block (non-owner, zero, happy path; verifies `prisma.planet.update` AND `prisma.user.update` happen inside the same critical section).
- [X] T049 [P] [US4] Extend `backend/test/unit/handlers/scan.spec.ts` with a beacon-projection case: planet with non-empty `beacon` surfaces the string in the projected scan cell (research Decision 10).

### Implementation for User Story 4

- [X] T050 [US4] Add MessageIds `ADM_NOT_LANDED, ADM_NOT_OWNER, ADM_MENU, ADM_INVALID, ADM_OK, WTHDR_NOT_LANDED, WTHDR_NOT_OWNER, WTHDR_OK, WTHDR_NONE` to `messages.ts`.
- [X] T051 [US4] Implement `PlanetStateService.applyAdminChange(key, requesterUserid, change)`: refuse if `requesterUserid !== state.userid`. Dispatch on `change.type`, validate value bounds (`taxrate ∈ [0,119]`, `beacon.length ≤ 75`, `password.length ≤ 10`, item indices in `[0, NUMITEMS)`). Apply + flush.
- [X] T052 [US4] Implement `PlanetStateService.withdrawTax(key, requesterUserid)`: refuse non-owner. Capture `state.tax`, set to `0n`, flush planet AND credit user cash inside `runSerialized`, return `{ ok: true, amount }`.
- [X] T053 [US4] Implement `backend/src/game/commands/handlers/admin.handler.ts` per `contracts/commands.md` § `admin`. Use `parseUint32` (existing) for numeric args; map item keywords like buy/sell handlers do.
- [X] T054 [US4] Implement `backend/src/game/commands/handlers/withdraw.handler.ts` per `contracts/commands.md` § `withdraw`.
- [X] T055 [US4] Register `AdminHandlerService` and `WithdrawHandlerService` in `commands.module.ts`.
- [X] T056 [US4] Extend `backend/src/game/commands/handlers/scan.handler.ts` to attach `beacon: planet.beacon` to projected planet cells in both `scan` (sector) and `scan lo` (range) outputs when beacon is non-empty (research Decision 10). Add a sector-scan readout line `MessageId.SCAN_BEACON` (`%s broadcasts: "%s"`).

**Checkpoint**: US1 + US2 + US3 + US4 functional. Owners now have agency.

---

## Phase 7: User Story 5 — Real Cargo Visibility (Priority: P2)

**Goal**: `report cargo` shows the actual 14-slot ship inventory with quantities, totals, and capacity.

**Independent Test**: Buy 30 food at a planet, run `report cargo`, see the line for food with quantity 30 and total tonnage 60.

### Tests for User Story 5 *(write first)*

- [X] T057 [P] [US5] Add `backend/test/unit/handlers/report-cargo.spec.ts`: empty cargo emits `REP_CARGO_NONE` + total 0; non-empty emits one `REP_CARGO_LINE` per non-zero slot in ascending item-index order, then a `REP_CARGO_TOTAL` line with summed tonnage and ship-class capacity. Zero-quantity slots are omitted (research Decision 8).

### Implementation for User Story 5

- [X] T058 [US5] Add MessageIds `REP_CARGO_LINE, REP_CARGO_TOTAL, REP_CARGO_NONE` to `messages.ts`.
- [X] T059 [US5] Extend `ReportHandlerService.classCache` (in `backend/src/game/commands/handlers/report.handler.ts`) to also pull `maxTons` from each `ShipClass` row.
- [X] T060 [US5] Replace the `TODO(005)` cargo branch (`report.handler.ts:74-81`) with the per-item readout per `contracts/commands.md` § "`report cargo`" (uses `ITEM_NAMES`, `ITEM_TONS`).

**Checkpoint**: All five user stories functional. Cargo visibility deferred from feature 003 is closed.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Living documentation, end-to-end smoke, suite green.

- [X] T061 [P] Update `docs/ARCHITECTURE.md`: add `PlanetModule`, `PlanetStateService` (in-memory Map + per-planet async serializer + per-mutation flush), `PlanetTickService` (round-robin one-planet-per-tick) to the module map. Reference `TickService.startPlanetUpdateTimer`.
- [X] T062 [P] Update `docs/PROGRESS.md`: append a 2026-05-XX entry for feature 005 — completed work, test coverage summary, decisions made, what's next (feature 006 combat).
- [X] T063 [P] Update `docs/GAME_MECHANICS.md`: add the planet ownership / orbit / land / claim flow, buy/sell semantics, neutral-zone exceptions, `multiply()` formula, tax model. Cite original sources (`GECMDS.C:cmd_*`, `GEPLANET.C:multiply`).
- [X] T064 [P] Update `docs/DATA_MODEL.md`: document the `Planet` columns, in-memory `PlanetState` shape, and the parallel-array `items*` projection. Note no migration was required.
- [X] T065 [P] Update `docs/DECISIONS.md`: append entries summarising research.md Decisions 1–10 with one-line rationales each.
- [X] T066 Add `backend/test/integration/command-roundtrip-planet.spec.ts`: full text-command path through `CommandRouterService` — `orbit` → `land Aurora` → `buy 30 food` → `report cargo` → warp to neutral zone → `orbit` → `land` → `sell 10 food` → `report cargo`. Asserts the whole ledger and event-line shape end-to-end.
- [X] T067 Run `cd backend && npx jest` and confirm: zero failures, ≥ 35 net new tests vs. the pre-005 baseline, no warnings about unhandled async errors. If a flaky concurrent test surfaces, fix it (do NOT skip).

---

## Dependencies

```
Phase 1 Setup (T001)
  └── Phase 2 Foundational (T002-T014)
        ├── Phase 3 US1 (T015-T023)         ─┐
        ├── Phase 4 US2 (T024-T036)         ─┤   independent;
        ├── Phase 5 US3 (T037-T045)         ─┤   may run in parallel
        ├── Phase 6 US4 (T046-T056)         ─┤   after Phase 2
        └── Phase 7 US5 (T057-T060)         ─┘
              └── Phase 8 Polish (T061-T067) — after all user stories
```

Cross-phase notes:
- US4 admin & US3 tick BOTH mutate planet state — both go through `PlanetStateService` so the per-planet serializer protects them. No code-level dependency between US3 and US4 beyond shared service.
- US5 depends only on `ITEM_NAMES`/`ITEM_TONS` from foundational T002 — does not need US2's trade plumbing to be functional.

## Parallel Execution Examples

Within Foundational (after T001 lands):
```
T002, T003, T008, T009 — independent files; ship in parallel.
T004 depends on T002+T003. T005 stands alone. T006 depends on T005.
T007 depends on T006. T010 depends on T008+T009.
T011 → T012 → T013/T014.
```

Within US1 (after Foundational):
```
T015, T016, T017 — three test files, parallel.
Then T018, T019 sequential (messages → service method).
T020, T021 parallel (different handler files).
T022, T023 sequential at the end.
```

Within US2 (after Foundational):
```
T024, T025, T026, T027 — four test files, parallel.
Then T028 → T029 → T030 + T031 (parallel) → T032 + T033 (parallel) → T034 → T035 + T036 (parallel).
```

Within US3 (after Foundational):
```
T037, T038, T039 — three test files, parallel.
Then T040 → T041 → T042 → T043 → T044 + T045 (parallel).
```

Within US4 (after Foundational):
```
T046, T047, T048, T049 — four test files, parallel.
Then T050 → T051 + T052 (parallel) → T053 + T054 (parallel) → T055 → T056.
```

Within US5: T057 then T058 → T059 → T060 (sequential, all touch `report.handler.ts` adjacents).

## Implementation Strategy — MVP-first

1. **MVP = US1.** Land and merge T001 → T014 → T015 → T023. After this you can `orbit`, `land`, name a planet, and have ownership survive restart. Demo-able.
2. **Trade loop = US1 + US2.** Adds the buy/sell economic core. Players can now meaningfully use planets.
3. **Living world = US1 + US2 + US3.** Adds the production tick. The galaxy now changes between visits.
4. **Owner agency = US1–US4.** Owners can configure their planets and extract wealth.
5. **Pilot QoL = US1–US5.** Cargo readout closes the deferred TODO from feature 003.

After each story completes, all prior stories remain functional — every `runSerialized` write goes through `PlanetStateService`, and the read path stays the same in-memory Map. No phase removes or relocates code from a prior phase.

## Test count summary (target ≥ 35 new backend tests)

| Phase | New tests |
|---|---|
| Foundational | T004 (1 spec, ~6 expectations), T007 (1 spec, ~3), T013 (1 spec, ~5), T014 (1 spec, ~2) → **4 spec files** |
| US1 | T015, T016, T017 → **3 spec files** + T023 integration → **4** |
| US2 | T024, T025, T026, T027 → **4 spec files** + T035, T036 → **6** |
| US3 | T037, T038, T039 → **3 spec files** + T044, T045 → **5** |
| US4 | T046, T047, T048, T049 → **4 spec files** |
| US5 | T057 → **1 spec file** |
| Polish | T066 → **1 integration spec** |
| **Total** | **27 new spec files**, ≈ 70+ test expectations end-to-end |

Comfortably exceeds the ≥ 35 target from `plan.md` Technical Context. Balance regression coverage (FR-028) is handled by T004 alone.
