---
description: "Task list for Scan Modes & Display Options"
---

# Tasks: Scan Modes & Display Options

**Input**: Design documents from `/specs/015-scan-modes/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/scan-render.md, quickstart.md

**Tests**: MANDATORY per project constitution (Principle II). Unit, integration, and frontend component tests are written alongside (or before) implementation. Existing 003/004 `sca lo` fixtures will be updated in lock-step with the deliberate plot-character migration (research D1).

**Organization**: Tasks are grouped by user story — US1 (`sca ra`), US2 (`sca se`), US3 (`sca lo full` + display options). All three stories share the scantab + `scan:render` foundation laid in Phase 2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no incomplete-task dependency — safe to parallelise
- **[Story]**: US1 / US2 / US3 (only on user-story phase tasks)

## Path Conventions

Web app — `backend/src/...`, `backend/tests/...`, `frontend/src/...`, `frontend/tests/...`. Original C source under `reference/ge-source/` for `@see` references only (read-only).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm baseline — no new project scaffold needed.

- [ ] T001 Verify backend + frontend build green on `015-scan-modes` branch (`cd backend && npm run build` and `cd frontend && npm run build`); record any pre-existing failures so they aren't attributed to this feature.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, scantab helper, ShipState cache, gateway event plumbing, and `set` listing scaffolding. Every user story depends on these.

**⚠️ CRITICAL**: No US1/US2/US3 implementation may start until Phase 2 is complete.

### Shared types

- [ ] T002 Extend `CommandResult` / scan payload types in `backend/src/game/commands/command.types.ts`: add `ScanCell` (`x`, `y`, `type`, `char`, optional `colour`), `SidePanelRow`, `ScanRenderEvent` (`kind`, `mode`, `cells`, `header`, optional `sidePanel`); migrate any existing `scanGrid` shape to the new structured form. Cross-reference `specs/015-scan-modes/data-model.md` §3 and `contracts/scan-render.md` §1.

### ShipState cache fields

- [ ] T003 [P] Add non-optional `scanNames: boolean` and `scanHome: boolean` to `ShipState` in `backend/src/game/ship/ship-state.types.ts`, defaulting to `false`. JSDoc each with `@see GEMAIN.H:233` / `@see GEMAIN.H:234`.
- [ ] T004 Hydrate `scanNames` / `scanHome` from `User.options[0]` / `User.options[1]` in `ShipStateService.hydrate()` in `backend/src/game/ship/ship-state.service.ts` (and the corresponding mapper in `ship-state.mappers.ts`). Default to `false` when index missing/undefined. Reference `data-model.md` §2.

### Scantab helper (research D2, D5)

- [ ] T005 [P] Create `backend/src/game/commands/handlers/helpers/scantab.ts` exporting `Scantab`, `ScantabEntry`, and pure `buildScantab(self, allShips, prev, scanRange): Scantab` per `contracts/scan-render.md` §2 — sticky letter assignment, exclude self/cloaked/out-of-range, NOSCANTAB=26 (research D2). JSDoc with `@see GECMDS.C:2785 update_scantab` and `@see GECMDS.C:2895 pick_letter`.
- [ ] T006 [P] [Tests] Unit test `buildScantab` in `backend/tests/unit/scantab.spec.ts` — letter stickiness across two consecutive scans, cloaked exclusion, out-of-range exclusion, A..Z order by distance, lazy-init from `prev=null`, 26-cap when >26 ships qualify, immutability of `prev`.

### ScanHandler service surface — scantab lifecycle hooks

- [ ] T007 In `backend/src/game/commands/handlers/scan.handler.ts`, add a private `Map<string, Scantab>` keyed by `${userid}#${shipno}` plus public `clearScantab(userid: string, shipno: number): void` (idempotent no-op for missing keys). Reference `contracts/scan-render.md` §3.
- [ ] T008 Wire `clearScantab` to lifecycle events: call from `GameGateway.handleDisconnect()` in `backend/src/gateway/game.gateway.ts`, from the existing `ShipDestroyedEvent` listener wired by 008/014, and from the dock-back-to-base handler. Add a focused integration test `backend/tests/integration/scantab-lifecycle.spec.ts` covering disconnect / death / dock paths.

### Gateway event plumbing

- [ ] T009 In `backend/src/gateway/game.gateway.ts`, when a `CommandResult` carries a populated `scanRender: ScanRenderEvent`, emit **both** `command:result` (header line only, `info` category) and `scan:render` (full payload) to the issuing socket — never broadcast. On scan failure (`scanRender` absent), emit only `command:result` with `system` category. Reference `contracts/scan-render.md` §1 ("Event routing canonical").
- [ ] T010 [P] [Tests] Integration test `backend/tests/integration/scan-render-event.spec.ts` — verifies event routing: success path emits both events (disjoint contents), failure path emits only `command:result`, `mode` reflects `ShipState.scanHome`, payload never broadcasts to other sockets in the room.

### Frontend scan panel (shared)

- [ ] T011 [P] Create `frontend/src/hooks/useScanRender.ts` — subscribes to `scan:render`, maintains an array of scan cards, applies `mode: "overwrite"` (replace) vs `mode: "append"` (push). Absence of event = no update (per contract).
- [ ] T012 [P] Create `frontend/src/components/ScanPanel.tsx` consuming `useScanRender`, rendering the 30×15 grid + optional side panel, applying Tailwind colour classes from `ScanCell.colour`. Mount it adjacent to (not replacing) the existing `ScanMap.tsx` so prior behaviour is unaffected until US1 wiring lands.
- [ ] T013 [P] [Tests] Vitest component test `frontend/tests/ScanPanel.spec.tsx` — overwrite replaces single card; append produces multiple stacked cards; missing `scan:render` leaves panel unchanged.

### `set ?` scaffolding (shared by US3 and stable for US1/US2)

- [ ] T014 In `backend/src/game/commands/handlers/set.handler.ts`, refactor option dispatch into a registry table (`{ name, get, set, label }`) so `set ?` can iterate and emit `auto-shield: ON | auto-repair: OFF | …` as a single `info` line. Add `scannames` and `scanhome` registry entries that read/write `User.options[0]` / `User.options[1]` and update the corresponding `ShipState` cache field. Persist via Prisma write-through (single update — not deferred to 30s flush). Reference `contracts/scan-render.md` §4 + research D4.
- [ ] T015 [P] [Tests] Unit test `backend/tests/unit/set-scan-options.spec.ts` — `set scannames on|off`, `set scanhome on|off`, `set ?` listing format, unknown option returns `SET_UNKNOWN`, bogus toggle value returns `SET_FMT`, `User.options[]` write-through, `ShipState` cache refresh.

**Checkpoint**: Foundation ready — `buildScantab` is tested, gateway emits `scan:render`, `ShipState` carries the cache flags, and `set scannames|scanhome` round-trips through Prisma. US1/US2/US3 may now proceed in parallel.

---

## Phase 3: User Story 1 — Range radar scan (Priority: P1) 🎯 MVP

**Goal**: Implement `sca ra <1-9>` with zoom-formula projection, `*`-at-centre rendering, scantab letters, mine plotting, and 3-category colour channel (`self`/`human`/`ai`). Header shows effective range + sector. SCANHOME drives `mode`.

**Independent Test**: From a populated area, `sca ra 1` through `sca ra 9` each return a 30×15 grid; `*` at center; ships lettered A,B,C… by ascending distance with stable letter across re-scans; live mines as `.`; effective-range header grows monotonically (`scanrange/81` → `scanrange`); colour channel populated for ship cells only.

### Tests for User Story 1 *(write first, ensure they FAIL)*

- [ ] T016 [P] [US1] Unit test `backend/tests/unit/scan-ra.spec.ts` — projection at every zoom 1..9 (SC-001 monotonic-range across all 9), 3-category colour channel, `*` at centre cell `(15,7)`, `sca ra 0|10|abc|<missing>` all coerce to level 1 (FR-001), letter stickiness across consecutive `sca ra` calls, mine glyph `.`, header `"Range: <r> — Sector <x>,<y>"`.
- [ ] T017 [P] [US1] Unit test in same `scan-ra.spec.ts` for SC-002 — three ships at known coords appear within ±1 grid cell of algebraic expectation across all 9 zoom levels.
- [ ] T018 [P] [US1] Failure-mode test in `scan-ra.spec.ts` — `sca ra 5` while not in flight / dead returns `system`-category line and **does not** populate `scanRender` (asserted via the gateway integration test in T021).

### Implementation for User Story 1

- [ ] T019 [US1] In `backend/src/game/commands/handlers/scan.handler.ts`, add `handleRangeScan(ship, args)` — parse level (coerce 0/>9/non-numeric/missing → 1), compute `effective_range = scanrange / (10-level)^2` (`@see GECMDS.C:2510`), call `buildScantab` against `ShipStateService.findAllShips()`, project each entry into the 30×15 grid centred on self, plot `*` at centre, mines as `.` (live mines only — read mine layer from feature 006b), set per-cell `colour` ∈ `{'self','human','ai'}`, build header, return `CommandResult` with `scanRender: { kind: 'ra', mode, cells, header }` where `mode` is `ship.scanHome ? 'overwrite' : 'append'`. JSDoc `@see GECMDS.C:2484 scan_ra`.
- [ ] T020 [US1] Register `sca ra` dispatch path in `scan.handler.ts` so the existing scan command parser routes `ra <level>` to `handleRangeScan`. Ensure it does not regress `sca sh` / `sca pl` paths from 003/004 (existing tests must stay green).
- [ ] T021 [P] [US1] Integration test `backend/tests/integration/scan-ra-gateway.spec.ts` — issue `sca ra 5` over a real Socket.io test client, assert both `command:result` (info line, header text only, no grid) and `scan:render` (`kind='ra'`, full cells, correct `mode`) arrive on the issuing socket only; failure case (docked) emits only `command:result`.

**Checkpoint**: US1 (MVP) is independently functional — players can range-scan with zoom, see lettered contacts, and SCANHOME `overwrite`/`append` works end-to-end via `ScanPanel`.

---

## Phase 4: User Story 2 — Sector radar scan (Priority: P2)

**Goal**: Implement `sca se` — 30×15 grid bounded to the player's current sector. Plot `*`, scantab letters for ships, planets as digits `1`-`9`, mines as `.`, with the 4-category colour channel (`self`/`human`/`ai`/`planet`).

**Independent Test**: Player in a sector with another player, an AI ship, a planet, and a mine — `sca se` returns the expected grid with all four colour categories populated; empty-sector case shows only `*`.

### Tests for User Story 2 *(write first, ensure they FAIL)*

- [ ] T022 [P] [US2] Unit test `backend/tests/unit/scan-se.spec.ts` — sector-bounded projection (no entities outside the sector appear), 4-category colour channel populated correctly per FR-005, planet digit assignment matches `GEPLANET` indexing, empty-sector returns only `*`, mine glyph `.`, cell-collision precedence `self > ship > planet > mine` (data-model invariant).
- [ ] T023 [P] [US2] Failure-mode test in `scan-se.spec.ts` — `sca se` while not in flight returns `system` line, no `scanRender`.

### Implementation for User Story 2

- [ ] T024 [US2] In `backend/src/game/commands/handlers/scan.handler.ts`, add `handleSectorScan(ship)` — restrict candidate ships and planets to current sector, call `buildScantab` (still shared scantab — letters must match `sca ra`), project to 30×15 grid bounded to the sector, populate 4-category colour channel including `planet`, header `"Sector <x>,<y>"`, return `CommandResult` with `scanRender: { kind: 'se', mode, cells, header }`. JSDoc `@see GECMDS.C:2562 scan_se`.
- [ ] T025 [US2] Register `sca se` in the scan dispatcher; reuse the same scantab as `sca ra` so an ABCD letter assignment from `sca ra` survives a follow-up `sca se` (FR-012). Confirm via cross-mode letter-stickiness check added to `scantab.spec.ts` (extend T006).
- [ ] T026 [P] [US2] Integration test `backend/tests/integration/scan-se-gateway.spec.ts` — round-trip `sca se` over Socket.io, assert payload shape and that letters match a preceding `sca ra` (shared scantab).

**Checkpoint**: US1 + US2 both work; sector and range scans share letter assignments.

---

## Phase 5: User Story 3 — Extended local scan & display options (Priority: P3)

**Goal**: Migrate `sca lo` to scantab letters (deliberate D1 deviation), implement `sca lo full` with side panel + SCANNAMES, complete `set ?` listing and persistence.

**Independent Test**: With SCANNAMES on, `sca lo full` shows side panel rows (letter / distance / bearing / heading / speed) plus a name line under each. Toggle off, name lines vanish. Logout/login preserves the toggle.

### Tests for User Story 3 *(write first, ensure they FAIL)*

- [ ] T027 [P] [US3] Unit test `backend/tests/unit/scan-lo-full.spec.ts` — side-panel row formatting matches `scan_sh` style (integer parsec distance, integer 0-359 bearing/heading, `showarp()` speed string), SCANNAMES on adds name line under each row, SCANNAMES off suppresses name lines, side panel ordered by ascending distance (matches scantab letters A,B,C…), three populated fixtures per SC-004. **Failure-mode assertion** (closes /speckit-analyze G2): `sca lo` and `sca lo full` issued while not in flight (docked, dead, or any other non-flight state per FR-011) MUST return a single `command:result` line with `category: 'system'` and MUST NOT emit a `scan:render` event. Add one assertion per state (docked, dead) for both `sca lo` and `sca lo full` — four assertions total — mirroring the structure already used by T018 (`sca ra`) and T023 (`sca se`) so SC-006 coverage is uniform across all three scan commands.
- [ ] T028 [P] [US3] Update existing 003/004 `sca lo` fixtures and tests to expect scantab letters in place of the original `+`/`=` glyphs (research D1). Affected files: `backend/tests/unit/scan-handler.spec.ts` and any sca-lo integration tests under `backend/tests/integration/`. Document the migration intent in the test comment header so future readers don't think the change was accidental.
- [ ] T029 [P] [US3] Persistence integration test `backend/tests/integration/set-scan-options-persistence.spec.ts` — SC-005: `set scanhome on` → simulate logout (drop ShipState) → simulate login (re-hydrate) → `set ?` reports `scanhome: ON`; assert `User.options[1] === 1` in DB.
- [ ] T030 [P] [US3] Edge-case test in `set-scan-options.spec.ts` — `set frobnicate on` returns usage hint without touching state; `set scannames bogus` returns usage hint without touching state.

### Implementation for User Story 3

- [ ] T031 [US3] In `backend/src/game/commands/handlers/scan.handler.ts`, modify the existing `sca lo` path: replace `+`/`=` plotting with scantab letters (call `buildScantab`, share with `ra`/`se`). Keep header format `"Range: <scanrange*10> — Sector <x>,<y>"`. JSDoc `@see GECMDS.C:2640 scan_lo` + comment noting the D1 deviation.
- [ ] T032 [US3] Add `sca lo full` branch in `scan.handler.ts` — produces `kind: 'lo-full'` with `sidePanel: SidePanelRow[]`. Use the existing `showarp()` formatter shipped in 003 (locate it via `backend/src/game/commands/handlers/sen.handler.ts` or wherever `sca sh` shipped it). Include `name` field iff `ship.scanNames` is true. JSDoc `@see GECMDS.C:3019 printmapfull`.
- [ ] T033 [US3] Confirm `set ?`, `set scannames on|off`, `set scanhome on|off` already work end-to-end via T014; if any handler integration is missing (e.g., the ShipState-cache refresh on success), close the gap here.
- [ ] T034 [P] [US3] Frontend — extend `ScanPanel.tsx` to render the optional `sidePanel` rows (letter | dist | bearing | heading | speed | optional name). Add Vitest case in `frontend/tests/ScanPanel.spec.tsx` covering side-panel rendering with and without `name`.

**Checkpoint**: All three user stories independently functional; `sca lo`/`sca lo full` use shared scantab letters; SCANNAMES/SCANHOME persist across login.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T035 [P] Update `docs/ARCHITECTURE.md`, `docs/PROGRESS.md`, `docs/GAME_MECHANICS.md`, `docs/DECISIONS.md`, `docs/DATA_MODEL.md` per CLAUDE.md — record scan-mode module additions, the D1/D2/D3 deviations, and the `User.options` index map.
- [ ] T036 [P] Verify SC-007 — run the full backend test suite (`cd backend && npm test`) and confirm all previously-passing 003/004 scan tests still pass after the `sca lo` glyph migration. Capture the green run in the PR description.
- [ ] T037 Walk through `specs/015-scan-modes/quickstart.md` end-to-end manually against the dev stack (backend + frontend running). Tick each section; record any deviations.

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (T001) — no dependencies.
- Foundational (T002–T015) — depends on Setup. **Blocks all user stories.**
  - Within Phase 2: T002 unblocks T003-T013; T005 unblocks T006; T007 unblocks T008; T011 unblocks T012; T014 unblocks T015.
- US1 (T016–T021), US2 (T022–T026), US3 (T027–T034) — each depends on Phase 2. They can run in parallel once Phase 2 completes; the only cross-story dependency is the shared scantab map (already foundational), so letter-stickiness tests in US2/US3 implicitly assume US1's `sca ra` path exercises scantab — but this is a test ordering concern, not an implementation one.
- Polish (T035–T037) — after all chosen user stories.

### Within each user story

- Tests written first and observed FAILING → then implementation → then integration.
- Models/types before services; services before gateway emission.

### Parallel opportunities

- Phase 2: T003, T005, T010, T011, T012, T013, T015 are `[P]` and live in different files.
- US1 tests (T016, T017, T018) all in `scan-ra.spec.ts` — same file → NOT parallel; mark as sequential within the test file. (T021 is its own integration file → parallel.)
- US2 tests T022/T023 same file → sequential within file; T026 separate → `[P]`.
- US3 tests T027–T030 are in distinct files → all `[P]`.
- US1/US2/US3 implementation can proceed in parallel by different developers (different functions in `scan.handler.ts` — coordinate via small commits to avoid merge churn).

---

## Parallel Example: Phase 2

```bash
# After T002 lands (shared types), launch in parallel:
Task: "T003 ShipState cache fields in backend/src/game/ship/ship-state.types.ts"
Task: "T005 buildScantab helper in backend/src/game/commands/handlers/helpers/scantab.ts"
Task: "T011 useScanRender hook in frontend/src/hooks/useScanRender.ts"
Task: "T012 ScanPanel component in frontend/src/components/ScanPanel.tsx"
Task: "T015 set-options unit test in backend/tests/unit/set-scan-options.spec.ts"
```

## Parallel Example: After Phase 2

```bash
# Three developers, three stories:
Developer A: T016 → T017 → T018 → T019 → T020 → T021   (US1)
Developer B: T022 → T023 → T024 → T025 → T026          (US2)
Developer C: T027 → T028 → T029 → T030 → T031 → ...    (US3)
```

---

## Implementation Strategy

### MVP (US1 only)

1. T001 (Setup) → T002–T015 (Foundational) → T016–T021 (US1).
2. **STOP and validate** — players can `sca ra` with full zoom, letters, colour, SCANHOME mode. This is the smallest shippable slice.

### Incremental delivery

- MVP (US1) → demo → US2 (`sca se`) → demo → US3 (`sca lo full` + display options) → demo → Polish.
- Each story adds value without regressing the previous one (SC-007 specifically asserted in T036).

---

## Notes

- `[P]` tasks operate on distinct files — safe to fan out across agents or developers.
- Story labels (`US1`/`US2`/`US3`) trace each task back to its acceptance scenarios in spec.md.
- `sca lo` glyph migration (research D1) is intentional — T028 updates fixtures in lock-step.
- Original C source under `reference/ge-source/` is read-only; all `@see` references point there.
- Verify tests fail before implementing.
- Commit after each task or logical group (foundational hook will offer auto-commit on `/speckit-implement`).
