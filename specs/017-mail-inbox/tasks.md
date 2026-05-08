---
description: "Task list for feature 017-mail-inbox"
---

# Tasks: Mail Inbox

**Input**: Design documents from `/specs/017-mail-inbox/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/commands.md, quickstart.md

**Tests**: MANDATORY per project constitution (Principle II). Each story has unit + integration coverage written before or alongside implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1=list, US2=read, US3=delete)
- All paths are repo-relative

## Path Conventions

Web app — `backend/src/`, `backend/test/` per plan.md.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the new module directory and types. No DB or schema work — `MailStat` is unchanged.

- [X] T001 [P] Create new module directory `backend/src/game/mail/` with empty placeholder `mail.module.ts` exporting `MailModule` (NestJS `@Module({})`).
- [X] T002 [P] Create `backend/src/game/mail/mail.types.ts` with `MailListEntry`, `MailListing`, `ProductionReportPayload`, `DistressSignalPayload`, `GenericPayload` interfaces per `data-model.md` §In-memory.
- [X] T003 [P] Create test directory `backend/test/mail/` (empty — populated by later tasks).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Repository + render + DI wiring shared by all three commands. **Blocks all user-story phases.**

⚠️ **CRITICAL**: No story task may begin until Phase 2 is complete.

- [X] T004 Implement `backend/src/game/mail/mail-inbox.repository.ts` — `MailInboxRepository` class with: `findByUserid(userid: string): Promise<MailStat[]>` (sorted `stamp DESC, msgno DESC, class DESC` per R4); `deleteOne(userid: string, klass: number, msgno: bigint): Promise<boolean>` (returns false on Prisma `P2025`). Inject `PrismaService`.
- [X] T005 [P] Implement `backend/src/game/mail/mail-render.ts` — pure functions `classLabel(class: number): string`, `formatListLine(entry: MailListEntry): string`, `formatDetail(entry: MailListEntry): string[]` covering production-report (class 3), distress-signal (class 1), and generic-fallback branches per `contracts/commands.md` outputs.
- [X] T006 Implement `backend/src/game/mail/mail-inbox.service.ts` — `MailInboxService` with `list(userid)`, `resolveIndex(userid, index)`, `deleteByIndex(userid, index)`. Implements R3 sender resolution two-tier chain (`ShipStateService.shipname` → raw `dtime`; empty `dtime` → `(system)`), R4 sort order, R5 re-resolution per call, validation per FR-011. Inject `MailInboxRepository`, `ShipStateService`, `PrismaService`. (No `User`-row lookup tier — `shipname` lives on `Ship`, not `User`.)
- [X] T007 [P] Add `MailModule` providers/exports in `backend/src/game/mail/mail.module.ts`: imports `PrismaModule`, `ShipStateModule`; provides `MailInboxRepository`, `MailInboxService`; exports `MailInboxService`.
- [X] T008 [P] Unit test `backend/test/mail/mail-render.spec.ts` — covers class label table, list line formatting, both detail branches, and generic fallback. Snapshot-style assertions on emitted strings.
- [X] T009 Unit test `backend/test/mail/mail-inbox.service.spec.ts` — sort order with mixed classes (R4), 1-based indexing, R3 fallback chain (3 cases incl. empty `dtime` → `(system)`), `resolveIndex` validation (missing/0/negative/non-int/out-of-range), `deleteByIndex` returns invalid on `P2025`. Mocks `MailInboxRepository`, `ShipStateService`, `PrismaService`.

- [X] T029 [P] Unit test `backend/test/mail/mail-schema-drift.spec.ts` — assert the `MailStat` Prisma model has no `readAt` or `deletedAt` fields. Snapshot the field names from the Prisma DMMF (`Prisma.dmmf.datamodel.models.find(m => m.name === 'MailStat').fields.map(f => f.name)`) and assert neither string appears. Guards FR-014 (no per-message read state) and SC-003 (no soft-delete state).

**Checkpoint**: `MailInboxService` is fully unit-tested and the module wires up cleanly. Story phases can now begin.

---

## Phase 3: User Story 1 — List inbox `mai` (Priority: P1) 🎯 MVP

**Goal**: A player types `mai` (no args) and sees a numbered list of their `MailStat` rows newest-first; with-arg form delegates to existing maintenance gate.

**Independent Test**: Seed two `MailStat` rows for a player; invoking `mai` through `CommandRouterService` returns lines containing both entries with class labels, sender, topic, date, and 1-based indices in the order specified by R4. `mai <pwd>` continues to drive `MaintHandlerService` unchanged.

### Tests for User Story 1 *(write first, ensure they FAIL before implementation)*

- [X] T010 [P] [US1] Unit test `backend/test/mail/mai.handler.spec.ts` — covers: no-arg → `MailInboxService.list()` rendered output (empty + non-empty, mixed classes); with-arg → exactly one delegate call to `MaintHandlerService.handle(ship, args)` and pass-through of its `CommandResult`; ensures no inbox query when args present. **MUST also assert `prisma.mailStat.delete` is never called for either branch (FR-013).**
- [X] T011 [US1] Integration test `backend/test/mail/mail-inbox.integration.spec.ts` — boots NestJS test module against real Postgres; seeds 3 mixed-class `MailStat` rows for a test user; runs `mai` through `CommandRouterService` and asserts: header line, 3 lines in `stamp DESC, msgno DESC` order, class labels match data-model.md §Class label table, sender resolution falls through to raw `dtime` for unknown user. Reuses Postgres test setup pattern from feature 009 (per R6).

### Implementation for User Story 1

- [X] T012 [US1] Implement `backend/src/game/commands/handlers/mai.handler.ts` — new `MaiHandlerService` registered with keyword `mai`, no aliases; constructor injects `MailInboxService` and `MaintHandlerService`; `handle(ship, args)` returns `MaintHandlerService.handle(ship, args)` when `args.length >= 1`, otherwise builds `CommandResult` from `MailInboxService.list(ship.userid)` via `mail-render.formatListLine`. Set categories per `contracts/commands.md` §Cross-command guarantees (`system` for empty, default for content rows). Add JSDoc `@see GEMAIN.H:531 MAILSTAT`.
- [X] T013 [US1] Modify `backend/src/game/commands/handlers/maint.handler.ts` — remove `'mai'` from its `aliases` array (per R2). Keep `'maint'` keyword behavior identical.
- [X] T014 [US1] Modify `backend/src/game/commands/commands.module.ts` — import `MailModule`; register `MaiHandlerService` provider; ensure `MaintHandlerService` remains exported for the dispatcher to consume.

**Checkpoint**: `mai` lists the inbox; `mai <pwd>` still drives maintenance. Maintenance regression covered by SC-005 spot check (run feature 014 tests — should still pass).

---

## Phase 4: User Story 2 — Read message `rea <index>` (Priority: P1)

**Goal**: A player types `rea <index>` and sees the class-appropriate detail block for the message at that 1-based index in the most-recent ordering.

**Independent Test**: With 2 seeded messages of different classes, `rea 1` and `rea 2` each render the class-specific detail per `contracts/commands.md` §`rea`. Out-of-range/missing/non-positive indices emit usage or invalid-message lines and make no DB writes.

### Tests for User Story 2 *(write first, ensure they FAIL before implementation)*

- [X] T015 [P] [US2] Unit test `backend/test/mail/rea.handler.spec.ts` — production-report detail branch (planet/cash/debt/tax/14-item table); distress-signal detail branch (attacker name/planet/sector); usage line on missing arg; invalid-message line on `0`, `-1`, non-numeric, out-of-range; asserts no `prisma.mailStat.delete` call ever made (FR-013). **Race-with-purge case**: seed 2 rows, capture index from `mai`, delete the targeted row directly via Prisma (simulating a purge or concurrent delete between list and rea), then call `rea` with the captured index — assert "Invalid message." response and no throw (spec edge case 4 for `rea`).
- [X] T016 [US2] Extend `backend/test/mail/mail-inbox.integration.spec.ts` — add scenarios: `rea 1` against seeded distress row returns sector `(int1, int2)`; `rea 2` against seeded production row returns financial fields and itemqty[14]; `rea 99` returns invalid-message and `MailStat` row count unchanged.

### Implementation for User Story 2

- [X] T017 [US2] Implement `backend/src/game/commands/handlers/rea.handler.ts` — new `ReaHandlerService` with keyword `rea`; injects `MailInboxService`; parses single integer arg; on missing arg emits usage; on invalid index emits "Invalid message."; on valid index calls `MailInboxService.list` + `resolveIndex` and renders via `mail-render.formatDetail`. Read-only (FR-013). Add JSDoc `@see GEMAIN.H:220 MAIL_CLASS_*` and `@see GECMDS.C:cmd_readmail` on the handler class and its `handle` method (Constitution Principle IV).
- [X] T018 [US2] Modify `backend/src/game/commands/commands.module.ts` — register `ReaHandlerService` provider.

**Checkpoint**: `mai` + `rea` cover the full read path of US1+US2. Quickstart steps 1–4 should now pass.

---

## Phase 5: User Story 3 — Delete message `del <index>` (Priority: P2)

**Goal**: A player types `del <index>` and the corresponding `MailStat` row is hard-deleted; subsequent `mai` re-derives indices over the remaining rows.

**Independent Test**: With 3 seeded messages, `del 2` removes the second; the next `mai` shows 2 messages with new 1-based indices and the deleted row is absent from a direct `MailStat` query.

### Tests for User Story 3 *(write first, ensure they FAIL before implementation)*

- [X] T019 [P] [US3] Unit test `backend/test/mail/del.handler.spec.ts` — success path emits "Message N deleted." and calls `MailInboxService.deleteByIndex` exactly once; usage line on missing arg; invalid-message on `0`/`-1`/non-numeric/out-of-range with **no** delete call; race-with-purge case (`P2025` → repository returns false) emits invalid-message rather than throwing.
- [X] T020 [US3] Extend `backend/test/mail/mail-inbox.integration.spec.ts` — `del 2` against 3 seeded rows: assert confirmation line, assert remaining row count == 2 via Prisma, assert subsequent `mai` invocation lists 2 entries with renumbered indices 1 and 2; assert `del 99` makes no row deletion. **Double-delete scenario (spec edge case 5)**: run `del 2` twice against a 3-row inbox; assert first call succeeds with confirmation and row count is 2; assert second call also succeeds (index 2 of the remaining 2-row list resolves to a different row per R5 re-resolution) with confirmation and final row count is 1. Matches `contracts/commands.md` edge-case table: "second targets new entry #2 (different row)". Additionally assert the two deleted rows have different `(class, msgno)` composite keys to prove different rows were targeted.

### Implementation for User Story 3

- [X] T021 [US3] Implement `backend/src/game/commands/handlers/del.handler.ts` — new `DelHandlerService` with keyword `del`; injects `MailInboxService`; parses single integer arg; on missing/invalid emits usage/invalid-message; on valid index calls `MailInboxService.deleteByIndex` (which delegates to `MailInboxRepository.deleteOne`); maps repository `false` (P2025) to invalid-message; success line uses `success` category per cross-command guarantees. Add JSDoc `@see GEMAIN.H:220 MAIL_CLASS_*` and `@see GECMDS.C:cmd_deletemail` on the handler class and its `handle` method (Constitution Principle IV).
- [X] T022 [US3] Modify `backend/src/game/commands/commands.module.ts` — register `DelHandlerService` provider.

**Checkpoint**: All three commands functional and independently tested. Quickstart steps 1–6 (incl. maintenance regression) should pass end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T023 [P] Run `quickstart.md` walkthrough manually against local `docker compose up backend postgres` with a seeded user; confirm steps 1–6 produce expected output, including SC-005 maintenance regression (`mai <pwd>` unchanged).
- [X] T024 [P] Update `docs/ARCHITECTURE.md` — add `MailModule` entry under module map (mail-inbox.service.ts as the surface; repository + render as internals).
- [X] T025 [P] Update `docs/PROGRESS.md` — entry for 2026-05-07 covering completed scope, test coverage levels, and SC-001..SC-006 satisfaction.
- [X] T026 [P] Update `docs/GAME_MECHANICS.md` — section on player mail (commands, retention via midnight 7-day purge, references to `GEMAIN.H:220` mail classes and `GEMAIN.H:531 MAILSTAT`).
- [X] T027 [P] Update `docs/DECISIONS.md` — entry for the `mai` keyword dispatcher pattern (R2) — why a dedicated dispatcher beats threading inbox into `MaintHandlerService`.
- [X] T028 Final lint + type-check pass (`pnpm --filter backend lint && pnpm --filter backend tsc --noEmit`); resolve any issues introduced by new files.
- [X] T030 [P] Performance micro-benchmark `backend/test/mail/mail-inbox-perf.spec.ts` — seed 50 `MailStat` rows for a test user, invoke `MailInboxService.list()` on a warm DB connection (one untimed warm-up call, then time the next call), assert wall time `< 50` ms. Follows the pattern of the midnight-job perf budget test in feature 009. Verifies SC-006.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Phase 1; **blocks** all story phases.
- **US1 (Phase 3)**: depends on Phase 2. T013 (drop `mai` alias) must land with T012 to avoid router registration conflict.
- **US2 (Phase 4)**: depends on Phase 2; can start in parallel with US1 *if* a second developer handles `rea` only.
- **US3 (Phase 5)**: depends on Phase 2. Independent of US2; integration assertions in T020 reuse fixtures from T011 — keep the test file flow sequential or use isolated transactional setup.
- **Polish (Phase 6)**: depends on Phases 3–5 complete.

### Within Each User Story

- Tests written first; verify they fail before implementing handlers.
- Handler files (`*.handler.ts`) before module-registration edit.
- Each handler edit to `commands.module.ts` (T014, T018, T022) touches the **same file** — must run sequentially, not in parallel.

### Parallel Opportunities

- Phase 1: T001/T002/T003 in parallel.
- Phase 2: T005, T007, T008, T029 parallel; T004 + T006 + T009 sequential (T006 depends on T004; T009 depends on T006).
- Phase 3 tests: T010 parallel with T011 (different files).
- Phase 4 tests: T015 parallel with T016.
- Phase 5 tests: T019 parallel with T020.
- Phase 6: T023–T027 and T030 fully parallel; T028 last.

---

## Parallel Example: User Story 1

```bash
# Tests for US1 in parallel:
Task: "Unit test backend/test/mail/mai.handler.spec.ts (T010)"
Task: "Integration test backend/test/mail/mail-inbox.integration.spec.ts (T011)"

# After tests fail, implement:
Task: "Implement backend/src/game/commands/handlers/mai.handler.ts (T012)"
Task: "Drop 'mai' alias from backend/src/game/commands/handlers/maint.handler.ts (T013)"
# Then sequentially: T014 (commands.module.ts edit)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 — both P1)

1. Phase 1 → Phase 2 → Phase 3 (`mai`) → Phase 4 (`rea`).
2. Validate quickstart steps 1–4 + maintenance regression (step 6).
3. Ship as MVP — players can list and read mail; deletion deferred to next iteration.

### Incremental Delivery

1. Setup + Foundational → green.
2. Add US1 (`mai`) → integration test green → demoable.
3. Add US2 (`rea`) → quickstart 1–4 green → demoable.
4. Add US3 (`del`) → quickstart 5 green → feature complete.
5. Polish phase → docs updated → ready to merge.

---

## Notes

- No Prisma migration. `MailStat` schema is untouched (FR-014, R7).
- `commands.module.ts` is edited three times (T014, T018, T022) — keep these edits sequential, not parallel.
- All three handlers ultimately depend on `MailInboxService`; do not duplicate sort or sender-resolution logic in handler files.
- SC-005 (maintenance regression) is verified twice: T013 unit ensures alias is dropped; quickstart step 6 (T023) is the live regression.
- Avoid: caching listings across commands (R5 forbids it); soft-delete columns (R7, FR-014); cross-player access paths (contract guarantee).
