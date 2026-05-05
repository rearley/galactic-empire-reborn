---
description: "Task list for 009 — Midnight Maintenance Job"
---

# Tasks: 009 Midnight Maintenance Job

**Input**: Design documents from `/specs/009-midnight-job/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Mandatory per Constitution II. Unit tests for pure helpers, integration tests against a real test Postgres for every user story, balance regression for every constant. All tests written before or alongside implementation.

**Organization**: Tasks are grouped by user story (US1–US6 from spec.md). Within each story, tests come first, then implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps to a user story from spec.md
- All paths are absolute or rooted at the repo (`backend/...`, `specs/...`)

## Path Conventions

Backend-only feature. All code in `backend/src/...`, all tests in `backend/test/...`. No frontend changes.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project-level changes shared by every user story (cron wiring, env config, balance constants).

- [X] T001 Add `@nestjs/schedule` dependency in `backend/package.json` (latest 4.x compatible with NestJS 10) and run `npm install` in `backend/`
- [X] T002 Register `ScheduleModule.forRoot()` in `backend/src/app.module.ts` imports list (project's first `@nestjs/schedule` use; do not add any `@Interval` decorator)
- [X] T003 [P] Create `backend/src/game/midnight/midnight.constants.ts` exporting `TEAMBONU=3_200_000n`, `MAILDAYS_DEFAULT=7`, `PLTVCASH=201_228_378n`, `PLTVDIV=201_228_378n`, `CHGLOSER_DEFAULT=100`, `MAXTEAMS=50`, `MAIL_CLASS_PRODRPT=3`, `MESG20=20`, `ADVISORY_LOCK_KEY=0x474D6E6967687400n` — each with a JSDoc `@see GEMAIN.C:` line citation per data-model.md
- [X] T004 [P] Create `backend/src/game/midnight/midnight.config.ts` with `loadMidnightConfig(env)` that reads `MIDNIGHT_MAILDAYS` (1–30, default 7), `MIDNIGHT_CHGLOSER` (0–100, default 100), `MIDNIGHT_ADMIN_TOKEN` (optional string); validates ranges; mirrors the patterns in `backend/src/game/cybertron/cybertron.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Prisma schema, migration, and the empty `MidnightModule` skeleton — all user stories depend on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Add `MidnightRun` model to `backend/prisma/schema.prisma` exactly as specified in `specs/009-midnight-job/data-model.md` (PK on `runDate @db.Date`; counters and `durationMs` as `Int`; `completedAt` as `DateTime`)
- [X] T006 Generate the Prisma migration via `cd backend && npx prisma migrate dev --name add_midnight_run` and commit `backend/prisma/migrations/<timestamp>_add_midnight_run/migration.sql` alongside the schema change (do NOT use `prisma db push`)
- [X] T007 Create empty `backend/src/game/midnight/midnight.module.ts` (NestJS module declaring providers/controllers added by later phases) and import it in `backend/src/app.module.ts`
- [X] T008 [P] Create the test directory `backend/test/game/midnight/` with an `.gitkeep` if needed (used by all subsequent test tasks)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 — Daily score recalculation and roster ranking (Priority: P1) 🎯 MVP

**Goal**: Every player's score is recomputed as `plscore + klscore` where `plscore` = sum of owned-planet net-worths; players are re-ranked into `rospos` skipping KEY and `@`-prefixed AI users. This is the foundation that US2/US3/US4 build on.

**Independent Test**: Seed a fixture of 5 users + 1 AI user + assorted planets and known klscores; trigger the midnight pass via the manual endpoint; assert per-user `score`, `plscore`, `planets`, `population`, and `rospos` exactly match the canonical formula and ordering rules.

### Tests for User Story 1 *(write first, ensure they FAIL before implementation)*

- [X] T009 [P] [US1] Pure-unit test for `valuePlanet` in `backend/test/game/midnight/value-pl.spec.ts` — table-driven against the formula `(cash+tax)/(1_000_000n/PLTVCASH) + Σ(item_value × item_qty / PLTVDIV)`; include a "rich planet" case to prove BigInt safety; cite `GEMAIN.C:1348-1359`
- [X] T010 [P] [US1] Pure-unit test for `rankRoster` in `backend/test/game/midnight/rank-roster.spec.ts` — covers KEY skip, `@`-prefix skip, score-zero skip, descending order, ties broken by userid (deterministic), and reset-to-0 for non-qualifiers
- [X] T011 [P] [US1] Pure-unit test for `buildProductionMailStat` in `backend/test/game/midnight/mailstat-builder.spec.ts` — asserts every field per data-model.md (class=3, type=20, name1 truncation, 14-element itemqty)
- [X] T012 [P] [US1] Integration test `backend/test/game/midnight/midnight.service.spec.ts` — drives `MidnightService.run()` against a real test DB seeded with US1's fixture; asserts every assertion in spec US1 acceptance scenarios 1–4 (planet count, plscore math, score = plscore+klscore, rospos ordering, AI/KEY skips); also asserts `klscore` is unchanged for every user pre/post pass (FR-007)
- [X] T013 [P] [US1] Balance regression test in `backend/test/game/midnight/balance-regression.spec.ts` — imports `TEAMBONU`, `MAILDAYS_DEFAULT`, `PLTVCASH`, `PLTVDIV`, `CHGLOSER_DEFAULT`, `MAXTEAMS`, `MAIL_CLASS_PRODRPT` from `midnight.constants.ts` and asserts each exact value (covers SC-006)

### Implementation for User Story 1

- [X] T014 [P] [US1] Create pure helper `backend/src/game/midnight/value-pl.ts` exporting `valuePlanet(planet, itemBaseValues, PLTVCASH, PLTVDIV) => bigint` per `GEMAIN.C:1348-1359`; reuse the per-item base-value table referenced by `backend/src/game/planet/planet-economy.service.ts` (research.md D12)
- [X] T015 [P] [US1] Create pure helper `backend/src/game/midnight/rank-roster.ts` exporting `rankRoster(users) => Map<userid, rospos>` — filter `score > 0`, exclude KEY and `@`-prefix, sort score-desc with tie-break on userid, assign `rospos = i+1`; non-qualifiers get 0
- [X] T016 [P] [US1] Create pure helper `backend/src/game/midnight/mailstat-builder.ts` exporting `buildProductionMailStat(planet, msgno) => Prisma.MailStatCreateInput` per data-model.md
- [X] T017 [US1] Create `backend/src/game/midnight/midnight.repository.ts` with phase-1 helper `resetUserAccumulators(tx)` (single `updateMany` zeroing planets/score/plscore/population for `userid != KEY`) and phase-2 helper `processOwnedPlanets(tx, msgnoBase)` (selects planets where `type = PLTYPE_PLNT AND userid <> ''`, joins to User, increments `planets`, adds `population += men/10000n`, adds `plscore += valuePlanet(...)`, inserts MailStat per planet, returns counters; FR-011/FR-012 silent skips)
- [X] T018 [US1] Add phase-4-partial helpers to `midnight.repository.ts`: `setUserScores(tx)` (sets `score = plscore + klscore` for `userid != KEY`) and `assignRosterPositions(tx)` — implements the single-statement `UPDATE ... FROM (SELECT ROW_NUMBER() ...)` from research.md D7, plus the second statement zeroing rospos for non-qualifiers
- [X] T019 [US1] Create `backend/src/game/midnight/midnight-run.ledger.ts` exporting `hasRunForToday(tx, today) => Promise<boolean>` and `recordRun(tx, runDate, completedAt, durationMs, counters) => Promise<void>` (upsert on PK)
- [X] T020 [US1] Create `backend/src/game/midnight/midnight.service.ts` with `run(): Promise<MidnightCounters>` — acquires `pg_try_advisory_lock(ADVISORY_LOCK_KEY)` outside the tx via `prisma.$queryRaw`, opens `prisma.$transaction(async tx => ...)`, calls phase 1 then phase 2 then phase-4 score+rospos helpers, calls ledger upsert at end of tx, releases advisory lock in `finally`; emits the structured `midnight.complete` log line; returns counters. (Phases 3 and 4-team are wired in US2/US3/US4 later — this scaffolds the orchestration so US1 is independently testable.)
- [X] T021 [US1] Wire `MidnightService` into `backend/src/game/midnight/midnight.module.ts` providers; export it for use by the admin controller and `OnApplicationBootstrap` self-heal (added in Polish phase)

**Checkpoint**: US1 fully functional — running the midnight pass produces correct scores and rospos, with phases 3 and 4-team as no-ops; T012 passes.

---

## Phase 4: User Story 2 — Planet production report mail (Priority: P2)

**Goal**: One `MailStat` row per owned planet, addressed to the owner, with the correct structured fields.

**Independent Test**: Seed a player owning two planets with known inventory; run the midnight pass; query MailStat and assert exactly two rows with correct planet name, sector, cash/debt/tax, and 14-element itemqty.

### Tests for User Story 2 *(write first)*

- [X] T022 [P] [US2] Integration test in `backend/test/game/midnight/midnight.service.spec.ts` (extend existing file) — covers spec US2 acceptance scenarios 1–4: one row per owned planet, no row for unowned, no row for orphan owner (silent skip), no duplicates/misses across 10 players × multiple planets

### Implementation for User Story 2

- [X] T023 [US2] Verify `processOwnedPlanets` in `midnight.repository.ts` (built in T017) inserts MailStat rows correctly and uses `BigInt(Date.now()) + i` per-iteration counter for msgno uniqueness per research.md D6 — fix any gaps surfaced by T022

**Checkpoint**: US2 fully functional. Note: implementation is mostly delivered as part of US1's `processOwnedPlanets` (the spec couples score recalc and mail generation in a single phase-2 walk, matching `GEMAIN.C:1120-1169`). The split here is for test independence.

---

## Phase 5: User Story 3 — Mail purge (Priority: P2)

**Goal**: Mail older than `MAILDAYS` and mail to `*`-prefixed recipients deleted; everything else preserved.

**Independent Test**: Seed mail rows aged uniformly across 14 days plus a few `*ghost` recipients; run the pass; assert exactly the expected rows are gone.

### Tests for User Story 3 *(write first)*

- [X] T024 [P] [US3] Integration test `backend/test/game/midnight/mail-purge.spec.ts` — covers spec US3 acceptance scenarios 1–4 including the configurable retention window (set `MIDNIGHT_MAILDAYS=14` via process env override and assert 8–13-day-old mail is preserved)

### Implementation for User Story 3

- [X] T025 [US3] Add phase-3 helper `purgeMail(tx, mailDays)` to `midnight.repository.ts` — two `deleteMany` calls: `stamp < floor(Date.now()/1000) - mailDays * 86400` and `userid: { startsWith: '*' }`; returns total delete count
- [X] T026 [US3] Wire `purgeMail` into `MidnightService.run()` between the score-recalc step and the team/rospos step, threading the configured `mailDays` from `loadMidnightConfig`

**Checkpoint**: US3 fully functional; T024 passes.

---

## Phase 6: User Story 4 — Team score reconciliation (Priority: P3)

**Goal**: Per-team count and score recomputed; orphan teamcodes reset to 0; empty teams marked removed (`teamcode = -1`). TEAMBONU and `score / teamcount` are added **once per member** inside the user-iteration loop (FR-019, `GEMAIN.C:1275`).

**Independent Test**: Seed 3 users on team 5, 2 on team 9, 1 orphan referencing team 99; run; assert team-5 score = `3 × TEAMBONU + Σ(member.score / 3)`, team-9 similarly, no team-99 row, orphan teamcode = 0.

### Tests for User Story 4 *(write first)*

- [X] T027 [P] [US4] Integration test `backend/test/game/midnight/team-reconciliation.spec.ts` — covers spec US4 acceptance scenarios 1–3 with explicit per-member TEAMBONU accumulation (research.md D-team / FR-019); also asserts the empty-team `teamcode = -1` sentinel
- [X] T028 [P] [US4] Idempotency integration test `backend/test/game/midnight/idempotency.spec.ts` — runs `MidnightService.run()` twice against the same fixture; asserts identical end state on User/Team/Mail rows; asserts MailStat row count exactly doubles (FR-003 / SC-003)

### Implementation for User Story 4

- [X] T029 [US4] Add phase-4-team helpers to `midnight.repository.ts`: `zeroAllTeams(tx)`, `countTeamMembersAndResetOrphans(tx)` (per-user walk: if `teamcode > 0` and team exists → increment `teamcount`; if not → reset user's `teamcode = 0`), `applyPerMemberTeamScore(tx, teambonu)` (per-user walk: for each non-KEY user with `teamcode > 0`, `teamscore += teambonu` and `teamscore += score / max(teamcount, 1)` — both inside the per-user loop per FR-019), `markEmptyTeamsRemoved(tx)` (set `teamcode = -1` where `teamcount = 0` and `teamcode > 0`)
- [X] T030 [US4] Wire phase-4-team helpers into `MidnightService.run()` in correct order: zero teams → count + reset orphans → set user scores (already there from US1 T018) → apply per-member team score → mark empty removed → assign rospos (already there from US1 T018). Update returned counters with `teamsReconciled` and `teamsRemoved`.

**Checkpoint**: US4 fully functional; T027 and T028 pass.

---

## Phase 7: User Story 5 — Player-vs-player CHGLOSER cash penalty (Priority: P3)

**Goal**: When one human kills another, the loser's cash is reduced by `CHGLOSER%`, capped at available cash, and credited to the killer. Does not fire when either side is AI.

**Independent Test**: Stage a kill resolution between two human-player ships with known cash; assert exact cash transfer; repeat with AI on either side and assert no transfer.

### Tests for User Story 5 *(write first)*

- [X] T031 [P] [US5] Integration test `backend/test/game/combat/chgloser-pvp.spec.ts` — covers spec US5 acceptance scenarios 1–4 plus SC-007 extremes (loser cash = 0 and at BigInt-safe upper bound); uses the existing 006b combat-tick test harness

### Implementation for User Story 5

- [X] T032 [US5] Add `applyCashPenalty(attackerUserid, victimUserid, percent): Promise<bigint>` to `backend/src/game/player/player-score.repository.ts` — single transactional `UPDATE`: `transfer = floor(loser.cash * percent / 100)` capped at `loser.cash`; decrements loser, increments killer; returns transferred amount; tolerates missing rows safely
- [X] T033 [US5] Modify `backend/src/game/player/player-score.service.ts` `handleShipDestroyed` listener: after the existing `transferKillScore` call, if BOTH `attackerUserid` and `victimUserid` are present and NEITHER matches `AI_USERID_RE` and the configured CHGLOSER percent > 0, call `applyCashPenalty`. Read the percent once at module init from `loadMidnightConfig().chgLoserPercent`. Add JSDoc `@see GEFUNCS.C:killem (1087-1218 chgloser block)`
- [X] T034 [US5] Wire a factory provider that calls `loadMidnightConfig` (from `midnight.config.ts`) into `PlayerScoreModule` so `PlayerScoreService` can read `chgLoserPercent` at construction via DI; do not call `loadMidnightConfig(process.env)` directly inside the service body — keep unit-testability by injecting the resolved value through the factory provider

**Checkpoint**: US5 fully functional; T031 passes.

---

## Phase 8: User Story 6 — Droid kill scoring (Priority: P3)

**Goal**: Killing a Droid awards the Droid's class `points` to the player's `score` and `klscore`. No deduction on the (ephemeral) Droid side; no error when the Droid victim has no `User` row.

**Independent Test**: Stage a kill where a player destroys a Droid of each of classes 10/11/12 with known `points`; assert player's `score` and `klscore` each increased by exactly that value; assert no exception.

### Tests for User Story 6 *(write first)*

- [X] T035 [P] [US6] Regression test `backend/test/game/combat/droid-kill-scoring.spec.ts` — for each of classes 10/11/12, drive a Droid-victim `COMBAT_SHIP_DESTROYED` event with `scoreAwarded` set to that class's `points`; assert attacker's `score` and `klscore` deltas; assert no exception when the Droid victim has no `User` row (FR-026); covers SC-008 across all three Droid classes

### Implementation for User Story 6

- [X] T036 [US6] Add a named constant `AI_VICTIM_PREFIXES = ['Cybrg-', 'Droid-']` and JSDoc to `backend/src/game/player/player-score.service.ts` documenting that `Droid-` participates in the AI-victim contract (so a future refactor cannot regress FR-025/026). Verify the existing `transferKillScore(..., isAiVictim=true)` path already updates only the attacker — add an explicit comment citing `backend/src/game/player/player-score.repository.ts:24-55`. **No behavioural change** is expected here; T035 is what pins the contract.

**Checkpoint**: US6 fully functional; T035 passes.

---

## Phase 9: Manual admin endpoint, self-heal, and concurrency hardening

**Purpose**: FR-001b, FR-002, FR-004a — the operational paths that wrap the core `MidnightService.run()` from US1–US4.

- [X] T037 [P] Tests `backend/test/game/midnight/advisory-lock.spec.ts` — concurrent invocation: first caller acquires lock and runs; second caller observes `pg_try_advisory_lock` returns false (cron path logs skip and exits cleanly; HTTP path returns 409 with `code: MIDNIGHT_LOCK_HELD`)
- [X] T038 [P] Tests `backend/test/game/midnight/transaction-rollback.spec.ts` — inject a fault inside phase 2 (e.g. mock `processOwnedPlanets` to throw on the 3rd planet); assert no `MidnightRun` row, no MailStat rows, no User mutations remain (FR-012a)
- [X] T039 [P] Tests `backend/test/game/midnight/self-heal.spec.ts` — boot the Nest app with a clean DB (no `MidnightRun` row for today) → asserts `run()` was called once; boot again with today's row already present → asserts `run()` was NOT called
- [X] T040 [P] Tests `backend/test/game/midnight/admin-endpoint.spec.ts` — covers contracts/admin-midnight.md exhaustively: 401 (missing/wrong token), 503 (token unset in env), 202 (correct token + fresh DB), 409 (correct token + lock held), 202 again on same-day re-run with doubled MailStat row count
- [X] T041 Implement `backend/src/game/midnight/admin-token.guard.ts` — NestJS `CanActivate` guard reading `MIDNIGHT_ADMIN_TOKEN` from a config provider; returns 503 when token unset, 401 on mismatch, true on match. Use constant-time comparison.
- [X] T042 Implement `backend/src/game/midnight/admin-midnight.controller.ts` — `POST /admin/midnight/run` guarded by `AdminTokenGuard`; calls `MidnightService.run()`; returns 202 with the response body shape from `contracts/admin-midnight.md`; maps `MIDNIGHT_LOCK_HELD` from the service to a 409 with the documented body; register the controller in `MidnightModule`
- [X] T043 Implement `OnApplicationBootstrap` in `MidnightService` — on boot, query `MidnightRun` for today's server-local date (using `new Date()` and the server TZ per research.md D5); if absent, call `run()` once asynchronously and log the outcome; if `pg_try_advisory_lock` returns false (another node, future-proofing), log a skip and exit cleanly
- [X] T044 Add the `@Cron('0 0 * * *')` decorator to `MidnightService.scheduledRun()` per research.md D1 — `scheduledRun` calls `run()` and logs the outcome; on `MIDNIGHT_LOCK_HELD` it logs and exits cleanly per FR-004a

**Checkpoint**: All operational paths converge on the same `run()` and are independently tested.

---

## Phase 10: Polish & Cross-Cutting

- [X] T045 Performance budget test `backend/test/game/midnight/perf-budget.spec.ts` — seed 1,000 users + 2,000 planets, run `MidnightService.run()`, assert `durationMs < 5000` per SC-005
- [X] T046 Soak test `backend/test/game/midnight/seven-day-soak.spec.ts` — simulate 7 consecutive days against a fixture that includes deleted users, orphan teamcodes, and planets with empty owner fields; assert no unhandled exception (SC-009)
- [X] T047 [P] Update `docs/ARCHITECTURE.md` — add a `MidnightService` block under the module map (`game/midnight/`)
- [X] T048 [P] Update `docs/DECISIONS.md` — add a 2026-05-05 entry summarising research.md D1 (`@nestjs/schedule` introduction), D2 (advisory lock), D7 (rospos via window function), D8/D9 (per-kill scoring lives in `PlayerScoreService`)
- [X] T049 [P] Update `docs/PROGRESS.md` — add the 009 completion entry with tests, decisions, and "next: 010 react-frontend"
- [X] T050 [P] Update `docs/GAME_MECHANICS.md` — add midnight pass mechanics with `GEMAIN.C` line citations
- [X] T051 [P] Update `docs/DATA_MODEL.md` — add the new `MidnightRun` ledger entity
- [X] T052 Run `specs/009-midnight-job/quickstart.md` end-to-end on a fresh dev DB and confirm every step matches expected output
- [X] T053 Run `cd backend && npm test` — assert the entire test suite (1238+ baseline plus the new tests from this feature) is green; record the new total in the PROGRESS entry from T049

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. **Blocks all user stories**.
- **US1 (Phase 3)**: Depends on Foundational. The first independently shippable increment (MVP — recompute scores + rospos, no mail purge, no team reconciliation, no per-kill scoring).
- **US2 (Phase 4)**: Depends on US1 (US1's `processOwnedPlanets` already inserts MailStat rows; US2 adds focused tests).
- **US3 (Phase 5)**: Depends on Foundational only — can run in parallel with US1/US2 if staffed.
- **US4 (Phase 6)**: Depends on US1 (needs `setUserScores` from T018) and Foundational.
- **US5 (Phase 7)**: Depends on Foundational only (combat-side; touches `PlayerScoreService`).
- **US6 (Phase 8)**: Depends on Foundational only (combat-side; touches `PlayerScoreService`).
- **Phase 9 (admin/self-heal/concurrency)**: Depends on US1 (the orchestration in T020 must exist).
- **Polish (Phase 10)**: Depends on all of US1–US6 and Phase 9.

### Within Each User Story

- Tests written before implementation; verify they fail.
- Pure helpers (`value-pl`, `rank-roster`, `mailstat-builder`) before the repository.
- Repository before service orchestration.
- Service before controller (Phase 9).

### Parallel Opportunities

- Setup tasks T003 + T004 are [P].
- US1 test tasks T009/T010/T011/T013 are [P]; T012 sequential because it shares the integration spec file with US2/US4 sub-tests.
- US1 implementation: T014/T015/T016 are [P] (different pure-helper files); T017–T021 are sequential (same repository/service files).
- US3, US5, US6 can be developed in parallel with US1/US2/US4 by different team members because they touch disjoint files (mail-purge helper, combat listener edits, regression test).
- Phase 9 tests T037/T038/T039/T040 are [P].
- Phase 10 docs tasks T047–T051 are all [P].

---

## Parallel Example: User Story 1

```bash
# Tests for US1 (write first, expect failure):
Task: "Pure-unit test for valuePlanet in backend/test/game/midnight/value-pl.spec.ts"          # T009
Task: "Pure-unit test for rankRoster in backend/test/game/midnight/rank-roster.spec.ts"        # T010
Task: "Pure-unit test for buildProductionMailStat in backend/test/game/midnight/mailstat-builder.spec.ts"  # T011
Task: "Balance regression test in backend/test/game/midnight/balance-regression.spec.ts"       # T013

# Pure helpers for US1 (parallel implementation):
Task: "Create valuePlanet helper in backend/src/game/midnight/value-pl.ts"                     # T014
Task: "Create rankRoster helper in backend/src/game/midnight/rank-roster.ts"                   # T015
Task: "Create buildProductionMailStat helper in backend/src/game/midnight/mailstat-builder.ts" # T016
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 Setup (T001–T004) → `@nestjs/schedule` installed, constants + config in place.
2. Phase 2 Foundational (T005–T008) → migration committed, empty `MidnightModule` registered.
3. Phase 3 US1 (T009–T021) → `MidnightService.run()` recomputes scores, builds production-report MailStat rows, assigns rospos. Phases 3 (mail purge) and 4-team are no-ops at MVP boundary; the `MidnightRun` ledger is written.
4. **STOP & VALIDATE**: Run T012 manually plus the quickstart against a small fixture. Demo: `score`, `plscore`, `rospos` correct.

### Incremental Delivery After MVP

- US3 mail purge → T024–T026 → operators stop seeing unbounded mail growth.
- US4 team reconciliation → T027–T030 → team scoring works end-to-end.
- US5 CHGLOSER + US6 Droid scoring → T031–T036 → "scoring is real" complete on the combat side.
- Phase 9 (admin endpoint + self-heal + cron) → T037–T044 → unattended operation; first real cron firing at the next 00:00.
- Phase 10 polish → T045–T053 → docs updated, full suite green, perf budget proven.

### Parallel Team Strategy

With multiple developers post-Foundational:

- Dev A: US1 (T009–T021) — owns the core orchestration.
- Dev B: US3 (T024–T026) — independent file (mail-purge helper).
- Dev C: US5 + US6 (T031–T036) — combat-side, touches `PlayerScoreService` only.
- Phase 9 starts once Dev A finishes US1.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps each task to a user story for traceability.
- TEAMBONU is added **once per member** inside the user-iteration loop (FR-019, `GEMAIN.C:1275`) — every team-related test must validate this exactly.
- Constitution III: the single `@Cron` decorator added in T044 is the only `@nestjs/schedule` use; no `@Interval` is added or contemplated.
- Constitution IV: T006 produces a real Prisma migration committed alongside the schema change. Do NOT use `prisma db push`.
- Constants live in `midnight.constants.ts` and are imported by name everywhere, including the balance-regression test (T013).
- Commit after each task or logical group; keep PRs small enough to review.
