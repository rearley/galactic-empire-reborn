# Contract: Droid Event Bus Payloads

All events are published on `EventEmitter2` (the same bus 006b uses for
`combat.ship-destroyed` and 007 uses for `cybertron.taunt`). The Droid
module is the sole publisher; `GameGateway` is the sole consumer of the
player-facing events. No service in `backend/src/game/droid/` may
import `Server` or `Socket` directly.

## Published events

### `droid.annoy`

Emitted when a Droid scans an in-range player and the annoy roll succeeds
(or, in fight-back mode, when the Droid emits its call-for-help message
to the attacker).

```ts
interface DroidAnnoyEvent {
  /** shipKey of the Droid emitting the message (`<userid>:<shipno>`) */
  fromShipKey: string;
  /** human-readable Droid shipname (substituted into the message template) */
  fromShipname: string;
  /** target player's userid */
  toUserid: string;
  /** target player's shipno */
  toShipno: number;
  /** the rendered chat string (already templated with %s = fromShipname) */
  message: string;
  /** sector the Droid is in (for sector-room broadcast) */
  sector: { x: number; y: number };
  /** physics tick number when emitted (for ordering / replay) */
  tickAt: number;
  /** which class emitted (10/11/12), for debug telemetry */
  classNumber: number;
  /** whether this is a passive-scan annoy or a fight-back call-for-help */
  variant: 'passive' | 'help';
}
```

**Event name**: `'droid.annoy'`
**Gateway behavior**: Emit to `to:<toUserid>:<toShipno>` socket AND broadcast
to `sector:<x>:<y>` room. Sector room broadcast carries the same payload —
co-located players see the chatter contextually (FR-030, FR-031).

### `droid.spawned`

Emitted on each successful spawn. Operational/observability only — the
gateway does NOT broadcast this to clients.

```ts
interface DroidSpawnedEvent {
  shipKey: string;
  classNumber: number;
  sector: { x: number; y: number };
  tickAt: number;
}
```

**Event name**: `'droid.spawned'`
**Gateway behavior**: Logged for telemetry; no Socket.io emit.

### `droid.killed`

Emitted on each Droid death (after the existing 006b
`combat.ship-destroyed` chain has completed cargo transfer, BEFORE the
Droid is removed from `ShipStateService`). Operational/observability
only — the player-facing kill notification is already produced by 006b.

```ts
interface DroidKilledEvent {
  shipKey: string;
  classNumber: number;
  /** shipKey of the attacker (the player who landed the killing blow) */
  attackerShipKey: string;
  sector: { x: number; y: number };
  tickAt: number;
}
```

**Event name**: `'droid.killed'`
**Gateway behavior**: Logged for telemetry; no Socket.io emit.

## Consumed events

### `combat.ship-destroyed` (from 006b)

The Droid module subscribes to filter for events where:

- the **victim** is a Droid (userid matches `^@Droid-`) → triggers
  `droid_died` (remove from in-memory map, free spawn slot, publish
  `droid.killed`).
- the **attacker** is a Droid (userid matches `^@Droid-`) → triggers
  `droid_won` (set `speed2b = rndm(5000.0)` per `GEDROIDS.C` line 538).

The event payload from 006b already carries victim and attacker
identifiers; no changes to the 006b contract are required.

## Invariants

1. The Droid module publishes ONLY the three events listed above. Any
   new player-facing event (e.g., a kill banner) MUST go through
   `combat.ship-destroyed` rather than a new `droid.*` event so the
   006b kill chain remains the single source of truth for kill
   notifications.
2. Payloads carry the **minimum data** the gateway needs — no
   `ShipState` snapshots, no item arrays. Sector resolution and room
   translation are the gateway's job.
3. Event names are typed via a `DroidEvents` const-as-namespace export
   in `backend/src/game/droid/droid-events.ts`. Consumers (the gateway,
   tests) reference the const; raw string literals are forbidden in
   production code (linted via existing `no-magic-strings` ESLint rule
   if present, otherwise enforced by code review).
