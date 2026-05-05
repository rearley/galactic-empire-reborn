# Phase 1 Data Model: Ephemeral Droid AI

**No Prisma schema change.** This feature is implemented entirely on top
of existing Prisma models with one additional optional field on the
in-memory `ShipState` interface and three new `ShipClass` seed rows.

## In-memory state

### `ShipState` (modified)

The existing `ShipState` interface (`backend/src/game/ship/ship-state.types.ts`)
gains one optional field:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `isEphemeral` | `boolean?` | `undefined` | When `true`, this state never participates in the dirty-flush cycle. Used exclusively by Droids (classes 10/11/12). Persistent ships (players, Cybertrons, Sarterns) leave this field undefined. |

All other fields are unchanged. Mappers (`prismaShipToState`,
`stateToPrismaUpdate`) are unaffected — `isEphemeral` is in-memory only
and not part of the Prisma schema.

### `DroidTickService` private state

| Field | Type | Purpose |
|-------|------|---------|
| `spawnTickCounter` | `number` | Increments on every `TickKind.PHYSICS` fire. Rolls over at `DROID_SPAWN_TICK_CADENCE = 30`. On rollover, runs spawn evaluation + per-Droid action pass. |
| `livePopulation` | `Map<number, Set<string>>` | Per-class live-Droid index, keyed by `classNumber` (10/11/12) → set of userids. Used to enforce per-class cap and to drive the per-Droid action pass without re-scanning the entire ship map. |
| `nextSlotIndex` | `number` | Monotonic counter used by `DroidSpawner` to allocate userids of the form `@Droid-<n>`. Wraps at a high ceiling (9999) with uniqueness check against `livePopulation`. |

### `DroidSpawner` (no persistent state)

A pure helper class. Constructs a `ShipState` with `isEphemeral: true`,
randomized initial fields (per `droid_init`), and calls
`ShipStateService.loadShip(state)`. Updates `livePopulation` on
`DroidTickService` via injection.

## ShipState fields the Droid AI reads/writes

| Field | Read | Write | Notes |
|-------|------|-------|-------|
| `userid`, `shipno` | ✓ | – | Composite key |
| `shipname` | – | ✓ (init only) | Format: `<typename><usrn*usrn+gernd()%100>` (line 129) |
| `shpclass` | ✓ | ✓ (init only) | 10, 11, or 12 |
| `xcoord`, `ycoord` | ✓ | ✓ (init only) | `rndm(39.9) - 19.8` per axis |
| `heading`, `head2b` | ✓ | ✓ | Set by confuse / alter-vector / flee branches |
| `speed`, `speed2b` | ✓ | ✓ | Set by every action branch |
| `holdcourse` | ✓ | ✓ | Set by every action branch |
| `shieldstat`, `shield`, `shieldtype` | ✓ | ✓ | `shieldup`/`shielddn` toggle by speed |
| `phasr`, `phasrtype` | ✓ | ✓ (init) | Init to `shipclass.max_phasr` |
| `damage` | ✓ | – | >75 triggers Vakory mine+jammer+flee branch |
| `items` | ✓ | ✓ | Init randomized loadout; consumed by `laymine`, `jam`; for Vakory, `I_TORPEDO` is replenished pre-`torp` per line 480 |
| `jammer` | ✓ | – | When > 0, all action branches collapse to jammed-flee |
| `cantexit` | ✓ | – | > 0 triggers fight-back path; set by 006b on incoming attack |
| `lastfired` | ✓ | – | Identifies the attacker for fight-back targeting; set by 006b |
| `where` | ✓ | – | 0 = normal space, 1 = hyperspace, ≥2 = orbit (planet-bound attacker special case) |
| `topspeed` | ✓ | – | From `ShipClass`; used for top-speed flee |
| `tick` | ✓ | ✓ | Per-Droid action timer; replicated for fidelity even though our cadence comes from `spawnTickCounter` |
| `cloak` | – | – (read on attacker) | Vakory + Murdonian normal-space fire requires `attacker.cloak != 10` |
| `lmissl*` | ✓ | – | `missl_attached(ptr, usrn)` = any `lmisslDistance[i] > 0` |
| `energy` | – | ✓ | Set to `50000` after each `droid_lives` invocation (line 214) |
| `status` | ✓ | ✓ | Init to `GESTAT_AUTO=2`; on death `droid_died` sets `GESTAT_AVAIL=0` then state is removed |

## ShipClass fields consumed (read-only)

| Field | Use |
|-------|-----|
| `scanRange` | Distance gate for annoy (`ddist * 10000 < scanRange`) |
| `maxShields` | Init `shieldtype` (per-class maxima) |
| `maxPhaser` | Init `phasrtype` (per-class maxima) |
| `topspeed` | Top-speed flee branches (`topspeed * 1000`) |
| `category` | Filter for `CLASSTYPE_DROID = 3` |
| `typename` | Disambiguator between classes 10/11/12 (matches `GEDROIDS.C` lines 203/206/209 string compares) |

## New `ShipClass` seed rows

Added to `backend/prisma/seed/ship-classes.ts`. Values verbatim from
the original C-source class table.

| `classNumber` | `typename` | `category` | `tot_to_create` | Other fields |
|---------------|-----------|-----------|-----------------|--------------|
| 10 | `Lydorian Garbage Scow` | 3 (`CLASSTYPE_DROID`) | 2 | `scanRange`, `maxShields`, `maxPhaser`, `topspeed`, `hasMine`, `hasJammer` from C source; no torpedo, no missile, no zipper |
| 11 | `Murdonian Transport` | 3 (`CLASSTYPE_DROID`) | 2 | Heavily-loaded freighter values from C source; full weapons inventory enabled (`hasTorpedo`, `hasMine`, `hasJammer`) |
| 12 | `Vakory Survey Drone` | 3 (`CLASSTYPE_DROID`) | 2 | Survey-drone values from C source; `hasTorpedo`, `hasMine`, `hasJammer` enabled |

The exact numeric values for `scanRange`, `maxShields`, `maxPhaser`,
`topspeed`, etc., are pinned in the seed file and exercised by the
balance-regression test. They are not duplicated in this document to
keep the C source as the single source of truth.

## Per-class tunables (`droid.config.ts`)

Operationally tunable via NestJS `ConfigModule` (env override). Defaults
from `GEDROIDS.C` and the C class table.

| Key | Default | Purpose |
|-----|---------|---------|
| `class10.scanRange` | from C source | Garbage Scow scan range |
| `class11.scanRange` | from C source | Murdonian scan range |
| `class12.scanRange` | from C source | Vakory scan range |
| `class10.topspeed` | from C source | (Garbage Scow has no warp) |
| `class11.topspeed` | from C source | Murdonian top warp |
| `class12.topspeed` | from C source | Vakory top warp |
| `fightbackHyperspaceMaxDist` | `30000` | `ddist < 30000` gate for hyperspace phaser fire (lines 351, 458) |
| `confuseDenom_class11` | `10` | Murdonian confuse roll: `gernd()%10 == 0` |
| `alterVectorDenom_class12` | `20` | Vakory alter-vector roll: `gernd()%20 == 1` |
| `vakoryDamageThreshold` | `75` | Vakory >75% damage triggers mine+jammer+flee |

## New constants (`constants.ts`)

| Constant | Value | Source |
|----------|-------|--------|
| `DROID_MAX_PER_CLASS` | `2` | FR-006; matches `tot_to_create` for each Droid class |
| `DROID_SPAWN_TICK_CADENCE` | `30` | `GEMAIN.C` line ~2325 (`ticktock2 >= 30`) |
| `DROID_ANNOY_DENOM` | `4` | `gernd() % 4 == 1` from `droid_annoy` line 240 |
| `DROID_USERID_PREFIX` | `"@Droid-"` | `GEDROIDS.C` line 111 |
| `CLASSTYPE_DROID` | `3` | `GEMAIN.H` line 216 (already present in repo if defined; this feature pins the value) |

## Persistence guarantees (testable invariants)

1. `prisma.ship.findMany({ where: { shpclass: { in: [10, 11, 12] } } })`
   returns `[]` at every moment of the server's lifetime (FR-001, FR-004).
2. `ShipStateService.flush()` issues zero Prisma calls for any state with
   `isEphemeral === true` (FR-002).
3. `ShipStateService.removeFromGame()` issues zero Prisma calls for
   ephemeral states (which it already does for all states — verified by
   inspection at `ship-state.service.ts:117`).
4. `prisma.user.findMany({ where: { userid: { startsWith: '@Droid-' } } })`
   returns `[]` at every moment of the server's lifetime (Droid spawn
   never touches `User`).
