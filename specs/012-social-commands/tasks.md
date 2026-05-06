---
description: "Task list for feature 012-social-commands"
---

# Tasks: Social and Information Commands

**Input**: Design documents from `/specs/012-social-commands/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: MANDATORY per Constitution Principle II. Each handler ships with a Jest unit test plus an E2E round-trip through `CommandRouterService` / `GameGateway`. Tests are written before or alongside implementation.

**Organization**: Tasks are grouped by user story so each command can be implemented, tested, and merged independently after the foundational work lands.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependency)
- **[Story]**: Maps to user stories from spec.md (US1–US6)
- All paths are relative to the repo root

## Path Conventions

Backend-only NestJS additions per plan.md:

- Handlers: `backend/src/game/commands/handlers/`
- Helpers: `backend/src/game/commands/helpers/`
- Module / messages: `backend/src/game/commands/`
- Ship state types: `backend/src/game/ship/`
- Gateway: `backend/src/gateway/`
- Unit tests: `backend/test/unit/commands/`
- E2E tests: `backend/test/e2e/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the project structure for new handler files exists; no project-level scaffolding is needed (this feature is additive only).

- [X] T001 Verify `backend/src/game/commands/handlers/` and `backend/src/game/commands/helpers/` exist (created in feature 003); no new directories required.
- [X] T002 Confirm `ROSTER_MAX` env var convention is in `backend/.env.example` and add `ROSTER_MAX=20` if missing.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting types, helpers, message ids, and the `ShipState.teamcode` denormalisation that every user story below depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [P] Add optional `teamcode?: bigint` field to `ShipState` in `backend/src/game/ship/ship-state.types.ts`, with JSDoc referencing `specs/012-social-commands/research.md` D6.
- [X] T004 [P] Hydrate `ShipState.teamcode` from `User.teamcode` in `backend/src/game/ship/ship-state.service.ts` (or wherever ShipState is built from `Ship`/`User` rows on connect), so `dat`/`tea` can read it.
- [X] T005 [P] Extract the existing AI userid pattern from `PlayerScoreService` and `DroidTickService` into `backend/src/game/commands/helpers/ai-userid.ts`, exporting `isAiUserid(userid: string): boolean`. Update the two existing callers to import from the new helper. Add unit test `backend/test/unit/commands/helpers/ai-userid.spec.ts`. Remove the inline regex from both original locations.
- [X] T006 [P] Add new `MessageId` entries to `backend/src/game/commands/messages.ts` for: `WHO_HEADER`, `WHO_ROW`, `DAT_HEADER`, `DAT_LINE`, `DAT_NOT_FOUND`, `ROS_HEADER`, `ROS_ROW`, `MSG_USAGE_SEN`, `MSG_USAGE_FRE`, `MSG_SENT`, `FRE_HAIL`, `FRE_SECTOR`, `FRE_GALAXY`, `TEAM_NONE`, `TEAM_CURRENT`, `TEAM_LEFT`, `TEAM_JOINED`, `TEAM_NOT_FOUND` per `contracts/commands.md`.
- [X] T007 Extend the gateway broadcast loop in `backend/src/gateway/game.gateway.ts` to recognise the special rooms `hail` (broadcasts to all sockets, filtering cloaked recipients) and `galaxy` (broadcasts to all sockets unfiltered) emitted by the `sen` handler, plus the existing `sector:{x}:{y}` rooms; add unit/integration coverage in `backend/test/unit/gateway/game.gateway.broadcast.spec.ts`.
- [X] T008 Confirm channel-frequency thresholds (HAIL=0, SECTOR_MAX=19999, GALAXY_MIN=20000) are exported as named constants from `backend/src/game/commands/handlers/_freq-thresholds.ts` (new file) and add a balance-regression test `backend/test/unit/commands/freq-thresholds.spec.ts` that fails if any value changes (Constitution II).

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 — `who` lists active ships (Priority: P1) 🎯 MVP

**Goal**: Captains can see every active non-cloaked ship in the galaxy, sorted by shipname ascending case-insensitive, including their own ship.

**Independent Test**: Connect two players to the live game; from one terminal type `who`; confirm both ships appear with shipname/class/sector/kills. Cloak one ship; confirm it disappears from the listing.

### Tests for User Story 1

- [X] T009 [P] [US1] Unit test `backend/test/unit/commands/who.handler.spec.ts` covering: lists all active ships including self, excludes cloaked ships, sorts by shipname ascending case-insensitive, header line present, returns one row when alone (FR-001/-002/-003/-003a).

### Implementation for User Story 1

- [X] T010 [US1] Implement `WhoHandlerService` in `backend/src/game/commands/handlers/who.handler.ts` (Command keyword `who`, minArgs 0; reads `ConnectedShipsRegistry` + `ShipStateService`; emits header + per-ship `info` lines per `contracts/commands.md`).
- [X] T011 [US1] Register `WhoHandlerService` in `backend/src/game/commands/commands.module.ts` `onModuleInit()`.

### Dispatch + E2E for User Story 1

- [X] T012 [P] [US1] Add dispatch integration test for `who` in `backend/test/integration/commands/who.dispatch.spec.ts` round-tripping through `CommandRouterService.dispatch()` with two registry-resident ships.

**Checkpoint**: `who` is fully functional and testable independently.

---

## Phase 4: User Story 2 — `dat` inspects a specific ship (Priority: P1)

**Goal**: Captains can run `dat <fragment>` to scout a ship's full public stat block (class, sector, speed, heading, energy, damage, all 14 cargo slots, kills, score, team).

**Independent Test**: With two ships active, type `dat <partial-of-other-name>`; receive the target's full stat block including each of the 14 cargo slots. Cloak the target; the response becomes `Ship not found.`

### Tests for User Story 2

- [X] T013 [P] [US2] Unit test `backend/test/unit/commands/dat.handler.spec.ts` covering: case-insensitive substring match, self-match allowed, cloak filters as not-found, missing arg → usage error, no match → `Ship not found.`, all 14 cargo slots rendered, team name resolved when `teamcode` present (FR-004/-005/-006/-007).

### Implementation for User Story 2

- [X] T014 [US2] Implement `DatHandlerService` in `backend/src/game/commands/handlers/dat.handler.ts` (Command keyword `dat`, minArgs 1, argMissingMessage `"Usage: dat <ship-name-fragment>"`; resolves first match by walking registry; uses `PrismaService` to look up `Team.teamname` from `ShipState.teamcode`; renders the 14-slot cargo block per `contracts/commands.md`).
- [X] T015 [US2] Register `DatHandlerService` in `backend/src/game/commands/commands.module.ts`.

### Dispatch + E2E for User Story 2

- [X] T016 [P] [US2] Add dispatch integration test `backend/test/integration/commands/dat.dispatch.spec.ts` covering match, no-match, cloak-not-found, and missing-arg branches.

**Checkpoint**: User Stories 1 and 2 both work independently — the situational-awareness MVP is complete.

---

## Phase 5: User Story 3 — `ros` leaderboard (Priority: P2)

**Goal**: Captains can view the top human players ranked by score with deterministic tiebreakers, AI userids excluded, capped at `ROSTER_MAX` (default 20) or 200 with `ros all`.

**Independent Test**: Seed ≥25 human users plus a Cybertron and a Droid with mixed scores; run `ros`; confirm rows ordered by `score DESC, kills DESC, userid ASC`, capped at 20, with no AI userids. `ros all` returns up to 200.

### Tests for User Story 3

- [X] T017 [P] [US3] Unit test `backend/test/unit/commands/ros.handler.spec.ts` mocking `PrismaService` to verify: default cap 20, `ros all` cap 200, AI prefix exclusion (`Cybrg-`, `@Droid-`), sort order `score DESC, kills DESC, userid ASC`, header line, row formatting (FR-008/-009/-010/-011). Include a latency assertion: `RosHandlerService.execute()` completes in < 200 ms with a mocked `PrismaService` returning 1000 user rows (SC-001).

### Implementation for User Story 3

- [X] T018 [US3] Implement `RosHandlerService` in `backend/src/game/commands/handlers/ros.handler.ts` (Command keyword `ros`, minArgs 0; reads `ROSTER_MAX` from env via `ConfigService` defaulting to 20; uses `PrismaService.user.findMany` with the filter / orderBy / take from `data-model.md`).
- [X] T019 [US3] Register `RosHandlerService` in `backend/src/game/commands/commands.module.ts`.

### Dispatch + E2E for User Story 3

- [X] T020 [P] [US3] Add dispatch integration test `backend/test/integration/commands/ros.dispatch.spec.ts` seeding the test DB with mixed human + AI users and asserting rendered output across `ros` and `ros all`.

**Checkpoint**: Leaderboard available; US1/US2/US3 all independently functional.

---

## Phase 6: User Story 5 — `fre` tunes a frequency (Priority: P2)

**Goal**: Captains set channel A/B/C frequency: `hail` → 0, 1–19999 → sector, ≥20000 → galaxy. Numeric `0`, negatives, and non-integers are rejected. The change persists via the existing flush cycle.

**Independent Test**: Issue `fre b 5000`; observe sector-scoped confirmation. Wait > 1 SHIP_UPDATE heartbeat and confirm the row in Postgres reflects 5000 at index 1.

(Implemented before US4 because `sen` depends on `fre` being correct.)

### Tests for User Story 5

- [X] T021 [P] [US5] Unit test `backend/test/unit/commands/fre.handler.spec.ts` covering: `hail` → 0 + hail confirmation, `1`–`19999` → sector confirmation, `≥20000` → galaxy confirmation, explicit `0` rejected, negative rejected, non-integer rejected, bad channel letter rejected, `dirty` flag set on success (FR-017/-018/-019/-020/-021/-022).

### Implementation for User Story 5

- [X] T022 [US5] Implement `FreHandlerService` in `backend/src/game/commands/handlers/fre.handler.ts` (Command keyword `fre`, minArgs 2, argMissingMessage `"Usage: fre <A|B|C> <number|hail>"`; mutates `ship.freq[channelIndex]` and sets `ship.dirty = true`; uses thresholds from `_freq-thresholds.ts`).
- [X] T023 [US5] Register `FreHandlerService` in `backend/src/game/commands/commands.module.ts`.

### Dispatch + E2E for User Story 5

- [X] T024 [P] [US5] Add dispatch integration test `backend/test/integration/commands/fre.dispatch.spec.ts` covering each scope confirmation and each error branch.

**Checkpoint**: Frequencies are settable and persist through the flush cycle.

---

## Phase 7: User Story 4 — `sen` sends in-game messages (Priority: P2)

**Goal**: After `fre`, `sen <channel> <message>` broadcasts according to the sender's frequency: hail (all online, cloaked excluded), sector (1–19999), galaxy (≥20000). Messages are real-time only, never persisted, capped at 200 chars.

**Independent Test**: Set channel B to a sector frequency (e.g., 5000); place captain B in same sector and captain C elsewhere; `sen b Hi` from A; only B receives the `message.send` event. Repeat with hail and galaxy frequencies and confirm scoping.

### Tests for User Story 4

- [X] T025 [P] [US4] Unit test `backend/test/unit/commands/sen.handler.spec.ts` covering: hail produces `room: 'hail'` broadcast, sector produces `room: 'sector:{x}:{y}'`, galaxy produces `room: 'galaxy'`, unset freq treated as hail, missing message → usage error, message > 200 chars → usage error and zero broadcasts, sender does not appear in recipients, payload shape matches `contracts/websocket-events.md` (FR-012 through -016a).

### Implementation for User Story 4

- [X] T026 [US4] Implement `SenHandlerService` in `backend/src/game/commands/handlers/sen.handler.ts` (Command keyword `sen`, minArgs 2, argMissingMessage `"Usage: sen <A|B|C> <message>"`; joins remaining args into the message; resolves sender's `freq[channelIndex]` and emits a single `CommandResult.broadcasts` entry per `contracts/commands.md`; emits one `system` confirmation line back to sender).
- [X] T027 [US4] Register `SenHandlerService` in `backend/src/game/commands/commands.module.ts`.

### Dispatch + E2E for User Story 4

- [X] T028 [P] [US4] Add E2E test `backend/test/e2e/social-commands.e2e-spec.ts::sen` round-tripping through `GameGateway` with three connected sockets (sender + same-sector recipient + other-sector recipient) and asserting hail/sector/galaxy delivery rules including cloak-filter on hail.

**Checkpoint**: Real-time chat works across all three frequency scopes.

---

## Phase 8: User Story 6 — `tea` team affiliation (Priority: P3)

**Goal**: `tea` shows current team; `tea <name>` joins by exact case-insensitive name match; `tea leave` clears affiliation. Both `User.teamcode` and `ShipState.teamcode` are updated and a `player.snapshot` is rebroadcast.

**Independent Test**: Seed a `Pirates` team; from a fresh captain, `tea` → "not on a team"; `tea Pirates` → "joined"; verify `User.teamcode` row in Postgres and `ShipState.teamcode` in memory both updated, and `player.snapshot` arrives at the caller's socket; `tea leave` clears both.

### Tests for User Story 6

- [X] T029 [P] [US6] Unit test `backend/test/unit/commands/tea.handler.spec.ts` covering: no-arg shows current (none and joined cases), exact case-insensitive match joins (writes User + ShipState, dirty true, broadcast emitted), prefix/substring matches do NOT join, `tea leave` clears both stores, non-existent team name → error with no state change (FR-023 through -028).

### Implementation for User Story 6

- [X] T030 [US6] Implement `TeaHandlerService` in `backend/src/game/commands/handlers/tea.handler.ts` (Command keyword `tea`, minArgs 0; uses `PrismaService` for `Team.findFirst({ where: { teamname: { equals: name, mode: 'insensitive' } } })` and `User.update({ data: { teamcode } })`; mutates `ShipState.teamcode` + `dirty = true`; on successful join/leave emits a `broadcasts` entry `{ room: '__player_snapshot__', event: 'player.snapshot', payload: {} }` matching the existing sentinel pattern from `rename.handler.ts`).
- [X] T031 [US6] Register `TeaHandlerService` in `backend/src/game/commands/commands.module.ts`.

### Dispatch + E2E for User Story 6

- [X] T032 [P] [US6] Add E2E test `backend/test/e2e/social-commands.e2e-spec.ts::tea` covering join, leave, no-such-team, and asserting `player.snapshot` is rebroadcast (globally) on each successful join/leave.

**Checkpoint**: All six commands independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T033 [P] Update `docs/ARCHITECTURE.md` to add the six handlers under `backend/src/game/commands/handlers/` and the `message.send` gateway event.
- [X] T034 [P] Update `docs/PROGRESS.md` with feature 012 completion entry per CLAUDE.md format (Completed / Tests / Decisions made / Next / Known issues).
- [X] T035 [P] Update `docs/GAME_MECHANICS.md` documenting `who`/`dat`/`ros`/`sen`/`fre`/`tea` with `GECMDS.C` line references per Constitution Principle I.
- [X] T036 [P] Update `docs/DECISIONS.md` with D1 (admin-command reinterpretation) and D2 (`tea` subset) from `research.md`.
- [X] T037 Run full backend test suite (`npm test --workspace backend`) and confirm all existing command tests still pass (FR/SC-007 — no regressions). [1551 tests / 171 suites — all green]
- [ ] T038 Walk through `specs/012-social-commands/quickstart.md` end-to-end against a running dev stack and confirm every section passes; record any deviations.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: trivial verification — no blockers.
- **Foundational (Phase 2)**: depends on Phase 1; BLOCKS every user story.
- **User Stories (Phases 3–8)**: each depends only on Phase 2; otherwise independent.
- **Polish (Phase 9)**: depends on at least the user stories whose docs are being updated.

### User Story Dependencies

- **US1 `who`**: Foundational only. No story dependency.
- **US2 `dat`**: Foundational only. Independent of US1 (own registry walk).
- **US3 `ros`**: Foundational only. DB-only path, independent of registry-based stories.
- **US5 `fre`**: Foundational only. Sequenced before US4 because US4 depends on `fre` working in practice for E2E validation, but the *handlers* are independent — US4 unit tests stub `freq` directly.
- **US4 `sen`**: Foundational only at unit level; for the E2E walkthrough US5 should be merged so a real `fre` flow precedes `sen`.
- **US6 `tea`**: Foundational only.

### Within Each User Story

- Tests written before or alongside implementation — confirm they FAIL pre-implementation.
- Handler implementation → module registration → dispatch/E2E test.

### Parallel Opportunities

- Foundational: T003, T004, T005, T006 are different files and run in parallel; T007 and T008 follow.
- All six user stories can be developed in parallel by different developers once Phase 2 is done.
- Within a story, the unit-test task and the dispatch/E2E test task can run in parallel (marked `[P]`).
- Phase 9 doc tasks (T034–T037) all touch separate files — fully parallel.

---

## Parallel Example: Foundational Phase

```bash
Task: "Add ShipState.teamcode field in backend/src/game/ship/ship-state.types.ts"
Task: "Hydrate ShipState.teamcode from User.teamcode in ship-state.service.ts"
Task: "Create helpers/ai-userid.ts + spec"
Task: "Add new MessageId entries in commands/messages.ts"
```

## Parallel Example: User Story Burst (after Phase 2)

```bash
# Three developers, three stories in flight at once:
Task: "Implement who.handler.ts + tests (US1)"
Task: "Implement ros.handler.ts + tests (US3)"
Task: "Implement fre.handler.ts + tests (US5)"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 + Phase 2 — Foundational ready.
2. Phase 3 + Phase 4 — `who` and `dat` (both P1) — situational-awareness MVP.
3. Validate against quickstart §1 and §2; deploy/demo.

### Incremental Delivery

1. MVP (US1 + US2) → demo.
2. Add US3 `ros` → demo (leaderboard online).
3. Add US5 `fre` then US4 `sen` together → demo (chat online).
4. Add US6 `tea` → demo (teams online).
5. Phase 9 polish + docs.

### Parallel Team Strategy

- Team completes Phase 1 + Phase 2 together.
- Once Phase 2 lands, split: Dev A → US1+US2, Dev B → US3, Dev C → US5+US4, Dev D → US6.
- Re-converge for Phase 9 docs and the full-suite regression run.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- `[Story]` = traceability to spec.md user stories.
- Verify each unit/E2E test fails before implementing the handler it covers (TDD).
- Commit after each task or logical group; CLAUDE.md prohibits Co-Authored-By trailers.
- No Prisma migration is created in this feature (per plan.md / research.md D6).
- Channel-frequency thresholds (0 / 1–19999 / ≥20000) are constitutional — guarded by T008 balance regression test.
