# Tasks: Navigation Autopilot, Spy, Help, and Clear Screen

**Input**: Design documents from `/specs/016-navigation-spy/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: MANDATORY per Constitution Principle II (Testing First Class). Tests are written before or alongside implementation.

**Organization**: Tasks are grouped by user story. P1 = MVP. Stories are independently testable.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Different file, no dependencies on incomplete tasks → can run in parallel
- **[Story]**: US1 (nav), US2 (spy), US3 (hel/?), US4 (cls). Setup / Foundational / Polish phases carry no story label.
- File paths are exact and absolute relative to repo root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: One-time scaffolding shared by all four commands.

- [X] T001 Add `UNIVMAX = 15` constant in `backend/src/game/constants.ts` with `@see GEGLOBAL.H:134 univmax` JSDoc, and replace the existing magic-number `const univmax = 15.0` in `backend/src/game/ai/cybertron/cybertron-tick.service.ts:674` with an import of the new constant.
- [X] T002 Extend `CommandResult` in `backend/src/game/commands/command.types.ts` to add an optional `clearLog?: boolean` field with the JSDoc note from data-model.md §4.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Persistence + state-shape changes that all four user stories (or, at minimum, US1 + US2) depend on.

**⚠️ CRITICAL**: No US1 or US2 implementation may begin until this phase is complete. US3 (`hel`) and US4 (`cls`) only depend on T002.

- [X] T003 Add `navTargetX Int?` and `navTargetY Int?` to the `Ship` model in `backend/prisma/schema.prisma`; add `///` doc-comments per data-model.md §1.
- [X] T004 Generate Prisma migration via `cd backend && npm run prisma:migrate:dev -- --name nav_target_coords`; commit the resulting `backend/prisma/migrations/<timestamp>_nav_target_coords/migration.sql`.
- [X] T005 Add `navTargetX: number | null` and `navTargetY: number | null` to `ShipState` in `backend/src/game/ship/ship-state.types.ts` with JSDoc references to `GECMDS.C:5121` and research D1.
- [X] T006 Round-trip the two new fields in both directions (`prismaShipToState` and `stateToPrismaUpdate`) inside `backend/src/game/ship/ship-state.mappers.ts`; default `null` on read when DB column is null, write `null` on update when state value is null.
- [X] T007 [P] Add a `MessageId` enum entry and template for every new message ID in `backend/src/game/commands/messages.ts`: `NAVFMT`, `NAV01`, `NAV_INACTIVE`, `NAV_STATUS`, `NAV_ARRIVED`, `NAV_ALREADY_THERE`, `SPY1`, `SPY0`, `SPY0B`, `SPY0C`, `SPYM0`, `SPYM1`, `HELFMT`, `HEL_UNKNOWN`. Templates per the contracts.
- [X] T008 [P] Add a balance regression test in `backend/test/game/balance/nav-spy.balance.spec.ts` asserting `UNIVMAX === 15` and `I_SPY === 13`.

**Checkpoint**: Schema, state, mappers, messages, and the balance test exist. User-story implementation can now begin.

---

## Phase 3: User Story 1 — Autopilot Navigation (Priority: P1) 🎯 MVP

**Goal**: A player can issue `nav <x> <y>` and the ship steers itself to the target sector across physics ticks, arriving on a floor-based sector match. Manual `rot`/`imp`/`war` silently disengages. `nav` with no args reports status.

**Independent Test**: With a ship at a known position, sufficient energy, and a fake clock, `nav <x> <y>` engages `holdcourse`, the physics tick rewrites `head2b` each tick toward the target, the ship rotates and moves, and arrival fires once with `holdcourse`/`navTargetX`/`navTargetY` cleared.

### Tests for User Story 1 *(write first; ensure they FAIL before implementation)*

- [X] T009 [P] [US1] Unit test for the `nav` handler in `backend/test/game/commands/handlers/nav.handler.spec.ts` covering: status form (active + inactive), `NAVFMT` rejection (wrong arg count, non-integer, `|x|>UNIVMAX`, `|y|>UNIVMAX` — including ±15 boundary cases), `NAV_ALREADY_THERE` short-circuit (no state change), engagement happy path (sets `navTargetX`/`navTargetY`/`holdcourse=1`, emits `NAV01`, sets `dirty`), silent target replace while active, in-orbit auto-break (`where>=10` → `where=1` then engage).
- [X] T010 [P] [US1] Integration test in `backend/test/game/tick/nav-autopilot.integration.spec.ts` using the existing fake-clock harness: place a ship, engage autopilot, advance physics ticks, assert (a) `head2b` is recomputed each tick toward target+0.5 cell center, (b) ship eventually reaches the floor-based target sector, (c) `NAV_ARRIVED` is emitted exactly once to the `user:${userid}` room as a `command:result`, (d) `holdcourse`, `navTargetX`, `navTargetY` are cleared on arrival, (e) no further steering occurs in the same tick after arrival.
- [X] T011 [P] [US1] Integration test in `backend/test/game/tick/nav-cancel.integration.spec.ts`: with autopilot active, dispatch `rot 30` / `imp 50` / `war 3` (one per parametrised case), assert `holdcourse=0`, `navTargetX=null`, `navTargetY=null`, no cancel-event emitted, and the manual command takes effect.

### Implementation for User Story 1

- [X] T012 [US1] Create `NavHandlerService` in `backend/src/game/commands/handlers/nav.handler.ts` implementing both forms (status + engage) per `contracts/nav-command.md`; use `cbearing` and `cdistance` from existing helpers; reference `GECMDS.C:5109 cmd_navigate` and research D1 in JSDoc.
- [X] T013 [US1] Register `NavHandlerService` (keyword `nav`, minArgs 0) in `backend/src/game/commands/commands.module.ts` and the command-router registration table.
- [X] T014 [US1] Add the autopilot branch to `backend/src/game/physics/physics-tick.service.ts`: for each ship with `holdcourse > 0`, run arrival check first (clear state + emit `NAV_ARRIVED` to `user:${userid}` room, then `continue`), otherwise rewrite `head2b = cbearing(ship, {x: navTargetX+0.5, y: navTargetY+0.5}, ship.heading)`. Branch must run before the existing rotation step.
- [X] T015 [US1] Add the silent autopilot-cancel preamble to the existing `rot`, `imp`, `war` handlers in `backend/src/game/commands/handlers/rotate.handler.ts`, `backend/src/game/commands/handlers/impulse.handler.ts`, and `backend/src/game/commands/handlers/warp.handler.ts`: if `ship.holdcourse > 0`, set `holdcourse=0`, `navTargetX=null`, `navTargetY=null` before continuing the manual logic. No event emission.

**Checkpoint**: US1 fully functional and independently testable. MVP candidate.

---

## Phase 4: User Story 2 — Plant Spy on Planet (Priority: P2)

**Goal**: Player in orbit of an enemy planet with one `I_SPY` item issues `spy`; planet's `spyowner` becomes the player's userid, the item is consumed, and subsequent planet scans by that player reveal owner-equivalent intel.

**Independent Test**: Ship in orbit of user-B planet with `items[I_SPY] >= 1`. Issue `spy` → `planet.spyowner === ship.userid`, `items[I_SPY]` decremented by 1n, `SPYM1` confirmation emitted. Then `sca pl <name>` from the same player includes the per-item inventory block; from a third user it does not.

### Tests for User Story 2 *(write first; ensure they FAIL before implementation)*

- [X] T016 [P] [US2] Unit test in `backend/test/game/commands/handlers/spy.handler.spec.ts`: rejection branches in original-source order — not in orbit (`SPY1`), wormhole (`SPY0B`), self-owned planet (`SPY0`), neutral zone (`SPY0C`), no spy equipment (`SPYM0`). Assert each rejection produces zero state change (snapshot ship + planet before/after). Success path: `items[I_SPY]` decremented by `1n`, `planet.spyowner` set to ship.userid, both `dirty` flags true, `SPYM1` emitted with planet name. Overwrite case: planet starts with spyowner = 'carol', alice issues spy → assert planet.spyowner === alice.userid and items[I_SPY] decremented (carol's prior spy is silently overwritten).
- [X] T017 [P] [US2] Integration test for spy scan reveal in `backend/test/game/commands/handlers/scan-spy-reveal.spec.ts` (or extend the existing `scan.handler.spec.ts`): planet with `spyowner = "alice"`, viewer `alice` runs `sca pl <name>` → output contains the per-item inventory block (mirrors GECMDS.C:2367-2375 owner output). Viewer `bob` runs same → only aggregate descriptions, no item lines. Case-insensitive userid match verified.

### Implementation for User Story 2

- [X] T018 [US2] Create `SpyHandlerService` in `backend/src/game/commands/handlers/spy.handler.ts` per `contracts/spy-command.md`; validation in original-source order (`GECMDS.C:6044`/`6055`/`6063`/`6070`/`6077`); use existing `PlanetStateService` to fetch by `(xsect, ysect, plnum=where-10)`. JSDoc references `GECMDS.C:6040 cmd_spy`.
- [X] T019 [US2] Register `SpyHandlerService` (keyword `spy`, minArgs 0) in `backend/src/game/commands/commands.module.ts`.
- [X] T020 [US2] Extend the `scan pl <name>` rendering branch in `backend/src/game/commands/handlers/scan.handler.ts` (or wherever `scanPl` lives — verify) with the spy-owner reveal: `else if (planet.spyowner !== '' && planet.spyowner.toLowerCase() === ship.userid.toLowerCase())` emit the same per-item inventory block as the planet-owner branch. Reference research D3 in a code comment.

**Checkpoint**: US1 and US2 both independently functional.

---

## Phase 5: User Story 3 — In-Game Help (Priority: P2)

**Goal**: `hel` (alias `?`) returns a topic catalog with no args; `hel <topic>` returns the topic body; unknown topics return `HEL_UNKNOWN` with valid topics listed.

**Independent Test**: `hel` lists exactly the five topic IDs (navigation, combat, trade, planet, ship). `hel navigation` returns navigation body lines. `?` is identical to `hel` for both forms. `hel quokka` returns `HEL_UNKNOWN` echoing `quokka`.

### Tests for User Story 3 *(write first; ensure they FAIL before implementation)*

- [X] T021 [P] [US3] Unit test in `backend/test/game/commands/handlers/help.handler.spec.ts`: no-arg form emits `HELFMT` catalog mentioning all five topic IDs; each `hel <topic>` returns the topic body with the title as the first line; `hel quokka` returns `HEL_UNKNOWN` with the offending input echoed; case-insensitive match (`HEL Navigation`, `? NAVIGATION`); parametrised across both keywords (`hel`, `?`) confirming identical behaviour.
- [X] T022 [P] [US3] Snapshot test in `backend/test/game/commands/handlers/help.snapshot.spec.ts` pinning the exact line content of each of the five topic bodies, so future wording edits are deliberate.

### Implementation for User Story 3

- [X] T023 [P] [US3] Create the typed help catalog in `backend/src/game/commands/help/help-topics.ts` exporting `HelpTopicId` union, `HelpTopic` interface, frozen `HELP_TOPICS` record, and `HELP_TOPIC_IDS` array. Topic command coverage per `contracts/help-command.md`. Tone wiki-faithful where wiki coverage exists.
- [X] T024 [US3] Create `HelpHandlerService` in `backend/src/game/commands/handlers/help.handler.ts` implementing both forms; topic match is case-insensitive; lines are emitted as `info` category. Reference `GECMDS.C` cmd_help in JSDoc.
- [X] T025 [US3] Register `HelpHandlerService` under both `hel` and `?` keywords (minArgs 0) in `backend/src/game/commands/commands.module.ts`.

**Checkpoint**: US1, US2, US3 all independently functional.

---

## Phase 6: User Story 4 — Clear Screen (Priority: P3)

**Goal**: `cls` clears only the issuing player's frontend event log via a `clearLog: true` directive on `CommandResult`. Zero backend mutation. Other players unaffected.

**Independent Test**: With a populated event log, dispatch `cls` from the input box → event log empties within one frame on the issuing client; backend ship/planet/sector state unchanged; a second connected client sees nothing.

### Tests for User Story 4 *(write first; ensure they FAIL before implementation)*

- [X] T026 [P] [US4] Unit test in `backend/test/game/commands/handlers/cls.handler.spec.ts`: handler returns `{ lines: [], clearLog: true }`; ship state snapshot before/after handler call is identical; extra arguments are accepted silently with the same result; also assert the returned CommandResult has no `broadcast` field and no room/socket directives, confirming cls is never emitted to other clients.
- [X] T027 [P] [US4] Frontend Vitest in `frontend/src/socket/__tests__/command-result-handlers.spec.ts`: given a `command:result` payload with `clearLog: true`, asserts `EventLog.clear()` is invoked exactly once after lines are appended; default-undefined results do NOT trigger clear (preserves existing behaviour).

### Implementation for User Story 4

- [X] T028 [US4] Create `ClsHandlerService` in `backend/src/game/commands/handlers/cls.handler.ts` returning `{ lines: [], clearLog: true }`. Pure handler, no service dependencies. JSDoc references `GECMDS.C:117 cmd_cls`.
- [X] T029 [US4] Register `ClsHandlerService` (keyword `cls`, minArgs 0) in `backend/src/game/commands/commands.module.ts`.
- [X] T030 [US4] Expose a `clear()` callable on the existing `EventLog` component in `frontend/src/components/EventLog.tsx` (e.g., via `useImperativeHandle`/ref or a store action — match existing component pattern).
- [X] T031 [US4] Honour the `clearLog` directive in `frontend/src/socket/command-result-handlers.ts`: after appending `result.lines`, if `result.clearLog === true`, invoke `EventLog.clear()`. Other-result payloads remain unaffected.

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T032 [P] Update `docs/PROGRESS.md` with the 016-navigation-spy entry per CLAUDE.md format (Completed / Tests / Decisions made / Next / Known issues). Known issues: A1 — FR-013 spy removal mechanic not implemented; spyowner cleared only by overwrite. Needs explicit resolution before feature 014 (planet attack) ships, as ownership changes may need to clear spyowner. Reference: GECMDS.C cmd_spy.
- [X] T033 [P] Update `docs/GAME_MECHANICS.md` adding sections for Autopilot, Spy, Help, and Clear-Screen, each with `@see GECMDS.C:<line>` references and a note on the autopilot enhancement (research D1).
- [X] T034 [P] Update `docs/DECISIONS.md` with entries for D1 (`holdcourse` boolean reuse), D3 (spy intel reveal at scan render), and D4 (`cls` directive shape).
- [X] T035 [P] Update `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md` to mention `navTargetX`/`navTargetY` on Ship and the autopilot tick branch in `PhysicsTickService`.
- [X] T036 Run the `quickstart.md` end-to-end smoke test against a local stack; record any deltas in PROGRESS.md `Known issues`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001 and T002 are independent (different files) and can run in parallel.
- **Foundational (Phase 2)**: T003→T004→T005→T006 are sequential (schema → migration → state types → mappers all touch the same chain). T007 and T008 are [P] — independent files.
- **US1 (Phase 3)**: depends on Phase 2 (T003–T007) being complete.
- **US2 (Phase 4)**: depends on Phase 2 (T007 for messages; nothing from US1).
- **US3 (Phase 5)**: depends only on T002 (CommandResult shape) and T007 (messages).
- **US4 (Phase 6)**: depends only on T002 (CommandResult shape).
- **Polish (Phase 7)**: depends on US1–US4 being complete (whichever subset is being shipped).

### User Story Dependencies

- US1 (P1, MVP), US2 (P2), US3 (P2), US4 (P3) are all independently testable. None imports another's handler.
- US2 touches `scan.handler.ts` (T020) — confirm no merge conflict with concurrent US1 work (different file).

### Within Each User Story

- Tests (T009–T011, T016–T017, T021–T022, T026–T027) MUST be written and FAIL before the corresponding implementation tasks.
- Within US1: handler (T012) before router registration (T013) before tick branch (T014) before manual-cancel preambles (T015) — only T013 strictly depends on T012; T014 and T015 can begin once T012 lands.

### Parallel Opportunities

- Phase 1: T001 ∥ T002.
- Phase 2: T007 ∥ T008 (after T006 completes for state-shape correctness, but actually T007/T008 don't depend on T003–T006 — they can start immediately after T002).
- Tests within a story: T009 ∥ T010 ∥ T011; T016 ∥ T017; T021 ∥ T022; T026 ∥ T027.
- Across stories (after Phase 2): US1 ∥ US2 ∥ US3 ∥ US4 by separate developers — different handler files, different test files. Only T020 (scan handler edit) and T015 (rot/imp/war preambles) touch existing shared code, so coordinate those merges.
- Phase 7: T032 ∥ T033 ∥ T034 ∥ T035 (different doc files).

---

## Parallel Example: User Story 1

```bash
# Tests first, in parallel:
Task: "T009 nav handler unit tests in backend/test/game/commands/handlers/nav.handler.spec.ts"
Task: "T010 autopilot integration test in backend/test/game/tick/nav-autopilot.integration.spec.ts"
Task: "T011 cancel integration test in backend/test/game/tick/nav-cancel.integration.spec.ts"

# Then implementation, mostly sequential because of router registration ordering:
Task: "T012 NavHandlerService in backend/src/game/commands/handlers/nav.handler.ts"
Task: "T013 register nav in backend/src/game/commands/commands.module.ts"
# T014 and T015 can run in parallel once T012 lands:
Task: "T014 autopilot tick branch in backend/src/game/physics/physics-tick.service.ts"
Task: "T015 cancel preamble in rot/imp/war handlers"
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1 + Phase 2 (foundation).
2. Phase 3 (US1 — autopilot).
3. Validate against `quickstart.md` §3 and the US1 independent test.
4. Ship.

### Incremental Delivery

1. Foundation → US1 (MVP, ship).
2. US3 (`hel`/`?`) — onboarding-critical, lowest risk.
3. US2 (`spy`) — unlocks strategic play before planet-attack.
4. US4 (`cls`) — quality-of-life polish.
5. Final docs sweep (Phase 7).

### Parallel Team Strategy

After Phase 2 lands:

- Dev A: US1 (largest scope — handler + tick + cancel preambles).
- Dev B: US2 (handler + scan reveal extension).
- Dev C: US3 + US4 (smallest two; both are mostly additive).
- Coordinate merges of `commands.module.ts`, `messages.ts`, and the rot/imp/war handlers.

---

## Notes

- [P] tasks = different files, no incomplete dependencies.
- Every new handler must include a JSDoc `@see GECMDS.C:<line> <function>` reference (Constitution Principle IV).
- Verify each test fails before its corresponding implementation lands (TDD — Constitution Principle II).
- Commit after each task or each tightly-coupled group (e.g., schema + migration together).
- Stop at any checkpoint to validate the active story independently.
- Avoid: editing prior Prisma migrations (Constitution Principle IV); adding `@Interval` for the autopilot branch (Principle III — the existing physics tick is the single tick source).
