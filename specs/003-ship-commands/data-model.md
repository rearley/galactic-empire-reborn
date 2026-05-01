# Data Model — Ship Commands & Terminal Frontend

This feature does **not** introduce or alter any Prisma models. It introduces three
in-memory domain types (`ShipState`, `Command`, `CommandResult`) and one wire payload
(`ScanCell`). All persisted shapes are inherited from feature 001's schema.

---

## In-memory entities

### ShipState

The authoritative live representation of one ship. Mirrors `Ship` from
`backend/prisma/schema.prisma` field-for-field (FR-007), plus a `dirty` flag.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `userid` | `string` | `Ship.userid` | composite key part |
| `shipno` | `number` | `Ship.shipno` | composite key part |
| `shipname` | `string` | `Ship.shipname` | |
| `shpclass` | `number` | `Ship.shpclass` | resolves to `ShipClass.classNumber` |
| `heading` | `number` | `Ship.heading` | float, degrees |
| `head2b` | `number` | `Ship.head2b` | float, target heading |
| `speed` | `number` | `Ship.speed` | float, current speed |
| `speed2b` | `number` | `Ship.speed2b` | float, target speed |
| `xcoord` | `number` | `Ship.xcoord` | float, universe X |
| `ycoord` | `number` | `Ship.ycoord` | float, universe Y |
| `damage` | `number` | `Ship.damage` | float |
| `energy` | `number` | `Ship.energy` | float |
| `phasr`, `phasrtype` | `number` | `Ship.*` | |
| `kills`, `lastfired` | `number` | `Ship.*` | |
| `shieldtype`, `shieldstat`, `shield` | `number` | `Ship.*` | |
| `cloak` | `number` | `Ship.cloak` | |
| `degrees` | `number` | `Ship.degrees` | the *requested* rotation delta — set by `cmd_rotate` per Q1 |
| `percent` | `number` | `Ship.percent` | impulse % set by `cmd_impulse` |
| `tactical`, `helm`, `train` | `number` | `Ship.*` | gating fields short-circuited per FR-019a |
| `where` | `number` | `Ship.where` | hyperspace flag; `>= 10` = orbit |
| `ltorpsChannel`, `ltorpsDistance` | `number[]` | `Ship.*` | parallel arrays |
| `lmisslChannel`, `lmisslDistance`, `lmisslEnergy` | `number[]` | `Ship.*` | |
| `decout` | `number[]` | `Ship.decout` | |
| `jammer` | `number` | `Ship.jammer` | |
| `freq` | `number[]` | `Ship.freq` | length 3 |
| `items` | `bigint[]` | `Ship.items` | cargo |
| `titem`, `hostile`, `cantexit`, `repair`, `hypha`, `firecntl`, `destruct`, `status`, `cybmine`, `cybskill`, `cybupdate`, `tick`, `emulate`, `minesnear`, `lock`, `holdcourse`, `topspeed`, `warncntr` | `number` | `Ship.*` | |
| **`dirty`** | `boolean` | _in-memory only_ | set `true` on every state mutation; cleared after successful Prisma flush |

**Invariants**:
- `dirty` defaults `false` after hydration; defaults `false` after a successful flush; never read by Postgres.
- `degrees ∈ [-180, 180]` per `valdegree` (`GEFUNCS.C:1933`).
- `percent ∈ [0, 99]` per `valpcnt` (`GEFUNCS.C:1906`).
- For ship class with `maxWarp == 0`, `cmd_warp` short-circuits with `WARP01` and never mutates `speed2b` / `head2b`.

**Lifecycle**:
1. **Hydrate** at `OnModuleInit`: `prisma.ship.findMany()` → mapper → Map.
2. **Mutate** during a command: handler writes fields directly on the stored `ShipState`, then sets `dirty = true`.
3. **Flush** on each `SHIP_UPDATE` tick: iterate Map, for every `dirty` entry call `prisma.ship.update({ where: { userid_shipno: { userid, shipno } }, data: { …mappedFields } })`, then `dirty = false`. Each entry's flush is wrapped in try/catch so a sibling failure cannot stop the loop or the next tick (FR-006).

**Cardinality**: one `ShipState` per `(userid, shipno)`. The Map size at any point equals the count of persisted `Ship` rows minus any rows that have been removed (out of scope here).

### Connection-scoped active ship binding

Per FR-030, the active ship for one connection is resolved on socket handshake — not via an in-game command (no BOARD entry exists in the original `GECMDS.C` command table). The `GameGateway` stores the binding on the Socket.io client object:

```ts
// in handleConnection, after resolution:
client.data.userid        = '<connecting userid>';
client.data.activeShipNo  = <resolved shipno>;
```

Resolution rule (from FR-030 — verbatim, no implementation latitude):

| Ships found for `userid` (sorted by `shipno` ASC) | Action |
|---|---|
| 0 | `client.emit('error', { code: 'NO_SHIP', message: 'No ship found for user.' })` then `client.disconnect(true)`. No row is created. |
| 1 | bind that row's `shipno` to `client.data.activeShipNo`. |
| ≥ 2 | bind the **lowest `shipno`** (the first row of the ASC sort). Log exactly: `[ShipStateService] WARN multiple ships for userid=<id>, picked lowest shipno=<n>`. Connection is NOT rejected; player is NOT prompted. |

**Why lowest shipno** (recorded in FR-030 and reproduced here so an implementer reading only `data-model.md` does not invent a different rule):

1. Deterministic — same `userid` reconnecting always hits the same ship, required by handshake-resolution tests and by the dirty-flag flush model.
2. The `Ship` model has no `lastActiveAt` / `lastFlownAt` column. A "most recently used" rule would require a schema migration this feature deliberately avoids.
3. `shipno` is part of the composite primary key — always present, never null, never tied across rows for the same `userid`.

**Handler-side guard**: if a handler cannot find a `ShipState` for `(client.data.userid, client.data.activeShipNo)` — which should be impossible in normal operation because the handshake guarantees the binding — it MUST return a single `system`-category line "No active ship." rather than crash.

Every command handler reads the active ship via `shipStateService.get(client.data.userid, client.data.activeShipNo)`. No in-scope command mutates `client.data.activeShipNo`.

---

### Command

A registered handler for one keyword.

| Field | Type | Notes |
|-------|------|-------|
| `keyword` | `string` | canonical lower-case keyword (`'impulse'`) |
| `aliases` | `string[]` | recognised short forms from `GECMDS.C:111-225` (`['imp']`) |
| `minArgs` | `number` | minimum args after the keyword |
| `handler` | `(ship: ShipState, args: string[], ctx: CommandContext) => CommandResult` | pure function |

The `CommandRouter` builds an internal `Map<string, Command>` keyed by both `keyword` and every entry of `aliases`, all pointing at the same record.

---

### CommandResult

| Field | Type | Notes |
|-------|------|-------|
| `lines` | `{ text: string, category: 'system'\|'info'\|'success'\|'combat' }[]` | order-preserving |
| `scanGrid?` | `ScanCell[]` | present only on `scan` |
| `broadcasts?` | `{ room: string, event: string, payload: unknown }[]` | scaffolded; no in-scope command emits any |

---

### ScanCell (wire type, also a domain type)

```ts
type ScanCell = {
  x: number;          // range-scan column, integer [0, MAXX) = [0, 30)
  y: number;          // range-scan row,    integer [0, MAXY) = [0, 15)
  type: 'ship' | 'planet' | 'wormhole' | 'self';
  char: string;       // the original game's single ASCII char for that object
};
```

The grid is the **range-centred tactical projection** rendered by `scan_lo`
(`GECMDS.C:2640-2726`), NOT an intra-sector grid. Dimensions come from `GEMAIN.H`:
`MAXX = 30` (line 121), `MAXY = 15` (line 122). Empty positions are omitted; an empty
range emits a `scanGrid` containing only the self-cell.

`char` mapping (anchored at the `scan_lo` renderer, not `scan_sh`/`scan_pl` which produce
no grid):

| `type` | `char` | Source |
|--------|--------|--------|
| `'ship'` | `'='` (manual ship) or `'+'` (auto/AI) | `scan_lo` `GECMDS.C:2710,2715` |
| `'planet'` | `'@'` | wiki `commands.md` (verify at implement; `scan_lo` original prints planets via the same `printmap` pipeline) |
| `'wormhole'` | `'*'` (visible) | wiki `commands.md` (verify at implement) |
| `'self'` | `'*'` | `scan_lo` `GECMDS.C:2721` — `map[MAXY/2][MAXX/2] = '*'` |

> **Char collision:** both wormholes and the self-cell currently land on `'*'` in the
> original. Disambiguation is delivered by the `type` discriminator on the wire — the
> frontend renderer can style `'self'` differently from `'wormhole'` (colour, weight)
> even though both glyphs are `'*'`.

**Projection** (per `GECMDS.C:2675-2718`, derived from `shipclass.scanrange`):

```
range   = shipclass.scanrange / 1000.0          // GECMDS.C:2675
xfactor = (range × 2) / (MAXX − 1)               // GECMDS.C:2681
yfactor = (range × 2) / (MAXY − 1)               // GECMDS.C:2682
xf      = (target.xcoord − ship.xcoord) / xfactor + (MAXX / 2)
yf      = (target.ycoord − ship.ycoord) / yfactor + (MAXY / 2)
emit    = (0 ≤ xf < MAXX) && (0 ≤ yf < MAXY)     // off-range cells dropped
```

`SCAN_GRID_WIDTH = MAXX = 30` and `SCAN_GRID_HEIGHT = MAXY = 15` are exported from
`contracts/shared-types.ts`. Backend (`backend/src/game/constants.ts`) and frontend
(`frontend/src/components/ScanMap.tsx`) MUST import these constants — neither side
hard-codes the dimensions.

**Self-cell**: the backend always emits `{ x: floor(MAXX/2), y: floor(MAXY/2), type: 'self', char: '*' }`
as part of every `scan lo` `scanGrid`, regardless of whether the range is empty
(`GECMDS.C:2721` writes the centre marker after all targets are projected).

**Restriction**: `scanGrid` is emitted by `scan lo` (and bare `scan` as alias) ONLY.
`scan sh` and `scan pl` are named-target text readouts (`scan_sh` `GECMDS.C:2190`,
`scan_pl` `GECMDS.C:2295`) and produce no `scanGrid` field. See spec.md
`Clarifications` Session 2026-05-02 Q1/Q2.

---

## Persisted entities (read-only here)

This feature **reads** the following models from feature 001 without modification:

- `Ship` — hydrated to `ShipState` at boot; updated row-by-row on flush.
- `ShipClass` — read for `maxWarp` / `maxAcceleration` / `maxImpulse` (impulse cap mirrors `cmd_impulse` `valpcnt(_, 0, 99)` upper bound; if `ShipClass` carries a tighter cap, that cap wins per FR-018).
- `Sector`, `Planet`, `Wormhole` — read by `scan` to populate `lines` text + `scanGrid`. The procedural generator is feature 004; in feature 003 we read whatever rows are present (Assumption #5).

No DDL changes; no new migrations.
