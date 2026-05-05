# Contract — WebSocket Events (additions for feature 010)

This document specifies the four new Socket.io events introduced by
feature 010. The pre-existing events (`command`, `command:result`, scan
results, combat broadcasts, etc.) defined in
`specs/003-ship-commands/contracts/websocket-events.md` are unchanged.

The TypeScript declarations for every payload below live in
`frontend/src/types/contracts.ts` (FR-027). The backend imports them
structurally; `frontend/test/contracts-parity.spec.ts` enforces parity.

## 1. `player.snapshot`

**Direction**: server → joining client only (`socket.emit`)
**When**: inside `handleConnection`, after the userid is resolved to a ship
and **before** any `player.joined` broadcast for the same shipId.
**Payload**: `PlayerSnapshotPayload` — `{ players: ConnectedPlayer[] }`
**Notes**:
- `players` MUST contain every ship currently in the
  `ConnectedShipsRegistry` at the moment of snapshot capture, including
  the joining ship itself if its registry insert happens before the
  snapshot send (recommended order).
- Subsequent `player.joined` / `player.left` / `physics.sector-transition`
  events keep the client in sync incrementally.

## 2. `player.joined`

**Direction**: server → all (`this.server.emit`)
**When**: from `handleConnection`, immediately after the snapshot is sent
to the joining socket (FR-024).
**Payload**: `PlayerJoinedPayload` — `ConnectedPlayer`
**Single-socket invariant (FR-025a)**:
If `handleConnection` resolves a shipId that already has a live socket,
the prior socket MUST be server-disconnected first; that disconnect emits
`player.left` for the old socket, after which `player.joined` fires for
the new socket. The client list never holds duplicates for one shipId.

## 3. `player.left`

**Direction**: server → all (`this.server.emit`)
**When**: from `handleDisconnect`, only if the disconnecting socket had
been resolved to a ship in the registry (FR-025).
**Payload**: `PlayerLeftPayload` — `{ shipId: string }`

## 4. `physics.sector-transition`

**Direction**: server → all (`this.server.emit`)
**When**: at the end of every physics tick (6 s), iff at least one ship's
integer-cell `(floor(x), floor(y))` changed since the previous tick.
**Payload**: `PhysicsSectorTransitionPayload` —
`{ transitions: SectorTransition[] }`
**Inclusion rules (FR-026)**:
- All ship types are eligible: human-controlled, Cybertrons, Droids.
- A transition entry is emitted only when the integer cell actually
  changed; sub-cell movement does not produce events.
- Newly-spawned ships (no previous-tick cell) do NOT produce a transition
  event for their initial cell — clients learn of them via `player.joined`
  for human ships, or via existing droid/cybertron event channels for AI.
- Despawned ships (had a cell last tick, gone this tick) do NOT produce a
  transition event — clients learn of them via `player.left` or the
  forthcoming `droid.killed` / `cybertron.killed` channels.

## Event-ordering guarantees

For a single connecting socket, the gateway MUST emit events in this order:

```
(socket connection accepted)
→ player.snapshot   (to this socket only)
→ player.joined     (broadcast to all incl. this socket)
```

For a takeover (single-socket-per-ship enforcement):

```
old socket: handleDisconnect → player.left (broadcast)
new socket: handleConnection → player.snapshot (to new socket)
                              → player.joined (broadcast)
```

For a tick with movement:

```
physics tick fires
→ (combat / scan / other existing per-tick emissions, unchanged)
→ physics.sector-transition (broadcast, single batched event)
```

## Test coverage required

| Test | Type | Asserts |
|------|------|---------|
| `player-snapshot.spec.ts` | Jest backend | snapshot sent only to joining socket; contains every registered ship |
| `player-join-leave.spec.ts` | Jest backend | join broadcasts after snapshot; left fires on disconnect; payloads match contract |
| `single-socket-per-ship.spec.ts` | Jest backend | 2nd connection for same shipId disconnects 1st; resulting event order is left→snapshot→joined |
| `sector-transition.spec.ts` | Jest backend | batched event emitted iff ≥1 cell change; non-emission on quiet tick; AI ships included |
| `usePlayerList.spec.ts` | Vitest frontend | reducer handles SNAPSHOT/JOIN/LEFT/TRANSITION correctly, alphabetical sort, ignores stale transitions |
| `PlayerListPanel.spec.tsx` | Vitest frontend | renders sorted entries, updates on incremental events, derives sector from `floor()` convention |
| `ConnectionBanner.spec.tsx` | Vitest frontend | hidden when connected; visible+message correct for disconnected/reconnecting |
| `contracts-parity.spec.ts` | Vitest frontend | continues to pass after additions |
