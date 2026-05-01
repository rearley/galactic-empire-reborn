# WebSocket Event Contracts — Tick Engine & Real-time Foundation

Transport: Socket.io v4 over the default `/socket.io` namespace. All payloads are JSON.

This contract is **frozen** for feature 003+ to build on. Additive changes (new events,
new optional fields) are allowed; renaming or removing fields below is a breaking change.

---

## Connection lifecycle

| Direction | Event | Payload | Notes |
|-----------|-------|---------|-------|
| C → S | (TCP connect) | — | Standard Socket.io handshake. Server logs the connection. |
| C → S | `disconnect` | — | Server releases all sector room memberships automatically (FR-008). |

No authentication in this feature. Anonymous sockets are accepted. Auth lands in feature 003+.

---

## Sector room management

### `sector:join` (Client → Server)

Request to join a sector group.

**Payload**:
```json
{ "x": 12, "y": 7 }
```

**Server response (success)**: emit `sector:joined` to the requesting socket only:
```json
{ "x": 12, "y": 7, "room": "sector:12:7" }
```

**Server response (failure — out of bounds, FR-009)**: emit `error` to the requesting socket
only:
```json
{
  "event": "sector:join",
  "code": "OUT_OF_BOUNDS",
  "message": "Sector (X,Y) is outside galaxy bounds [1..30, 1..15]"
}
```
The socket is NOT joined to any room. The connection remains open.

**Server response (failure — malformed payload, e.g., non-integer or missing field)**: emit
`error`:
```json
{
  "event": "sector:join",
  "code": "INVALID_PAYLOAD",
  "message": "x and y must be integers"
}
```

**Idempotency**: A `sector:join` for a sector the socket is already in produces a single
`sector:joined` echo and no duplicate membership.

---

### `sector:leave` (Client → Server)

Request to leave a sector group.

**Payload**:
```json
{ "x": 12, "y": 7 }
```

**Server response (success)**: emit `sector:left` to the requesting socket:
```json
{ "x": 12, "y": 7, "room": "sector:12:7" }
```

**Behavior on never-joined sector**: no-op — server still emits `sector:left` for symmetry
and to make client logic uniform. No `error` is emitted.

**Bounds**: Same `OUT_OF_BOUNDS` and `INVALID_PAYLOAD` `error` contract as `sector:join`.

---

## Error event shape (general)

All `error` events emitted by this gateway use the shape:

```ts
interface GatewayError {
  event: string;     // the originating client event name, e.g., "sector:join"
  code: string;      // machine-readable identifier, SCREAMING_SNAKE_CASE
  message: string;   // human-readable, suitable for direct display
}
```

Codes defined in this feature:
- `OUT_OF_BOUNDS` — coordinates outside the 30 × 15 galaxy.
- `INVALID_PAYLOAD` — malformed or missing fields.

---

## Reserved for future features (NOT implemented here)

These names are reserved so that feature 003+ can use them without churn:

- `tick:physics` (S → room) — broadcast on each 6 s physics tick, scoped to a sector room.
- `tick:ship` (S → room) — broadcast on each 1 s ship update tick.
- `command` (C → S) — text command input from a player.
- `event` (S → room) — generic in-sector event (combat, arrival, departure, etc.).

This feature MUST NOT emit these events; doing so would couple the foundation to gameplay
that doesn't exist yet.
