# Game Mechanics

Implemented mechanics with C source references.
Updated at the end of every implement session per CLAUDE.md.

---

## Command dispatch (feature 003)

**Source**: GECMDS.C:111-225 (command table)

Player text input is received over Socket.io as `{ input: string }`.
The `CommandRouterService` tokenises (trim + collapse whitespace), lowercases the
first token, and looks it up in an alias-keyed registry. If the keyword is
unknown it returns `UNKNOWN_CMD`. If `args.length < minArgs` it returns the
command's `argMissingMessage`. Otherwise it calls `handler(ship, args, ctx)`.

The `Command` type is synchronous: `handler` returns `CommandResult`, not a Promise.
Gateway wraps dispatch in a try/catch and emits `'Internal error processing command.'`
on unhandled throws.

---

## cmd_rotate (feature 003)

**Source**: GECMDS.C:258-310 (`cmd_rotate`)

Keywords: `rotate`, `rot`  
Argument: degrees (integer, -180..180)

Sets `ship.degrees` to the requested heading delta and marks the ship dirty.
The rotation takes effect on the next physics tick (TICKTIME=6s) when the tick
engine applies heading changes — not implemented until feature 006.

Balance constants from GEMAIN.H:
- `ROTENGUSE = 30` — energy consumed per rotation (gate deferred to feature 006)
- `ROTAMT = 20` — maximum degrees per tick (gate deferred to feature 006)

Error messages:
- `ROTFMT` — missing/invalid format
- `NUMOOR` — degrees out of range (-180..180)
- `NOWTURN` — success line includes the requested heading

---

## cmd_impulse (feature 003)

**Source**: GECMDS.C:312-380 (`cmd_impulse`)

Keywords: `impulse`, `imp`  
Argument: percent (integer, 0..99)

Sets `ship.percent` and `ship.speed2b = 1000 * (percent / 100)`. The speed change
is staged in `speed2b` (desired speed) and applied on the next physics tick.

Balance constants from GEMAIN.H:
- `ACCENGAMT = 120` — energy used per acceleration tick (gate deferred to feature 006)

Error messages:
- `IMPFMT` — missing/invalid format
- `NUMOOR` — percent out of range (0..99)
- `ENGFIRE` — success line includes the new heading (ship.heading)

---

## cmd_warp (feature 003)

**Source**: GECMDS.C:580-650 (`cmd_warp`)

Keywords: `warp`, `war`  
Argument: warp factor (integer; must be ≥ 0)

Stages the requested warp speed in `ship.speed2b = 1000 * speed`. Four gate checks
per GECMDS.C:

| Gate | Condition | Message | Action |
|------|-----------|---------|--------|
| WARP01 | `ship.topspeed == 0` | Ship class has no warp | Reject |
| WARP02 | `speed < 0` | Speed < 0 | Reject |
| WARP03 | `speed > topspeed * 1.5` | Way over max speed | Reject |
| WARP04 | `speed > topspeed` | Over max speed | Warn + apply |

WARP04 is warn-and-apply (not reject) per GECMDS.C:614-619. The distinction between
the class max_warp and topspeed (skill-adjusted) is deferred to feature 006; currently
`ship.topspeed` serves as the unified proxy.

Error messages: `WARP01`–`WARP04`, `ENGFIRE` (success)

---

## cmd_scan (feature 003)

**Source**: GECMDS.C:2138 (`cmd_scan`), GECMDS.C:2640 (`scan_lo`), GECMDS.C:2190 (`scan_sh`), GECMDS.C:2295 (`scan_pl`)

Keywords: `scan`, `sc`  
Subcommands: `lo` (default), `sh <name>`, `pl <name>`

`scan lo` — range-centred tactical projection onto a 30×15 grid.

Grid formula (GECMDS.C:2675-2718):
```
range        = scanRange / 1000.0 × 2.0
xfactor      = range / (MAXX - 1)
yfactor      = range / (MAXY - 1)
cell.x       = floor((target.x - ship.x) / xfactor + MAXX / 2)
cell.y       = floor((target.y - ship.y) / yfactor + MAXY / 2)
```

Returns `{ lines, scanGrid: ScanCell[] }`. Self-cell always at (15, 7) = `*`.
Other ships: `=` (normal) or `+` (auto-pilot, status==1).

`scan sh <name>` — text-only bearing/range to a named ship. No scanGrid.
`scan pl <name>` — text-only planet scan. No scanGrid. Deferred to feature 004.

Deferred gates (TODO markers):
- Tactical computer check (GECMDS.C:2143) — feature 006
- Jammer check (GECMDS.C:2150) — feature 006
- Planet/wormhole projection — feature 004

---

## cmd_report (feature 003)

**Source**: GECMDS.C:1946 (`cmd_report`)

Keywords: `report`, `rep`  
Subcommands: `nav`, `sys`, `cargo`, `wpns`

`report nav` — multi-line navigation read-out: ship class/name header, position,
heading, speed, rotation state, energy. Lines: REP01, REP02–REP11 (shield status),
REP12–REP14 (cloak/training/emulate gates if applicable).

`report sys` — system summary: damage, energy, kills. Lines: REP15–REP21.

`report cargo` — item inventory. Stub (TODO feature 005 planet items). Lines: REP22–REP27.

`report wpns` — weapon loadout. Stub (TODO feature 006 combat). Lines: REP28–REP32.

ShipClass data (typeName, hasCloak) is pre-cached on module init via Prisma.

---

## ShipState dirty flush (feature 003)

**Source**: Original engine flushed WARSHP via Btrieve record writes in various
command handlers and tick routines. This port batches writes.

On every `SHIP_UPDATE` tick (1s), `ShipStateService` iterates the in-memory Map
and calls `prisma.ship.update()` for each entry where `dirty === true`, then clears
`dirty`. Errors per-entry are caught and logged; other ships are not affected.

`mutate(userid, shipno, fn)` sets `dirty = true` after calling `fn`. Handlers that
read-only (scan, report) do not set dirty.

---

## Procedural galaxy generation (feature 004)

**Source**: @see GEPLANET.C:455-650 xgetsector

The 30×15 galaxy is generated once on first boot by `GalaxyService.onModuleInit()`,
inside a single Postgres transaction that also writes the `GalaxyMeta` singleton row.
If `GalaxyMeta` already exists the generator is skipped (idempotency probe).

### PRNG

A Mulberry32 generator is seeded from the `GALAXY_SEED` environment variable
(default `0xC0FFEE`). All random draws during generation consume from this single
deterministic stream, guaranteeing the same seed always produces the identical galaxy.

### Row-major iteration and the neutral zone

Sectors are visited in row-major order `y=0..14, x=0..29`. The origin sector `(0,0)`
(neutral zone) is special-cased first: it receives a fixed `s00` fixture authored as
a TypeScript constant array (the original loaded this from a `.MSG` file not present
in the reference source). All other sectors are procedurally generated.

### Sector population algorithm

For each non-origin sector:
1. A slot roll: `rng.intBelow(plodds) === 0` — if true the sector receives planetary objects.
2. If populated: `slotCount = rng.intBelow(maxplanets)` slots are generated.
3. Per slot: `rng.intBelow(wormodds) === 0` → wormhole; otherwise → planet.

Default config (matches GEMAIN.H balance intent):
- `plodds` controls planet density (lower = denser)
- `wormodds` controls wormhole-to-planet ratio
- `maxplanets` caps slots per sector

### Planet coordinate placement

Planet floating-point coordinates within a sector are computed as:
```
xcoord = xsect + rng.next() * 0.8 + 0.1
ycoord = ysect + rng.next() * 0.8 + 0.1
```
A peer-distance check of ≥ 0.07 is enforced between planets in the same sector;
slots that fail the check are retried up to a fixed attempt limit.

### Wormhole destinations

Destination coordinates are `(destX + 0.5, destY + 0.5)` where `destX ∈ 0..29` and
`destY ∈ 0..14`, drawn uniformly at random. Self-loop destinations (landing in the
same sector as the wormhole origin) are rejected and redrawn. Destinations are bounded
to the 30×15 grid (deviation from original `[-univmax..+univmax]` — see DECISIONS.md).

### Operator reseed

The generation parameters are configurable via environment variables:
`GALAXY_SEED`, `GALAXY_PLODDS`, `GALAXY_WORMODDS`, `GALAXY_MAXPLANETS`.
Changing the seed and running `db:reset` produces a fresh deterministic galaxy.

---

## Validators (feature 003)

**Source**: GECMDS.C — inline bounds checks in each command handler

`valdegree(str)` — parses an integer, validates -180 ≤ n ≤ 180. Returns `{ok: true, value}` or `{ok: false, code: 'NUMOOR'}`.

`valpcnt(str, max=99)` — parses an integer, validates 0 ≤ n ≤ max. Same shape.

Balance regression tests pin the boundary values. Changing the bounds breaks tests
(`validators.spec.ts`).
