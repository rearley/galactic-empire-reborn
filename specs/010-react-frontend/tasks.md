# Tasks: Terminal UI — Command Input, Event Log, ASCII Sector Map, Player Panel

**Input**: Design documents from `/specs/010-react-frontend/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are MANDATORY per project constitution (Principle II). Vitest for frontend, Jest for backend. Tests written before or alongside implementation — never after.

**Organization**: Tasks grouped by user story. US1 + US2 are both P1 (MVP); US3 + US4 are P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1, US2, US3, US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Validate baseline state — no new tooling, no new dependencies (per plan.md).

- [X] T001 Verify `backend/` and `frontend/` install cleanly (`npm ci` in each) and existing test suites pass (`backend/ npm test`, `frontend/ npm test`) before any 010 changes land — establishes the FR-022 green baseline
- [X] T002 [P] Confirm no new runtime dependencies are added in `backend/package.json` or `frontend/package.json` for this feature (plan.md constraint); document baseline versions in `specs/010-react-frontend/quickstart.md` if drift is detected

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire-type contracts and shared connection-banner shell — every user story depends on these. NO user-story phase may start until Phase 2 is complete.

**⚠️ CRITICAL**: All wire payload types and the parity-test extension must land first so the four user stories can proceed independently.

- [X] T003 Add `Sector`, `ConnectedPlayer`, `PlayerSnapshotPayload`, `PlayerJoinedPayload`, `PlayerLeftPayload`, `SectorTransition`, `PhysicsSectorTransitionPayload` interfaces to `frontend/src/types/contracts.ts` per data-model.md §A (FR-027)
- [X] T004 [P] Extend `frontend/test/contracts-parity.spec.ts` to assert the four new wire payload types are exported and structurally complete (FR-027)
- [X] T005 [P] Add typed event-name constants (`'player.snapshot'`, `'player.joined'`, `'player.left'`, `'physics.sector-transition'`) to `frontend/src/types/contracts.ts` so backend and frontend reference identical strings
- [X] T006 Update `frontend/src/socket/socketClient.ts` to ensure `reconnectionDelay: 1000`, `reconnectionDelayMax: 30000`, `randomizationFactor: 0.5` (per research.md R3, FR-020); add inline JSDoc citing FR-020
- [X] T007 [P] Add Vitest test `frontend/test/socketClient.spec.ts` extension verifying the reconnection options above are passed to `io()` (FR-020)

**Checkpoint**: Wire contracts shared, parity test green, socket client backoff configured. User stories can now be implemented in parallel.

---

## Phase 3: User Story 1 — Issue commands and see results in a scrolling log (Priority: P1) 🎯 MVP

**Goal**: A logged-in player types commands, sees them clear, sees results stream into a categorised, auto-scrolling, capped event log; up/down arrows recall the last 20 submissions.

**Independent Test**: Boot backend + frontend, log in as a test ship, type a sequence of valid and invalid commands; each round-trips through the gateway and appears with appropriate styling. Up-arrow recalls the last 20 entries. Submitting clears the input. Buffer caps at 500 with FIFO drop.

### Tests for User Story 1 (write first, ensure they FAIL before implementation)

- [X] T008 [P] [US1] Extend `frontend/test/CommandInput.spec.tsx` with tests for: empty/whitespace suppression (FR-005), 20-entry history bound, up-arrow recall, down-arrow forward recall, draft restoration when cursor returns past most-recent (FR-004)
- [X] T009 [P] [US1] Extend `frontend/test/EventLog.spec.tsx` with tests for: chronological order newest-at-bottom (FR-007), 500-entry buffer cap with FIFO drop (FR-010), sticky-bottom auto-scroll on new entry (FR-008), auto-scroll pause when user scrolls up and resume when they return to bottom (FR-008), category styling for combat/nav/system/chat (FR-009), graceful render of unknown category (FR-011)

### Implementation for User Story 1

- [X] T010 [US1] Update `frontend/src/components/CommandInput.tsx` to maintain `CommandHistory { entries, cursor, draft }` per data-model.md §B.2; add up/down arrow handlers, empty-input suppression, and Enter-to-submit-and-clear (FR-003..FR-005)
- [X] T010a [US1] Configure Tailwind theme in `frontend/tailwind.config.ts` with a single accent color token (green or amber, chosen at build time); add a Vitest class-presence assertion in `EventLog.spec.tsx` or `App.spec.tsx` confirming the accent class is applied to at least one rendered element (FR-001)
- [X] T011 [P] [US1] Update `frontend/src/components/EventLog.tsx` to: cap entries at 500 via slice on push (FR-010), maintain `stickyBottom` boolean (research.md R2), render category-specific styling for combat/nav/system/chat (FR-009), fall back to a generic style for unknown categories (FR-011)
- [X] T012 [US1] Wire `CommandInput.tsx` Enter-submission to `useSocket` so submissions emit `command` and the resulting `command:result` payload appends to the event log (FR-006); ensure new lines flow through the same buffer that broadcasts populate
- [X] T013 [US1] Update `frontend/src/App.tsx` to render the layout regions per FR-002 (top banner area, main event-log pane, command input bar fixed at bottom); preserve existing public behaviors covered by `App.spec.tsx` (FR-022)

**Checkpoint**: User Story 1 fully functional and independently testable — a player can type, recall, and see categorised event-log output.

---

## Phase 4: User Story 2 — See the world around them on an ASCII sector map (Priority: P1)

**Goal**: A 30×15 ASCII grid renders the current sector with the spec's symbol mapping; refreshes on scan results and clears on local-ship sector transitions.

**Independent Test**: Submit `scan`, verify the map renders cells with correct symbols at correct positions. Trigger a `physics.sector-transition` event for the local shipId; verify the previous map state is cleared.

### Tests for User Story 2 (write first, ensure they FAIL before implementation)

- [X] T014 [P] [US2] Extend `frontend/test/ScanMap.spec.tsx` with tests for: 30×15 empty grid when no scan present (FR-012, edge case), symbol mapping (`+` self, `@` ship, `O` planet, `W` wormhole, `*` mine, `.` empty) (FR-014), overlap priority `self > ship > planet > wormhole > mine` (FR-015), clear on `physics.sector-transition` containing local shipId (FR-013)

### Implementation for User Story 2

- [X] T015 [US2] Update `frontend/src/components/ScanMap.tsx` to render a 30×15 monospace grid using `MAXX=30 / MAXY=15` constants from `contracts.ts`, project `ScanCell[]` into characters with the priority sort from research.md R7 (FR-012, FR-014, FR-015)
- [X] T016 [US2] In `ScanMap.tsx` (or a small `useScanMapState` hook colocated with it), maintain `ScanMapState { cells, selfSector }` per data-model.md §B.4; subscribe to `physics.sector-transition` and clear `cells` when the local shipId appears in the transitions array (FR-013)
- [X] T017 [US2] Update `frontend/src/App.tsx` to mount `ScanMap.tsx` in the main right region of the layout (FR-002) and pass the local shipId so transition-clear logic resolves correctly

**Checkpoint**: User Stories 1 AND 2 both work independently — full MVP.

---

## Phase 5: User Story 3 — See who else is online and where (Priority: P2)

**Goal**: A side panel lists every connected ship (name, sector, class), hydrated by `player.snapshot` and updated incrementally via `player.joined` / `player.left` / `physics.sector-transition`. Backend gateway must emit those events.

**Independent Test**: Open two browser sessions on different test userids. Each player appears in the other's panel. Warp one ship; the other player's panel reflects the new sector within one tick. Disconnect one; they disappear within a reasonable interval. Open a second tab on the same userid; first tab disconnects (single-socket invariant) and the panel shows one entry, not two.

### Tests for User Story 3 (write first, ensure they FAIL before implementation)

**Backend (Jest)**

- [X] T018 [P] [US3] Create `backend/test/gateway/player-snapshot.spec.ts` asserting `player.snapshot` is emitted via `socket.emit` (joining socket only, NOT broadcast), contains every ship currently in `ConnectedShipsRegistry`, and fires before any `player.joined` for the same shipId (FR-029)
- [X] T019 [P] [US3] Create `backend/test/gateway/player-join-leave.spec.ts` asserting `player.joined` broadcasts via `this.server.emit` with `{ shipId, name, sector, shipClass }` after the snapshot, and `player.left` broadcasts via `this.server.emit` with `{ shipId }` from `handleDisconnect` only when the socket had been resolved (FR-024, FR-025)
- [X] T020 [P] [US3] Create `backend/test/gateway/single-socket-per-ship.spec.ts` asserting that a second connection for the same shipId disconnects the first; resulting event order is `player.left` (old) → `player.snapshot` (new) → `player.joined` (new) (FR-025a)
- [X] T021 [P] [US3] Create `backend/test/game/tick/sector-transition.spec.ts` asserting: batched `physics.sector-transition` emitted iff ≥1 integer-cell change between ticks; not emitted on a quiet tick; AI ships (Cybertrons + Droids) are included; newly-spawned and despawned ships do NOT produce transition entries (FR-026)

**Frontend (Vitest)**

- [X] T022 [P] [US3] Create `frontend/test/usePlayerList.spec.ts` asserting reducer handles `SNAPSHOT` (replace), `JOIN` (set / overwrite per FR-025a), `LEFT` (delete), and `TRANSITION` (mutate sector, ignore unknown shipId); output is alphabetically sorted by name (FR-018)
- [X] T023 [P] [US3] Create `frontend/test/PlayerListPanel.spec.tsx` asserting the panel renders sorted entries, updates on each event type, and derives sector display from the integer pair `(floor(x), floor(y))` matching FR-026's convention (FR-016, FR-017, FR-017a)

### Implementation for User Story 3 — Backend

- [X] T024 [US3] Create `backend/src/gateway/connected-ships.registry.ts` exporting a `ConnectedShipsRegistry` injectable singleton with `upsert(shipId, socketId): string | undefined`, `remove(socketId): { shipId } | undefined`, `list(): ConnectedPlayer[]` (data-model.md §C.1, research.md R4)
- [X] T025 [US3] Register `ConnectedShipsRegistry` as a provider in the gateway module (`backend/src/gateway/gateway.module.ts` or equivalent) so it is injectable into `GameGateway`
- [X] T026 [US3] Extend `backend/src/gateway/game.gateway.ts` `handleConnection` to: resolve socket → ship, call `registry.upsert`; if upsert returned a prior socketId, call `server.sockets.sockets.get(oldId)?.disconnect(true)` first; then `socket.emit('player.snapshot', { players: registry.list() })`; then `this.server.emit('player.joined', connectedPlayer)` (FR-024, FR-025a, FR-029, research.md R4)
- [X] T027 [US3] Extend `backend/src/gateway/game.gateway.ts` `handleDisconnect` to call `registry.remove(socket.id)`; if a shipId was removed, `this.server.emit('player.left', { shipId })` (FR-025)
- [X] T028 [US3] Create `backend/src/game/tick/sector-transition.subscriber.ts` implementing `SectorTransitionSubscriber` per data-model.md §C.2 and research.md R5: holds `Map<shipId, Sector>` previous-tick cells; on each physics tick, builds current `Map` from `ShipStateService` (all ship types incl. AI), diffs, emits batched `physics.sector-transition` via `this.server.emit` iff non-empty, swaps the snapshot (FR-026)
- [X] T029 [US3] Wire `SectorTransitionSubscriber` into `backend/src/game/tick/tick.module.ts` and the existing physics-tick lifecycle (no new `setInterval`, per plan.md and Constitution III)

### Implementation for User Story 3 — Frontend

- [X] T030 [P] [US3] Create `frontend/src/state/usePlayerList.ts` exporting a `useReducer`-backed hook with actions `SNAPSHOT`, `JOIN`, `LEFT`, `TRANSITION`; internal state is `Map<shipId, ConnectedPlayer>`; selector returns alphabetically-sorted array (data-model.md §B.3, research.md R1)
- [X] T031 [P] [US3] Create `frontend/src/components/PlayerListPanel.tsx` rendering name, sector `(x, y)`, class for each connected ship; consumes `usePlayerList`; derives sector from `floor()` (FR-016, FR-017, FR-018)
- [X] T032 [US3] In `frontend/src/socket/useSocket.ts` (or a thin adjacent subscriber), wire `player.snapshot` / `player.joined` / `player.left` / `physics.sector-transition` event handlers to dispatch the corresponding `usePlayerList` actions (FR-017, FR-017a)
- [X] T033 [US3] Update `frontend/src/App.tsx` to mount `PlayerListPanel.tsx` in the side region (FR-002)

**Checkpoint**: User Stories 1, 2 AND 3 all work independently. Multiplayer awareness functional.

---

## Phase 6: User Story 4 — Stay informed when the connection drops (Priority: P2)

**Goal**: A banner reports disconnected/reconnecting status; the client recovers transparently with backoff; banner clears on reconnect and gameplay resumes without a page refresh.

**Independent Test**: Kill the backend; the banner appears within seconds. Restart the backend; banner clears within ~30 s and command submission works again without refreshing.

### Tests for User Story 4 (write first, ensure they FAIL before implementation)

- [X] T034 [P] [US4] Create `frontend/test/ConnectionBanner.spec.tsx` asserting: hidden when status is `'connected'`; visible with appropriate copy when status is `'connecting'`, `'disconnected'`, or `'reconnecting'`; styling distinguishes states (FR-019)
- [X] T035 [P] [US4] Extend `frontend/test/socketClient.spec.ts` with assertions that emit/receive `connect`, `disconnect`, `reconnect_attempt`, `reconnect` events translate into the four `ConnectionStatus` values (FR-019, FR-021)

### Implementation for User Story 4

- [X] T036 [US4] Create `frontend/src/components/ConnectionBanner.tsx` consuming a `ConnectionStatus` value (`'connecting' | 'connected' | 'disconnected' | 'reconnecting'`); renders nothing when `'connected'`, otherwise a top banner with status-appropriate copy (FR-019, data-model.md §B.5). Keep the existing `ConnectionIndicator.tsx` intact for FR-022 compatibility
- [X] T037 [US4] Update `frontend/src/socket/useSocket.ts` (or `socketClient.ts`) to expose a `ConnectionStatus` value derived from socket.io-client lifecycle events (`connect`, `disconnect`, `reconnect_attempt`, `reconnect`) and clear it back to `'connected'` on successful reconnect (FR-019, FR-021)
- [X] T038 [US4] Update `frontend/src/App.tsx` to mount `ConnectionBanner.tsx` in the top region (FR-002) and pass the live `ConnectionStatus`; ensure command submission resumes automatically on reconnect — no manual refresh path (FR-021)

**Checkpoint**: All user stories independently functional. Feature 010 ready for end-to-end validation.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T039 [P] Update `docs/PROGRESS.md` roadmap section so the remaining roadmap reads exactly: `010=react-frontend, 011=onboarding, 012=social, 013=ship-mgmt, 014=planet-attack, 015=navigation` (FR-028); do NOT modify existing feature log entries
- [X] T040 [P] Update `docs/ARCHITECTURE.md` to add: `ConnectedShipsRegistry` (gateway), `SectorTransitionSubscriber` (tick), `usePlayerList` (frontend state), and the four new wire events
- [X] T041 [P] Append a `docs/DECISIONS.md` entry dated 2026-05-05 covering: last-write-wins single-socket-per-ship, batched per-tick `physics.sector-transition`, no Redux/new-state-layer for player list (research.md R1, R4, R5)
- [X] T042 [P] Append a `docs/PROGRESS.md` feature-log entry for 010 listing completed user stories, test counts, and any deferred follow-ups (e.g. `droid.spawned` / `droid.killed` bridge still pending per spec assumption)
- [X] T043 Run the full Vitest suite (`cd frontend && npm test`) and the full Jest suite (`cd backend && npm test`); confirm all 003-era tests still pass (FR-022) and all new specs are green (FR-023, SC-008)
- [ ] T044 Execute every step of `specs/010-react-frontend/quickstart.md` against a local backend + frontend; verify each row of the manual acceptance walk passes; record any deviations as issues, not as code changes [manual — requires running services]

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies
- **Phase 2 (Foundational)**: depends on Phase 1; BLOCKS all user stories. Wire payloads (T003) must land before any user-story task that imports them
- **Phase 3 (US1, P1) 🎯 MVP**: starts after Phase 2
- **Phase 4 (US2, P1)**: starts after Phase 2; can run in parallel with Phase 3
- **Phase 5 (US3, P2)**: starts after Phase 2; can run in parallel with Phases 3/4. Internally, backend tasks (T018–T021, T024–T029) and frontend tasks (T022–T023, T030–T033) can be split across two developers
- **Phase 6 (US4, P2)**: starts after Phase 2; can run in parallel with Phases 3/4/5
- **Phase 7 (Polish)**: depends on whichever user stories shipped

### User Story Dependencies

- **US1 (P1, MVP)**: independent
- **US2 (P1)**: independent — only consumes the local-shipId from connection state, which already exists pre-010
- **US3 (P2)**: independent of US1/US2 by design — the panel works even if event-log/scan-map are stripped
- **US4 (P2)**: independent — banner is decoupled from any other component

### Within Each User Story

- Tests written and FAIL before implementation (Constitution Principle II + spec-kit rule)
- Backend lifecycle tasks (US3): Registry (T024) before Gateway wiring (T026, T027); subscriber (T028) before tick wiring (T029)
- Frontend state tasks (US3): `usePlayerList` (T030) before `PlayerListPanel` (T031) before App mount (T033)
- App-mount tasks (T013, T017, T033, T038) are last within their story to avoid trivial layout merge conflicts

### Parallel Opportunities

- T004, T005, T007 within Phase 2 (different files)
- T008 + T009 (CommandInput + EventLog tests — different files)
- T011 vs T010 (CommandInput.tsx vs EventLog.tsx)
- All four backend tests T018/T019/T020/T021 (different spec files)
- T022 + T023 (frontend US3 tests — different files)
- T030 + T031 (different files; T031 imports T030, so T030 lands first if same dev)
- T034 + T035 (different test files)
- All Phase 7 docs tasks T039/T040/T041/T042 (different files)

---

## Parallel Example: User Story 3

```bash
# Backend test bay (different files, write together):
Task: "Create backend/test/gateway/player-snapshot.spec.ts"
Task: "Create backend/test/gateway/player-join-leave.spec.ts"
Task: "Create backend/test/gateway/single-socket-per-ship.spec.ts"
Task: "Create backend/test/game/tick/sector-transition.spec.ts"

# Frontend test bay (different files, write together):
Task: "Create frontend/test/usePlayerList.spec.ts"
Task: "Create frontend/test/PlayerListPanel.spec.tsx"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (wire types, parity, socket backoff)
3. Complete Phase 3: US1 (commands + event log)
4. Complete Phase 4: US2 (sector map)
5. **STOP and VALIDATE**: Boot backend + frontend, walk steps 1–4 of quickstart.md
6. Demo / merge-to-main candidate

### Incremental Delivery

1. Setup + Foundational → green CI baseline
2. US1 → Test independently → demo (commands work)
3. US2 → Test independently → demo (map renders)
4. US3 → Test independently → demo (multiplayer awareness)
5. US4 → Test independently → demo (resilient connection)
6. Polish → docs + full quickstart pass

### Parallel Team Strategy

After Phase 2:
- Developer A: US1 (Phase 3)
- Developer B: US2 (Phase 4)
- Developer C: US3 backend (T024–T029) and Developer D: US3 frontend (T030–T033) — both share the wire-types from Phase 2
- Developer E: US4 (Phase 6)

All five tracks merge independently; Phase 7 polish is a single small wrap-up PR.

---

## Notes

- [P] tasks = different files, no incomplete-task dependencies
- [Story] label maps task to user story for traceability
- Tests MUST fail before implementation (TDD discipline, Constitution II)
- No new runtime dependencies (plan.md constraint)
- No Prisma migrations (plan.md: feature is presentation + event-emission only)
- Constitution III: emission piggy-backs on existing physics tick — no new `@Interval` or `setInterval`
- FR-022 baseline: every refactor of `socketClient.ts`, `useSocket`, `ConnectionIndicator`, `EventLog`, `CommandInput`, `ScanMap`, `App.tsx` must keep existing tests green unmodified
