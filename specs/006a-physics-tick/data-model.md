# Phase 1 Data Model — Physics Tick Activation

No Prisma schema change. This feature reads and mutates fields that already
exist on `ShipState` (in-memory) and reads `ShipClass` (Postgres, cached).

## ShipState — fields touched by `PhysicsTickService`

Composite key: `(userid, shipno)`. Source of truth at runtime is the
`Map<shipKey, ShipState>` owned by `ShipStateService`. The 1-second
`SHIP_UPDATE` flush already persists `dirty` rows.

### Read every tick
| Field | Purpose |
|-------|---------|
| `shpclass` | Resolves `ShipClass.maxAcceleration` for rotation step (`max_accel/10`) and acceleration / deceleration step. |
| `status` | `1 = GESTAT_USER` → debit `MOVENGUSE`. Any other → AI; skip the debit. |
| `where` | `0` = normal space; `1` = hyperspace; `>=10` = orbit/docked. Orbit/dock skips rotate/accel/move/maintenance but still ticks countdowns. |
| `heading`, `head2b` | Current and target heading; rotation step closes the gap. |
| `speed`, `speed2b` | Current and target speed; accel/decel step closes the gap. |
| `xcoord`, `ycoord` | Pre-tick position; needed to compute the pre-update sector for transition detection. |
| `energy` | Read by the `useenergy`-equivalent floor check (do not debit if it would drop below the per-debit fudge floor). |
| `hypha`, `cantexit` | Per-tick countdowns. |

### Mutated every tick
| Field | When | How |
|-------|------|-----|
| `heading` | Always (when not snapping, when full block runs) | Advance by `±max_accel/10` toward `head2b`; normalize to `[0, 360)`. |
| `speed` | When full block runs | Advance toward `speed2b` by `±max_accel` (×2 on decel); snap if within step. |
| `speed2b` | When `useenergy` refuses or post-debit `energy < MOVENGMIN` | Forced to `0` so the ship begins decelerating next tick. |
| `xcoord`, `ycoord` | When `speed > 0` and full block runs | Position-integration formula. |
| `energy` | On `ACCENGAMT` step, on `MOVENGUSE` debit | Decrement, gated by the per-debit floor. |
| `hypha`, `cantexit` | Always (every non-destroyed ship) | `max(0, x - 1)`. |
| `dirty` | Whenever any of the above is mutated | Set via `ShipStateService.mutate(...)`. |

### Read-only / not touched
| Field | Why mentioned |
|-------|---------------|
| `topspeed` | Only the `warp` command writes / reads it. The tick does not adjust `topspeed`; the legacy overspeed-engine-blow rachet at `GEFUNCS.C:738-768` is **out of scope** for 006a (it is part of safety-system damage, deferred). |
| All weapon / shield / cloak / mine / decoy / jammer fields | Out of scope (FR-018). |

## Sector — derived, not stored

Sector is **always** `{ x: floor(xcoord), y: floor(ycoord) }`. There is no
stored sector field on `Ship` or `ShipState`. After a coordinate update,
the tick compares the pre-update derived sector to the post-update derived
sector; on inequality, it emits `physics.sector-transition`.

`scan.handler.ts` already uses this `floor(coord)` convention. The
`+1` in `report.handler.ts` is a UI display offset (so the player sees
"1..30" rather than "0..29") and is not the canonical sector index.

## ShipClass — fields read

| Field | Used by | Hydration |
|-------|---------|-----------|
| `classNumber` | Cache key | Loaded once at boot by `ShipClassCacheService.onModuleInit`. |
| `maxAcceleration` | `physics-math.rotationStep`, `physics-math.accelerationStep` | Same. |
| `maxWarp` | `warp.handler.ts` (WARP01 gate) | Same. |

The cache is populated once on boot via `prisma.shipClass.findMany()`,
stored in a `Map<number, { maxAcceleration: number; maxWarp: number }>`,
and never re-fetched (the `ShipClass` catalog is static seed data per the
constitution's data model).

## Constants consumed (regression-pinned by `balance-regression.spec.ts`)

| Constant | Value | Source |
|----------|-------|--------|
| `TICKTIME` | `6` | `GEMAIN.H:133` |
| `ACCENGAMT` | `120` | `GEMAIN.H:76` |
| `MOVENGUSE` | `10` | `GEMAIN.H:78` |
| `MOVENGMIN` | `3000` | `GEMAIN.H:77` |
| `ROTENGUSE` | `30` (paid by `rotate` command, not the tick — pinned defensively) | `GEMAIN.H:73` |
| `WARP_THRESHOLD` | `1000` (1 warp factor in internal units) | `GEFUNCS.C:482, 493, 538` |
| `COORD_SCALE` | `65000` (denominator in position integration) | `GEFUNCS.C:648-649` |
| `MAXX`, `MAXY` | `30`, `15` | `GEMAIN.H:121-122` |

Per-class `max_accel` / `max_warp` are not constants — they live in
`ShipClass` and are read from cache. The regression test asserts the
sum-of-classes for `maxAcceleration` and `maxWarp` against the seed file,
so any class re-tuning trips the test.

## Entity: PhysicsTick (event)

The 6-second heartbeat that arrives via `TickService.subscribe(TickKind.PHYSICS, ...)`.
Payload: `{ kind: 'PHYSICS', tickNumber: number, firedAt: Date }` (already
defined in `tick/tick.types.ts`). The orchestrator forwards `firedAt` to
emitted physics events as `tickAt`.
