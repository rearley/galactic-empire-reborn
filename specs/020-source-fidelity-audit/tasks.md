---

description: "Task list for feature 020 — Source Fidelity Audit"
---

# Tasks: Source Fidelity Audit

**Input**: Design documents from `/specs/020-source-fidelity-audit/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/beacon-event.md, quickstart.md

**Tests**: Tests are MANDATORY per the project constitution (Principle II) and per FR-007 / SC-002. Every HIGH/MEDIUM fix is preceded by a failing regression test, then made to pass.

**Organization**: Tasks are grouped by user story so each fidelity gap can be triaged, fixed, and verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps to a user story from spec.md (US1–US7)

## Path Conventions

Web app layout from plan.md: `backend/src/`, `backend/tests/`, repo-level `docs/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Wire the audit log and the manual-suite runner so every subsequent task has somewhere to land.

- [X] T00 Create `docs/020-audit-findings.md` with the schema header from `data-model.md` (id, sourceRef, tsModule, severity, disposition, testRef, notes) and an empty findings table
- [X] T00 [P] Add Jest manual project config at `backend/jest.manual.config.ts` matching only `tests/manual/*.manual.spec.ts`, excluded from the default `backend/jest.config.ts`
- [X] T00 [P] Add `"test:manual": "jest --config jest.manual.config.ts"` script to `backend/package.json`
- [X] T00 [P] Create `backend/tests/manual/` directory with a `README.md` describing the opt-in suite per `quickstart.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Stand up the shared audit primitives every story depends on (finding log conventions, fixture directory, balance-pin source-of-truth file).

**⚠️ CRITICAL**: User-story phases reference these files; complete this phase first.

- [X] T00 Create `backend/tests/fixtures/` directory (if missing) and add `.gitkeep` so subsequent fixture commits land cleanly
- [X] T00 Create `backend/src/game/constants.ts` (if not already present) as the single TS-side mirror of GEMAIN.H gameplay constants — re-export existing pinned values from their current locations and add JSDoc `@see GEMAIN.H:<line>` for each
- [X] T00 Add a one-line scaffold entry to `docs/020-audit-findings.md` for each of F-001..F-008 (one per named gap), all initially marked `disposition=pending`. Real triage fills these in during the per-story tasks.

**Checkpoint**: Foundation ready — user story tasks may begin in parallel.

---

## Phase 3: User Story 1 — Combat behavior matches the original (Priority: P1) 🎯 MVP

**Goal**: `randamage()` matches a checked-in C-derived golden vector and the Interceptor preload bonus from `GEFUNCS.C:checkdam` is applied (only) to Interceptors.

**Independent Test**: `npm test -- combat-math.spec` passes against the committed golden fixture; an Interceptor's per-tick reload exceeds a non-Interceptor's by the documented bonus under identical state.

### Tests for User Story 1 *(write first, ensure they FAIL before implementation)*

- [X] T01 [P] [US1] Add `backend/tests/fixtures/randamage.golden.json` — checked-in C-derived `{ rngSeed, dmgMax, ton, expected }` rows generated per `quickstart.md` regeneration steps
- [X] T01 [P] [US1] Write failing unit test `backend/tests/unit/combat-math.spec.ts` that loads the golden fixture and asserts `randamage()` matches every row
- [X] T01 [P] [US1] Write failing unit test `backend/tests/unit/interceptor-preload.spec.ts` asserting Interceptor class reload includes the `checkdam` preload bonus and other classes do not

### Implementation for User Story 1

- [X] T01 [US1] Audit `randamage()` against `GEFUNCS.C:randamage`; record finding F-001 in `docs/020-audit-findings.md` with severity, sourceRef, tsModule, notes
- [X] T01 [US1] Reconcile `randamage()` in `backend/src/game/combat/combat-math.ts` so the golden-vector test (T011) passes; add `@see GEFUNCS.C:randamage` JSDoc
- [X] T01 [US1] Audit phaser-reload path against `GEFUNCS.C:checkdam`; record finding F-002 in `docs/020-audit-findings.md`
- [X] T01 [US1] Apply Interceptor preload bonus in `backend/src/game/combat/combat-tick.service.ts` so T012 passes; add `@see GEFUNCS.C:checkdam` JSDoc and class-gating comment
- [X] T01 [US1] Update F-001 and F-002 in `docs/020-audit-findings.md` to `disposition=fixed` with `testRef` paths

**Checkpoint**: User Story 1 fully functional — combat math pins to the C source.

---

## Phase 4: User Story 2 — Wormholes behave authentically per sector (Priority: P1)

**Goal**: `Wormhole.visible` is surfaced in in-memory state and respected by scan rendering.

**Independent Test**: With a fixture containing a `visible=false` wormhole, the rendered scan output omits it; flipping to `visible=true` shows it with the C-source destination marker.

### Tests for User Story 2 *(write first, ensure they FAIL before implementation)*

- [X] T02 [P] [US2] Write failing integration test `backend/tests/integration/wormhole-visibility.spec.ts` covering visible=false (hidden) and visible=true (shown) cases against a known galaxy fixture

### Implementation for User Story 2

- [X] T02 [US2] Record finding F-003 (wormhole visibility flag missing) in `docs/020-audit-findings.md` with `@see GEMAIN.H:473` for `GALWORM.visible`
- [X] T02 [P] [US2] Add `visible: boolean` to the wormhole shape in `backend/src/game/galaxy/galaxy.types.ts` (default `true` for backward-compat per data-model.md)
- [X] T02 [P] [US2] Surface `visible` on the in-memory wormhole record in `backend/src/game/ship/ship-state.types.ts` (consumer side of the scan renderer)
- [X] T02 [US2] Update scan rendering in `backend/src/game/commands/handlers/scan.handler.ts` to honor `wormhole.visible` (depends on T022, T023)
- [X] T02 [US2] Update F-003 in `docs/020-audit-findings.md` to `disposition=fixed` with `testRef`

**Checkpoint**: Story 2 done — wormhole visibility is authentic.

---

## Phase 5: User Story 3 — Scan output ordering matches original (Priority: P2)

**Goal**: `scan lo full` field/column ordering matches the original C command handler.

**Independent Test**: Snapshot test compares `scan lo full` output against a layout extracted from the C handler.

### Tests for User Story 3 *(write first, ensure they FAIL before implementation)*

- [X] T03 [P] [US3] Write failing snapshot test `backend/tests/integration/scan-lo-full.spec.ts` capturing `scan lo full` output for a fixed game state

### Implementation for User Story 3

- [X] T03 [US3] Record finding F-004 (scan ordering drift) in `docs/020-audit-findings.md` citing the C `scan` command handler line range
- [X] T03 [US3] Reorder field emission in `backend/src/game/commands/handlers/scan.handler.ts` so the snapshot matches the C handler's column/line sequence; whitespace normalization permitted per spec assumptions
- [X] T03 [US3] Update F-004 to `disposition=fixed` with `testRef`

**Checkpoint**: Story 3 done — scan output matches the original terminal.

---

## Phase 6: User Story 4 — Beacons announce ship movement (Priority: P2)

**Goal**: Movement emits a `beacon` socket event matching the contract in `contracts/beacon-event.md` (payload: `{ shipId, shipName, fromSector, toSector }`) under the C-source gating conditions.

**Independent Test**: Integration test forces gate roll on/off and verifies the event fires (or doesn't) and that no event fires for in-sector repositions or empty `toSector`.

### Tests for User Story 4 *(write first, ensure they FAIL before implementation)*

- [X] T04 [P] [US4] Write failing integration test `backend/tests/integration/beacon.spec.ts` covering all four acceptance cases from `contracts/beacon-event.md` (gate fires, gate suppressed, no observers, in-sector move) using a stubbable `gernd()`

### Implementation for User Story 4

- [X] T04 [US4] Record finding F-005 (beacon-on-move missing) in `docs/020-audit-findings.md` with `@see GEFUNCS.C:808-816`
- [X] T04 [US4] Add `BeaconEvent` type in `backend/src/gateway/events/beacon.event.ts` matching the contract payload exactly
- [X] T04 [US4] Emit `beacon` event from `backend/src/gateway/game.gateway.ts` to the `toSector` Socket.io room when the four gating conditions in `contracts/beacon-event.md` hold (depends on T042)
- [X] T04 [US4] Update F-005 to `disposition=fixed` with `testRef`

**Checkpoint**: Story 4 done — multiplayer event log carries authentic beacons.

---

## Phase 7: User Story 5 — User options fully covered by `set` (Priority: P2)

**Goal**: Every `User.options[]` byte the C source actually reads in a command/tick path is toggleable via `set` and round-trips through login/logout.

**Independent Test**: For each in-scope option, a unit test toggles it via the `set` handler, persists, reloads, and asserts the value survived.

### Tests for User Story 5 *(write first, ensure they FAIL before implementation)*

- [X] T05 [P] [US5] Write failing unit test `backend/tests/unit/set-options-coverage.spec.ts` that enumerates the audited in-scope option list (loaded from `backend/src/game/commands/handlers/set-options.catalog.ts`) and asserts every entry has a `set` toggle and persisted round-trip

### Implementation for User Story 5

- [X] T05 [US5] Audit `User.options[]` reads across the C source; produce the canonical in-scope option list and commit it as `backend/src/game/commands/handlers/set-options.catalog.ts` (one entry per option with `@see` source ref). Record finding F-006 in `docs/020-audit-findings.md`
- [X] T05 [US5] Extend `backend/src/game/commands/handlers/set.handler.ts` to cover every option in the catalog (depends on T051) so T050 passes
- [X] T05 [US5] Update F-006 to `disposition=fixed` with `testRef`

**Checkpoint**: Story 5 done — `set` covers every C-read option.

---

## Phase 8: User Story 6 — Balance constants pinned by tests (Priority: P1)

**Goal**: Every gameplay-affecting `#define` in GEMAIN.H is pinned by at least one regression test; the enumeration fails the build if either side drifts.

**Independent Test**: `npm test -- gemain-pins.spec` passes; mutating any TS-side pin or removing a GEMAIN.H entry fails the test.

### Tests for User Story 6 *(write first, ensure they FAIL before implementation)*

- [X] T06 [P] [US6] Write failing unit test `backend/tests/unit/gemain-pins.spec.ts` that:
  (a) parses gameplay-affecting `#define`s from `reference/ge-source/GEMAIN.H` (excluding the hard-coded I/O / buffer-size exclusion list with comment-justified entries),
  (b) loads the TS pin set from `backend/src/game/constants.ts`,
  (c) asserts the two sets are equal and each pin's value matches GEMAIN.H

### Implementation for User Story 6

- [X] T06 [US6] Record finding F-007 (incomplete balance pin coverage) in `docs/020-audit-findings.md`
- [X] T06 [US6] Extend `backend/src/game/constants.ts` with any missing pins so T060 passes; each pin has a `@see GEMAIN.H:<line>` JSDoc
- [X] T06 [US6] Update F-007 to `disposition=fixed` with `testRef`

**Checkpoint**: Story 6 done — balance constants are tamper-evident.

---

## Phase 9: User Story 7 — Manual quickstart smoke tests runnable (Priority: P3)

**Goal**: T053, T043, T077 manual checks are encoded as `*.manual.spec.ts` files and runnable via `npm run test:manual`.

**Independent Test**: A fresh checkout runs `npm run test:manual` and sees pass/fail output for each smoke test.

### Implementation for User Story 7

- [X] T07 [P] [US7] Author `backend/tests/manual/T053.manual.spec.ts` encoding the prior-feature T053 manual validation
- [X] T07 [P] [US7] Author `backend/tests/manual/T043.manual.spec.ts` encoding the prior-feature T043 manual validation
- [X] T07 [P] [US7] Author `backend/tests/manual/T077.manual.spec.ts` encoding the prior-feature T077 manual validation
- [X] T07 [US7] Verify `npm run test:manual` discovers all three specs and that they are NOT picked up by the default `npm test` (depends on T002, T003, T070, T071, T072)
- [X] T07 [US7] Record finding F-008 in `docs/020-audit-findings.md` and mark `disposition=fixed` with `testRef` pointing to `backend/tests/manual/`

**Checkpoint**: Story 7 done — manual smoke suite is opt-in but discoverable.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Wrap the audit, document deltas, and close the loop on living docs per CLAUDE.md.

- [X] T08 Triage any audit-surfaced gaps beyond F-001..F-008: classify HIGH/MEDIUM/LOW; up to +2 HIGH/MEDIUM may be fixed in this feature (spec edge case 4) — log every additional finding (F-009..) in `docs/020-audit-findings.md`
- [X] T08 [P] Update `docs/PROGRESS.md` with the 020 entry: completed scope, net new test count (per FR-011), decisions made, known issues
- [X] T08 [P] Update `docs/GAME_MECHANICS.md` with the four mechanics touched (randamage, Interceptor preload, wormhole visibility, beacon-on-move) and their C source references
- [X] T08 [P] Update `docs/DECISIONS.md` if any deviation from plan occurred during the audit (else skip)
- [X] T08 Run `cd backend && npm test` — confirm all pre-existing + new tests are green (SC-003)
- [X] T08 Run `cd backend && npm run test:manual` — confirm the manual suite executes and reports per-spec pass/fail (SC-006)
- [X] T08 Confirm `git diff` introduces no new commands, mechanics, or UI features (SC-007); if any creep is detected, revert before finishing

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup; blocks all user-story phases
- **User Stories (Phases 3–9)**: All depend on Foundational; otherwise independent and can run in parallel by separate developers
- **Polish (Phase 10)**: Depends on every user story whose findings are in scope being marked `fixed` or `deferred`

### User Story Dependencies

- **US1, US2, US3, US4, US5, US6, US7**: Each depends only on Phase 2. No cross-story dependencies — every story modifies a different module/file set:
  - US1 → `combat-math.ts`, `combat-tick.service.ts`, fixtures
  - US2 → `galaxy.types.ts`, `ship-state.types.ts`, `scan.handler.ts` (read of `visible`)
  - US3 → `scan.handler.ts` (ordering)
  - US4 → `gateway/game.gateway.ts`, new `beacon.event.ts`
  - US5 → `set.handler.ts`, new `set-options.catalog.ts`
  - US6 → `constants.ts`
  - US7 → `tests/manual/*` only
  - Note: US2 and US3 both touch `scan.handler.ts`. Sequence: US2 first (adds visibility read), US3 second (reorders fields). Or, if assigned to one developer, fold both edits into a single pass.

### Within Each User Story

- Failing tests written before implementation (TDD per Principle II)
- Audit-finding entry recorded before fix lands (so `disposition=fixed` + `testRef` update is the closing edit)
- Each fix carries a `@see <C source>` JSDoc citation

### Parallel Opportunities

- All Setup tasks marked [P] (T002, T003, T004) can run in parallel
- US1 fixture, golden-vector test, and Interceptor preload test (T010, T011, T012) are independent files
- US2 type edits (T022, T023) are independent files
- US7 manual specs (T070, T071, T072) are fully independent
- Polish doc updates (T081, T082, T083) hit different docs and can run in parallel
- Across stories: US1, US4, US5, US6, US7 can be worked in parallel by separate developers immediately after Phase 2

---

## Parallel Example: User Story 1

```bash
# Launch independent US1 starters together:
Task: "Add backend/tests/fixtures/randamage.golden.json (T010)"
Task: "Write failing combat-math.spec.ts (T011)"
Task: "Write failing interceptor-preload.spec.ts (T012)"
```

---

## Implementation Strategy

### MVP First (User Stories 1, 2, 6 — all P1)

1. Phase 1 Setup → Phase 2 Foundational
2. US1 (combat fidelity) — restores correct combat feel
3. US2 (wormhole visibility) — restores correct exploration mechanics
4. US6 (GEMAIN.H pinning) — prevents future drift
5. **STOP and VALIDATE**: P1 stories pass independently; ship MVP

### Incremental Delivery

1. MVP (US1 + US2 + US6) → Ship
2. Add US3 (scan ordering) → Ship
3. Add US4 (beacon emission) → Ship
4. Add US5 (set options coverage) → Ship
5. Add US7 (manual smoke runner) → Ship

### Parallel Team Strategy

After Phase 2:
- Dev A: US1 (combat)
- Dev B: US2 + US3 (both touch `scan.handler.ts`, sequence US2 then US3)
- Dev C: US4 (beacon)
- Dev D: US5 (set options)
- Dev E: US6 (GEMAIN.H pins) + US7 (manual suite)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task → spec.md user story for traceability
- Verify each failing test FAILS before its paired implementation lands (Principle II)
- Each finding (F-NNN) entry in `docs/020-audit-findings.md` closes with `disposition=fixed` + `testRef` once the fix lands
- LOW findings (if any surface during audit) are documented but NOT fixed (FR-010)
- No new commands, mechanics, or UI features — keep diff to fidelity fixes, tests, docs (FR-012 / SC-007)
- Net new test count tracked in `docs/PROGRESS.md` per FR-011
