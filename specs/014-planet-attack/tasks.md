---

description: "Task list for feature 014 — Planet Attack Commands"
---

# Tasks: Planet Attack Commands

**Input**: Design documents from `/specs/014-planet-attack/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/commands.md, contracts/combat-math.md, quickstart.md

**Tests**: MANDATORY per Constitution II. Each handler unit-tested; combat math gets deterministic-`gernd` trace tests; the `attack_fig` ratio bug gets a dedicated preservation test; balance-regression tests pin the six DI defaults.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)

## Path Conventions

Web app — backend only. All paths under `backend/src/` and `backend/tests/`.

---

## Phase 1: Setup

**Purpose**: No new project scaffolding. Existing NestJS modules from features 001–013 are extended in place.

- [X] T001 Verify branch state and confirm no Prisma migration is required (read `backend/prisma/schema.prisma`, confirm `Planet`, `Ship`, `WarUser`, `MailStat` shapes match `data-model.md`); record findings in `specs/014-planet-attack/PROGRESS.md` if any drift detected.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting infrastructure all five stories depend on — DI tokens, `rndm` helper, MessageId additions, mail templates.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Create `backend/src/game/commands/attack.config.ts` exposing six DI tokens (`PLATTRT1`, `PLATTRT2`, `PLATTRF1`, `PLATTRF2`, `PLATTRF3`, `FIRETICKS`) with defaults from research.md D2 (`0.05` for PLATTR*, `10` for FIRETICKS), env-var overrides matching the `CLOAK_ENERGY_USE` pattern from feature 013.
- [X] T003 [P] Create `backend/src/game/commands/_attack-constants.ts` with compile-time-only constants: `ITEM_DESTRUCTION_RANGE = 15` (gernd()%15 → 0..14), `MAIL_CLASS_DISTRESS` re-export, attack-kind enum (`AttackKind.TROOP`, `AttackKind.FIGHTER`).
- [X] T004 [P] Add `rndm(n: number): number` helper to `backend/src/game/combat/random.port.ts` per research.md D5: returns `(gernd() / GERND_MAX) * n` as floating-point in `[0, n)`.
- [X] T005 [P] Extend `MessageId` enum and `messages.ts` with new ids: `ATT_NOT_ORBIT`, `ATT_NO_CAPABILITY`, `ATT_WORMHOLE`, `ATT_SELF`, `ATT_FORMAT`, `ATT_NO_TROOPS`, `ATT_NO_FIGHTERS`, `ATT_DEFENDER_FIGHTER_KILL`, `ATT_GROUND_TROOP_KILL`, `ATT_ATTACKER_COUNTER_KILL`, `ATT_LOSS_REPORT`, `ATT_WIN_TROOP`, `ATT_WIN_FIGHTER`, `ATT_RETREAT`, `ATT_STANDOFF`, `ATT_ITEM_DESTROYED`, `ATT_RESOLVED`, `ATT_OWNER_ALERT`, `ATT_GROUND_AA`, `MESG02`, `MESG03`, `MESG04`, `MESG05`, `PLN_HEADER`, `PLN_NONE`, `MAINT2`, `MAINT3`. Mail body templates from research.md D3.
- [X] T006 [P] Create `backend/src/game/planet/planet-attack.types.ts` with `AttackOutcome` (kill1, kill2, left1, left2, won, itemsDestroyed[]) and re-export `AttackKind` from `_attack-constants.ts`.
- [X] T007 Create unit test `backend/tests/game/combat/random.port.spec.ts` (or extend existing) for `rndm(n)` — verify uniform distribution bounds `[0, n)` and deterministic output for a fixed `gernd` seed. Test MUST be written before T004 implementation passes (TDD).
- [X] T008 Wire `attack.config.ts` providers into `backend/src/game/commands/commands.module.ts` (add to `providers` array; export tokens for handler injection).

**Checkpoint**: Foundation ready — DI tokens registered, `rndm` available, MessageIds defined. User stories may now proceed in parallel.

---

## Phase 3: User Story 1 — Assault an enemy planet with troops (Priority: P1) 🎯 MVP

**Goal**: A captain in orbit can issue `att N troops` to invade a foreign planet; combat resolves with kills on both sides, ownership transfers on dominance, surviving troops return to cargo, planet owner receives mail/alert.

**Independent Test**: Two captains, one orbiting the other's planet. Attacker types `att 1000 troops`. Verify cargo deduction, combat narration in source order, defender attrition, planet flushed to DB, owner notification (alert if online, MESG02/03 mail). Repeat with overwhelming numbers and verify ownership transfer + `WarUser.planets++`.

### Tests for User Story 1 *(write first, ensure they FAIL)*

- [X] T009 [P] [US1] Handler unit test `backend/tests/game/commands/handlers/attack.handler.spec.ts` covering all preconditions for the troop branch: not-in-orbit (FR-014-001), `max_attk == 0` (FR-014-002), wormhole rejection (FR-014-003), self-attack (FR-014-004), neutral-zone zap delegation (FR-014-005), bad arg shape (FR-014-006), zero/insufficient troop cargo (FR-014-007).
- [X] T010 [P] [US1] Combat math trace test `backend/tests/game/planet/attack-troop-math.spec.ts` — deterministic `gernd` seed; assert `kill1`, `kill2`, `left1`, `left2`, `won`, items-destroyed match a hand-traced reference for at least: (a) standoff (`ratio <= 2`) — assert `WarUser.planets` is unchanged; (b) dominance win (`left2 < left1/4`) — assert `WarUser.planets` increments by exactly 1; (c) retreat (`left1 < left2/4`, defectors added to planet) — assert `WarUser.planets` is unchanged; (d) full-wipe win (`left2==0 && fighters==0`); (e) high-ratio item destruction (`ratio>2 && left1>left2/2`); (f) write-count: assert `PlanetStateService` flush is called exactly once per resolution, including on rejection paths (no flush on precondition failure, exactly one flush on any combat resolution regardless of outcome). Each branch maps to combat-math.md steps.
- [X] T011 [P] [US1] Concurrent-attack test `backend/tests/game/commands/handlers/attack-concurrent.spec.ts` — two simulated attackers acquire the per-planet mutex sequentially; second attacker re-validates and rejects via self-attack after first capture; assert no cargo deduction on rejection (research.md D1).
- [X] T012 [P] [US1] CommandRouter dispatch test `backend/tests/game/commands/handlers/attack.dispatch.spec.ts` — verifies `CommandRouterService` dispatches `"att"` to `AttackHandler`. Match the `*.dispatch.spec.ts` pattern from features 011–013.
- [X] T013 [P] [US1] Owner-alert + spy-mail test `backend/tests/game/planet/call-for-help.spec.ts` (troop branch cases) — assert: (a) alert emitted to `user:${ownerUserid}` room when owner online, (b) silent drop when room empty, (c) spy mail queued iff `spyowner` set AND (`won==1` OR `gernd()%6==0`) AND `sendSpyMail` true (FR-014-029a, research.md D4).
- [X] T014 [P] [US1] Mail-path test (troop branch cases) inside `attack.handler.spec.ts` or a dedicated `attack-mail.spec.ts`: MESG02 inserted on `ratio>1 && won==0`, MESG03 on `ratio>1 && won==1`; payload fields (planet name, xsect, ysect, num, ship name, attacker userid) verified; `class = MAIL_CLASS_DISTRESS`.
- [X] T015 [P] [US1] Balance regression test `backend/tests/game/planet/planet-attack-balance.spec.ts` (troop coefficients) — asserts `PLATTRT1`, `PLATTRT2`, `FIRETICKS` resolve to the canonical defaults from research.md D2.

### Implementation for User Story 1

- [X] T016 [P] [US1] Create `backend/src/game/planet/planet-attack.service.ts` with `attackTroop(num, ship, planet): AttackOutcome` implementing combat-math.md steps 1–10 verbatim (defender fighters fire → ground troops → ratio counter-kill → cap → outcome → item destruction → persist → call-for-help → mail → ownership transfer). Use injected `PLATTRT1`, `PLATTRT2`, `FIRETICKS`, `gernd`, `rndm`. JSDoc references GECMDS.C:3580–3750.
- [X] T017 [US1] Add `callForHelp(planet, ship, kind, num, won, sendSpyMail)` private method (or `CallForHelpService` per plan.md consolidation note) implementing research.md D4: alert via `user:${ownerUserid}` room when online; spy-mail roll iff three conditions hold. Add `MailStatService` insert path call.
- [X] T018 [US1] Wire `PlanetAttackService` into `backend/src/game/planet/planet.module.ts` providers; ensure it can resolve `PlanetStateService` (for the per-planet mutex via `withPlanetLock`), `ShipStateService`, `MailStatService`, `WarUserService`, `RandomPort`, and the six DI tokens.
- [X] T019 [US1] Create `backend/src/game/commands/handlers/attack.handler.ts` with troop dispatch only (fighter branch wired in US2). Steps: parse `margc==3 && genearas("tro", margv[2])`; run preconditions in source order (FR-014-001..007); acquire per-planet mutex via `PlanetStateService.withPlanetLock(plnum, fn)`; INSIDE the lock, re-run preconditions, set `ship.hostile = ship.where`, `ship.cantexit = FIRETICKS`, deduct `ship.items[I_TROOPS].qty -= num`, call `planetAttackService.attackTroop(...)`, emit narration lines from the `AttackOutcome`. JSDoc → GECMDS.C:3515 cmd_attack.

  **Mutex re-validation scope**: Inside the lock, re-validate ONLY state-dependent preconditions: orbit (`ship.where`), self-attack (`planet.userid`), and cargo quantity. Static preconditions (`max_attk`, wormhole, neutral-zone zap) MUST NOT re-run inside the lock — they were evaluated before lock acquisition and have no new state to check.
- [X] T020 [US1] Register `AttackHandler` in `backend/src/game/commands/commands.module.ts` providers and route `"att"` in `CommandRouterService`.
- [X] T021 [US1] Update `docs/PROGRESS.md`, `docs/GAME_MECHANICS.md`, and `docs/ARCHITECTURE.md` with US1 troop-attack entry citing GECMDS.C:3515 / 3580–3750 / 3996.

**Checkpoint**: At this point, US1 is fully functional. A captain can attack with troops, capture planets, owners receive notifications. MVP is complete.

---

## Phase 4: User Story 2 — Assault an enemy planet with fighters (Priority: P1)

**Goal**: A captain in orbit can issue `att N fighters` to launch a fighter assault. Defender fighters return-fire, ground anti-air may fire if `troops > 500`, surviving fighters return to cargo. Win if `left2==0 && troops < 5`.

**Independent Test**: Captain A in orbit, planet with both fighters and >500 troops. `att 500 fighters`. Verify ground-troop shootdown roll, defender return-fire, narration order, surviving fighters returned. Repeat with planet `troops < 5` and verify win + ownership transfer + MESG05. Defender-fighterless planet exercises the bug-preservation path.

### Tests for User Story 2 *(write first, ensure they FAIL)*

- [X] T022 [P] [US2] Extend `attack.handler.spec.ts` with fighter-branch precondition coverage: zero/insufficient fighter cargo (FR-014-007 fighter variant) and fighter `genearas("fig", arg)` parsing.
- [X] T023 [P] [US2] Combat math trace test `backend/tests/game/planet/attack-fighter-math.spec.ts` — deterministic `gernd` seed; assert math for: (a) ground anti-air fires when `troops>500 && (gernd()%5-1)>0` (FR-014-020), (b) defender return-fire (FR-014-021), (c) attacker counter-kill gated by `ratio>1` (FR-014-022), (d) high-ratio item destruction `ratio>5` (FR-014-023), (e) win condition `left2==0 && troops<5` (FR-014-024).
- [X] T024 [P] [US2] **Bug-preservation test** in `attack-fighter-math.spec.ts` (or `attack-fighter-bug.spec.ts`): assert that with `left2 == 0` (defenders had no fighters), `ratio == 0` and therefore: NO ground-fire, NO defender return-fire, NO counter-kill, NO item destruction, NO mail, NO alert, NO win unless `troops<5`. Test MUST FAIL if someone "fixes" the bug (FR-014-019, SC-008).
- [X] T025 [P] [US2] Extend dispatch test `attack.dispatch.spec.ts` to assert fighter-branch routing.
- [X] T026 [P] [US2] Extend `call-for-help.spec.ts` with fighter-branch cases: trigger gated by `ratio>1 || won==1` (FR-014-029); spy-mail roll same gate as troop.
- [X] T027 [P] [US2] Extend mail-path coverage: MESG04 on `(ratio>2 || won==1) && won==0`, MESG05 on `won==1`. NO mail when `ratio<=2 && won==0`.
- [X] T028 [P] [US2] Extend `planet-attack-balance.spec.ts` with `PLATTRF1`, `PLATTRF2`, `PLATTRF3` default assertions.

### Implementation for User Story 2

- [X] T029 [US2] Add `attackFighter(num, ship, planet): AttackOutcome` to `planet-attack.service.ts` implementing combat-math.md steps 1–11 verbatim, INCLUDING the documented `ratio = (left2>0) ? (left1/left2)*100 : 0` quirk (no zero-guard "fix"). Floating-point ratio (distinct from troop's integer ratio). JSDoc → GECMDS.C:3788–3950 with explicit comment marking FR-014-019 / SC-008.
- [X] T030 [US2] Extend `attack.handler.ts` to dispatch the fighter branch when `genearas("fig", margv[2])`. Same precondition order; same per-planet mutex flow; deduct from `I_FIGHTER`; call `attackFighter`. Combine with troop branch via shared precondition path; only the deduction-source and math-fn differ.
- [X] T031 [US2] Update `docs/PROGRESS.md` and `docs/GAME_MECHANICS.md` with US2 fighter-attack entry, calling out the preserved `attack_fig()` ratio bug and citing GECMDS.C:3788.

**Checkpoint**: Both US1 and US2 work independently. Full `att` command is now feature-complete.

---

## Phase 5: User Story 3 — List the planets I own (Priority: P2)

**Goal**: A captain types `pln` and receives a tabular list of every planet bearing their userid.

**Independent Test**: Seed three planets owned by the calling captain plus several owned by others. `pln` returns exactly those three rows sorted by `plnum` ascending with name/xsect/ysect/plnum columns. Empty-state path returns the no-planets-owned message.

### Tests for User Story 3 *(write first, ensure they FAIL)*

- [X] T032 [P] [US3] Handler unit test `backend/tests/game/commands/handlers/pln.handler.spec.ts` — owner with N planets returns N rows sorted by `plnum` ASC; owner with zero planets returns `PLN_NONE`; assert NO state mutation and NO writes (FR-014-040..042).
- [X] T033 [P] [US3] Extend `attack.dispatch.spec.ts` (or add `pln.dispatch.spec.ts`) to assert `"pln"` routes to `PlnHandler`.
- [X] T034 [P] [US3] Performance assertion in `pln.handler.spec.ts` — seed 50 owned planets in a 500-planet galaxy; assert handler completes in < 200 ms (SC-005). Use `performance.now()` bracketing.

### Implementation for User Story 3

- [X] T035 [P] [US3] Create `backend/src/game/commands/handlers/pln.handler.ts` — Prisma query `findMany({ where: { userid }, select: { name, xsect, ysect, plnum }, orderBy: { plnum: 'asc' } })`. Empty → `PLN_NONE`. Otherwise emit `PLN_HEADER` then one formatted row per planet (`%-20s  (%2d,%2d)  #%3d`). JSDoc → GECMDS.C `cmd_pln`. Read-only handler.
- [X] T036 [US3] Register `PlnHandler` in `commands.module.ts` providers; route `"pln"` in `CommandRouterService`.
- [X] T037 [US3] Update `docs/PROGRESS.md` with US3 entry.

**Checkpoint**: US3 works independently — captains can list owned planets.

---

## Phase 6: User Story 4 — Show prices at the orbited planet (Priority: P2)

**Goal**: `pri` returns price quotes at the orbited planet without modifying state. Bare `pri` lists every sellable item; `pri N <item>` quotes the total cost using `baseprice` for owners, `markup2a` for foreigners, gated by the full feature-005 buy precondition ladder.

**Independent Test**: Seed planet with known item quantities and markups. Owner-captain types `pri 100 men` → PRICE1 quote with baseprice. Foreign captain (sell flag 'Y') → PRICE1 with markup2a. Run all six precondition-failure paths (BUY7/BUY5/BUY4/BUY8/BUY3/BUY2) and verify the correct rejection in each case. Bare `pri` lists every item.

### Tests for User Story 4 *(write first, ensure they FAIL)*

- [X] T038 [P] [US4] Handler unit test `backend/tests/game/commands/handlers/price.handler.spec.ts` — six-precondition ladder (BUY7/BUY5/BUY4/BUY8/BUY3/BUY2) one assertion per failure; happy path for owner (`baseprice * N`) and foreign caller (`markup2a * N`); BUY1 not-in-orbit; PRICEFMT for malformed args (FR-014-050..053, SC-006).
- [X] T039 [P] [US4] Bare-`pri` listing test in `price.handler.spec.ts` — iterates every item with `sell == 'Y'`, emits one PRICE1 line per sellable item; uses owner-pricing if captain is the owner (FR-014-052).
- [X] T040 [P] [US4] Read-only assertion test — verify no DB writes and no in-memory mutations occur for any `pri` invocation (success or failure).
- [X] T041 [P] [US4] Extend dispatch test to assert `"pri"` routes to `PriceHandler`.

### Implementation for User Story 4

- [X] T042 [P] [US4] Create `backend/src/game/commands/handlers/price.handler.ts` — read planet items from `PlanetStateService.get(xsect, ysect, plnum)` (research.md D9); cash from `ShipStateService.get(shipId).cash` (in-memory, matching the feature-005 buy/sell pattern). Bare path: iterate `kwrd[]` and emit one PRICE1 per sellable item. Quoted path: run precondition ladder in source order (BUY1 → arg shape → BUY7 → BUY5 → BUY4 → BUY8 → BUY3 → BUY2), then emit PRICE1. JSDoc → GECMDS.C:4284 cmd_price.
- [X] T043 [US4] Register `PriceHandler` in `commands.module.ts` providers; route `"pri"` in `CommandRouterService`.
- [X] T044 [US4] Update `docs/PROGRESS.md` and `docs/GAME_MECHANICS.md` with US4 entry.

**Checkpoint**: US4 works independently — captains can quote item prices without committing.

---

## Phase 7: User Story 5 — Maintenance requires the planet password (Priority: P2)

**Goal**: `mai` on a passworded planet (any value other than literal `"none"`) requires the captain to supply the matching password as an argument. `MAINT2` if missing, `MAINT3` if wrong, otherwise the existing feature-013 maintenance flow runs unchanged.

**Independent Test**: Seed a planet with `password = "secret"`, valid maintenance preconditions. `mai` (no arg) → MAINT2, no cash debit. `mai wrong` → MAINT3, no cash debit. `mai secret` → existing maintenance proceeds, cash debited. Re-seed with `password = "none"` and verify bare `mai` works with or without arg.

### Tests for User Story 5 *(write first, ensure they FAIL)*

- [X] T045 [P] [US5] Test `backend/tests/game/commands/handlers/maint-password.spec.ts` — four password-state combinations: (a) no arg + passworded planet → MAINT2 + cash unchanged (FR-014-060), (b) wrong arg → MAINT3 + cash unchanged (FR-014-061), (c) correct arg (case-insensitive `sameas`) → existing maintenance proceeds (FR-014-063), (d) `password == "none"` → bypass gate regardless of arg (FR-014-062). SC-007 zero-deduction assertion on every rejection path.
- [X] T046 [P] [US5] Order-preservation test — assert the new password gate fires AFTER FR-209 (neutral zone) and BEFORE FR-204 (no damage), matching research.md D10. Seed a planet that fails BOTH (e.g., neutral zone AND missing password) — neutral-zone error MUST emit, not MAINT2.

### Implementation for User Story 5

- [X] T047 [US5] Modify `backend/src/game/commands/handlers/maint.handler.ts` — insert FR-014-060/061/062 password gate between the existing FR-209 (neutral zone) and FR-204 (no damage) checks. Use existing `sameas` helper for case-insensitive comparison; literal `"none"` sentinel bypasses the gate. JSDoc reference GECMDS.C:4471 (MAINT2), 4479 (MAINT3).
- [X] T048 [US5] Update `docs/PROGRESS.md` to mark FR-210 (carried over from feature 013) as closed; add US5 entry.

**Checkpoint**: US5 closes feature 013's deferred FR-210. All five user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, full-suite verification, and quickstart smoke.

- [X] T050 [P] Update `docs/ARCHITECTURE.md` module map: add `PlanetAttackService` under `game/planet/`, the three new handlers under `game/commands/handlers/`, and the `attack.config.ts` DI surface. (Balance regression coverage for all six DI defaults is provided by T015 + T028 — no consolidated balance task needed.)
- [X] T051 [P] Update `docs/DECISIONS.md` with: (a) per-planet mutex re-validation choice (D1), (b) PLATTR* DI default justification (D2), (c) `attack_fig` ratio-bug preservation rationale (FR-014-019, SC-008), (d) `mai` password-gate ordering (D10).
- [X] T052 Run the full backend Jest suite (`pnpm --filter backend test`); all suites green; resolve any incidental failures.
- [ ] T053 Execute the manual quickstart in `quickstart.md` (steps 0–8) end-to-end against a local backend; record pass/fail per step in `specs/014-planet-attack/PROGRESS.md`.
- [ ] T054 Final commit prep — `git status` clean apart from feature changes; ensure no Prisma migration was inadvertently created (no schema changes per plan.md).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. **BLOCKS all user stories** — DI tokens and `rndm` are consumed by every story's tests and implementation.
- **US1 (Phase 3)**: Depends on Foundational. MVP candidate.
- **US2 (Phase 4)**: Depends on Foundational. Shares the `attack.handler.ts` and `planet-attack.service.ts` files with US1 — recommended to land US1 first to minimize merge friction; can run in parallel by a different developer with care.
- **US3 (Phase 5)**: Depends on Foundational only. Fully independent of US1/US2.
- **US4 (Phase 6)**: Depends on Foundational only. Fully independent.
- **US5 (Phase 7)**: Depends on Foundational only. Edits a feature-013 file but no overlap with US1/US2/US3/US4 surface.
- **Polish (Phase 8)**: Depends on all desired user stories.

### User Story Dependencies

- **US1**: No dependencies on other stories.
- **US2**: Shares `attack.handler.ts` and `planet-attack.service.ts` with US1; functionally independent (separate combat math fn, separate cargo source) but file-level conflict — sequence US1 → US2 if a single developer.
- **US3, US4, US5**: All file-level independent of each other and of US1/US2. Fully parallelizable.

### Within Each User Story

- Tests (Phase 3/4/5/6/7 *Tests* sections) MUST be written and FAIL before implementation.
- Models/types (data-model.md) before services.
- Services before handlers.
- Handlers before module wiring.
- Module wiring before docs update.

### Parallel Opportunities

- All Foundational [P] tasks (T002, T003, T004, T005, T006) can run in parallel.
- All US1 [P] tests (T009–T015) can run in parallel.
- All US2 [P] tests (T022–T028) can run in parallel.
- US3, US4, US5 can be developed entirely in parallel by three developers once Foundational is done.
- Polish T050/T051 can run in parallel.

---

## Parallel Example: Foundational Phase

```bash
# Launch all foundational [P] tasks together:
Task: "Create attack.config.ts with six DI tokens" (T002)
Task: "Create _attack-constants.ts" (T003)
Task: "Add rndm(n) to random.port.ts" (T004)
Task: "Extend MessageId enum and messages.ts" (T005)
Task: "Create planet-attack.types.ts" (T006)
```

## Parallel Example: User Story 1 Tests

```bash
# Launch all US1 [P] tests together:
Task: "Handler precondition tests in attack.handler.spec.ts" (T009)
Task: "Combat math trace test in attack-troop-math.spec.ts" (T010)
Task: "Concurrent-attack mutex test" (T011)
Task: "Dispatch test attack.dispatch.spec.ts" (T012)
Task: "Owner-alert + spy-mail test call-for-help.spec.ts" (T013)
Task: "Mail-path test (MESG02/03)" (T014)
Task: "Balance regression for PLATTRT1/T2/FIRETICKS" (T015)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup
2. Phase 2: Foundational (CRITICAL — blocks all stories)
3. Phase 3: User Story 1 (troop attack — the headline endgame loop)
4. **STOP and VALIDATE**: Two-tab test from quickstart §4 — verify capture, mail, alert
5. Demo MVP — captains can capture planets via troop assault

### Incremental Delivery

1. Setup + Foundational → DI/helpers ready
2. US1 (troop attack) → MVP! End-to-end planet capture working
3. US2 (fighter attack) → second canonical attack mode + bug preservation
4. US3 (`pln`) → tabular owned-planets listing
5. US4 (`pri`) → pre-purchase price quotes
6. US5 (`mai` password gate) → closes feature-013 FR-210
7. Polish → full-suite green + quickstart pass

### Parallel Team Strategy

With three developers post-Foundational:
- Dev A: US1 → US2 (sequential — share files)
- Dev B: US3 + US4 (small, parallel by file)
- Dev C: US5

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The `attack_fig()` ratio bug (FR-014-019, SC-008) is **intentional fidelity** — the test in T024 fails if it is "fixed"
- No Prisma migration in this feature; no frontend changes
- All combat math traces to GECMDS.C with line anchors per research.md D7
