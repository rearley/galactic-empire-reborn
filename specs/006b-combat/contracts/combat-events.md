# Contract — `combat.*` events on `EventEmitter2`

These are the typed event names and payload contracts emitted by
`CombatTickService` and the combat command handlers. Listeners run
synchronously on the tick thread; long-running consumers MUST defer
their work (e.g., `setImmediate`).

The `GameGateway` is the **sole** bridge between this event bus and
Socket.io. Combat services MUST NOT call Socket.io directly (FR-031).
The gateway translates each event into a Socket.io room broadcast:
sector-scoped by default, with the single exception of
`combat.ship-destroyed` which is broadcast galaxy-wide.

`shipId` follows the 006a convention: composite key `${userid}:${shipno}`.
`tickAt` mirrors `TickContext.firedAt`.

## Event catalogue

### `combat.phaser-fired`

Emitted by the `pha` handler immediately after a successful fire,
before hit resolution.

```ts
export const COMBAT_PHASER_FIRED = 'combat.phaser-fired' as const;

export interface CombatPhaserFiredEvent {
  shipId: string;
  bearing: number;          // degrees, 0..359
  percent: number;          // % of charge fired, 1..100
  hyper: boolean;           // true if hyper-phaser path was used
  sector: { x: number; y: number };
  tickAt: Date;
}
```

**Broadcast scope**: sector room of the firing ship.

### `combat.hit`

Emitted on a successful hit by phaser, torpedo, missile, or mine.
One event per (attacker, victim, weapon) tuple. For phasers in the
arc, multiple `combat.hit` events may be emitted from one `pha`
command if multiple ships are in the line of fire.

```ts
export const COMBAT_HIT = 'combat.hit' as const;

export interface CombatHitEvent {
  attackerId: string;
  victimId: string;
  weapon: 'phaser' | 'torpedo' | 'missile' | 'mine';
  damageHull: number;       // applied to victim.damage
  damageShield: number;     // applied to victim.shield
  sector: { x: number; y: number };
  tickAt: Date;
}
```

**Broadcast scope**: sector room of the victim.

### `combat.miss`

Emitted on a phaser fire that consumed energy but hit no target
(phasers only — torpedoes and missiles either hit or are decoyed).

```ts
export const COMBAT_MISS = 'combat.miss' as const;

export interface CombatMissEvent {
  attackerId: string;
  weapon: 'phaser';
  sector: { x: number; y: number };
  tickAt: Date;
}
```

**Broadcast scope**: sector room of the firer.

### `combat.decoy-intercept`

Emitted when an active decoy intercepts an inbound torpedo or missile
(FR-011).

```ts
export const COMBAT_DECOY_INTERCEPT = 'combat.decoy-intercept' as const;

export interface CombatDecoyInterceptEvent {
  defenderId: string;       // the ship whose decoy intercepted
  attackerId: string;       // the ship that fired the projectile
  weapon: 'torpedo' | 'missile';
  sector: { x: number; y: number };
  tickAt: Date;
}
```

**Broadcast scope**: sector room of the defender.

### `combat.mine-detonation`

Emitted when a mine's `timer` reaches 0 on a sweep tick AND at least
one ship is within `MINERANGE`. One event per detonation; if the same
detonation damages multiple ships, multiple `combat.hit` events with
`weapon: 'mine'` accompany the single `combat.mine-detonation`.

```ts
export const COMBAT_MINE_DETONATION = 'combat.mine-detonation' as const;

export interface CombatMineDetonationEvent {
  mineId: number;
  channel: number;          // mine owner channel — also written to each victim's lastfired
  sector: { x: number; y: number };
  tickAt: Date;
}
```

**Broadcast scope**: sector room of the mine.

### `combat.ship-destroyed`

Emitted when a ship's `damage` reaches `>= 100` and the kill check
fires. The kill is credited to whichever attacker is currently in
`victim.lastfired` (which is overwritten by every hit; see R-8 in
`research.md` for ordering rules).

```ts
export const COMBAT_SHIP_DESTROYED = 'combat.ship-destroyed' as const;

export interface CombatShipDestroyedEvent {
  victimId: string;
  attackerId: string | null;  // null only if no attacker is recorded
  attackerChannel: number;
  weapon: 'phaser' | 'torpedo' | 'missile' | 'mine' | null;
  sector: { x: number; y: number };
  tickAt: Date;
}
```

**Broadcast scope**: galaxy-wide (every connected player). This is the
single galaxy-wide event in the combat family; all others are
sector-scoped. Matches original GE death-announcement behavior.

## Subscription order

Both `PhysicsTickService` and `CombatTickService` subscribe to the
same `TickKind.PHYSICS` event channel (no new tick kind is
introduced). Subscription registration order is enforced by Nest
module dependency: `CombatModule` imports `PhysicsModule`, so
`PhysicsTickService.onModuleInit()` runs before
`CombatTickService.onModuleInit()`. The `TickService` subscriber
queue fires in registration order, so combat runs after the
physics movement pass on the same 6-second cadence — mirroring
`checktm()` in the original.

## Payload minimalism

Payloads carry the **minimum data** needed for a sector- or
galaxy-scoped broadcast:

- No `ShipState` snapshots — clients fetch state through the existing
  scan/report channels.
- No socket-room metadata — the gateway derives the sector room from
  `event.sector`.
- All identifiers use the composite `shipId` key; no internal Prisma
  IDs leak.
