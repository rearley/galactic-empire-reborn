# Contract — Physics Tick Events

The 006a tick emits two typed events on `EventEmitter2`. They carry the
**minimum data** a downstream consumer needs to do its job; full
`ShipState` snapshots and transport-layer details (Socket.io rooms, etc.)
are intentionally absent so the contract does not couple the physics
module to the gateway.

A consumer (gateway, telemetry, AI service) subscribes via
`@OnEvent('physics.sector-transition', { async: false })`. Listeners run
synchronously on the tick thread; long-running consumers MUST defer their
work (e.g., `setImmediate`, queue) so they do not blow the 6-second budget.

## Event: `physics.sector-transition`

Emitted whenever a ship's coordinate update crosses a sector boundary
(i.e., `floor(preX) !== floor(postX)` OR `floor(preY) !== floor(postY)`).

**Payload (TypeScript)**
```ts
export interface PhysicsSectorTransitionEvent {
  /** Composite key — `${userid}:${shipno}`. */
  shipId: string;
  /** Pre-update derived sector. */
  fromSector: { x: number; y: number };
  /** Post-update derived sector. */
  toSector: { x: number; y: number };
  /** Post-update coordinates (source of truth). */
  x: number;
  y: number;
  /** TickService context.firedAt. */
  tickAt: Date;
}
```

**Emission rules**
- Emitted exactly once per ship per tick on transition; never on a no-op
  tick (`speed === 0`) and never when the integer sectors are equal even
  though coordinates moved.
- MUST NOT include the full `ShipState` or any Socket.io room name.
- `from`/`to` are always derived from coordinates — no stored sector field.

**Test expectation**
The integration test seeds a ship at `xcoord = 9.95`, `ycoord = 5.0`,
`heading = 90`, `speed = 21000` (moves +sin/65000 along +x axis), advances
one tick, and asserts a single `physics.sector-transition` event is emitted
with `fromSector.x = 9`, `toSector.x = 10`.

---

## Event: `physics.hyperspace`

Emitted whenever the **acceleration step** crosses the warp threshold
(`speed === 1000`) in either direction during this tick. Mirrors the
`hyperspace(ptr, usrn, 1|0)` calls at `GEFUNCS.C:483, 539`.

**Payload (TypeScript)**
```ts
export interface PhysicsHyperspaceEvent {
  /** Composite key — `${userid}:${shipno}`. */
  shipId: string;
  /** 'enter' = crossing 999 → ≥1000; 'exit' = crossing ≥1000 → <1000. */
  direction: 'enter' | 'exit';
  /** Post-step speed (so consumers can decide what to render). */
  speed: number;
  /** TickService context.firedAt. */
  tickAt: Date;
}
```

**Emission rules**
- Emitted only on the tick where the *step* crosses 1000 — not on every
  tick the ship is in hyperspace.
- A ship can transition twice in a single tick only if `accel()` and a
  later forced `speed2b = 0` cause two crossings — but `accel()` only
  runs once per tick, so this should not happen in practice. Defensive
  test: emit at most once per ship per tick.
- MUST NOT include shield/cloak side-effects from the original
  `hyperspace()` (those belong to feature 006b combat). The event is a
  signal only.

**Test expectation**
The integration test seeds a player ship at `speed = 0`, `speed2b = 1000`,
`shipclass.max_accel = 1000` (so one step crosses the boundary), advances
one tick, and asserts `physics.hyperspace` is emitted once with
`direction: 'enter'`.

---

## Non-events (deliberately not emitted by 006a)

To keep the surface area small, **none of the following** are emitted by
this feature; they are reserved for downstream features:

- Combat impact / damage / destruction
- Mine, decoy, jammer state changes
- Shield / cloak transitions
- Energy depletion or repair completion
- Per-tick heartbeat broadcast (the gateway does not need a tick beat;
  it reacts to the typed events above)

If a future feature needs another event, it MUST add a new typed event with
its own minimum-data payload — no overloading the two events above with
optional fields.
