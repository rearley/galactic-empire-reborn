# Feature Specification: Terminal UI — Command Input, Event Log, ASCII Sector Map, Player Panel

**Feature Branch**: `010-react-frontend`
**Created**: 2026-05-05
**Status**: Draft
**Input**: User description: "Feature 010 — replace 003-vintage frontend scaffolding with a shippable terminal UI for v1 playtesting: command bar with history, scrolling event log, 30×15 ASCII sector map, player list panel, robust connection lifecycle."

## Clarifications

### Session 2026-05-05

- Q: Are `player.joined`, `player.left`, and `physics.sector-transition` already emitted by the backend? → A: No — backend audit confirmed they are not currently emitted. Feature 010 scope expands to include the backend gateway/physics changes that emit them (rather than splitting them into a separate feature).
- Q: Where should `physics.sector-transition` be emitted from — the physics tick or command handlers? → A: From the physics tick, when a ship's integer sector cell changes between ticks. This ensures AI ships (Cybertrons, Droids) also trigger transitions, not just human-issued movement commands.
- Q: What is the broadcast scope for `player.joined` / `player.left`? → A: Galaxy-wide (`this.server.emit`), since the player-list panel shows every connected ship across the galaxy.
- Q: How does the player-list panel populate initially when a client connects (before any join/left/transition event arrives)? → A: Backend emits a `player.snapshot` event to the joining socket only on `handleConnection`, containing the full list of currently connected ships; subsequent updates remain incremental.
- Q: What is the broadcast scope and shape of `physics.sector-transition`? → A: Galaxy-wide but batched — one event per physics tick carrying an array of all transitions that occurred that tick, not one event per ship. Keeps wire traffic bounded as AI populations grow.
- Q: How should the backend handle multiple concurrent sockets for the same ship (second browser tab, reconnect overlap)? → A: Last-write-wins. When a new socket resolves to a shipId already held by another live socket, the prior socket is server-disconnected; `player.left` fires for the old socket then `player.joined` fires for the new one. No reference counting; single live socket per ship is the v1 invariant.
- Q: How is each ship's float `(x, y)` projected to the integer sector pair shown in the player-list panel? → A: `floor(x)`, `floor(y)` — same convention as FR-026's transition detection, so the displayed sector always equals the `toSector` of the most recent transition event for that ship.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Issue commands and see results in a scrolling log (Priority: P1)

A returning player loads the game in a desktop browser. They see a dark, monospace terminal with a command input bar at the bottom and a scrolling event log filling the main pane. They type `scan`, press Enter, and the log shows the result. They press the up arrow, recall the previous `scan`, edit it to `scan 5 7`, and press Enter again. Combat and navigation messages arrive from other players in their sector and are appended to the log in real time, color-coded by type.

**Why this priority**: Without a command bar and event log, the game is unplayable. This single slice — input in, log out — is the smallest viable terminal experience and exercises the full Socket.io request/response/broadcast loop the backend already provides.

**Independent Test**: Boot backend + frontend, log in as a test ship, type a sequence of valid and invalid commands, verify each round-trips through the gateway and appears in the log with appropriate styling. Recall via up-arrow works for the last 20 entries. Submitting clears the input.

**Acceptance Scenarios**:

1. **Given** the player is connected, **When** they type a valid command and press Enter, **Then** the input clears and the result appears in the event log within one tick.
2. **Given** the player has submitted at least one command, **When** they press the up arrow, **Then** the input is populated with the most recent submission; pressing up again recalls the one before, up to 20 entries.
3. **Given** the event log has more entries than fit on screen, **When** a new entry arrives, **Then** the log auto-scrolls to the bottom unless the player has manually scrolled up.
4. **Given** an event of type combat/nav/system/chat is received, **When** it is rendered, **Then** it is visually distinguishable (color or prefix) from other types.

---

### User Story 2 — See the world around them on an ASCII sector map (Priority: P1)

The player runs `scan` (or warps into a new sector). A 30×15 grid panel updates to show the current sector: their own ship as `+`, other ships as `@`, planets as `O`, wormholes as `W`, mines as `*`, empty space as `.`. The map refreshes when scan results arrive or when a sector-transition event indicates the player has moved.

**Why this priority**: The sector map is the second pillar of the original game's feel. Without it, players have no spatial awareness. It is independently testable from the event log.

**Independent Test**: Submit a `scan` command, verify the map panel renders the returned cells with correct symbols at correct grid positions. Trigger a sector-transition event, verify the map clears and re-populates from the next scan or transition payload.

**Acceptance Scenarios**:

1. **Given** a scan result arrives with a list of sector cells, **When** the map renders, **Then** each entity is drawn at its (x, y) using the symbol mapping (ship `@`, planet `O`, wormhole `W`, mine `*`, self `+`).
2. **Given** the player warps to a new sector, **When** the sector-transition event fires, **Then** the previous map state is cleared and replaced with the new sector contents.
3. **Given** the map has no current scan, **When** rendered, **Then** it shows a 30×15 grid of empty-space markers.

---

### User Story 3 — See who else is online and where (Priority: P2)

A side panel lists all currently connected ships: name, current sector, and class. As players join, leave, or warp, the list updates without a page refresh.

**Why this priority**: Multiplayer awareness — knowing who is in the galaxy and where — drives engagement but is not required to play a single command. Belongs to the second wave.

**Independent Test**: Open two browser sessions on different test accounts. Verify each player appears in the other's panel. Warp one ship; verify the other player's panel reflects the new sector. Disconnect one; verify they disappear from the other's panel within a reasonable interval.

**Acceptance Scenarios**:

1. **Given** another ship connects, **When** the player.joined event arrives, **Then** the new ship appears in the player list with name, sector, and class.
2. **Given** a listed ship warps to a new sector, **When** the sector-transition event fires for that ship, **Then** the panel updates that ship's sector value.
3. **Given** a listed ship disconnects, **When** the player.left event arrives, **Then** that ship is removed from the list.

---

### User Story 4 — Stay informed when the connection drops (Priority: P2)

If the websocket connection drops (server restart, network blip), a banner appears at the top of the screen indicating disconnection. The client transparently retries with backoff. When the connection is restored, the banner disappears and gameplay resumes; any state that needs refresh is re-fetched.

**Why this priority**: A persistent 24/7 game must survive flaky networks. Players need to know they are not connected, and the client must recover without a manual refresh. Below the core play loop in priority because users can refresh the browser as a fallback.

**Independent Test**: Kill the backend; verify banner appears within a few seconds. Restart backend; verify banner disappears and command submission works again without a page refresh.

**Acceptance Scenarios**:

1. **Given** the websocket is connected, **When** the connection drops, **Then** a "Disconnected — reconnecting…" banner appears at the top of the viewport.
2. **Given** the client is in a disconnected state, **When** retry attempts are made, **Then** they use exponential backoff (capped at a reasonable ceiling) so as not to hammer a recovering server.
3. **Given** the connection is restored, **When** the socket re-handshakes successfully, **Then** the banner disappears and command submission resumes normally.

---

### Edge Cases

- The event log accumulates events for a long-running session and must not degrade the browser. The client trims to a maximum buffer (e.g., last 500 entries).
- A player submits an empty or whitespace-only command — the client suppresses it (no round-trip, no log entry).
- The player presses up arrow with no submission history — input remains empty, no error.
- A scan returns no entities for a sector — the map renders all empty cells, no error.
- A `droid.spawned` or `droid.killed` event arrives once the backend bridges them — the event log renders them as a generic system/combat event without crashing, even though styling is not yet specialised.
- The player resizes the window — terminal layout remains usable on standard desktop widths (≥1024px). Mobile layout is out of scope.
- The user manually scrolls up to read history — auto-scroll pauses; resumes when they scroll back to the bottom.

## Requirements *(mandatory)*

### Functional Requirements

**Layout & aesthetic**
- **FR-001**: The UI MUST present as a single full-viewport terminal with a dark background, monospace font, and a single accent text color (green or amber) chosen at build time for v1.
- **FR-002**: The UI MUST be laid out in regions: a top connection-status banner area, a main event-log pane, an ASCII sector-map panel, a player-list panel, and a command input bar fixed at the bottom.

**Command input**
- **FR-003**: Players MUST be able to type a command into the input bar and submit it by pressing Enter; the input MUST clear after submission.
- **FR-004**: The client MUST maintain a per-session command history of the last 20 submissions; pressing up arrow recalls older entries, down arrow recalls newer ones, returning past the most recent restores the in-progress draft.
- **FR-005**: The client MUST NOT submit empty or whitespace-only commands.
- **FR-006**: The client MUST send each submitted command to the gateway as a `command` request and surface the resulting payload in the event log.

**Event log**
- **FR-007**: The event log MUST display events in chronological order with newest at the bottom.
- **FR-008**: The event log MUST auto-scroll to the bottom when new entries arrive, unless the user has manually scrolled away from the bottom; in that case auto-scroll MUST resume once they return to the bottom.
- **FR-009**: The event log MUST visually distinguish at least four message categories — combat, navigation, system, and chat — by color and/or prefix.
- **FR-010**: The event log MUST cap retained entries at a defined maximum (e.g., 500) and discard oldest entries on overflow.
- **FR-011**: The event log MUST gracefully render any incoming event whose category is unknown (e.g., future `droid.spawned`, `droid.killed`) using a generic style without throwing.

**Sector map**
- **FR-012**: The sector map MUST render a 30×15 grid using monospace characters.
- **FR-013**: The sector map MUST update its contents when a scan-command result arrives or when a sector-transition event indicates the player has changed sectors.
- **FR-014**: The sector map MUST use these symbol assignments: own ship `+`, other ships `@`, planets `O`, wormholes `W`, mines `*`, empty `.`.
- **FR-015**: When two entities occupy the same cell, the map MUST render a deterministic priority (self > ship > planet > wormhole > mine).

**Player list**
- **FR-016**: The player list MUST show every currently connected ship with name, current sector, and class. Sector MUST be displayed as the integer pair `(floor(x), floor(y))` derived from the ship's float position, matching the convention used by `physics.sector-transition` (FR-026).
- **FR-017**: The player list MUST update incrementally on player.joined, player.left, and sector-transition events without a full page refresh.
- **FR-017a**: On client connect, the player list MUST be initialised from a `player.snapshot` event emitted by the backend to the joining socket only, containing the full list of currently connected ships. Incremental events (FR-017) take over after the snapshot is applied.
- **FR-018**: The player list MUST sort entries in a stable order (alphabetical by name is the default).

**Connection lifecycle**
- **FR-019**: The client MUST establish a Socket.io connection on load and display its status (connected / connecting / disconnected / reconnecting) via a banner that is only visible when not in the connected state.
- **FR-020**: When the connection drops, the client MUST automatically attempt to reconnect with exponential backoff, capped at a reasonable ceiling (e.g., 30 seconds between attempts).
- **FR-021**: On successful reconnect, the client MUST clear the disconnected banner and resume normal command submission without requiring a page refresh.

**Compatibility**
- **FR-022**: All existing 003-era frontend tests MUST continue to pass; refactors of `socketClient.ts`, `useSocket`, `ConnectionIndicator`, `EventLog`, `CommandInput`, `ScanMap`, and `App.tsx` MUST preserve the public behaviors those tests cover.
- **FR-023**: Each new component or hook introduced by this feature MUST be covered by at least one Vitest test for its primary behavior.

**Backend event emission (added per 2026-05-05 clarification)**
- **FR-024**: The backend `GameGateway` MUST emit a `player.joined` event galaxy-wide (`this.server.emit`) from `handleConnection` once a connected socket is resolved to a ship, with payload `{ shipId, name, sector: { x, y }, shipClass }`.
- **FR-025**: The backend `GameGateway` MUST emit a `player.left` event galaxy-wide (`this.server.emit`) from `handleDisconnect` when a previously-resolved ship's socket disconnects, with payload `{ shipId }`.
- **FR-025a**: The backend MUST enforce a single live socket per `shipId` (last-write-wins). When `handleConnection` resolves a new socket to a shipId that already has a live socket, the prior socket MUST be server-disconnected; the resulting sequence MUST be `player.left` (old) → `player.snapshot` (new) → `player.joined` (new). The player list therefore never contains duplicate entries for the same ship.
- **FR-026**: The backend physics tick MUST emit a single batched `physics.sector-transition` event per tick (galaxy-wide via `this.server.emit`) whenever one or more ships' integer sector cells `(floor(x), floor(y))` changed between the previous and current tick. The batch MUST include transitions for all ship types — human-controlled, Cybertrons, and Droids — so that the player-list panel and other consumers stay in sync regardless of who initiated the movement. If no transitions occurred in a tick, no event is emitted. Payload: `{ transitions: Array<{ shipId, fromSector: { x, y }, toSector: { x, y } }> }`.
- **FR-027**: The TypeScript payload contracts for `player.joined`, `player.left`, `physics.sector-transition`, and `player.snapshot` MUST be defined in `frontend/src/types/contracts.ts` and MUST be the single source of truth shared by backend emitters and frontend consumers.
- **FR-029**: The backend `GameGateway` MUST emit a `player.snapshot` event to the joining socket only (`socket.emit`, not broadcast) inside `handleConnection`, after the socket is resolved to a ship and before any `player.joined` broadcast. Payload: `{ players: Array<{ shipId, name, sector: { x, y }, shipClass }> }`.

**Housekeeping**
- **FR-028**: `docs/PROGRESS.md`'s roadmap section MUST be updated as part of this feature so that the remaining roadmap reads: 010=react-frontend, 011=onboarding, 012=social, 013=ship-mgmt, 014=planet-attack, 015=navigation. Existing feature log entries MUST NOT be modified.

### Key Entities *(include if feature involves data)*

- **Event log line**: A timestamped, categorized message destined for the scrolling log. Carries a category (combat/nav/system/chat/unknown), a text body, and an optional source ship identifier. Sourced from the backend's `EventLogLine` contract.
- **Scan cell**: A single (x, y) position within a sector with an entity kind (ship/planet/wormhole/mine/self) and a reference identifier. Sourced from the backend's `ScanCell` contract.
- **Connected player**: An entry in the player list — display name, current sector coordinates, ship class. Maintained client-side from gateway events.
- **Command history entry**: A previously submitted command string retained in client memory only. Bounded to the last 20 entries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new player can submit their first command and see the resulting event in the log within 2 seconds of page load on a stable connection.
- **SC-002**: After running `scan`, the sector map reflects the result within one physics tick (≤6 seconds in the worst case, typically immediate).
- **SC-003**: Commands round-trip from input to log entry in under 500ms median on a local development environment.
- **SC-004**: When the backend is restarted, the client visibly enters a disconnected state, then automatically returns to a working state within 60 seconds without the user refreshing the browser.
- **SC-005**: A returning player can recall and resubmit their previous 20 commands using only the up arrow, without ever touching the mouse.
- **SC-006**: A returning player whose session receives 1000 broadcast events maintains a responsive UI — no visible freeze when typing or scrolling — thanks to the 500-entry buffer cap discarding oldest entries on overflow.
- **SC-007**: Two players in the same sector each see each other in the player list with correct sector coordinates within 2 seconds of either joining or warping.
- **SC-008**: All Vitest frontend tests pass — both the existing 003-era suite and the new tests added in this feature.

## Assumptions

- The target experience is desktop, mouse-and-keyboard, viewport ≥1024px wide. Mobile and touch layouts are explicitly out of scope.
- The accent color (green or amber) and exact symbol set are chosen by the implementer at build time; making either operator-configurable is out of scope for v1.
- Sound is out of scope.
- A settings/preferences UI is out of scope.
- Authentication UI (`cmd_new`, `cmd_rename`) is out of scope and will be delivered in feature 011-onboarding. For v1 of this feature, the existing test ship resolution path used by the gateway is sufficient to establish a session.
- The backend already emits the previously-existing typed events listed in `frontend/src/types/contracts.ts` (e.g. `command.result`, scan results, combat broadcasts); this feature consumes them. The three additions — `player.joined`, `player.left`, and `physics.sector-transition` — are NOT yet emitted and ARE in scope for this feature (see FR-024..FR-027).
- `droid.spawned` and `droid.killed` events are not yet bridged from the backend's internal event bus to Socket.io (per 008 known issues). This feature does not block on that bridge but renders such events safely if/when they arrive.
- Event log buffer cap (500) and command history depth (20) are chosen as reasonable defaults; tuning is out of scope.
- Reconnect backoff schedule (e.g., 1s, 2s, 4s, 8s, 16s, 30s cap) is a reasonable default; exact schedule is left to the implementer.
- Work in this feature spans both the `frontend/` package and targeted additions to `backend/` (`GameGateway` connection lifecycle hooks and the physics tick emitter). All other backend modules are untouched.
