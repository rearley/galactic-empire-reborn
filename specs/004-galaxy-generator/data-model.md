# Phase 1 — Data Model: Galaxy Generator

**Feature**: 004-galaxy-generator
**Date**: 2026-05-01

This feature introduces one new persistent entity (`GalaxyMeta`) and populates
three pre-existing entities (`Sector`, `Planet`, `Wormhole`) introduced in
feature 001. No edits are made to prior migrations (Constitution IV).

## New entity: GalaxyMeta

Single-row table holding the authoritative provenance of the live galaxy.
Its presence is the boot-time signal that generation completed (FR-002,
FR-012). Its absence triggers regeneration.

| Field | Type | Notes |
|---|---|---|
| `id` | `Int` | Always `1`; DB-level `CHECK (id = 1)` enforces singleton. |
| `seed` | `BigInt` | The seed value actually used. May be wider than the runtime PRNG state — we record what the operator supplied for audit. |
| `plodds` | `Int` | Validated against legal range `1..20` before insert. |
| `wormodds` | `Int` | Validated against legal range `1..100` before insert. |
| `maxplanets` | `Int` | Validated against legal range `1..9` before insert. |
| `generatedAt` | `DateTime` | `@default(now())`. The transaction's commit timestamp is close enough for audit. |

Prisma model:

```prisma
model GalaxyMeta {
  /// Always 1; DB CHECK enforces single-row semantics.
  id          Int      @id @default(1)
  /// Seed actually used at generation. BigInt to allow operator-supplied wide values.
  seed        BigInt
  /// `plodds` tunable in effect at generation. Original `numopt` legal range 1..20.
  plodds      Int
  /// `wormodds` tunable in effect at generation. Legal range 1..100.
  wormodds    Int
  /// `maxplanets` tunable in effect at generation. Legal range 1..9.
  maxplanets  Int
  /// Generation commit time.
  generatedAt DateTime @default(now())
}
```

Migration adds the table with the singleton CHECK constraint via raw SQL in a
follow-up `prisma migration` step (the CHECK is not expressible in the schema
DSL).

## Populated entities (no schema changes)

### Sector (`GALSECT`, GEMAIN.H:424)

The generator inserts exactly **450 rows** — one per `(x,y)` in
`0..MAXX-1 × 0..MAXY-1`. Field population:

| Field | Value at generation |
|---|---|
| `xsect`, `ysect` | from the row-major iteration order |
| `plnum` | `0` always (sectors carry no planet number; `Planet.plnum` discriminates) |
| `type` | `SECTYPE_NORMAL = 1` (`GEMAIN.H:205`); no other sector types in the original `xgetsector` path (`GEPLANET.C:481`) |
| `numplan` | The number of planets+wormholes placed in this sector. For origin = `s00plnum` (5); for non-origin = `p` from `gernd()%maxplanets` (`GEPLANET.C:484-487`) |

### Planet (`GALPLNT`, GEMAIN.H:438)

Origin-sector planets (the `s00` fixture) populate fields per
`GEPLANET.C:670-727` (`build_plan_1`). Non-origin planets populate per
`GEPLANET.C:579-631`:

| Field | Origin (s00 fixture) | Non-origin (random) |
|---|---|---|
| `xsect`, `ysect`, `plnum` | from fixture index | sector coords + `i+1` |
| `xcoord`, `ycoord` | `(xsect + s00[i].xcoord, ysect + s00[i].ycoord)` | `(xsect + rng.f(0.8) + 0.1, ysect + rng.f(0.8) + 0.1)`, retried until ≥ 0.07 from peers |
| `type` | `PLTYPE_PLNT = 2` | `PLTYPE_PLNT = 2` |
| `name` | `s00[i].name` (e.g. `"Zygor-3"`) | `""` empty (FR-008; nameless until colonized) |
| `userid` | `s00[i].owner` (typically `""`) | `null` |
| `enviorn` | `s00[i].env` | `floor(rng.f(4))` ∈ `0..3` |
| `resource` | `s00[i].res` | `floor(rng.f(4))` ∈ `0..3` |
| `cash`, `debt`, `tax`, `taxrate`, `warnings` | `0` | `0` |
| `password` | `"none"` | `"none"` |
| `lastattack`, `beacon`, `spyowner` | `""` | `""` |
| `technology`, `teamcode` | `0` | `0` |
| `itemsQty[14]`, `itemsRate[14]`, `itemsSell[14]`, `itemsReserve[14]`, `itemsMarkup2a[14]`, `itemsSold2a[14]` | filled per `build_plan_*` per-type rules in source | mostly zero, with `~25%` chance of populated `MEN`/`FOOD` qty per `GEPLANET.C:618-627` |

**Multi-planet sectors are valid** — `Planet.@@id([xsect,ysect,plnum])`
allows up to `MAXPLANETS=9` (the source bound) per sector. The wiki's
"max planets per sector" rule is `maxplanets` config (default 5 for us).

### Wormhole (`GALWORM`, GEMAIN.H:467)

Wormholes are an alternative to a planet in a non-origin sector — the
original picks them stochastically when iterating slots
(`GEPLANET.C:548-551`). Origin sector wormholes only exist if an `s00` entry
has `type == 3`.

| Field | Value |
|---|---|
| `xsect`, `ysect`, `plnum` | sector coords + slot index `i+1` |
| `type` | `PLTYPE_WORM = 3` |
| `xcoord`, `ycoord` | origin-side COORD inside the sector (same scheme as planets) |
| `visible` | `1` (faithful to `GEPLANET.C:641`) |
| `destXcoord`, `destYcoord` | `(destX + 0.5, destY + 0.5)` where `destX/destY` are integer sector coords sampled from `0..MAXX-1 × 0..MAXY-1` and `(destX,destY) != (xsect,ysect)`. **Deviation from `GEPLANET.C:642-643`** which sampled `[-univmax..+univmax]` — see `research.md` Decision 5. |
| `name` | `""` (nameless wormholes; original sets none in `build_worm`) |

## In-memory read model (transient, hydrated at boot)

Not persisted; lives inside `GalaxyService`. Hydrated once after the
generation transaction (or after the idempotency probe shows an existing
world).

```ts
class GalaxyService {
  private planetsBySector: Map<string, Planet[]>;       // key "x,y"
  private wormholesBySector: Map<string, Wormhole[]>;   // key "x,y"
  private planetsByName: Map<string, Planet>;           // key lowercased planet.name
}
```

Invariants:
- `planetsByName` only contains entries with non-empty `name` — i.e., the
  origin-sector neutral-zone set. Non-origin planets are not addressable by
  name (FR-010).
- `planetsBySector.size + (sectors with no planets)` covers all 450 sectors.
- Maps are constructed once and never mutated within the 004 scope.

## Configuration (transient, env-sourced)

Not stored as data; read once at boot and validated.

```ts
interface GalaxyConfig {
  seed:       number;   // uint32; default 0xC0FFEE
  plodds:     number;   // 1..20; default 4
  wormodds:   number;   // 1..100; default 10
  maxplanets: number;   // 1..9; default 5
}
```

Out-of-range values throw on `onModuleInit` and abort startup (FR-006a).

## Lifecycle / state transitions

`GalaxyMeta` row:
- **Absent** (fresh DB) → generator runs → row inserted as last write of the
  generation transaction.
- **Present** (existing world) → no writes; generator skips entirely.
- **Never** updated or deleted by feature 004. (Re-seeding a world is
  expressed by dropping the DB and rebooting.)

`Planet` rows are written exactly once at generation in feature 004 scope.
Mutation (colonization, ownership transfer, trade) is feature 005 territory.

`Wormhole` rows are written exactly once and never mutated.

`Sector` rows are written exactly once and never mutated (in this feature).
