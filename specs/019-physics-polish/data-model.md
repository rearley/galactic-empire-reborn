# Data Model — Physics Polish

**No new entities. No schema migrations.** This document inventories the existing
fields and event shapes the feature touches so reviewers and implementers can verify
that no persistence change sneaks in.

## Existing entities — fields touched

### `ShipState` (in-memory; `backend/src/game/ship/ship-state.types.ts`)

| Field | Used by | Read/Write |
|---|---|---|
| `xcoord`, `ycoord` | wrap (FR-001, FR-002) | R/W |
| `speed`, `speed2b`, `topspeed` | overspeed (FR-003), auto-repair gates | R/W (overspeed recovery rewrites topspeed/speed2b) |
| `warncntr` | overspeed counter (FR-003, FR-004) | R/W |
| `damage` | overspeed engine break (FR-003) | R/W |
| `autoRepair` | auto-repair consumer (FR-005) | R |
| `autoShield` | auto-shield consumer (FR-006) | R |
| `shieldsUp` (or equivalent) | auto-shield raise (FR-006) | R/W |
| `tagged` (combat-lock) | auto-repair gate, auto-shield gate | R |
| `where` | wrap gate (FR-001 only when `where <= 1`) | R |

No new fields. No persisted-state additions.

### `User` (Prisma; `backend/src/prisma/...`)

| Field | Used by | Direction |
|---|---|---|
| `score` | AI-kill deduction (FR-007) | decrement (floor 0) |
| `klscore` | AI-kill deduction (FR-007) | decrement (floor 0) |

No `User` schema change.

### `Cybertron` (Prisma)

| Field | Used by | Direction |
|---|---|---|
| `kills` | Cybertron attacker increment (FR-008a) | increment (atomic) |

Already exists per feature 007. No schema change.

### Droid (in-memory only)

Droids are ephemeral and never persisted (Principle of feature 008). Spawn/kill bridge
events carry the in-memory `@Droid-N` userid; **no Prisma writes** for droid presence.

## Configuration constants — added

### `score_f2`

| Property | Value |
|---|---|
| Source | `SCORE_F2` env variable, parsed at module init |
| Type | integer |
| Range | `[0, 32700]` (inclusive — matches MajorBBS `numopt(SCRFACT, 0, 32700)`) |
| Default | `100` |
| Where | `backend/src/game/player/score.config.ts` |
| Reference | `GEMAIN.C:603` |

Locked-in regression test asserts default = 100; range guard rejects out-of-range
values at boot (fail-fast, NestJS module init throws).

## Event shapes — new

### `droid.spawned` (Socket.io, sector-scoped)

Routes to `sector:<x>:<y>` room. Mirrors `droid.annoy` payload shape with the
ephemeral flag explicit.

```ts
type DroidSpawnedPayload = {
  shipId: string;        // e.g. '@Droid-7'
  shipname: string;      // display name
  shpclass: number;      // 10, 11, or 12
  sector: { x: number; y: number };
  ephemeral: true;       // explicit — frontend MUST mark non-persistent
  spawnedAt: number;     // epoch ms
};
```

### `droid.killed` (Socket.io, dual-routed)

Routes to **both** `sector:<x>:<y>` (so the sector roster removes the droid) and the
global `kills` channel (so the global kill banner updates).

```ts
type DroidKilledPayload = {
  shipId: string;            // '@Droid-N'
  shipname: string;
  shpclass: number;
  sector: { x: number; y: number };
  killedBy: string | null;   // attacker userid or null (e.g. mine kill)
  killedAt: number;          // epoch ms
};
```

### Internal `PHYSICS_BOUNDARY_WRAPPED` (event-emitter only — optional)

Optional, test-visibility only — emitted from `PhysicsTickService` when wrap fires.
NOT routed to clients. May be omitted if direct sector-transition assertions cover the
wrap path adequately.

```ts
type PhysicsBoundaryWrappedEvent = {
  shipId: string;
  axis: 'x' | 'y' | 'both';
  preCoord: { x: number; y: number };
  postCoord: { x: number; y: number };
  tickAt: number;
};
```

## Event shapes — extended

### `COMBAT_SHIP_DESTROYED` (existing internal event)

Spec change: `attackerUserid` MUST be captured from a pre-removal snapshot in
`CombatTickService.runKillResolution` so mutual-kill same-tick AI deaths still
attribute correctly. **No new fields added** — the existing field becomes
reliably populated where it was previously silently `null` for this edge case.

`PlayerScoreService.handleShipDestroyed` computes `isAiAttacker` locally via
`isAiUserid(attackerUserid)` and passes it through to
`PlayerScoreRepository.transferKillScore`. No new event field needed for this.

## State transitions — overspeed counter

Documented here so test cases line up with the FR set:

```text
warncntr: 0 ─(lottery hit, intspeed > topspeed)→ 1 → 2 → 3 → 4
                                                         │
                                          (next lottery hit while >4)
                                                         ↓
                                       engine break: damage += rng%20
                                                  topspeed = 0
                                                  speed2b = 0
                                                  warncntr stays
                                                  (re-trigger guarded by topspeed=0)

warncntr: N>0 ─(speed normalises: intspeed <= topspeed OR speed > speed2b)→
            recovery: topspeed = floor(topspeed/N); speed2b = topspeed*1000;
                      warncntr = 0
```

## Roster query invariant

Persisted roster queries (used by team/sector listings) MUST continue to query the
`Ship`/`User` tables only. Droids are joined into the frontend roster from socket
events — never from a Prisma query. This is asserted in tests by spawning droids
and verifying that `Prisma.user.findMany(...)` does not return any `@Droid-` rows.
