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

## Planet orbit / land / claim (feature 005)

**Source**: GECMDS.C:3800 (`cmd_orbit`), GECMDS.C:3900 (`cmd_land`)

### cmd_orbit

Keywords: `orbit`, `orb`

Resolves planets in the ship's current sector via `GalaxyService.getSectorPlanets(xsect, ysect)`.

| Condition | Behaviour |
|-----------|-----------|
| No planets in sector | `ORBITNO` — no planets here |
| Already in orbit | `ORBIT01` — already in orbit |
| Exactly one planet | Auto-orbit: sets `ship.where = 10 + plnum`, `ship.speed = ship.speed2b = 0` |
| Multiple planets | Emits pick-list (`ORBITPK`), waits for pilot to pick by number |
| Invalid pick | `ORBITALR` |

### cmd_land

Keywords: `land`, `lan`  
Requires: ship must be in orbit (`ship.where >= 10`)

State machine:

1. Ship not in orbit → `LAND_NOT_ORBIT`.
2. Planet is unowned:
   - No name arg supplied → prompt `LAND_NAME_PROMPT` (one-shot redispatch on `land <name>`).
   - Name arg present → validate (1–19 printable ASCII, trimmed): invalid → `LAND_INVALID_NAME`.
   - Valid name → `PlanetStateService.claim(xsect, ysect, plnum, userid, name)` → `LAND_CLAIMED`.
3. Planet is owned by self → `LAND_OK` (no password check).
4. Planet is owned by another player:
   - `password == "none"` or empty → `LAND_REFUSED`.
   - `password == "team"` + matching `teamcode` → `LAND_OK`.
   - `password == "team"` + mismatching `teamcode` → `LAND_REFUSED`.
   - Exact password match → `LAND_OK`.
   - Wrong password → `LAND_PASSFAIL`.

Claim writes immediately through `PlanetStateService.runSerialized` (per-mutation flush, no dirty flag — research Decision 1).

---

## Planet buy / sell (feature 005)

**Source**: GECMDS.C:4201 (`cmd_buy`), GECMDS.C:4127 (`cmd_sell`)

### cmd_buy

Keywords: `buy`  
Requires: `ship.where >= 10` (landed on a planet)

Price rules:
- Owner (`ship.userid == planet.userid`): pays `BASEPRICE[item]`
- Non-owner: pays `markup2a[item]` (set by owner via `admin markup`)
- Fee formula: `totalCost = qty × price × (1 + doll/1000)` where `doll = price`
- Neutral-zone buy: ship cargo is credited but **planet inventory is NOT decremented** — the neutral zone is a creation source (research Decision 4)

Refusals: `BUY1` (not landed), `BUYPAS1`/`BUYPAS3`/`BUYPAS4` (password), `BUY3` (sell-flag off), `BUY4` (reserve cap), `BUY5` (capacity).

All three writes (planet inventory, user cash, ship cargo) happen inside the same `runSerialized` critical section.

### cmd_sell

Keywords: `sell`  
Requires: `ship.where >= 10`, landed on neutral-zone `plnum=1` (Zygor-3 at sector 0,0)

Sell at the galactic market removes items from the universe — planet inventory is **never mutated** on a sell.

Sufficiency check and ship-cargo decrement are co-located inside `PlanetStateService.runSerialized` to prevent double-spend under concurrent sells. The handler only applies the user cash credit after the service returns.

Fee formula (GECMDS.C:4147): `proceeds = qty × BASEPRICE[item]; fee = 1 + doll/1000; if (doll - fee) < 0 then fee = doll`.

Refusals: `SELL1` (not landed or not neutral zone), `SELLFMT` (not plnum=1), `SELL3` (insufficient cargo).

---

## Planet economy tick / multiply() (feature 005)

**Source**: GEPLANET.C:195–340 (`multiply`)

`PlanetTickService` subscribes to `TickKind.PLANET_UPDATE`. On each firing it advances a round-robin cursor and calls `PlanetStateService.runEconomicTickFor(planetKey)` for one planet.

Tick cadence: `interval = max(PLANTIME_MIN_SECONDS, floor(PLANTOCK_SECONDS / N))` where `N = planet count`. At 450 planets: `floor(1800/450) = 4s` (the floor). At 3 planets: `floor(1800/3) = 600s`.

### multiply() formula (pure function in `planet-economy.ts`)

1. **Troop starvation** — if `troops/100 > food.qty`, reduce men by starving troops.
2. **Food consumption** — `food.qty -= ceil(men.qty / 100)`.
3. **Men starvation** — if food exhausted after consumption, reduce men to zero; break production loop.
4. **Gold-to-cash** — `planet.cash += gold.qty × BASEPRICE[I_GOLD]; gold.qty = 0`.
5. **Per-item production** (14 items) — for each item `i`:
   - `tfact = 1 - taxrate / 120`
   - `prod = manhours[i] × envFact × tfact × (cashBoost if applicable)`
   - `qty = min(qty + prod × men.qty / 1000, maxpl[i])`
   - `tax += taxrate / 1200 × men.qty` (after last item)
6. **Production-report mail deferred to feature 009** (GEPLANET.C:313-326 cap + mail emit).
7. **Revolt and `check_spy` deferred to feature 006** (GEPLANET.C:341+).

Zero-population planets produce nothing (`if men.qty == 0 → break` before production loop).

---

## Planet administration (feature 005)

**Source**: GECMDS.C:4300 (`cmd_admin`), GECMDS.C:4350 (`cmd_withdraw`)

### cmd_admin

Keywords: `admin`, `adm`  
Requires: landed (`ship.where >= 10`), owner (`planet.userid == ship.userid`)

Sub-commands:

| Sub-command | Arg | Effect |
|-------------|-----|--------|
| `rate <item> <n>` | item keyword, rate value | Sets `items[i].rate` |
| `markup <item> <n>` | item keyword, markup | Sets `items[i].markup2a` |
| `sellflag <item> on\|off` | item keyword | Sets `items[i].sell` (1 or 0) |
| `reserve <item> <n>` | item keyword, qty | Sets `items[i].reserve` |
| `tax <0..119>` | integer 0–119 | Sets `planet.taxrate` |
| `beacon <text>` | up to 75 chars | Sets `planet.beacon` |
| `password <text>\|none` | up to 10 chars | Sets `planet.password` |

All changes flush immediately via `PlanetStateService.runSerialized`.

### cmd_withdraw

Keywords: `withdraw`, `with`  
Requires: landed, owner, `planet.tax > 0`

Drains `planet.tax` to `user.cash` via Prisma `increment`. Planet tax zeroed and user credited inside the same `runSerialized` critical section.

Refusals: `WTHDR_NOT_LANDED`, `WTHDR_NOT_OWNER`, `WTHDR_NONE` (nothing to withdraw).

---

## Planet beacon visibility (feature 005)

**Source**: GECMDS.C:2295 (`scan_pl`), research Decision 10

When a planet has a non-empty `beacon` field, the `scan` projection includes `beacon: string` on the planet's `ScanCell`. The `SCAN_BEACON` message (`%s broadcasts: "%s"`) is emitted as a readout line alongside the scan grid. No new socket channel — beacons surface through the existing `scan` response shape.

---

## report cargo (feature 005)

**Source**: GECMDS.C:1946 (`cmd_report`) — cargo branch

`report cargo` replaces the feature-003 stub with the real 14-slot readout.

Format (one line per non-zero item, ascending item index):
```
  120 Men
   30 Food Cases
Total: 180 tons in cargo (capacity: 1000 tons).
```

Zero-quantity slots are omitted (research Decision 8). The `REP_CARGO_NONE` line is emitted when all slots are zero.

ShipClass `maxTons` is pre-cached at module init alongside `typeName`/`hasCloak`/`scanRange`.

---

## Validators (feature 003)

**Source**: GECMDS.C — inline bounds checks in each command handler

`valdegree(str)` — parses an integer, validates -180 ≤ n ≤ 180. Returns `{ok: true, value}` or `{ok: false, code: 'NUMOOR'}`.

`valpcnt(str, max=99)` — parses an integer, validates 0 ≤ n ≤ max. Same shape.

Balance regression tests pin the boundary values. Changing the bounds breaks tests
(`validators.spec.ts`).
