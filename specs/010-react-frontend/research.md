# Phase 0 Research — 010 React Frontend

All NEEDS CLARIFICATION items from Technical Context are resolved here.
Each entry follows the Decision / Rationale / Alternatives format.

## R1. State management for the player list

**Decision**: A single `usePlayerList` React hook backed by `useReducer`,
keyed by `shipId`. Hydrated by `player.snapshot`, mutated by `player.joined`,
`player.left`, and `physics.sector-transition`.

**Rationale**:
- The list is small (tens to low hundreds of ships) and changes infrequently
  relative to render cost; a reducer with a `Map<shipId, ConnectedPlayer>`
  inside is O(1) for all event paths.
- No Redux / Zustand needed — Constitution Principle III rules out unnecessary
  state layers, and the data does not cross feature boundaries.
- A reducer (rather than ad-hoc `useState`) makes the four event types into
  named actions that are trivial to test in isolation.

**Alternatives rejected**:
- Redux Toolkit — overkill for one panel's worth of state, adds a new dep.
- Pulling from a re-fetched HTTP endpoint on each event — couples to backend
  semantics that don't exist (no REST surface for connected ships) and loses
  the per-tick batching benefit.

## R2. Event log buffering & auto-scroll

**Decision**: Cap at 500 entries via array slice on each push. Track a
`stickyBottom` boolean; auto-scroll only when sticky. Sticky becomes `false`
when the user scrolls up past a small threshold (e.g. > 8 px from bottom),
and `true` again when they scroll back to within the threshold.

**Rationale**:
- 500 lines * ~80 chars ≈ 40 KB text — well within React's comfortable
  range without virtualization.
- The sticky-bottom pattern is a well-known terminal-log idiom; easier to
  test and explain than a virtualized list (which would also defeat
  natural-text-selection UX).

**Alternatives rejected**:
- `react-window` virtualization — adds a dep, breaks copy-paste of long
  selections, only pays off above ~10k rows.
- Hard-truncating to 500 with no sticky logic — fails AC for "user
  scrolled up reading history"; auto-scroll would yank them back down.

## R3. Reconnect backoff schedule

**Decision**: socket.io-client's built-in reconnection with
`reconnectionDelay: 1000`, `reconnectionDelayMax: 30000`, `randomizationFactor:
0.5`. Frontend code does not roll its own loop.

**Rationale**:
- socket.io-client 4.x already implements exponential backoff with jitter
  matching SC-004 / FR-020. Reusing it avoids duplicating retry logic.
- Jitter prevents reconnect-storm thundering herd if many clients drop
  simultaneously (e.g. backend restart).

**Alternatives rejected**:
- Hand-rolled `setTimeout`-based loop — would duplicate library behavior
  and need its own tests.
- Fixed-interval retry — fails FR-020's exponential-backoff requirement.

## R4. Single-socket-per-ship enforcement

**Decision**: An in-memory `ConnectedShipsRegistry` (singleton service)
with a `Map<shipId, socketId>`. On `handleConnection`, after resolving the
ship, look up any existing socketId; if present, call
`server.sockets.sockets.get(oldId)?.disconnect(true)` before storing the new
mapping. The disconnect handler for the old socket runs naturally and emits
`player.left`. Then the new socket emits `player.joined`.

**Rationale**:
- The clarification (spec §Q on multiple sockets) chose last-write-wins with
  no reference counting; this matches.
- Driving the sequence through socket.io's own disconnect lifecycle means
  the existing `handleDisconnect` path is reused — no special-case ordering
  code in the gateway.
- A single `Map` is sufficient because the backend is single-process
  (Constitution III: no distributed lock infrastructure today).

**Alternatives rejected**:
- Reference counting / multi-socket-per-ship — explicitly rejected by the
  spec clarification.
- Storing the registry in Postgres — wrong tier; transient connection
  state belongs in memory.

## R5. Sector-transition detection placement

**Decision**: A dedicated `SectorTransitionSubscriber` registered against
the existing physics tick. It snapshots `floor(x), floor(y)` for every ship
in `ShipStateService` at the *end* of the tick, diffs against the
previous-tick snapshot it holds, and emits a single `physics.sector-transition`
event with the batched array if non-empty.

**Rationale**:
- Spec clarification mandates emission from the physics tick (not from
  command handlers) so that AI-driven movement also triggers events.
- Subscribing to the existing tick avoids creating a new timer and stays
  inside Constitution III's tick-engine boundary.
- Batching per-tick keeps the event count bounded as AI populations grow,
  matching FR-026.
- Holding the previous snapshot inside the subscriber (not in
  `ShipStateService`) keeps `ShipStateService`'s contract unchanged and
  makes the detector trivially unit-testable with a stubbed ship-state
  iterable.

**Alternatives rejected**:
- Emit from `ShipMovementService` whenever a movement command lands —
  misses Cybertron / Droid AI movement which the spec explicitly requires.
- Per-ship event (one emit per transition) — the spec's clarification
  rejects this in favor of batching.

## R6. Wire contract location

**Decision**: Extend `frontend/src/types/contracts.ts` with the four new
payload types (`PlayerSnapshot`, `PlayerJoined`, `PlayerLeft`,
`PhysicsSectorTransition`). Backend imports/duplicates structurally; the
existing `frontend/test/contracts-parity.spec.ts` continues to enforce
parity.

**Rationale**:
- FR-027 requires the frontend file be the single source of truth.
- Reusing the parity test mechanism that 003 already established avoids
  inventing a second sync mechanism.

**Alternatives rejected**:
- A separate `@ge/contracts` workspace package — overkill for four
  additional types in a two-package repo.

## R7. ASCII map cell-priority rendering

**Decision**: When projecting `ScanCell[]` into the 30×15 character grid,
sort by priority `self > ship > planet > wormhole > mine > empty` and let
the higher-priority cell win. Pure render-time logic in `ScanMap.tsx`.

**Rationale**:
- FR-015 demands deterministic priority for overlap.
- Doing it in render keeps state simple — the wire payload remains a flat
  list of `ScanCell`s.

**Alternatives rejected**:
- Pushing priority resolution to the backend — the frontend already owns
  the symbol mapping; centralizing both there avoids duplicated tables.
