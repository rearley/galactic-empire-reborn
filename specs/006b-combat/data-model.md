# Data Model — 006b Ship-to-Ship Combat

No Prisma schema change. This document records which existing
fields are read or mutated by combat, and which structures live
in-memory only.

## Persistent state

### `Ship` (read + mutated through `ShipState` / `ShipStateService`)

Fields read or mutated by combat:

| Field            | Read | Mutate | Notes                                                                    |
|------------------|------|--------|--------------------------------------------------------------------------|
| `damage`         | yes  | yes    | Hull damage 0–100; `>= 100` triggers death (`GEFUNCS.C:1103`).           |
| `energy`         | yes  | yes    | Decremented by phaser fire (`% of charge`), missile flux cost, decoy/jammer deploy. Restored to `ENGYMAX` by `flux`. |
| `phasr`          | yes  | yes    | Phaser charge; reloaded by `+= PRELOAD` per tick up to `maxPhaser`; consumed on `pha` fire. |
| `phasrtype`      | yes  | —      | Selects impulse vs hyper-phaser path.                                    |
| `shield`         | yes  | yes    | Shield level; drained by `SHHITENG` on phaser hit; combined with `shieldhit()` on torp/missile/mine hits. |
| `shieldstat`     | yes  | yes    | Up/down flag toggled by `shi` and auto-lowered by torpedo fire.          |
| `shieldtype`     | yes  | —      | Class-determined shield model.                                           |
| `lastfired`      | yes  | yes    | Channel of the attacker whose hit was processed last; drives kill credit. |
| `kills`          | yes  | yes    | Incremented when this ship's hit kills a target (`killem`).              |
| `lock`           | yes  | yes    | Primary lock target channel; cleared lazily on `@` use (`GECMDS.C:1441-1471`); set by `loc`. |
| `ltorpsChannel`  | yes  | yes    | **Incoming**-torpedo firer-channel array; up to `MAXTORPS` slots, owned by the **target** ship. Per `GECMDS.C:1191–1202` the slot is allocated on `wptr->ltorps[i]` where `wptr = warshpoff(target)`. `MAXTORPS` therefore caps incoming torpedoes per target, not outbound per firer. |
| `ltorpsDistance` | yes  | yes    | Incoming-torpedo distance array (target-side); decremented per tick by `torpsped`. |
| `lmisslChannel`  | yes  | yes    | **Incoming**-missile firer-channel array; up to `MAXMISSL` slots, owned by the **target** ship (same target-side model as torpedoes). |
| `lmisslDistance` | yes  | yes    | Incoming-missile distance array (target-side); decremented per tick by `mislsped`. |
| `lmisslEnergy`   | yes  | yes    | Per-missile charge stored at fire time on the target's slot; becomes the damage source on hit. |
| `cantexit`       | yes  | yes    | Battle-lock counter; set to `FIRETICKS` (10) on every weapon-fire / hit event involving this ship; decremented one per physics tick (FR-028a, `GEFUNCS.C:1180–1181`). |
| `decout`         | yes  | yes    | Decoy slot lifetimes (in-memory only — see below); decremented per tick. |
| `jammer`         | yes  | yes    | Jammer counter (in-memory only — see below); set area-effect by `jam`; decremented per tick; cleared by `sys unjam`. |
| `items`          | yes  | yes    | Cargo array — torpedoes, missiles, mines, decoys, jammers, flux pods consumed on fire/deploy. |
| `cloak`          | yes  | —      | Read-only gate on torpedo fire (`tor` rejected if cloaked).              |
| `xcoord`/`ycoord`| yes  | —      | Read-only — used for line-of-fire geometry, mine sweep distance, jammer area effect. |
| `heading`/`speed`| yes  | —      | Read-only — phaser bearing math; warp gate for hyper-phaser path; warp gate for `tor` reject. |
| `status`         | yes  | —      | `1 = GESTAT_USER` distinguishes player ships for accounting; AI ships in 007/008. |

`dirty` is set by `ShipStateService.mutate()` so the existing 1-second
`SHIP_UPDATE` flush picks the changes up. Combat does NOT bypass this
path.

### `Mine` (read on boot + mutated on deploy/detonate)

Existing table from 001 — schema unchanged:

```
Mine {
  id          Int      @id @default(autoincrement())
  channel     Int                 // owner channel — written to victim.lastfired on detonation
  timer       Int                 // countdown; damage applies only when timer === 0 on a sweep tick
  xcoord      Float
  ycoord      Float
  deployedBy  String              // userid of the deployer
  deployedAt  DateTime @default(now())
}
```

Lifecycle:
- **Deploy** (`min` command): insert one row; `timer` starts at the canonical fuse value from the source (TBD — pinned in implementation).
- **Tick countdown**: `timer -= 1` every physics tick (in-memory representation kept in a `MineRegistry` mirror; flushed to DB on detonation).
- **Sweep tick** (`timer % 5 === 0`): apply damage / emit warning per R-3 in `research.md`.
- **Detonation**: row deleted (or `channel = 255` sentinel + delete on next maintenance pass — implementation chooses cleanest).
- **Zipper** (`zip` command): all mines within zipper range of the firing ship are deleted without damaging the firer.

A boot-time hydrate loads every active mine into the in-memory
registry; new mines flow through both paths (in-memory + DB) atomically.

## In-memory only state

### In-flight torpedoes / missiles

These already live on `ShipState` as the parallel arrays
`ltorpsChannel/Distance` and `lmisslChannel/Distance/Energy` (size
`MAXTORPS` / `MAXMISSL`). They flush via the existing `dirty`-driven
`SHIP_UPDATE` path. The "in-memory only" qualifier here means: there
is no separate projectile table — the projectile *is* the array slot.

Slot lifecycle (slots live on the **target's** arrays, per `GECMDS.C:1191–1202` and `GEFUNCS.C:1546`):
- **Fire** (`tor`/`mis`): allocate the lowest free slot on the **target's** `ltorps[]`/`lmissl[]`; set `channel = firer.channel` and `distance = cdistance × 10000 + 20`; for missiles also set `energy = charge`. Decrement cargo and set `shieldstat = down` (torps only) on the **firer**.
- **Tick travel**: walk **each ship's own** array (incoming projectiles); `distance -= torpsped` (or `mislsped` for missiles).
- **Decoy interception** (R-1, FR-011): when `distance` falls inside the decoy intercept threshold (<5000 torp / <3000 mis) AND the carrier of the slot (the target) has an active decoy AND the decoy-odds roll succeeds, the slot is cleared without applying damage.
- **Hit** (`distance <= 0`): apply damage to the slot's carrier via `combat-math` randomized damage + `randamage()` subsystem damage; write `carrier.lastfired = slot.channel`; clear the slot.
- **Firer dies**: every other ship's slots whose `.channel == firer.channel` are cleared (`GEFUNCS.C:1755–1778`).
- **Target dies**: the target's own slots are intrinsically removed with the ship.
- **Target leaves game** mid-flight (`!ingegame`): slot cleared, no hit, no kill credit (FR-027.3).

### Decoys

`ShipState.decout` is already a `number[]` field. Each non-zero
element is one active decoy with a per-tick decrementing lifetime.
On deploy (`dec`), the lowest zero slot is allocated and set to
`DECOYTIME` (× TICKTIME implied — exact representation matches the
original source). On every tick non-zero slots are decremented; on
reaching zero the slot is cleared. Decoys are intentionally lost on
process restart (matches original GE volatility — FR-015 confirms no
DB persistence).

### Jammer counter

`ShipState.jammer` is a single integer. The carrier's `jam` command
walks every ship within its scan range (including itself) and sets
each affected ship's `jammer` to `jamtime × (1 − distance/scanrange)`.
Per-tick decrement; immediate clear via `sys unjam`. Not persisted —
intentionally lost on restart.

### Combat events

`combat.*` payloads (see `contracts/combat-events.md`) are emitted via
`EventEmitter2` synchronously on the tick thread. They are not
buffered, batched, or persisted; the gateway translates them into
Socket.io room broadcasts on the same tick.

## Mutation discipline

Every `ShipState` mutation routes through `ShipStateService.mutate()`
so the existing 1-second flush path picks them up. Combat does not
introduce a fast-path direct `prisma.ship.update()` — all hull /
energy / shield / kill / lock / projectile-slot updates flow through
the in-memory map and flush asynchronously.

`Mine` writes use a small `MineRepository` (Prisma wrapper) with three
operations: `findAllActive()` (boot hydrate), `create({...})` (deploy),
`delete(id)` (detonation/zipper). No transactions are required —
each mine event is independent.
