# Feature Specification: Ship Commands & Terminal Frontend

**Feature Branch**: `003-ship-commands`
**Created**: 2026-05-01
**Status**: Draft
**Input**: User description: "003-ship-commands — ShipStateService (in-memory Map + dirty-flag flush), CommandRouter, five core commands (SCAN/REPORT/ROTATE/IMPULSE/WARP), terminal-style React frontend"

## Clarifications

### Session 2026-05-01

- Q: Rotation engine scope — does feature 003 implement the original delta-with-energy-cost rotation engine (`ROTENGUSE`/`ROTAMT`), or only persist the *requested* rotation? → A: A — store the requested rotation only; feature 006 wires `ROTENGUSE`/`ROTAMT` and per-tick application.
- Q: Gating conditions on `impulse`/`warp` (orbit, damage state) — implement now or short-circuit until feature 006? → A: A — short-circuit the deferred gates so they always pass; carry a `TODO(006)` comment that cites the exact `GECMDS.C` line for each gate.
- Q: Scan output shape — original per-object text, new 2D grid only, or both? → A: C — backend emits the original `cmd_scan` per-object text **and** a structured `scanGrid` payload; frontend renders the grid from the payload. Cell shape: `{ x: number, y: number, type: 'ship' | 'planet' | 'wormhole', char: string }[]` — one entry per occupied cell, omitted entries are empty space.

### Session 2026-05-02

- Q: Which `scan` sub-command(s) produce a `scanGrid` payload? → A: A — only `scan lo` produces `scanGrid`. `scan sh` and `scan pl` are named-target text readouts and return text-only `command:result` events with no `scanGrid` field. Bare `scan` with no sub-keyword is an alias for `scan lo` and also produces the grid. This is faithful to `GECMDS.C` — the original `scan_lo` (`GECMDS.C:2640-2726`) is the only sub-command that renders `map[MAXY][MAXX]`; `scan_sh` (`:2190`) and `scan_pl` (`:2295`) emit only text. Supersedes the part of the 2026-05-01 Q3 answer that implied every `cmd_scan` invocation produces a grid; the per-object text contract from that earlier answer remains in force for `sh`/`pl`. Grid dimensions are 30×15 (`MAXX`/`MAXY` from `GEMAIN.H:121-122`), not the previously stated 10×10. Coordinate model is the range-centred tactical projection from `scan_lo` (`xfactor`/`yfactor` at `GECMDS.C:2681-2682`), not "intra-sector".
- Q: How is the player marker delivered in `scanGrid`? → A: A — backend emits one self-cell `{ x: floor(MAXX/2), y: floor(MAXY/2), type: 'self', char: '*' }` as part of every `scan lo` `scanGrid`. The `ScanCellType` enum gains a `'self'` member (now `'ship' | 'planet' | 'wormhole' | 'self'`). Faithful to `GECMDS.C:2721` which writes `map[MAXY/2][MAXX/2] = '*'` server-side; the wire payload remains self-describing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Player issues a flight command and sees their ship change (Priority: P1)

A connected player types a flight command — `rotate 90`, `impulse 50`, or `warp 5` — into the in-game terminal. The server validates the input against the player's ship class, updates the ship's live state, confirms the change with a text response in the player's event log, and the change is persisted within seconds so it survives a server restart.

**Why this priority**: Direct text-command control of one's ship is the defining interaction of the original game. Without it, no other gameplay feature has a meaningful surface for the player. This is the entire point of feature 003.

**Independent Test**: A test player connects, types each flight command with valid and invalid arguments, observes the response lines in their event log, and a separate inspection of the persisted ship record confirms the change landed.

**Acceptance Scenarios**:

1. **Given** a player whose ship is currently heading 0°, **When** they type `rotate 90`, **Then** their ship's heading is updated to reflect a 90° rotation request and a confirmation line is returned to their event log.
2. **Given** a player aboard a ship class with an impulse maximum of 50, **When** they type `impulse 30`, **Then** the impulse speed is set to 30 and a confirmation line is returned.
3. **Given** that same player, **When** they type `impulse 75`, **Then** the request is rejected with the original game's "exceeds maximum" message and impulse speed is unchanged.
4. **Given** a player on a ship class with warp 6 maximum, **When** they type `warp 9`, **Then** the request is rejected with the original game's warp-too-high message and warp speed is unchanged.
5. **Given** a player has just issued a successful flight command, **When** at least one ship-update heartbeat has fired, **Then** the persisted ship record reflects the new state.
6. **Given** the server is restarted between heartbeats, **When** an in-flight ship state has not yet been persisted, **Then** the next persistence cycle within one heartbeat after the relevant change writes the change so no command is silently lost.

---

### User Story 2 - Player inspects the world around them (Priority: P1)

A connected player types `scan` to see what is currently in their sector — other ships, planets, and wormholes — rendered as a 2D grid using the original game's character codes. They type `report` to see the current status of their own ship — class, position, heading, speed, energy, shields, damage, and cargo. Both responses appear in their event log; the scan also populates a dedicated map area.

**Why this priority**: Even before combat or movement, a player must be able to see where they are and what is around them. Without these read-only commands the game is unobservable.

**Independent Test**: A test player connects, types `scan` and `report` with the world in a known seeded state, and observes both responses match the original game's text format and character codes for the configured world contents.

**Acceptance Scenarios**:

1. **Given** a player whose sector contains another ship, a planet, and a wormhole, **When** they type `scan`, **Then** they receive a 2D character grid showing each object at its correct position using the original game's character codes.
2. **Given** any active player, **When** they type `report`, **Then** they receive a multi-line status read-out covering ship class, position, heading, current impulse and warp speed, energy, shields, damage percentage, and cargo, formatted to match the original game.
3. **Given** a player whose sector is empty, **When** they type `scan`, **Then** they receive an empty grid (no objects) with no error.

---

### User Story 3 - Player input is forgiving and the system handles errors safely (Priority: P2)

The terminal accepts the original game's command keywords and short aliases, ignores leading/trailing whitespace, and tolerates extra spaces between arguments. Unknown commands produce a single recognizable error line that matches the original game. Missing or malformed numeric arguments produce a per-command error line that matches the original game.

**Why this priority**: A faithful command surface must be friendly enough that a player familiar with the 1988 client can reproduce muscle-memory inputs without surprise rejections. Not P1 because the five commands themselves work without it, but landing it now prevents rework later when more commands are added.

**Independent Test**: A test player can issue every command with leading whitespace, extra spaces, mixed case, and recognized aliases, and receive the same successful response as the canonical form. Issuing an unknown command produces the unknown-command error line. Issuing a known command with bad arguments produces the per-command error line.

**Acceptance Scenarios**:

1. **Given** any active player, **When** they type `   ROT 45  `, **Then** the rotate command is dispatched as if they had typed `rot 45` (case-insensitive, whitespace-tolerant).
2. **Given** any active player, **When** they type `flarp`, **Then** they receive the original game's unknown-command error line and no state changes.
3. **Given** any active player, **When** they type `rotate` with no argument, **Then** they receive the original game's missing-argument error line and the ship's heading does not change.
4. **Given** any active player, **When** they type `rotate abc`, **Then** they receive the original game's invalid-degree error line and the ship's heading does not change.

---

### User Story 4 - Player has a usable terminal interface (Priority: P1)

A player loads the web client, sees a connection indicator confirming they are connected to the live server, types commands into a single-line input at the bottom of the screen, watches their event log scroll on the left, and sees the most recent sector scan rendered as a fixed-character grid on the right. Disconnection is visually indicated and the client attempts to reconnect.

**Why this priority**: Without a usable interface the backend commands cannot be exercised by a real player. The terminal aesthetic is a stated fidelity goal.

**Independent Test**: A test runner can load the client, observe the connect indicator, type a command, observe the input clear after submit, observe the response line append to the event log and auto-scroll into view, and observe the scan map update on a `scan`. Forced disconnect produces a visible reconnect indicator.

**Acceptance Scenarios**:

1. **Given** the client has just loaded, **When** the WebSocket connection succeeds, **Then** a connection indicator confirms the live state.
2. **Given** the client is connected, **When** the player presses Enter on the command input, **Then** the input clears and the typed text is sent to the server.
3. **Given** the server returns response lines, **When** they arrive, **Then** they append to the event log in the order received and the log auto-scrolls so the newest line is visible.
4. **Given** the player issues a `scan`, **When** the server returns scan data, **Then** the scan map area renders the new grid and replaces any prior scan.
5. **Given** the connection drops, **When** the network is gone, **Then** a reconnect indicator is visible and the client attempts to reconnect automatically.

---

### Edge Cases

- A command issued for a player with no associated ship in memory must produce a clear error rather than a silent failure or a server crash.
- A command issued before the player's ship state has been hydrated from storage at boot must either wait for hydration or produce a deterministic "not ready" response — never a partial update.
- The persistence cycle must only write ships whose state has actually changed since the last write — clean ships must not generate database load every heartbeat.
- A subscriber error during the persistence cycle must not stop other ships from being persisted, and must not stop subsequent persistence cycles from running.
- Two commands issued in rapid succession (within the same heartbeat) must both be reflected in the next persistence write — the dirty flag must not be cleared mid-mutation.
- Negative or zero values for impulse and warp must be handled per the original game — see clarification.
- A `scan` issued for a sector with no contents must return an empty grid, not an error.
- Server restart mid-session: the player's last persisted ship state is the recovery point; in-memory changes within the past heartbeat may be lost — this is acceptable per the flush cadence.

## Requirements *(mandatory)*

### Functional Requirements

#### Ship state, in-memory and persistence

- **FR-001**: The server MUST hold a live in-memory copy of every ship's full flight state, keyed by player identifier, populated from persistent storage at server startup.
- **FR-002**: The server MUST treat the in-memory copy as the source of truth for command processing and tick-engine reads during gameplay.
- **FR-003**: Every state mutation MUST mark the affected ship as having unsaved changes.
- **FR-004**: On every 1-second ship-update heartbeat, the server MUST persist all ships marked as having unsaved changes since the previous cycle, and MUST NOT write ships with no changes.
- **FR-005**: After a successful persistence write, the affected ship's unsaved-changes flag MUST be cleared.
- **FR-006**: A persistence error for one ship MUST NOT prevent other ships from being persisted in the same cycle, and MUST NOT prevent the next persistence cycle from running.
- **FR-007**: The in-memory ship structure MUST mirror the persisted ship structure exactly — no field divergence is permitted.

#### Command intake and routing

- **FR-008**: The server MUST accept command text from a connected client over the existing real-time channel via a `command` event carrying `{ input: string }`.
- **FR-009**: The server MUST tokenise raw input into a keyword and zero or more arguments, ignoring leading and trailing whitespace and collapsing internal whitespace.
- **FR-010**: Keyword matching MUST be case-insensitive and MUST recognise the original game's recognised aliases (e.g. `rot` for `rotate`).
- **FR-011**: The server MUST respond to every command — successful, rejected, or unknown — via a `command:result` event carrying `{ lines: string[], scanGrid?: ScanCell[] }` where `ScanCell` is `{ x: number, y: number, type: 'ship' | 'planet' | 'wormhole', char: string }` (see FR-016). The `scanGrid` field is present only on responses produced by the `scan` command.
- **FR-012**: An unrecognised keyword MUST produce the original game's unknown-command response line.
- **FR-013**: A recognised keyword with too few arguments MUST produce the per-command missing-argument response line as defined by the original game.
- **FR-014**: A recognised keyword with malformed arguments MUST produce the per-command invalid-argument response line as defined by the original game.

#### The five commands

- **FR-015**: The `report` command MUST return a multi-line ship status read-out covering ship class, sector and intra-sector position, heading, impulse and warp speed, energy, shields (front and back where applicable), damage percentage, and cargo, faithful to the original game's `cmd_report` output format.
- **FR-016**: The `scan` command MUST dispatch by sub-keyword per `cmd_scan` (`GECMDS.C:2138`):
  - `scan lo` (and bare `scan` with no sub-keyword, treated as alias of `scan lo`) MUST return BOTH (a) the original game's `scan_lo` text header lines (`SCAN24` and the rendered map per `GECMDS.C:2640-2726`) AND (b) a structured `scanGrid` payload. The `scanGrid` is an array of cells `{ x: number, y: number, type: 'ship' | 'planet' | 'wormhole', char: string }`; one entry per occupied position; empty positions omitted. Coordinates use the original game's range-centred tactical projection: `x ∈ [0, MAXX)` (i.e. `[0, 30)`), `y ∈ [0, MAXY)` (i.e. `[0, 15)`), where `MAXX = 30` (`GEMAIN.H:121`) and `MAXY = 15` (`GEMAIN.H:122`). The projection formula is `xfactor = (range × 2) / (MAXX − 1)`, `yfactor = (range × 2) / (MAXY − 1)` per `GECMDS.C:2681-2682`, with `range` derived from `shipclass.scanrange`. An empty range returns an empty array.
  - `scan sh <name>` MUST return the original `scan_sh` per-target text readout (`GECMDS.C:2190`) — `lines` only, no `scanGrid` field.
  - `scan pl <name>` MUST return the original `scan_pl` per-target text readout (`GECMDS.C:2295`) — `lines` only, no `scanGrid` field.
  - `scan ra` and `scan se` are out of scope for this feature (see assumptions); requesting them MUST return the standard `SCANFMT` usage line.
  - In all cases the response is a single `command:result` event; `lines` carries the text and the optional `scanGrid` field is present ONLY for `scan lo` / bare `scan`.
- **FR-017**: The `rotate <degrees>` command MUST validate the argument as a non-negative integer in the range accepted by the original game (`valdegree`), record the *requested* rotation delta on the ship's state (mirroring `WARSHP.degrees` in `GECMDS.C:643`), and confirm with the original game's response. Per-tick application of the rotation, energy cost (`ROTENGUSE`), and per-tick rotation amount (`ROTAMT`) are out of scope for this feature and will be wired in feature 006.
- **FR-018**: The `impulse <speed>` command MUST validate the argument against the player's ship class's impulse maximum (per `cmd_impulse`, `GECMDS.C:482`), apply the new impulse speed to ship state, and reject out-of-range requests with the original game's "exceeds maximum" response.
- **FR-019**: The `warp <speed>` command MUST validate the argument against the player's ship class's warp maximum (per `cmd_warp`, `GECMDS.C:561`), apply the new warp speed to ship state, and reject out-of-range requests with the original game's warp-too-high response.
- **FR-019a**: Gating conditions in the original `cmd_impulse` / `cmd_warp` that depend on systems not yet implemented (orbit lock, damage-state restrictions, etc.) MUST short-circuit to "allow" in this feature. Each short-circuited gate MUST carry a source-code comment of the form `TODO(006): see GECMDS.C:<line>` referencing the original gate so feature 006 can wire it up without searching.
- **FR-020**: Every state mutation produced by `rotate`, `impulse`, or `warp` MUST mark the ship as having unsaved changes per FR-003.
- **FR-021**: Numeric ranges, message strings, and per-command rejection conditions MUST trace back to identifiable lines in `GECMDS.C`, `GEFUNCS.C`, or `GEMAIN.H` — guesses are not permitted.

#### Frontend terminal client

- **FR-022**: The client MUST render a full-viewport dark layout in a monospace font with three regions: a scrolling event log, a scan map area, and a single-line command input at the bottom.
- **FR-023**: Pressing Enter in the command input MUST send the typed text to the server as a `command` event and MUST clear the input.
- **FR-024**: Lines received in `command:result` events MUST be appended to the event log in arrival order and the log MUST auto-scroll so the newest line is visible.
- **FR-025**: Event log lines MUST be visually differentiated by category (system, info, success, combat) so combat output is distinguishable from informational output.
- **FR-026**: When a `command:result` carries scan data, the scan map area MUST render the new grid and replace any prior scan.
- **FR-027**: The client MUST display a visible connection indicator and a visible disconnect/reconnect indicator that reflect the live socket state.
- **FR-028**: The client MUST reach the development backend's real-time endpoint without manual configuration — the dev build's proxy handles routing.
- **FR-029**: The client MUST identify the active player to the backend on connect; in this feature the identifier is hard-coded for development and replaced by authentication in a future feature.
- **FR-030**: The active ship for a connection MUST be resolved server-side on socket handshake from the connecting player's persisted ships, NOT via an in-game command. This matches the original game's architecture, in which ship selection occurred in the MajorBBS shell menu before the in-game prompt — there is no BOARD/SELECT command in `GECMDS.C` (verified against the command table at `GECMDS.C:124-167`). Resolution rule for this feature MUST be exactly as follows, with no implementation latitude:

  - The gateway queries `Ship` rows by `userid` ordered by `shipno` ascending.
  - **Zero rows**: the connection MUST be rejected. The server emits one `error` event with `{ code: 'NO_SHIP', message: 'No ship found for user.' }` and then calls `disconnect(true)`. No `command:result` is emitted. No `Ship` row is created — auto-creation is a feature 005 (planet purchase) responsibility.
  - **Exactly one row**: that row's `shipno` MUST be bound to the connection at `socket.data.activeShipNo`.
  - **Two or more rows**: the **lowest `shipno`** (the first row in the ascending sort) MUST be bound. The server MUST log one warning line of the form `[ShipStateService] WARN multiple ships for userid=<id>, picked lowest shipno=<n>` so the modernization tie-break is observable. The connection MUST NOT be rejected and the player MUST NOT be prompted to choose. Multi-ship selection is a future feature; lowest-shipno is the chosen tie-break **because**: (a) it is deterministic — the same `userid` reconnecting hits the same ship every time, which is required for testability and for the dirty-flag flush to land on a stable target; (b) the `Ship` model has no `lastActiveAt` / `lastFlownAt` column, so a "most recently used" rule is not implementable without a schema migration this feature deliberately avoids; (c) `shipno` is part of the composite primary key and therefore always present, never null, never tied — there is no second-order tie-break to specify.

  Every command handler MUST read the active ship via the `(client.data.userid, client.data.activeShipNo)` composite key — no command in scope mutates which ship is active. A handler that cannot find a `ShipState` for its connection's bound key MUST return a single `system`-category line "No active ship." (this should not occur in normal operation — the handshake guarantees the binding — but the guard prevents a silent crash if state desyncs).

### Key Entities *(include if feature involves data)*

- **Live ship state**: The in-memory representation of one player's ship — every field of the persisted ship plus an unsaved-changes flag. Mirrors the persisted ship one-for-one (FR-007). Key: player identifier.
- **Command**: A registered handler for one keyword. Carries the keyword, its recognised aliases, its minimum argument count, and an executor that takes the live ship and parsed arguments and returns response lines.
- **Command result**: An ordered list of text lines to send back to the issuing client. May also carry zero or more broadcast events for delivery to a sector room (broadcasts are scaffolded in this feature; no command in scope produces one yet).
- **Event log line**: One text line displayed to the player, tagged with a category (system, info, success, combat) for visual styling.
- **Scan grid**: A 2D structured representation of the player's range-scan, emitted ONLY by `scan lo` (and bare `scan` as alias). Shape: `{ x: number, y: number, type: 'ship' | 'planet' | 'wormhole' | 'self', char: string }[]`. Coordinates are range-centred per `scan_lo` (`GECMDS.C:2640-2726`): `x ∈ [0, MAXX)` with `MAXX = 30`, `y ∈ [0, MAXY)` with `MAXY = 15`. The `char` field is the original game's character code for the object. The backend includes a self-cell at `(floor(MAXX/2), floor(MAXY/2))` with `type: 'self'`, `char: '*'` per `GECMDS.C:2721`. An empty range produces a `scanGrid` containing only the self-cell. The frontend renders this payload into the map panel; it does not parse the text lines to build the grid. `scan sh` and `scan pl` do NOT produce this payload.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player who knows the original game's commands can issue `scan`, `report`, `rotate`, `impulse`, and `warp` in this client and receive responses whose text and numeric formatting are indistinguishable from the original — verified by character-level diff of representative outputs against the strings in `GECMDS.C`.
- **SC-002**: Every state-changing command produces a persisted database write within one ship-update heartbeat (≤ 1 second under normal load).
- **SC-003**: A persistence cycle in which no ship has been mutated produces zero database writes (verified by query counter).
- **SC-004**: An unknown or malformed command produces a single response line and zero state mutations 100% of the time.
- **SC-005**: A player loading the client and typing one command sees the result appear in the event log in under 100 ms of round-trip time on a development network.
- **SC-006**: The server starts with N persisted ships and the in-memory map contains exactly N entries before the first heartbeat fires.
- **SC-007**: Backend test count grows by at least 35 new tests covering ship state hydration, dirty-flag flush behaviour, command router dispatch, each of the five commands (success and failure paths), and the socket round-trip; frontend test count is at least 6 covering event log, command input, and scan map rendering.

## Assumptions

- One active ship per player for this feature. The original game permits multi-ship ownership; multi-ship selection is deferred. Active-ship resolution happens at socket handshake (FR-030), not via an in-game command — this is faithful to the original, which selected the active ship in the BBS shell menu before entering the game (no BOARD/SELECT entry exists in the `GECMDS.C` command table at lines 124-167). The in-memory `Map` is keyed by `(userid, shipno)`; the per-connection binding `socket.data.activeShipNo` lets handlers look up the right entry.
- No authentication. The active player identifier is hard-coded in the development client; production authentication is a separate feature.
- The 1-second persistence cadence is acceptable as the recovery point. A crash within the past heartbeat may lose in-memory mutations not yet flushed; this matches the trade-off chosen in feature 002 for the heartbeat itself.
- The five commands in scope require no inter-ship effects (no combat, no orbit, no warp travel resolution). Movement physics — actually advancing the ship across the galaxy each tick — remains in feature 002's tick scaffold and is not implemented here. This feature only sets the *requested* speed and heading; physics integration is feature 006.
- Sector contents read by `scan` come from the persisted Sector / Planet / Wormhole / Ship tables seeded in feature 001. The procedural galaxy generator is feature 004; this feature reads whatever rows are present and renders them.
- Cybertron and droid ships, if any are present in the database, are visible to `scan` like player ships. Their AI behaviour is features 007–008; their static presence is rendered here.
- Frontend dev experience targets desktop browser first; mobile is out of scope.
- No internationalisation. All response strings are English ASCII per the original game.
- Existing 002 tick-engine subscriber registry is the integration point for the persistence cycle — no new heartbeat infrastructure is introduced.

## Open Questions

**Q1 RESOLVED**: Option A — store the requested rotation delta only (`warsptr->degrees`). `ROTENGUSE`, `ROTAMT`, energy cost, and per-tick application are deferred to feature 006. No rotation engine in this feature.

**Q2 RESOLVED**: Option A — all gating conditions on `impulse` and `warp` (orbit check, damage-state restrictions) short-circuit to allow in this feature. Each gate must have an explicit `// TODO(006): see GECMDS.C:NNN` comment referencing the exact source line.

**Q3 RESOLVED**: Option C — the `scan` command returns both (a) the original per-object text lines matching `cmd_scan` output, appended to the event log, and (b) a structured `scanGrid` payload. The frontend renders the grid from the payload. The `scanGrid` payload shape is: `Array of { x: number, y: number, type: 'ship' | 'planet' | 'wormhole', char: string }`. The `char` field uses the original game's character code for that object type.
