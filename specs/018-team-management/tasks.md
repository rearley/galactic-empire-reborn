# Tasks: Team Management

**Input**: Design documents from `/specs/018-team-management/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/commands.md, quickstart.md

**Tests**: MANDATORY per project constitution (Principle II). Jest unit + integration tests written before or alongside implementation. Vitest is N/A — no frontend changes.

**Organization**: Tasks grouped by user story. US1 (`tea create`) and US2 (password-gated join) are both P1 and ship together as one coherent invite-only mechanism. US3 (`tea list`) is P2. US4 (roster team column) is P3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no shared dependency on incomplete work)
- **[Story]**: maps task to user story (US1, US2, US3, US4); blank for Setup/Foundational/Polish

---

## Phase 1: Setup

**Purpose**: Confirm working tree and that no global tooling changes are required for this feature.

- [X] T001 Verify on branch `018-team-management` and `backend/` deps are installed (`cd backend && npm ci` if needed); no new top-level dependencies are introduced by this feature.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: DB migration, new module skeleton, and shared parser/validator. **Required before any user story can begin.**

- [X] T002 Create new Prisma migration `team_name_unique_lower` via `cd backend && npx prisma migrate dev --name team_name_unique_lower`; edit the generated `backend/prisma/migrations/<timestamp>_team_name_unique_lower/migration.sql` to contain `CREATE UNIQUE INDEX "Team_teamname_lower_key" ON "Team" (LOWER("teamname")) WHERE "teamcount" >= 0;` per data-model.md §"New schema artifact". Do not modify `schema.prisma` (the index is SQL-only). Commit the generated migration directory.
- [X] T003 [P] Create `backend/src/game/team/team.module.ts` exporting a NestJS module that imports `PrismaModule` and provides+exports `TeamService` and `TeamRepository` (skeleton only — empty service body OK at this point).
- [X] T004 [P] Create `backend/src/game/team/team.types.ts` with `ParsedTeaArgs` ({ name: string; password: string }), `TeamListEntry` ({ rank, teamcode, teamname, members, score }), and `TeamCreateError` discriminated union covering all error outcomes from contracts/commands.md (`already_on_team`, `usage`, `name_too_long`, `password_too_long`, `password_has_space`, `name_taken`).
- [X] T005 [P] Create `backend/src/game/team/team-name.ts` with: (a) `parseTeaArgs(args: string[]): ParsedTeaArgs | { error: 'usage' }` — splits last token as password, joins preceding tokens as name, trims; (b) `validateName(name: string)` — non-blank, ≤30 chars; (c) `validatePassword(pw: string)` — non-blank, ≤8 chars, no whitespace. JSDoc each with `@see GECMDS.C:5277 cmd_team`.
- [X] T006 [US-FOUND] Add unit tests `backend/test/team/team-name.spec.ts` covering: parser with 0/1/2/3+ tokens, name trim with leading/trailing whitespace, **all-whitespace name** (`parseTeaArgs(["   ", "s3cret"])` → `{ error: 'usage' }` because the trimmed name is empty — guards spec edge case "Whitespace-only name", line 92), multi-word name joined by single spaces, name length validator (29/30/31 char boundary cases), password validator (empty, 8-char, 9-char, contains-space). Tests MUST fail until T005 is complete.
- [X] T007 [P] Create `backend/src/game/team/team.repository.ts` with method stubs: `findByNameLower(name)`, `insertTeam({ teamcode, teamname, password })`, `liveCountsGroupBy()`, `findTeamsByCodes(codes)`, `getMaxTeamcode()`. Implementations come in story phases.
- [X] T008 Register `TeamModule` in `backend/src/game/commands/commands.module.ts` imports so `TeamService` is injectable into `tea.handler.ts` and `ros.handler.ts`.

**Checkpoint**: Migration applied, module wired, parser/validator tested. User stories may begin.

---

## Phase 3: User Story 1 — Create a New Team (Priority: P1) 🎯 MVP (with US2)

**Goal**: A player not on a team can run `tea create <name…> <password>` to create a new team and become its first member.

**Independent Test**: Log in as a teamless player → `tea create Foo s3cret` → confirmation line shown → `tea` reports membership in "Foo" → `Team` row exists in DB with `teamcount=1`, `teamscore=0`, `password='s3cret'` → second `tea create Foo` from another player rejected with `Team name already taken.`

### Tests for User Story 1 *(write first, ensure they FAIL before implementation)*

- [X] T009 [P] [US1] Add unit tests in `backend/test/team/team.service.spec.ts` covering `TeamService.create()`: success allocates `MAX(teamcode)+1`, sets `User.teamcode`, mirrors `ShipState.teamcode`; **case preservation** — invoking `create({ name: "Galactic Raiders", ... })` results in the inserted `Team.teamname` being exactly `"Galactic Raiders"` (read back from the repository mock or in-memory store and assert byte-equal, NOT lowercased) per FR-006; rejects when caller already on a team; rejects on duplicate name (case-insensitive) by simulating Prisma `P2002` unique-violation error; bounded retry on race (max 3 attempts) — verified by mocking the repository to throw `P2002` once then succeed.
- [X] T010 [P] [US1] Add handler-level unit tests in `backend/test/team/tea.handler.spec.ts` for the `create` branch covering every output row in contracts/commands.md §"`tea create`" (success line, already-on-team, missing-name, missing-password, name-too-long, password-too-long, password-has-space, name-taken). Assert exact message strings and `category` values.

### Implementation for User Story 1

- [X] T011 [US1] Implement `TeamRepository.getMaxTeamcode()` (returns `0n` when table empty), `insertTeam({ teamcode, teamname, password })` (sets `teamcount=1`, `teamscore=0n`, `secret=""`, `flag=0`), and `findByNameLower(name)` in `backend/src/game/team/team.repository.ts`.
- [X] T012 [US1] Implement `TeamService.create({ ship, name, password })` in `backend/src/game/team/team.service.ts`: pre-check `ship.teamcode` is null/0; wrap `getMaxTeamcode()` + `insertTeam` + `User.update({ teamcode })` in `prisma.$transaction`; on `P2002` retry up to 3 times with a freshly fetched max; return `{ ok: true, teamcode, teamname }` on success or a typed `TeamCreateError` on failure. Mirror `ShipState.teamcode` and mark dirty after a successful tx (mirror pattern from feature 012's `tea` join — check `tea.handler.ts` for the existing snippet).
- [X] T013 [US1] Modify `backend/src/game/commands/handlers/tea.handler.ts` to add a `create` sub-branch routed when `args[0]?.toLowerCase() === 'create'`: call `parseTeaArgs(args.slice(1))`, run validators, call `TeamService.create`, map result to `CommandResult` lines exactly as in contracts/commands.md §"`tea create`". Emit the `player.snapshot` broadcast on success (same payload pattern as the existing join branch). Preserve all existing show/leave behaviour.
- [X] T014 [US1] Update `docs/GAME_MECHANICS.md` with a "Team creation" subsection citing `GECMDS.C:5277` and noting the auto-assigned `teamcode` deviation (spec lines 165–170).

**Checkpoint**: A teamless player can create a team end-to-end; duplicate-name protection works; tests for US1 pass.

---

## Phase 4: User Story 2 — Join a Team With Password (Priority: P1)

**Goal**: A teamless player can join an existing team only with the correct password; wrong/missing password is rejected.

**Independent Test**: With existing team `Galactic Raiders` / `s3cret`: (a) `tea Galactic Raiders` → falls through to existing show-current-team handler (NOT a join attempt with missing password); (b) `tea Galactic Raiders wrongpw` → `Wrong password.`; (c) `tea Galactic Raiders s3cret` → joined; (d) `tea Other s3cret` while already on a team → already-on-team error.

### Tests for User Story 2 *(write first, ensure they FAIL before implementation)*

- [X] T015 [P] [US2] Extend `backend/test/team/tea.handler.spec.ts` (same file as T010 — sequential after T010) with cases covering every output row in contracts/commands.md §"`tea <name…> <password>`": success, already-on-team, no-such-team, wrong-password. Assert case-insensitive name match AND case-sensitive password match. Add a single-token regression test (`tea Foo` → routes to existing show-current-team, NOT a missing-password rejection — guards FR-016a).
- [X] T016 [P] [US2] Extend `backend/test/team/team.service.spec.ts` with `TeamService.joinByPassword({ ship, name, password })` cases: returns `no_such_team` when name has no case-insensitive match, `wrong_password` when team exists but `team.password !== password`, success otherwise (updates `User.teamcode` and mirrors ShipState).

### Implementation for User Story 2

- [X] T017 [US2] Implement `TeamService.joinByPassword({ ship, name, password })` in `team.service.ts`: pre-check `ship.teamcode` is null/0 (return `already_on_team`); call `findByNameLower(name)`; if missing return `no_such_team`; if `team.password !== password` return `wrong_password` (case-sensitive, byte-equal); else `User.update({ teamcode })`, mirror ShipState, return success.
- [X] T018 [US2] Modify `tea.handler.ts` join branch (existing from feature 012): replace the bare-name lookup with `parseTeaArgs(args)`-based parsing. Routing: `args.length >= 2` AND `args[0].toLowerCase()` is none of `create | leave | list` ⇒ password-gated join via `TeamService.joinByPassword`. `args.length === 1` ⇒ keep existing show-current-team behaviour (FR-016a). Emit `player.snapshot` broadcast on successful join (existing pattern preserved).
- [X] T019 [US2] Confirm existing feature-012 tests for `tea leave` and `tea` (show) still pass; if a feature-012 test asserted the old single-token-join behaviour, update it to the new contract per FR-016a and note the behavioural change in `docs/PROGRESS.md`.

**Checkpoint**: Password-gated join works end-to-end; all error paths covered; single-token form preserved.

---

## Phase 5: User Story 3 — List All Teams (Priority: P2)

**Goal**: Any logged-in player can run `tea list` to see a leaderboard of non-empty teams (top 20, sorted by score desc, tie-break by teamcode asc).

**Independent Test**: Seed 3 teams with scores 50/200/100 and 1+ members each; run `tea list` → output lists all three in order 200, 100, 50 with rank/name/member-count/score columns. Add a 4th team with 0 members → still 3 listed. Drop all teams → `No teams have been formed.`

### Tests for User Story 3 *(write first, ensure they FAIL before implementation)*

- [X] T020 [P] [US3] Extend `backend/test/team/team.service.spec.ts` with `TeamService.list()` cases: empty DB returns empty array; 3 teams ordered by score desc; tie-break two equal-score teams by `teamcode` asc; 0-member team excluded; > 20 non-empty teams capped at 20; password field is NOT present on returned `TeamListEntry`.
- [X] T021 [P] [US3] Extend `backend/test/team/tea.handler.spec.ts` (sequential after T015) with `tea list` cases: header row exact match (`  Rank  Team                            Members  Score`); row format with rank-4/name-30/count-5/score-10 fixed widths; "No teams have been formed." for empty case.
- [X] T022 [P] [US3] Add a balance-regression test in `backend/test/team/team.service.spec.ts` asserting `TEAM_LIST_DISPLAY_CAP === 20`, `MAXTEAMS === 50` (`GEMAIN.H:240`), `MAX_TEAMNAME_LENGTH === 30` (`GEMAIN.H:307` `teamname[31]` = 30 + null terminator), and `MAX_TEAM_PASSWORD_LENGTH === 8` (FR-011a — documented deviation from original 10). Export each as a named constant from `team.types.ts` (or `team-name.ts` for the validators) so the test fails CI if any constant drifts.

### Implementation for User Story 3

- [X] T023 [US3] Implement `TeamRepository.liveCountsGroupBy()` (returns `Array<{ teamcode: bigint; count: number }>` via `prisma.user.groupBy({ by: ['teamcode'], where: { teamcode: { gt: 0n } }, _count: { _all: true } })`) and `findTeamsByCodes(codes)` (returns `{ teamcode, teamname, teamscore }` rows for the given codes). Exactly two Prisma queries — no N+1 (research D7).
- [X] T024 [US3] Implement `TeamService.list()` in `team.service.ts`: call `liveCountsGroupBy`, then `findTeamsByCodes` for codes whose count > 0, then in application code zip by teamcode, sort by `teamscore DESC, teamcode ASC`, slice to 20, attach 1-based rank. Return `TeamListEntry[]`. Export the `20` cap as named constant `TEAM_LIST_DISPLAY_CAP` for the regression test in T022.
- [X] T025 [P] [US3] Create `backend/src/game/team/team-render.ts` with `renderTeamList(entries: TeamListEntry[]): CommandLine[]` producing the header line and rows per contracts/commands.md §"`tea list`" (rank:4, name:30, count:5, score:10), or the single `info`-category "No teams have been formed." line when empty.
- [X] T026 [US3] Add the `list` sub-branch to `tea.handler.ts` (routed when `args.length === 1 && args[0].toLowerCase() === 'list'`) calling `TeamService.list()` then `renderTeamList()`. Place the dispatch BEFORE the join branch so `list` is not mis-parsed as a single-token name.

**Checkpoint**: `tea list` returns sorted, capped, live-counted leaderboard; empty teams hidden; tests pass.

---

## Phase 6: User Story 4 — Team Affiliation on Roster (Priority: P3)

**Goal**: `ros` output shows each player's team in a fixed-width 12-char column, with `---` for unaffiliated and `Name…` truncation for names > 12 chars.

**Independent Test**: Seed 3 players on team `Galactic Raiders` (>12 chars) and 2 with `User.teamcode = null`; run `ros` → first 3 rows show `Galactic R…` (11 chars + ellipsis, total 12); last 2 rows show `---` left-padded to 12; column appears between `UserID` and `Score`.

### Tests for User Story 4 *(write first, ensure they FAIL before implementation)*

- [X] T027 [P] [US4] Add unit tests `backend/test/team/ros.handler.spec.ts` covering: header includes `Team` column in the documented position; team name ≤12 chars padded to 12; team name >12 chars truncated to first 11 + `…`; `User.teamcode` null/0 → `---` left-padded to 12; `User.teamcode` references a deleted team → `---` (graceful fallback per spec edge case line 100).
- [X] T028 [P] [US4] Add a query-budget assertion in `ros.handler.spec.ts`: when rendering N users, the team-column code path performs at most ONE `team.findMany` (no N+1). Assert via mocked repository call counter.

### Implementation for User Story 4

- [X] T029 [US4] Add `renderTeamCell(teamname: string | null): string` to `backend/src/game/team/team-render.ts` implementing D6 (12-char fixed width, `---` placeholder, ellipsis truncation at 11 chars + `…`).
- [X] T030 [US4] Modify `backend/src/game/commands/handlers/ros.handler.ts`: after the existing `User` page query, collect distinct non-zero `teamcode`s, run a single `TeamRepository.findTeamsByCodes(codes)`, build a `Map<bigint, string>`. Insert the `Team` column between `UserID` and `Score` in both the header line and per-row rendering, using `renderTeamCell` against the map (passing `null` when teamcode is null/0/missing-from-map).
- [X] T031 [US4] Update `docs/GAME_MECHANICS.md` "Roster" section noting the new Team column and citing FR-024..FR-027 + research D6.

**Checkpoint**: All four user stories independently functional. The full feature is now testable end-to-end.

---

## Phase 7: Polish & Cross-Cutting

- [X] T032 [P] Add integration test `backend/test/team/team.integration.spec.ts` running against a real Postgres DB (per project pattern): (a) concurrent-create race via `Promise.all` over two `TeamService.create` calls with the same name — exactly one succeeds, one row in DB (FR-010, research D1); (b) full quickstart Scenario A (alice creates, bob joins, both visible in `tea list` with member count 2); (c) Scenario F (last member leaves → `tea list` reports "No teams have been formed." while the row persists).
- [X] T033 [P] Update `docs/ARCHITECTURE.md` to add the `game/team/` module entry under the NestJS module map with its responsibilities (create/join/list service, repository, render).
- [X] T034 [P] Update `docs/DECISIONS.md` with a `2026-05-08 — Team creation: auto-assigned teamcode + single plaintext password` entry summarising research D1, D3, D7.
- [X] T035 [P] Update `docs/PROGRESS.md` with a `2026-05-08 — feature 018 team-management` entry: completed scope, tests, deviations from feature 012 join behaviour (single-token form no longer attempts a join), known issues.
- [X] T036 [P] Update `docs/DATA_MODEL.md` to note the new `Team_teamname_lower_key` index and that `Team.secret` and `Team.flag` remain unused by feature 018.
- [X] T037 Run the full quickstart.md validation matrix (Scenarios A–F) against a local dev environment; record SC-001..SC-006 outcomes in `docs/PROGRESS.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: trivial — no blockers.
- **Phase 2 (Foundational)**: blocks all user stories. T002 (migration) blocks any DB-touching test. T003–T008 can be done in parallel after T002.
- **Phase 3 (US1)** and **Phase 4 (US2)** both depend on Phase 2; US2 reuses `TeamRepository.findByNameLower` from T011 so US1 should land first OR T011 should be hoisted into Phase 2 if running US2 in parallel with US1 by another developer.
- **Phase 5 (US3)** depends on Phase 2 only (uses its own repository methods T023). Can run in parallel with US1/US2.
- **Phase 6 (US4)** depends on Phase 2 only — uses `findTeamsByCodes` (T023, defined under US3 but mechanically independent — if US3 is deferred, lift T023 into Phase 2).
- **Phase 7 (Polish)**: depends on all targeted user stories.

### Within each story

- Tests (Txxx [P]) MUST fail before the matching implementation lands.
- Repository methods → service methods → handler wiring → docs.

### Parallel Opportunities

- T003, T004, T005, T007 in Phase 2 can all run in parallel (different files).
- T009 + T010 (US1 tests) parallel; T015 + T016 (US2 tests) parallel; T020 + T021 + T022 (US3 tests) parallel; T027 + T028 (US4 tests) parallel.
- T032–T036 (polish docs and integration) all parallel.
- US3 and US4 can be developed in parallel by different contributors after Phase 2.

---

## Parallel Example: User Story 1

```bash
# Tests for US1 in parallel:
Task: "Unit tests for TeamService.create in backend/test/team/team.service.spec.ts"
Task: "Handler-level unit tests for tea create branch in backend/test/team/tea.handler.spec.ts"
```

## Parallel Example: Phase 2 Foundational

```bash
# After T002 (migration) lands, run in parallel:
Task: "Create team.module.ts skeleton"
Task: "Create team.types.ts"
Task: "Create team-name.ts parser/validator"
Task: "Create team.repository.ts method stubs"
```

---

## Implementation Strategy

### MVP First (US1 + US2 ship together as P1)

1. Phase 1 + Phase 2 (Setup + Foundational).
2. Phase 3 (US1 — `tea create`).
3. Phase 4 (US2 — password-gated join).
4. **STOP and VALIDATE**: run quickstart Scenarios A + B + C; teams can be created and joined with password gating. This is the minimum viable team gameplay loop.
5. Demo / merge candidate.

### Incremental Delivery

1. MVP (US1+US2) merged.
2. US3 (`tea list`) → demo → merge.
3. US4 (roster team column) → demo → merge.
4. Phase 7 polish lands continuously alongside US3/US4.

### Parallel Team Strategy

After Phase 2:
- Dev A: US1 + US2 (sequential — same handler file).
- Dev B: US3 (own service method + new render file).
- Dev C: US4 (modifies `ros.handler.ts` only — independent of `tea.handler.ts`).

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- The `tea.handler.ts` file is touched by US1, US2, and US3 — those tasks within those phases are NOT [P] relative to each other within the handler file.
- `team.service.spec.ts` is touched by US1, US2, US3 — sequence those test additions; do not mark cross-story as [P].
- Verify each test FAILS before its matching implementation — TDD per project constitution.
- Commit after each task or logical group (e.g., one commit per user story phase + tests).
- Stop at any checkpoint to validate independently.
- `Team.secret` and `Team.flag` columns are intentionally untouched — do not add code that reads or writes them in this feature.
- `prisma db push` is FORBIDDEN — always create a migration via `prisma migrate dev` (CLAUDE.md).
