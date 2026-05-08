# Tasks: Faithful Onboarding & Ship Purchase

**Input**: Design documents from `/specs/021-onboarding-ship-purchase/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/new-ship-command.md ✓

**Tests**: Mandatory per project constitution (Principle II: Testing is First Class). Unit and integration tests are written before or alongside implementation.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the shared constants file that all stories and tests depend on.

- [X] T001 Create `backend/src/game/constants/onboarding.ts` with exported constants `START_CASH = 5000n`, `START_FLUX_PODS = 3`, `START_CLASS = 1` — add JSDoc citing `GEMAIN.C:521 STRTCASH` and `GEFUNCS.C:initshp`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Update the gateway state machine and fix existing test mocks before any user story work can begin.

**⚠️ CRITICAL**: Both US1 and US2 implementations depend on this phase completing first.

- [X] T002 Update 6 existing test files that mock `OnboardingService.finalize()` — change all calls from `finalize(userId, classNum, shipName)` to `finalize(userId, shipName)` in: `backend/test/gateway/combat-broadcast.spec.ts`, `backend/test/gateway/game.gateway.droid-bridge.spec.ts`, `backend/test/gateway/player-snapshot.spec.ts`, `backend/test/integration/scan-ra-gateway.spec.ts`, `backend/test/integration/scan-render-event.spec.ts`, `backend/test/integration/scan-se-gateway.spec.ts`
- [X] T003 Remove `AWAITING_CLASS` step from `OnboardingState` type in `backend/src/gateway/game.gateway.ts` — narrow type to `{ step: 'AWAITING_NAME' }` only; update connection handler so no-ship players receive `prompt:ship-name` directly (remove class-list emit and `AWAITING_CLASS` branch)

**Checkpoint**: Existing gateway tests must still pass after T002+T003 before proceeding.

---

## Phase 3: User Story 1 — New player receives Interceptor automatically (Priority: P1) 🎯 MVP

**Goal**: New player completes onboarding (username → ship name) and enters game as class 1 Interceptor pilot with 5,000 credits and 3 flux pods — no class picker shown.

**Independent Test**: Register a new account, complete onboarding, verify `rep sys` shows Interceptor class, `rep cargo` shows 3 flux pods, player has 5,000 credits.

### Tests for User Story 1

- [X] T004 [US1] Write integration test `backend/test/integration/onboarding-init.spec.ts` — verify `OnboardingService.finalize(userId, shipName)` creates a `Ship` row with `shpclass=1`, `items` array of 14 elements with `items[4]=3n` and all others `0n`, and `User.cash=5000n`; assert no `prompt:class-list` event is emitted by the gateway

### Implementation for User Story 1

- [X] T005 [US1] Modify `OnboardingService.finalize()` in `backend/src/game/onboarding/onboarding.service.ts` — remove `classNumber` parameter; always create ship with `shpclass=START_CLASS` (1), `items=[0n,0n,0n,0n,3n,0n,0n,0n,0n,0n,0n,0n,0n,0n]` (14 elements, I_FLUX=4 → 3n), `energy=65000n` (ENGYMAX per GEFUNCS.C:initshp); set `User.cash=START_CASH` (5000n) via `prisma.user.update`; import constants from `backend/src/game/constants/onboarding.ts`

**Checkpoint**: Integration test T004 passes. Register flow: username → ship name → in game as Interceptor.

---

## Phase 4: User Story 2 — Player buys a new ship at Zygor-3 (Priority: P1)

**Goal**: Player with sufficient credits at neutral zone sector (0,0) orbiting a planet types `new ship 4` to purchase a Destroyer; credits deducted, new ship appears in their fleet.

**Independent Test**: Seed a player with ≥600,000 credits orbiting Zygor-3, run `new ship 4`, verify credits decremented and new Ship row exists.

### Tests for User Story 2

- [X] T006 [US2] Write unit tests `backend/test/unit/new-ship.handler.spec.ts` — cover all paths: success purchase (credits deducted, Ship created, auto-named `<TypeName> #N`); rejection for wrong sector; rejection for not orbiting; rejection for non-existent class number; rejection for AI/CPU class (category ≠ 'PLAYER'); rejection for insufficient credits; `new ship` (no class) returns ship-class list; `new` (no args) returns usage help; `new shield <type>` returns out-of-scope stub message

### Implementation for User Story 2

- [X] T007 [US2] Create `NewShipHandlerService` in `backend/src/game/commands/handlers/new-ship.handler.ts` with `get command(): Command` returning keyword `'new'`, aliases `[]`, minArgs 0 — implement subcommand dispatch: (a) no args → usage help; (b) `ship` with no class → query DB for all `ShipClass` with `category='PLAYER'` and list with prices; (c) `ship <N>` → validate sector `(Math.floor(xcoord)===0 && Math.floor(ycoord)===0)`, validate orbit `(ship.where >= 10)`, validate class exists and is PLAYER category, validate `User.cash >= maxPrice`, create Ship with default loadout (same items/energy as `initshp`), decrement `User.cash` via `prisma.user.update({ data: { cash: { decrement: maxPrice } } })`, auto-name as `<typeName> #<nextShipNo>`; (d) `shield` → stub message; JSDoc citing `GECMDS.C:cmd_new`
- [X] T008 [US2] Register `NewShipHandlerService` in `backend/src/game/commands/commands.module.ts` — add to `providers` array, inject in `CommandsModule` constructor, call `this.commandRouter.register(this.newShipHandler.command)` in `onModuleInit()`

**Checkpoint**: Unit tests T006 pass. Player can purchase ships at Zygor-3; all 6 rejection paths return correct messages.

---

## Phase 5: User Story 3 — Starting ship, cash, and cargo are correct (Priority: P2)

**Goal**: Exact starting state matches original C source — Interceptor (class 1), 5,000 credits, 3 flux pods at items[4], all other items zero. Balance regression tests pin these constants.

**Independent Test**: Register, verify exact cargo via `rep cargo` and exact cash via `rep sys`; balance regression tests fail if START_CASH or START_FLUX_PODS constants are changed.

### Tests for User Story 3

- [X] T009 [P] [US3] Write balance regression tests `backend/test/balance/start-constants.spec.ts` — import `START_CASH`, `START_FLUX_PODS`, `START_CLASS` from `backend/src/game/constants/onboarding.ts` and assert exact values (`START_CASH === 5000n`, `START_FLUX_PODS === 3`, `START_CLASS === 1`); tests must fail if any constant is changed; add JSDoc citing `GEMAIN.C:521 STRTCASH` and `GEFUNCS.C:initshp`

**Checkpoint**: Balance regression tests pass and will detect future constant drift.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Remove dead frontend code and update living documentation.

- [X] T010 Delete `frontend/src/onboarding/ClassPickerPrompt.tsx` — component is no longer used after onboarding class-picker removal (FR-005)
- [X] T011 [P] Update `frontend/src/App.tsx` — remove `class-list` branch from onboarding prompt handler and `ClassPickerPrompt` import and render
- [X] T012 [P] Update `frontend/src/socket/useSocket.ts` — remove `prompt:class-list` event listener; narrow `OnboardingPrompt` type to exclude the class-list step (contract: server never emits this event again)
- [X] T013 Update `docs/PROGRESS.md` — add entry for feature 021-onboarding-ship-purchase per format: completed items, test coverage, decisions made, known issues

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS both US1 and US2
- **Phase 3 (US1)**: Depends on Phase 2 completion
- **Phase 4 (US2)**: Depends on Phase 2 completion — can run in parallel with Phase 3 (different files)
- **Phase 5 (US3)**: Depends on Phase 1 (constants file) — can run in parallel with Phases 3 and 4
- **Phase 6 (Polish)**: Depends on Phases 3, 4, 5

### User Story Dependencies

- **US1 (P1)**: Requires Foundational (Phase 2) — no dependency on US2 or US3
- **US2 (P1)**: Requires Foundational (Phase 2) — no dependency on US1 or US3
- **US3 (P2)**: Requires only Phase 1 constants file — independently testable

### Within Each Phase

- T002 must complete before T003 (fix mocks before changing the signature they mock)
- T004 (test) must be written and FAIL before T005 (implementation)
- T006 (test) must be written and FAIL before T007+T008 (implementation)
- T007 must complete before T008 (handler must exist before registration)
- T010 must complete before T011 (delete before removing import)

---

## Parallel Opportunities

### Phase 3 + Phase 4 (after Phase 2 completes)

```
# US1 and US2 can run in parallel (different files):
Agent A: T004 → T005  (onboarding service)
Agent B: T006 → T007 → T008  (new-ship handler)
```

### Phase 5 (balance tests) can start as soon as T001 is done

```
# T009 can run as soon as constants file exists:
T001 complete → T009 starts immediately (no gateway/handler dependency)
```

### Phase 6 parallel tasks

```
# T011 and T012 can run in parallel (different files):
T010 → T011 || T012 → T013
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Create constants file (T001)
2. Complete Phase 2: Update test mocks + gateway (T002, T003)
3. Complete Phase 3: Onboarding integration test + service update (T004, T005)
4. **STOP and VALIDATE**: New player registers → Interceptor, 5,000cr, 3 flux pods
5. Ship if needed — US2 and US3 add value but US1 fixes the primary fidelity break

### Incremental Delivery

1. T001 → Constants exist
2. T002 + T003 → Foundation ready (existing tests still pass)
3. T004 + T005 → US1: No class picker, Interceptor on registration (MVP!)
4. T006 + T007 + T008 → US2: `new ship <N>` command works at Zygor-3
5. T009 → US3: Balance regression pinned
6. T010 + T011 + T012 + T013 → Frontend cleaned up, docs current

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- T002 is the riskiest task — update all 6 mock sites before changing the real signature
- `new ship <N>` handler follows the same pattern as `BuyHandlerService` (see `buy.handler.ts`)
- `User.cash` is BigInt in DB — all arithmetic uses BigInt (e.g. `5000n`, not `5000`)
- Ship items array is always exactly 14 elements (NUMITEMS=14); do not use push/length assumptions
- The `new` command onboarding intercept for players with no ship stays at the gateway level (FR-013) — `NewShipHandlerService` only handles players with an active ship
