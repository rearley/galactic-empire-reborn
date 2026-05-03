# Contract: cybertron.* events

`CybertronTickService` emits the following events on `EventEmitter2`.
The `GameGateway` is the **sole** Socket.io bridge; AI services MUST
NOT call Socket.io directly.

All payloads carry the **minimum data** the gateway needs to broadcast.
No `ShipState` snapshots, no socket-room metadata. Sector resolution
and room translation are the gateway's job.

## Event names

```ts
export const CYBERTRON_EVENT = {
  TAUNT:            'cybertron.taunt',
  SPAWNED:          'cybertron.spawned',
  TARGET_ACQUIRED:  'cybertron.target-acquired',
  BROKE_OFF:        'cybertron.broke-off',
} as const;
```

## Common types

```ts
type ShipKey = string; // "userid:shipno", e.g. "Cybrg-42:1"
type SectorCoord = { x: number; y: number };
```

## `cybertron.taunt`

Fired by `cyb_annoy` (FR-006a). Gateway delivers the message to (a) the
target player's socket as a personal event-log line and (b) broadcasts
to the target's current sector room so other players see the taunt.
**No weapon fire, no shield change, no maneuver change** in `cyb_annoy`.

```ts
interface CybertronTauntPayload {
  attackerShipKey: ShipKey;   // the Cybertron emitting the taunt
  targetShipKey:   ShipKey;   // the player being taunted
  message:         string;    // picked from taunt-pool.ts
  sector:          SectorCoord;
  tickAt:          number;    // tickNumber from TickContext
}
```

## `cybertron.spawned`

Fired by the spawn slot when a new Cybertron or Sartern is created
(FR-003). **Operational/observability only** — gateway does not
broadcast to clients.

```ts
interface CybertronSpawnedPayload {
  shipKey:     ShipKey;
  classNumber: number;
  sector:      SectorCoord;
  tickAt:      number;
}
```

## `cybertron.target-acquired`

Fired by `cyb_check_lockon` when `cybmine` transitions from `255` to a
valid target (FR-010). **Operational only** — gateway does not
broadcast to clients (the player learns by being attacked).

```ts
interface CybertronTargetAcquiredPayload {
  attackerShipKey: ShipKey;
  targetShipKey:   ShipKey;
  sector:          SectorCoord;
  tickAt:          number;
}
```

## `cybertron.broke-off`

Fired when the 1-in-`CYB_BREAKOFF` (500) roll succeeds for a non-quad
Cybertron (FR-007). The gateway delivers a "lucky day" event-log line
to the former target.

```ts
interface CybertronBrokeOffPayload {
  attackerShipKey: ShipKey;
  targetShipKey:   ShipKey;
  sector:          SectorCoord;
  tickAt:          number;
}
```

## Consumed events (this service is a listener)

`CybertronTickService` subscribes to `combat.ship-destroyed` (already
published by 006b) to drive the gold-transfer hook (FR-005a). When the
victim's `userid` matches `/^Cybrg-/` (single prefix covers all
CYBORG-class ships including Sarterns — see `GECYBS.C:104-105`):

1. Read victim's `User.cash`, clamp to `CYB_MAXCASH`.
2. Add the clamped amount to the attacker's `User.cash` (BigInt).
3. Zero the victim's `User.cash`.
4. Mark both `User` rows for immediate flush via the repository.

This event-driven approach keeps `CombatTickService` ignorant of
AI-specific rules — combat just publishes the kill.

## Non-events

The following decisions deliberately do **not** emit events:

- **Phaser fire / torpedo launch / mine deploy / jammer deploy / Zipper
  launch by a Cybertron** — these go through the existing 006b weapon
  helpers, which already emit `combat.*` events. Re-emitting under a
  `cybertron.*` name would duplicate broadcasts.
- **Hyperwarp entry/exit** — internal speed-band selection, not a
  player-visible distinct event.
- **Damage check passing** — internal; the resulting mine/jammer
  deploy already emits via 006b.
- **Per-tick `cybupdate` rollover** — internal heading randomization
  has no player-visible signal beyond the next physics tick's movement.
