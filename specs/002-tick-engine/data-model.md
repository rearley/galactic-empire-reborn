# Phase 1 Data Model — Tick Engine & Real-time Foundation

This feature introduces **no Prisma schema changes**. All entities below are in-memory
structures owned by NestJS singletons.

---

## Entity: `TickKind` (enum)

A tag identifying which heartbeat a subscriber is attached to.

| Value | Cadence | Maps to original |
|-------|---------|------------------|
| `SHIP_UPDATE` | 1000 ms | `TICKTIME2=1` (`GEMAIN.H`) |
| `PHYSICS`     | 6000 ms | `TICKTIME=6`  (`GEMAIN.H`) |

---

## Entity: `TickHandler` (type alias)

A callback registered against one `TickKind`. Signature:

```ts
type TickHandler = (ctx: TickContext) => void | Promise<void>;
```

`TickContext` carries minimal metadata for the firing — the kind and a monotonically
increasing tick count since process start (resets on reboot per FR-005):

```ts
interface TickContext {
  kind: TickKind;
  tickNumber: number;   // 1, 2, 3, … per kind, since process start
  firedAt: Date;        // wall-clock for logging only; NOT used for game math
}
```

**Validation rules**:
- A handler MUST NOT be `null` / `undefined`.
- The same handler reference MAY be registered against both kinds independently.
- Re-registering the same handler reference under the same kind is a no-op (idempotent).

---

## Entity: `Subscription` (return value of `tickService.subscribe`)

An opaque handle the caller invokes to unsubscribe. Implemented as a closure:

```ts
type Unsubscribe = () => void;
```

**State transitions**:
- `active` → `removed` when `unsubscribe()` is called. Idempotent — subsequent calls are
  no-ops.

---

## Entity: `SectorCoord`

Integer pair identifying a galactic sector. Used as the addressable unit for Socket.io rooms.

| Field | Type | Range | Notes |
|-------|------|-------|-------|
| `x`   | int  | 1..30 (inclusive) | `MAXX=30` from `GEMAIN.H` |
| `y`   | int  | 1..15 (inclusive) | `MAXY=15` from `GEMAIN.H` |

**Validation rules**:
- Both fields MUST be integers (reject floats, NaN, strings that don't parse as ints).
- Out-of-range values trigger the `OUT_OF_BOUNDS` error contract (see
  `contracts/websocket-events.md`) and the client is not joined.

**Room key derivation**: `\`sector:${x}:${y}\``

---

## Entity: `SectorMembership` (implicit, owned by Socket.io)

The set of sockets currently in a given sector room. Not stored explicitly by our code —
Socket.io's adapter owns this state. Cleanup on disconnect is automatic via Socket.io's
built-in `disconnecting` event handling, satisfying FR-008.

**Invariants** (verified by integration tests, not enforced by schema):
- A socket joining the same sector twice produces exactly one membership (Socket.io rooms
  are sets).
- A socket leaving a sector it never joined is a no-op.
- On `disconnect`, the socket is removed from every room it was in.

---

## Out of scope (deferred to later features)

- Player → ship mapping (feature 003)
- Ship state Map (feature 003)
- Sector contents / events broadcast on physics tick (features 004–006)
- Persistence of any of the above
