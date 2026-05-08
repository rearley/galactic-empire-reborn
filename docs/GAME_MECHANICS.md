# Game Mechanics

Implemented mechanics with C source references.
Updated at the end of every implement session per CLAUDE.md.

---

## Movement (feature 006a)

**Source**: GEFUNCS.C:441-460 (`rotship`), 469-573 (`accel`), 617-792 (`moveship`)

Driven by the 6-second `TickKind.PHYSICS` heartbeat. For each non-destroyed
ship, in ascending `${userid}:${shipno}` order, `PhysicsTickService` runs:

1. **Rotation** (skipped when `where >= 10`, i.e., orbit/docked):
   step = `shipclass.maxAcceleration / 10` degrees per tick. Snap when the
   absolute angular gap to `head2b` is within one step (or wraps around the
   short way). Result normalized to `[0, 360)`. The rotate command pays
   `ROTENGUSE` up-front; the tick does not debit again.

2. **Acceleration** (same skip condition):
   up-step = `maxAccel`, down-step = `maxAccel * 2`, snap when within step.
   Energy debit on the step: `0` if post-step `speed < WARP_THRESHOLD (1000)`,
   else `ACCENGAMT (120)`. If the per-debit floor refuses, force
   `speed2b = 0` so the ship coasts down on the next tick.
   Hyperspace boundary crossings (≥1000 ↔ <1000) emit `physics.hyperspace`.

3. **Position integration** (only when `speed > 0`):
   `x' = x + speed * sin(deg2rad(heading)) / 65000`
   `y' = y - speed * cos(deg2rad(heading)) / 65000`
   Sector is derived from coordinates (`{ x: floor(x), y: floor(y) }`); on a
   change, `physics.sector-transition` is emitted with the old/new sectors and
   post-update coords.

4. **Movement maintenance** (only when `speed > 0` AND `status === 1`, i.e.,
   player ship): debit `MOVENGUSE = 10`; if energy then drops below
   `MOVENGMIN = 3000`, force `speed2b = 0`. AI ships (status ≠ 1) skip this
   debit entirely (per the original `moveship`'s `GESTAT_USER` gate).

5. **Countdowns** (unconditional, every non-destroyed ship — orbit/docked too):
   `hypha = max(0, hypha - 1)` and `cantexit = max(0, cantexit - 1)`.

Per-ship faults are caught: `{ shipId, tickAt, stack }` is logged at error
level and an in-memory fault counter increments; the batch continues. The
faulted ship is re-attempted on the next tick (no quarantine).

`max_accel` and `max_warp` are read from `ShipClassCacheService`, which is
hydrated once on boot from `prisma.shipClass.findMany` and never re-fetched.

---

## Universe Boundary Wrap (feature 019 — US1)

**Source**: GEFUNCS.C:651-705 (`moveship` wrapping block)

After position integration, `PhysicsTickService` calls `wrapCoord(value, max)` on each
axis when `ship.where <= 1` (normal space or hyperspace — not orbit/docked):

```
wrapCoord(v, max) = ((v % max) + max) % max
```

`MAXX = 30`, `MAXY = 15`. Ships that cross the `x = 30` or `y = 15` boundary reappear at
the opposite edge preserving heading, speed, cargo, and weapon locks. The `PHYSICS_BOUNDARY_WRAPPED`
event is emitted with pre- and post-wrap coordinates for clients to update cached state.

The `telezip` non-wrap fallback from the original is dead code under `univwrap=true`.

---

## Overspeed Engine Damage (feature 019 — US2)

**Source**: GEFUNCS.C:733-792 (overspeed block inside `moveship`)

On each `TickKind.SHIP_UPDATE` tick, `ShipTickService.processShip` calls `decideOverspeed(ship, rng)`:

- **Not over threshold** (speed ≤ `topspeed * 1.5`): no-op.
- **Recovery** (`intspeed <= topspeed` after a previous warning): resets `topspeed = floor(topspeed/warncntr)`, `warncntr = 0`; emits `WARPSPD`.
- **Lottery miss** (`rng.intBelow(10) !== 0`): no-op this tick.
- **Warning** (`warncntr <= 4`): increments `warncntr`; emits `WARPFAST + warncntr`.
- **Engine break** (`warncntr > 4`): `damage += rng.intBelow(20)`, `topspeed = 0`, `speed2b = 0`; emits `WARPBRK`. Ship coasts to a stop on subsequent ticks.

Balance: lottery probability `1/10` per overspeed tick; `diff < 0` is clamped to `5` in the warn branch.

---

## Auto-Repair Tick (feature 019 — US3)

**Source**: GECMDS.C:cmd_maint (extracted into `MaintenanceService`)

`MaintenanceService.evaluateGates(ship, passwordArg?)` checks these gates in order:
1. `damage > 0` — nothing to repair.
2. `cash >= cost` — `MAINT_COST_NORMAL = 200` or `MAINT_COST_NEUTRAL = 2500` when in neutral zone (Zygor class exempt).
3. `tagged === 0` — not in combat lock.
4. Not in neutral zone (unless Zygor class `ZYGORCLASS = 10`).
5. When `passwordArg` is provided: planet password gate.

On `TickKind.SHIP_UPDATE`, if `ship.autoRepair === true` and all gates pass, `runMaintenance(ship)` debits cash and queues repair. No player-facing message on tick-driven repairs (silent automation). Command callers pass `args[0]` as `passwordArg`; tick callers pass `undefined`.

---

## Auto-Shield Tick (feature 019 — US4)

**Port-original QoL feature — no C source equivalent.**

`decideAutoShield(ship)` returns `'raise'` when all of these hold:
- `ship.autoShield === true`
- `ship.shieldstat === 0` (shields currently down)
- `ship.tagged === 0` (not in combat lock)
- At least one trigger flag is set: `recentlyWarpedExit` or `recentlySelfFiredTorp`

On `'raise'`, `ShipTickService` sets `shieldstat = 1` and clears the trigger flag.
Trigger flags are in-memory only (not persisted to Postgres). Sources: warp-exit path in
`physics-tick.service.ts` sets `recentlyWarpedExit = true`; torpedo-launch handler sets `recentlySelfFiredTorp = true`.

---

## AI Kill Scoring (feature 019 — US5)

**Source**: GEFUNCS.C:killem (1143-1185), GEFUNCS.C:1161 (AI 1/10 branch), GECYBS.C (kill counter)

Score deductions use `score_f2 = 100` (configurable via `SCORE_F2` env, range `[0, 32700]`):
- **PvP**: `floor((scr / 100) * score_f2)` deducted from victim's `klscore` and `score`.
- **AI attacker**: `floor((scr / 100) * score_f2 / 10)` — one-tenth of PvP rate.

`CHGLOSER` cash penalty applies only to PvP kills (both sides non-AI).

When a Cybertron attacker (`Cybrg-` prefix) scores a kill, `PlayerScoreService` emits
`CYBERTRON_SCORED_KILL` to break the `PlayerScoreModule → CybertronModule` circular dependency.
`CybertronTickService` listens and calls `cybertronRepository.incrementKills(shipno, userid)`.
Droid attackers (`@Droid-`) do NOT increment the kill counter (GEFUNCS.C:1253).

---

## Droid Presence Bridge (feature 019 — US6)

Ephemeral droid ships (`@Droid-N` userid prefix) are never persisted. Two lifecycle events
are broadcast via Socket.io:

- `droid.spawned` → emitted to the sector room (`sector:<x>:<y>`) when a droid spawns.
  Payload includes `shipId`, `shipname`, `shpclass`, `sector`, `ephemeral: true`, `spawnedAt`.
- `droid.killed` → emitted to both the sector room and the global `kills` channel on droid death.
  Payload includes `shipId`, `killedBy` (attacker userid or `null` for mine kills), `shpclass`, `sector`.

Frontend `useSectorRoster` hook listens to these events and maintains an in-memory droid list
(component state only — never written to any persisted store). Droids appear in the sector
roster with an `ephemeral` marker; they disappear on kill or disconnect/reconnect.

---

## Command dispatch (feature 003)

**Source**: GECMDS.C:111-225 (command table)

Player text input is received over Socket.io as `{ input: string }`.
The `CommandRouterService` tokenises (trim + collapse whitespace), lowercases **only the
first token** (keyword), and looks it up in an alias-keyed registry. Subsequent tokens
(args) preserve original casing — required for ship-name commands. If the keyword is
unknown it returns `UNKNOWN_CMD`. If `args.length < minArgs` it returns the command's
`argMissingMessage`. Otherwise it calls `handler(ship, args, ctx)`.

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

## cmd_scan (features 003 + 004 + 015)

**Source**: GECMDS.C:2138 (`cmd_scan`), GECMDS.C:2640 (`scan_lo`), GECMDS.C:2190 (`scan_sh`),
GECMDS.C:2295 (`scan_pl`), GECMDS.C (`scan_ra`), GECMDS.C (`scan_se`)

Keywords: `scan`, `sc`  
Subcommands: `lo` (default), `lo full`, `ra <1-9>`, `se`, `sh <name>`, `pl <name>`

### scan lo (updated feature 015 — D1 deviation)

Range-centred tactical projection onto a 30×15 grid.

Grid formula (GECMDS.C:2675-2718):
```
range        = scanRange / 1000.0 × 2.0
xfactor      = range / (MAXX - 1)
yfactor      = range / (MAXY - 1)
cell.x       = floor((target.x - ship.x) / xfactor + MAXX / 2)
cell.y       = floor((target.y - ship.y) / yfactor + MAXY / 2)
```

Self-cell always at (15, 7) = `*`. Other ships assigned scantab letters A-Z (nearest-first
ordering). Planet cells: `O`. Wormhole cells: `W`. Mine cells: `*` (when no ship overlaps).
**D1 deviation**: original C used `+` (auto-pilot) / `=` (normal) glyphs; this port uses A-Z
scantab letters to enable consistent cross-scan targeting.

### scan ra (feature 015)

**Source**: GECMDS.C (`scan_ra`)

Range radar with zoom levels 1–9.

Zoom formula: `effectiveRange = scanRange / (10 - level)^2`

- Level 1: effective range = `scanRange / 81` (very narrow — near vicinity only)
- Level 5: effective range = `scanRange / 25`
- Level 9: effective range = `scanRange / 1` (full scan range)

Grid: same 30×15 projection as `scan lo`, but using `effectiveRange` instead of the default
`scanRange / 500 × 2`. Colour channel: self (`*`), human (A-Z), ai (A-Z). Shares scantab with
`scan lo` — letter assignments are stable across both subcommands within the same session.

### scan se (feature 015)

**Source**: GECMDS.C (`scan_se`)

Sector close-up scan bounded to the player's current 1×1 sector (no projection outside
`floor(xcoord)..floor(xcoord)+1`, `floor(ycoord)..floor(ycoord)+1`). Fills the full 30×15
display grid with the sector contents. 4-colour channel: self (`*`), human (A-Z), ai (A-Z),
planet (digit 1-9 from plnum). Shares scantab with `scan lo` / `scan ra`.

### scan lo full (feature 015)

**Source**: GECMDS.C (`scan_lo` side-panel path); column layout matches `scan_sh` style

`scan lo full` produces the standard `scan lo` grid plus a right-side panel. Each row in
the panel corresponds to one scantab entry (A-Z) and contains:

| Col | Field |
|-----|-------|
| Letter | scantab letter |
| Distance | `cdistance × 10000` parsecs |
| Bearing | degrees to target |
| Heading | target ship's current heading |
| Speed | target ship's current speed |
| Name | target ship name (only if `User.options[0]` SCANNAMES = on) |

Result is emitted as `scan:render` with `mode: 'lo-full'` and a `sidePanel: SidePanelRow[]`
field alongside the grid.

### Scantab lifecycle (feature 015)

`ScanHandlerService` maintains a per-socket `Map<letter, shipKey>` scantab (letters A-Z,
up to 26 entries). Assignment is nearest-first by `cdistance`.

- **Lazy init**: populated on first `scan lo` / `scan ra` / `scan se` / `scan lo full` call.
- **Cleared** on: socket disconnect, ship death (`COMBAT_SHIP_DESTROYED` for that ship's owner),
  ship dock (where >= 10).
- **D2 deviation**: NOSCANTAB constant widened from 15 to 26 (full alphabet). The original C
  capped letter assignment at 15 ships; this port uses the full A-Z set.

### scan sh / scan pl

`scan sh <name>` — text-only bearing/range to a named ship. No scanGrid.
`scan pl <name>` — text-only planet scan. Resolves by galaxy-wide name (feature 004 D2).

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

## Combat (feature 006b)

All combat mechanics are driven by the 6-second `TickKind.PHYSICS` heartbeat via `CombatTickService`,
which subscribes after `PhysicsTickService` (post-move coordinates guaranteed).

---

### cmd_phasor / pha (feature 006b)

**Source**: GECMDS.C:cmd_phasor, GECMDS.C:954, GEFUNCS.C:firephas

Keywords: `pha <bearing> <percent>`

Gates (in order): `phasrtype` mounted on ship class; `phasr >= PMINFIRE (60)`; bearing `-180..180`;
percent `1..99`; firer's `jammer == 0` (JAMMER4 reject). Hyper-phaser path selected when
`speed >= WARP_THRESHOLD (1000)`.

Arc resolution: `lineOfFire(firer, target, bearing, beamWidth)` where `beamWidth = percent`.
`PHABIAS = 2` widens the effective arc — a target outside `percent` but within `percent + PHABIAS`
is still a hit (GECMDS.C:954). Friendly fire is allowed (no team filter). Energy and phasr charge
consumed on the firer. `cantexit = FIRETICKS` set on firer and on each victim hit.

Phaser reload: `CombatTickService` adds `PRELOAD (10)` to `phasr` per tick, clamped to `maxPhaser`.

Events emitted: `COMBAT_PHASER_FIRED`, `COMBAT_HIT` (per hit target), `COMBAT_MISS` (if arc empty).
All sector-scoped.

---

### Torpedoes / tor (feature 006b)

**Source**: GECMDS.C:cmd_torpedo, GECMDS.C:1178-1206, GEFUNCS.C:firetorp

Keywords: `tor <target>`

Gates: class must have `hasTorpedo`; ship not at warp; ship not cloaked; `items[torpedo] > 0` in
cargo; target's `ltorps[]` has a free slot (MAXTORPS=3, slots live on the **target**); firer's
`jammer == 0`.

On fire: allocate lowest free slot on **target's** `ltorps[]` with `.distance = cdistance × 10000 + 20`
and `.channel = firer.channel`; decrement one torpedo from firer's cargo; set firer's `shieldstat = down`;
set `cantexit = FIRETICKS` on firer.

Tick travel (`CombatTickService`): decrement `.distance` by `TORPSPED` per tick. If distance drops
below decoy threshold and target has active decoy, roll `decoyIntercept(random, DECODDS)` — on
success emit `COMBAT_DECOY_INTERCEPT` and clear slot. At `distance <= 0`, resolve hit via
`randamage + tonFact + shieldhit`, emit `COMBAT_HIT { weapon: 'torpedo' }`, clear slot. If target
is no longer `ingegame`, clear slot with no hit (FR-027.3).

---

### Missiles / mis (feature 006b)

**Source**: GECMDS.C:cmd_missl, GEFUNCS.C:firemiss

Keywords: `mis <target> <charge>`

Gates: class must have `hasMissile`; charge `1..50000`; energy debit `charge / MISENGFC`; target's
`lmissl[]` has a free slot (MAXMISSL=3); firer's `jammer == 0`.

On fire: allocate slot on **target's** `lmissl[]` with `.distance = cdistance × 10000 + 20`,
`.channel = firer.channel`, `.energy = charge`; set `cantexit = FIRETICKS` on firer. Missiles may
target ships at warp (no warp gate).

Tick travel: same decoy-intercept and hit resolution as torpedoes, using `MISLSPED` for travel.
Decoy threshold for missiles: `<3000` (vs `<5000` for torpedoes).

---

### Mines / mine (feature 006b)

**Source**: GECMDS.C:cmd_mine, GEFUNCS.C:minesweep, GEFUNCS.C:1432

Keywords: `mine`

Deploys one mine at the firer's current coordinates. Persisted to the `Mine` table via
`MineRepository.create()` and added to `MineRegistry`. Decrements `items[mine]` in cargo.

Mine sweep (per tick): `MineRegistry.tickAll()` decrements every mine's `timer` by 1.
`sweepCandidates()` returns mines where `timer % 5 === 0`. For each candidate, all ships within
`MINERANGE (10000)` are checked (neutral zone sector 0,0 skipped per GEFUNCS.C:1432).
- `timer > 0`: emit MINE6 proximity warning only; no damage.
- `timer === 0`: apply `mineFalloff(distance, tonFact)` cubic-falloff damage; write `victim.lastfired
  = mine.channel`; emit `COMBAT_HIT { weapon: 'mine' }` + `COMBAT_MINE_DETONATION`; delete mine
  from repo and registry.

No owner exclusion: the deployer can be hit by their own mine (faithful to GEFUNCS.C:minesweep).

---

### Zipper / zip (feature 006b)

**Source**: GECMDS.C:cmd_zipper

Keywords: `zip`

Sweeps all mines within the firer's scan range. For each in-range mine: `MineRepository.delete()` +
`MineRegistry.remove()`, emit `COMBAT_MINE_DETONATION` with no victim. Firer is not damaged. Mines
outside scan range are untouched.

---

### Decoys / decoy (feature 006b)

**Source**: GECMDS.C:cmd_decoy

Keywords: `decoy`

Allocates the lowest zero slot in `ship.decout[]` (max 10 slots, MAXDECOY=10) and sets it to
`DECOYTIME (15)`. Decrements one decoy from cargo. Decoy counter decremented each tick by
`CombatTickService`. When a decoy slot is active and an incoming torp/missile enters the decoy
threshold, `decoyIntercept(random, DECODDS)` is rolled. On intercept: `COMBAT_DECOY_INTERCEPT`
emitted, slot cleared, projectile neutralized.

---

### Jammer / jam (feature 006b)

**Source**: GECMDS.C:cmd_jammer, GECMDS.C:1593-1651

Keywords: `jam`

Area-effect: iterates all ships within carrier's `scanRange`, including the carrier itself (no
self-exclusion). Sets each affected ship's `jammer = JAMTIME × (1 − distance/scanRange)` via
`ShipStateService.mutate`. Decrements one jammer from cargo.

While `jammer > 0`: ship cannot fire phasors, torpedoes, missiles, or use the lock command
(JAMMER4 reject). `CombatTickService` decrements non-zero `jammer` counters each tick. `sys unjam`
clears the carrier's own `jammer` to 0 immediately.

---

### Lock / lock (feature 006b)

**Source**: GECMDS.C:cmd_lock, GECMDS.C:1441-1471

Keywords: `lock <name>`

Sets `ship.lock = target.channel` via `ShipStateService.mutate`. Resolves target by case-insensitive
name prefix within scan range via `findShip`. Self-lock rejected. Out-of-range target rejected (NOLOCK).

Lazy clear via `@` shorthand: when `@` is used in any weapon command, `findShip` re-validates the
stored lock. If the target is `!ingegame` or `cdistance × 10000 > scanRange`, `lock = -1` is set
and NOLOCK is returned before the weapon fires.

Firer's `jammer > 0` rejects the lock command (JAMMER4).

---

### Shields / shi (feature 006b)

**Source**: GECMDS.C:cmd_shield

Keywords: `shi up` / `shi dn`

Toggles `ship.shieldstat`. No energy cost. No auto-raise: `CombatTickService` does not reset
`shieldstat` between ticks. Firing a torpedo lowers shields (`shieldstat = down`) on the firer and
they remain lowered until the player explicitly raises them (`shi up`).

---

### Flux / flux (feature 006b)

**Source**: GECMDS.C:735-752

Keywords: `flux`

Consumes one flux pod from `items` and sets `ship.energy = ENGYMAX`. Rejected if no flux pods in
cargo. If energy is already at max, the pod is still consumed (matches original behavior at
GECMDS.C:751).

---

### Kill resolution (feature 006b)

**Source**: GEFUNCS.C:killem, GEFUNCS.C:acctm, GEFUNCS.C:1103-1185

After each tick's combat passes, `CombatTickService` checks every ship for `damage >= 100`. On death:
- `attacker = lastfired` channel lookup.
- `attacker.kills++` via `ShipStateService.mutate`.
- **Cargo transfer** (GEFUNCS.C:killem 1122-1136): loop items index 1–13 (skipping `I_MEN=0` by
  loop bounds, `I_TROOPS=8` explicitly). For each non-zero item: pick a random divisor 1–5
  (`Math.floor(random.next() * 5) + 1`), transfer `victim.items[i] / divisor` units if the
  weight fits in the attacker's remaining cargo (`ITEM_TONS[i] × amt ≤ maxTons − usedTons`).
- **Score transfer** (GEFUNCS.C:killem 1143-1185): `scr = shipClass.points` for victim's class.
  `attacker.score += scr` and `attacker.klscore += scr` (DB). `victim.score -= scr` and
  `victim.klscore -= scr` (floored at 0, never negative). AI victims (`Cybrg-*`, `Droid-*`)
  are never penalised. rospos bonus and chgloser cash penalty deferred to feature 009.
  Handled by `PlayerScoreService` → `PlayerScoreRepository.transferKillScore`.
- Emit `COMBAT_SHIP_DESTROYED` (galaxy-wide broadcast) with `loot` and `scoreAwarded` fields.
- Call `ShipStateService.removeFromGame(victim)`.
- Walk every other active ship's `ltorps[]`/`lmissl[]`; clear any slot whose `.channel == deadShip.channel`
  (GEFUNCS.C:1755-1778).

---

### Planet revolt (feature 006b)

**Source**: GEPLANET.C:341-380

Added to `PlanetEconomyService` (runs inside the economy tick for each owned planet): when
`(taxrate/120) × 0.35 × men > troops` AND `Random.next()` rolls `gernd() % 10 === 0`, troops are
reduced to `troops / ((rand % 8) + 2)`, a `MAIL_CLASS_DISTRESS` row is queued, and
`ownerUserId` is set to `null`. No combat events are emitted; this is a pure economic/political
consequence. The `RANDOM` port ensures revolt conditions are deterministic in tests (SC-007).

---

## Validators (feature 003)

**Source**: GECMDS.C — inline bounds checks in each command handler

`valdegree(str)` — parses an integer, validates -180 ≤ n ≤ 180. Returns `{ok: true, value}` or `{ok: false, code: 'NUMOOR'}`.

`valpcnt(str, max=99)` — parses an integer, validates 0 ≤ n ≤ max. Same shape.

Balance regression tests pin the boundary values. Changing the bounds breaks tests
(`validators.spec.ts`).

---

## Cybertron AI (feature 007)

**Source**: GECYBS.C — `cyb_lives` (198), `cyb_check_lockon` (649), `cyb_check_damage` (619),
`cyb_attack` (490), `cyb_annoy` (379), `cyb_lay_decoys` (556), `cyb_init` (88), `db_update` (455)

### Lifecycle

Cybertrons are persistent AI ships stored in Postgres (`userid LIKE 'Cybrg-%'`).
On boot, `CybertronRepository.hydrateAll` loads all `Cybrg-*` ships into `ShipStateService` and
clamps any `User.cash > CYB_MAXCASH (2_000_000)`. If population is below configured targets,
a spawn slot fires every 30 physics ticks (≈3 minutes) via `repository.createSpawn`.

### Per-ship state machine (`cyb_lives`)

Fires when `ship.tick` counts down to 0 (each Cybertron has an independent countdown):

1. **Energy allowance**: `energy += CYB_ALLOW (35)` (capped at 999,999).
2. **`cybUpdateDb`**: decrement `cybupdate`; when it hits 1, randomize direction/speed.
3. **Engagement scan** (`runEngagementScan`):
   - Skipped when inside the neutral zone (sector 0,0).
   - Skipped when jammed (`ship.jammer !== 0`).
   - Loops all active players within `scanRange`.
   - **Zipper branch**: class with `hasZipper`, `minesnear>0`, and inventory → deploy zipper,
     reverse course, set `holdcourse`, clear target (`cybmine=255`).
   - **Breakoff**: non-Cyberquad, 1-in-500 per visible target → clear target, escape at top speed,
     emit `cybertron.broke-off`.
   - **Warp-fire**: both ships in hyperwarp, `gebemean`, range < 30,000 → fire phasers.
   - **Normal-space attack** (within `tooclose` or `cantexit > 0`): `cybwhoops` gate → phaser;
     `rollTorpedoCount` → torpedo volley.
   - **Normal-space annoy** (in range but out of `tooclose`): `pickTaunt` → emit `cybertron.taunt`.
   - **Decoy deploy**: after attack/annoy, `cybwhoops` gate → fill one empty `decout` slot.
4. **Jammed path** (when `jammer !== 0`): lay mine (probabilistic), randomize course.
5. **`cybCheckDamage`**: if `damage > CYB_MINDAM (75)`: lay mine, deploy jammer, randomize heading;
   flush ship state immediately.
6. **`cybCheckLockon`**: honor `holdcourse` countdown; validate or reacquire target; select
   pursuit band (hyperwarp entry if far > `hyperdist1`, brake if > `hyperdist2`, close if near).
7. **Tick reset**: random `CYBTICKTIME`-based next countdown; Cyberquad (tough=1) ticks more aggressively.

### Difficulty scaling (`gebemean`)

- `kills < CYB_BE_NICE (30)`: 1-in-`CYBSLO (3)` chance of being mean (ordinary Cybertrons).
- `kills >= CYB_BE_NICE`: always mean.
- `kills >= CYB_BE_EASY (60)`: torpedo volley uses `rnd%6` (0–5); otherwise `rnd%2` (0–1).
- Cyberquad (`tough=1`) is always mean regardless of player kills.

### Gold accumulation and transfer

Each Cybertron earns `CYB_ALLOW (35)` gold per tick (credited to `ship.energy` for the tick
duration, then zeroed; the actual gold lives in `User.cash`). On spawn, initial gold is
`rnd % cyb_gold` per class (capped to `CYB_MAXCASH`). When a Cybertron is killed,
`CybertronRepository.transferGold` atomically zeros the victim's `User.cash` and credits
the attacker. Cash is clamped to `CYB_MAXCASH` at all four persistence boundaries (spawn,
hydrate, transfer, createSpawn).

### Sarterns

Sartern Attack Drones (class 24) and Obliterators (class 25) are `CLASSTYPE_CYBORG` ships.
They use the `Cybrg-` userid prefix per `GECYBS.C:104-105` and run the identical `cyb_lives`
code path. Their distinct behavior comes from their `ShipClass` row (higher scanRange,
different `tough` value) and their `CybertronClassConfig` entry (tot_to_create, tooclose, etc.).

---

## Droid AI (feature 008)

Three ephemeral ship classes driven by `DroidTickService` on the 6s physics tick. Droids are
never written to the DB — they exist only in the in-memory `ShipStateService` map. On server
restart all Droids vanish; on the next spawn cadence rollover (every 30 ticks ≈ 3 minutes) they
are re-populated up to cap. Max 2 per class, 6 total.

Spawn gated: only fires when ≥1 `GESTAT_USER` (human) ship is online.

### Class 31 — Lydorian Garbage Scow

**`@see GEDROIDS.C:droid_act_class_10`**

- Passive only — never returns fire under any condition.
- Scan loop: if a live player is within `scanRange (25000)`, toggle shields by speed
  (up at impulse, down at warp), roll `gernd() % 4 === 1` to emit a passive annoy message.
- Jammed path: set `speed2b = random sub-warp`, `holdcourse = [10, 59]` ticks.
- Loadout: sparse (flux 0–49, decoys 0–24, mines 0–9, jammers 0–9; no torps/missiles/gold).

### Class 32 — Murdonian Transport

**`@see GEDROIDS.C:droid_act_class_11`**

- Heavy freighter; primary PvE target for new players.
- Jammed path: `speed2b = topspeed * 1000`, random heading, hold-course `[10, 59]` ticks.
- Scan loop: shield toggle, optional sub-warp drift (if `holdcourse == 0`), annoy roll.
- Fight-back (`cantexit > 0 && lastfired >= 0` — note `>=`, not `>`):
  - Hyperspace + attacker in same zone + `ddist < 30000`: fire hyper-phaser.
  - Normal space + attacker non-cloaked: fire phaser; 1-in-10 confuse roll
    (new `head2b ∈ [0, 359.9)`, `speed2b ∈ [0, 10000)`, `holdcourse [3, 12]`).
  - Hyperspace + missile attached: exit hyperspace (`speed2b = rndm(999.0)`, hold `[5, 19]`).
  - Otherwise: raise shields.
  - Always emits a help-variant annoy message on fight-back entry.
- Loadout: heavy (flux 0–49, decoys 0–249, torps 0–249, mines 0–99, jammers 0–99,
  missiles 0–99, ion 0–24, gold 0–249). Gold transfers to killer on death.

### Class 33 — Vakory Survey Drone

**`@see GEDROIDS.C:droid_act_class_12`**

- Jammed path: `speed2b = topspeed * 1000`, `holdcourse = [10, 59]` ticks.
- Scan loop: shield toggle, annoy roll (passive variant).
- Fight-back (`cantexit > 0 && lastfired > 0` — note strictly `>`, not `>=`):
  - Hyperspace + same zone + `ddist < 30000`: fire hyper-phaser.
  - Normal space + non-cloaked attacker: fire phaser + `rollVakoryTorpedoVolley` (0 or 1 torp).
    - 1-in-20 alter-attack-vector roll (`head2b`, `speed2b ∈ [0, 5000)`, `holdcourse [3, 12]`).
  - Missile attached: `speed2b ∈ [5000, 10900)`, `holdcourse [5, 9]`.
  - `damage > 75%`: lay mine (if `items[I_MINE] > 0`) + deploy jammer (if `items[I_JAMMER] > 0`)
    + top-warp flee, `holdcourse [20, 49]`.
  - Help annoy emitted on fight-back entry.
- Loadout: sparse (no gold, no torps/missiles initially; torp inventory is replenished
  pre-fire per `GEDROIDS.C:480` so the AI is never gated by inventory).

### Ephemerality invariants

- `ShipState.isEphemeral = true` — `flush()` skips these states; zero Prisma calls.
- `removeFromGame` skips Prisma delete for ephemeral states.
- `prisma.ship.findMany({ where: { shpclass: { in: [31,32,33] } } })` always returns `[]`.
- Zero rows in `User` table with `userid LIKE '@Droid-%'`.

---

## Midnight Maintenance Pass (feature 009)

**Source**: GEMAIN.C:1084-1335 (`gemidnighta`)

Runs once per calendar day at 00:00 server time (`@Cron('0 0 * * *')`). Also triggered manually via POST /admin/midnight/run. Self-heals on restart: if today's `MidnightRun` row is absent, runs immediately on boot. Protected by a Postgres advisory lock — concurrent invocations throw `MidnightLockHeldError` (mapped to 409 at the API layer). The entire pass runs inside a single `prisma.$transaction()`.

### Phase 1 — Reset user accumulators (GEMAIN.C:1097-1115)

Zero `planets`, `score`, `plscore`, `population` for every non-KEY user. `klscore` is **not** touched — it is the lifetime kill-score accumulator.

### Phase 2 — Planet production reports (GEMAIN.C:1120-1170)

Walk every planet of type `PLTYPE_PLNT` with a non-empty, non-KEY, valid owner:

1. Compute `plScore = valuePlanet(cash, tax, itemsQty, BASEPRICE, PLTVCASH, PLTVDIV)`
   - Formula: `(cash + tax) × PLTVCASH / 1_000_000 + Σ(BASEPRICE[i] × itemsQty[i] / PLTVDIV)`
   - Source: GEPLANET.C — `PLTVCASH = PLTVDIV = 201_228_378`
2. Accumulate `planets`, `population` (= `itemsQty[0] / 10_000`), `plscore` per owner in-memory
3. Batch-update owners via `Promise.all`
4. Insert one `MailStat` row (class 3 / `MAIL_CLASS_PRODRPT`) per planet in chunks of 50

Planets with empty `userid`, KEY owner, or unknown owner are silently skipped (FR-011/FR-012).

### Phase 3 — Mail purge (GEMAIN.C:1175-1195)

Delete all `Mail` rows where:
- `stamp < (now - mailDays × 86400)` (default 7 days, configured via `MIDNIGHT_MAILDAYS`)
- `userid LIKE '*%'` (system-flagged recipients)

### Phase 4 — Score and roster (GEMAIN.C:1204-1332)

1. **User scores**: `UPDATE User SET score = plscore + klscore WHERE userid != KEY` (raw SQL)
2. **Team reconciliation**:
   - Zero all team `teamcount` and `teamscore`
   - For each user with `teamcode > 0`: increment `teamcount` if team exists, else reset `teamcode = 0` (orphan)
   - For each user with `teamcode > 0` and `score > 0`: `teamscore += TEAMBONU + (score / teamcount)`
     - `TEAMBONU = 3_200_000` (GEMAIN.H)
   - Mark teams with `teamcount = 0` as removed (`teamcode = -1`)
3. **Roster ranking**: Assign `rospos` via `ROW_NUMBER() OVER (ORDER BY score DESC, userid ASC)` to qualifying users (`score > 0`, not KEY, not `@`-prefixed). Non-qualifiers get `rospos = 0`.

### ChgLoser — PvP cash penalty (FR-025/FR-026)

**Source**: GEMAIN.C — `CHGLOSER` feature, `GEPCNT` percentage

When a player kills another player (both non-AI), `PlayerScoreService` transfers `floor(loser.cash × chgLoserPercent / 100)` from the loser to the killer atomically in a Prisma transaction. Rate configured via `MIDNIGHT_CHGLOSER` env (default 0 = disabled). AI ships (prefix `Cybrg-` or `@Droid-`) never pay the penalty as either attacker or victim.

---

## cmd_new — new-player onboarding (feature 011)

**Source**: GECMDS.C:4534 `cmd_new`

Not a typed command — triggered automatically by `GameGateway.handleConnection()` when
a connected socket has no existing `Ship` row. `OnboardingService` runs a multi-step
state machine per `socketId`:

1. **AWAITING_CLASS**: server emits `prompt:class-list` with all 18 `ShipClass` rows
   (classNumber, typeName, description). Client renders `ClassPickerPrompt`.
2. **AWAITING_NAME**: after client replies `prompt:reply { value: classNumber }`, server
   emits `prompt:ship-name`. Client renders `ShipNamePrompt`.
3. **Finalized**: after client replies `prompt:reply { value: shipName }`, server
   validates name (1-19 printable chars, no spaces, case-insensitive unique across all ships),
   creates `User` (if absent) + `Ship` rows in a Prisma transaction, loads ship into
   `ShipStateService` via `loadIfAbsent()`, then emits `player.snapshot` to all connected
   clients. `onboardingPrompt` is cleared on the client when `player.snapshot` arrives.

Returning players bypass the state machine: `OnboardingService.handleReturningPlayer()`
emits a welcome `command:result` directly.

**Validation**: ship name must match `/^[!-~]{1,19}$/` (printable ASCII, no space, max 19
chars). Name-taken uses the `Ship_shipname_lower_idx` LOWER() expression index.

---

## cmd_rename — ship rename (feature 011)

**Source**: GECMDS.C:5002 `cmd_rename`

**Syntax**: `rename <new-name>`

`RenameService.rename(userid, shipno, newName)` validates:
1. Format: 1-19 printable ASCII, no spaces (`/^[!-~]{1,19}$/`).
2. Case-insensitive uniqueness: if any other ship already has the same `LOWER(shipname)`,
   returns `reason: 'NAME_TAKEN'`.
3. Byte-identical: if the name is exactly equal (same bytes), it is a no-op — DB write is
   skipped; the handler returns a "Ship name unchanged" `system` message.

On success, the service atomically updates `Ship.shipname` in Postgres **and** in the
in-memory `ShipStateService` map. The handler then queues two broadcasts via `CommandResult.broadcasts`:
- `ship.renamed` to the current sector room with `{ shipId, oldName, newName }`
- `player.snapshot` sentinel → global `server.emit('player.snapshot', registry.list())`

Frontend: `useSocket` dispatches `RENAMED` action to `usePlayerList`; the reducer updates
`name` for the matching `shipId` without a full list replacement.

---

## cmd_who — list active ships (feature 012)

**Source**: GECMDS.C:5162 `cmd_who` (original = BBS debug echo; see D1 in DECISIONS.md for deviation)

**Syntax**: `who`

`WhoHandlerService` reads all ships from `ShipStateService.findAllShips()`, filters out
any ship with `cloak === 1`, and sorts the remainder by `shipname` case-insensitively.
Returns one header `system` line followed by one `info` line per ship: class number,
sector `(x,y)`, kills, shipname. Includes the calling ship.

---

## cmd_dat — ship stat block (feature 012)

**Source**: GECMDS.C:5829 `cmd_data` (original = password-gated wire-format dump; see D1 in DECISIONS.md for deviation)

**Syntax**: `dat <ship-name-fragment>`

`DatHandlerService` iterates `ShipStateService.findAllShips()` for the first ship whose
`shipname` contains the arg as a case-insensitive substring. If found and not cloaked,
renders a full stat block: class, sector, heading, speed, energy, damage, kills, 14 cargo
slots (items[0..13] rendered as numbers), and team name resolved via `Prisma.team.findFirst`
using the ship's `ShipState.teamcode`. Returns `Ship not found.` for no-match or cloaked.

---

## cmd_ros — leaderboard (features 012, 018)

**Source**: GECMDS.C (no direct equivalent; see GEMAIN.H for score/kills fields)

**Syntax**: `ros` / `ros all`

`RosHandlerService` queries `Prisma.user.findMany` excluding any userid with prefix `Cybrg-`
or `@Droid-`, ordered by `score DESC, kills DESC, userid ASC`. Default cap is
`ROSTER_MAX` (env var, default 20); `ros all` raises cap to 200.

**Team column (feature 018)**: After the user page query, collects distinct non-zero `teamcode`s
and performs a single `TeamRepository.findTeamsByCodes` call (no N+1). Each row includes a fixed
12-char team column between `UserID` and `Score`: team names ≤ 12 chars are padded; names > 12
are truncated to 11 chars + `…`; null/0/missing teamcodes render `---` padded to 12. Header:
`  Rank  UserID                Team         Score      Kills  Planets  Population`.

---

## cmd_fre — channel frequency (feature 012)

**Source**: GECMDS.C — frequency management; thresholds defined in research.md

**Syntax**: `fre <A|B|C> <number|hail>`

`FreHandlerService` maps channel letter to `ship.freq` index (a→0, b→1, c→2). Accepts
the keyword `hail` (sets 0) or a positive integer ≥1. Rejects: 0, negatives, non-integers,
invalid channels. On success sets `ship.dirty = true` so the 1s flush persists the value.

Thresholds in `_freq-thresholds.ts`: `FREQ_HAIL=0`, `FREQ_SECTOR_MAX=19999`,
`FREQ_GALAXY_MIN=20000`. Balance-regression tested in `test/unit/commands/freq-thresholds.spec.ts`.

---

## cmd_sen — send message (feature 012)

**Source**: GECMDS.C — in-game messaging; see contracts/websocket-events.md for payload shape

**Syntax**: `sen <A|B|C> <message>`

`SenHandlerService` reads `ship.freq[channelIndex]` and resolves the broadcast room:
- `freq === FREQ_HAIL (0)` → `room: 'hail'` (gateway delivers to all non-cloaked sockets)
- `1 ≤ freq ≤ FREQ_SECTOR_MAX (19999)` → `room: 'sector:{x}:{y}'` (current sector)
- `freq ≥ FREQ_GALAXY_MIN (20000)` → `room: 'galaxy'` (all connected clients)

Messages are capped at 200 characters; longer messages return a usage error with zero
broadcasts. Event name: `message.send`. Not persisted.

---

## cmd_tea — team management (features 012, 018)

**Source**: GECMDS.C:5277 `cmd_team` (see D2 in DECISIONS.md for auto-assigned teamcode deviation)

**Syntax**: `tea` / `tea leave` / `tea list` / `tea create <name…> <password>` / `tea <name…> <password>`

`TeaHandlerService` routes by first token:
- No arg: shows current team (via `ShipState.teamcode` → name lookup) or "not on a team".
- `tea leave`: clears `User.teamcode` (null) and `ShipState.teamcode` (undefined), sets `dirty = true`, emits `player.snapshot` broadcast.
- `tea list`: returns sorted leaderboard via `TeamService.list()` (see below).
- `tea create <name…> <password>`: creates a new team. Last token = password, preceding tokens = name (trimmed). Name ≤ 30 chars; password ≤ 8 chars, no whitespace. `TeamService.create` wraps `getMaxTeamcode+1 → insertTeam → User.update` in a Prisma transaction with up to 3 retries on P2002 (unique name race). Name casing preserved (FR-006). Emits `player.snapshot` on success.
- `tea <name…> <password>` (≥ 2 tokens, not a keyword): password-gated join. Calls `TeamService.joinByPassword` — case-insensitive name match, case-sensitive password comparison. Emits `player.snapshot` on success.
- Single non-keyword token (`tea Foo`): routes to show-current-team (FR-016a) — NOT a join attempt.

### Team creation (feature 018 deviation from GECMDS.C:5277)

The original required a player-supplied 5-digit `teamcode` and two passwords (`secret` for founder,
`password` for members). This implementation auto-assigns `teamcode = MAX(teamcode) + 1` and uses a
single plaintext join password (≤ 8 chars per FR-011a, vs original 10). `Team.secret` is stored as
`""` and unused. A `LOWER(teamname)` unique partial index enforces case-insensitive uniqueness at the
DB level. These deviations are explicitly authorised by spec lines 165–170.

### `tea list` leaderboard

`TeamService.list()` uses exactly two Prisma queries (no N+1):
1. `User.groupBy({ by: ['teamcode'], where: { teamcode: { gt: 0n } }, _count: ... })` — live member counts.
2. `Team.findMany({ where: { teamcode: { in: codes } } })` — fetches names and scores for surviving codes.

Results sorted `teamscore DESC, teamcode ASC`, capped at `TEAM_LIST_DISPLAY_CAP = 20`. Teams with
0 live members are excluded (FR-023a). `Team.teamcount` is not read (FR-023 — live count only).
`MAXTEAMS = 50` (GEMAIN.H:240) is the global cap; the display cap of 20 is a documented deviation (D2 in research.md).

---

## cmd_cloak — cloaking device (feature 013)

**Source**: GECMDS.C:3188 `cmd_cloak`; GEFUNCS.C:1366 `cloakstat`

**Syntax**: `cloak on` / `cloak off` (alias: `clo`)

`CloakHandlerService`:
- `on`: gates — cloak already active (>0), damaged cloak (<0), in hyperspace (where==1), energy ≤ CLOAK_ENERGY_USE. On success: debits energy, sets `ship.cloak = CLOAK_RAMP_INIT (1)`.
- `off`: sets `ship.cloak = 0`; broadcasts `event.log` to sector room.

`ShipManagementTickService.cloakTick()` — runs every PHYSICS tick (6s):
- Damaged cloak (<0): increments +1 each tick until 0.
- Energy starvation (`energy < CLOAK_ENERGY_USE`): sets cloak=0, emits `ship-management.cloak-collapsed` → gateway pushes to `user:${userid}` socket.
- Active cloak: drains `CLOAK_ENERGY_USE` (default=50, sysop-configurable via env); ramp: 1→2→10 over two ticks. `cloak===10` = fully cloaked.

**Cloaked-at-10 effects**: invisible to Cybertron target acquisition; excluded from `who` listing; `cmd_tor` locked out for firer; `cmd_report sys` shows "Cloak: active."

## cmd_transfer — ship-to-ship cargo transfer (feature 013)

**Source**: GECMDS.C:3271 `cmd_transfer`

**Syntax**: `transfer <item> <amount> <target-ship-name>` (alias: `tra`)

`TransferHandlerService` resolves the named target ship from `ShipStateService`. Gates: target
not found, target is self, ships in different sectors (co-location required). Amount validated:
`ALL` keyword transfers entire stack; numeric amount must be ≥1 and ≤ source's actual holding.
Gold (`I_GOLD`) and any of the 14 cargo items can be transferred.

Atomicity: both `ship.items[i]` decrement and `target.items[i]` increment happen inside the
same `ShipStateService.mutate` call sequence; if the gate fails neither ship is mutated.
Conservation invariant: `sourceQty + targetQty` before and after is identical (tested via 100
randomized transfers in `transfer.conservation.spec.ts`).

On success: a `user:${target.userid}` room broadcast notifies the receiving captain.

---

## cmd_jettison — discard cargo (feature 013)

**Source**: GECMDS.C:6102 `cmd_jettison`

**Syntax**: `jettison <item> <amount|ALL>` (alias: `jet`)

`JettisonHandlerService` decrements `ship.items[i]` by the requested amount. Items discarded
into space are permanently lost — no sector object is created, no recovery path exists (FR-403).

Gates: item keyword must resolve to a valid index; amount must be ≥1 (`ALL` on an empty slot
resolves to 0, which fails the guard); ship must actually hold the requested amount.

`ALL` resolves to the ship's entire current holding for that item index.

---

## cmd_set — ship option flags (features 013 + 015)

**Source**: GECMDS.C:5190 `cmd_set`; GEMAIN.H `options[]`

**Syntax**: `set auto-shield on|off` / `set auto-repair on|off` / `set scannames on|off` /
`set scanhome on|off` / `set ?` (alias: `set`)

`SetHandlerService` manages four flags across two storage locations:

**Ship-level flags** (persisted on the `Ship` DB row via `autoShield`/`autoRepair` columns):
- `auto-shield` → `Ship.autoShield` — when on, the ship management tick should auto-raise
  shields (tick consumer wiring deferred to feature 019).
- `auto-repair` → `Ship.autoRepair` — when on, the ship management tick should queue repair
  automatically (tick consumer wiring deferred to feature 019).

**User-level display options** (persisted in `User.options Int[]` at fixed indices, feature 015):
- `scannames` → `User.options[0]` — when on, ship names appear in the `sca lo full` side panel.
  Source: GEMAIN.H `options[]` SCANNAMES flag.
- `scanhome` → `User.options[1]` — when on, `scan:render` is delivered with `overwrite: true`
  (the frontend ScanPanel replaces the previous card rather than appending). When off, scans
  append. Source: GEMAIN.H `options[]` SCANHOME flag. **D3 deviation**: the original used ANSI
  cursor-home escape codes; this port uses a typed boolean field on the wire event.

`set ?` returns the current state of all four flags.

Flags are persisted immediately via `ShipStateService.mutate` (ship flags) or a direct Prisma
`User.update` (display options) + the 1s dirty flush (ship flags only).

---

## cmd_maint — maintenance (feature 013)

**Source**: GECMDS.C:4452 `cmd_maint`

**Syntax**: `maint` (alias: `mai`)

Gates (canonical order): FR-206 not in orbit, FR-207 uninhabited/pop<25000, FR-208 combat-locked, FR-209 NZ non-Zygor, FR-204 no damage, FR-205 insufficient cash.

Cost: `MAINT_COST_NORMAL=200 cr` (normal planet) / `MAINT_COST_NEUTRAL=2500 cr` (Zygor planets 0 or 1 at sector 0,0).

Effect: sets `ship.repair = floor(damage/3) + 1` (consumed by the repair sub-system).

## cmd_destruct/abort — self-destruct countdown (feature 013)

**Source**: GECMDS.C:5025 `cmd_destruct`, GECMDS.C:5044 `cmd_abort`; GEFUNCS.C:1820 `destruct`

**Syntax**: `destruct` / `des`; `abort` / `abo`

`destruct`: sets `ship.destruct = COUNTDOWN (20)`. Gates: NZ rejection, already-active rejection. Sector broadcast on initiation.

`ShipManagementTickService.destructTick()` — every PHYSICS tick:
- Decrements destruct by 1.
- If >0: emits `ship-management.destruct-tick` (special messages at 10/5/2).
- If ==0: emits `ship-management.destruct-boom` + `COMBAT_SHIP_DESTROYED` (null attacker, scoreAwarded=0) + `removeFromGame`.

`abort`: clears `ship.destruct=0`. Returns ABORT_OK. Sector broadcast only if `destruct<10` at abort time (SELFD4A — countdown was far enough that sector was already warned).

## cmd_abandon — ship abandonment (feature 013)

**Source**: GECMDS.C:3420 `cmd_abandon` (semantics reinterpreted — see DECISIONS.md D2)

**Syntax**: `abandon` / `aba`

Sets `ship.status = SHIP_STATUS_ABANDONED (3)`; clears any active destruct countdown; detaches `ctx.client.data.activeShipNo` so next command goes through onboarding (FR-704). Sector broadcast of abandonment.

FR-803: `CommandRouterService` checks `ship.status === 3` before routing any command — returns `SHIP_ABANDONED` message immediately.

---

## cmd_att — planet attack (feature 014)

**Source**: GECMDS.C:3515 `cmd_attack`; GECMDS.C:3580–3750 troop branch; GECMDS.C:3788–3950 fighter branch

**Syntax**: `att <amount> <troops|fighters>` (`tro` / `fig` accepted as keywords)

**Preconditions** (canonical source order):
1. FR-014-001: in orbit (ship.where >= 10)
2. FR-014-002: ship class can attack planets (ShipClassEntry.canAttackPlanet)
3. FR-014-003: planet type != PLTYPE_WORM
4. FR-014-004: not own planet (planet.userid != ship.userid)
5. FR-014-005: neutral zone zaphim (handled by combat tick)
6. FR-014-006: valid arg shape (amount + troops|fighters keyword)
7. FR-014-007: sufficient cargo

**Per-planet mutex** (`PlanetStateService.withPlanetLock`): serializes concurrent attackers on the same planet. Inside the lock: re-validate self-attack and cargo, then set `ship.hostile = ship.where`, `ship.cantexit = FIRETICKS`, deduct cargo.

**Troop attack** (`attackTroop`, steps 1–10):
1. Defender fighters fire: `kill1 += (gernd()%35+9) * fighters` (if fighters > 1)
2. Ground troops fire: `kill1 += floor(left2 * (rndm(PLATTRT1) + 0.25))`
3. Ratio counter-kill: `ratio = floor(left1/left2)`; if ratio > 2: `kill2 += floor(left1 * (rndm(PLATTRT2) + 0.1))`
4. Cap and apply
5. Outcome: dominance win if `left2 < left1/4`; retreat if `left1 < left2/4`; full-wipe win if `left2==0 && fighters==0`
6. Item destruction if `ratio > 2 && left1 > left2/2`: `gernd()%15` items per slot
7. Persist (planet troops updated, ship returns survivors)
8. Call-for-help: alert owner via EventEmitter2 + spy-mail roll if `ratio > 1`
9. Mail: MESG02 (lost) or MESG03 (won) if `ratio > 1`; class=MAIL_CLASS_DISTRESS
10. Ownership transfer: `WarUser.planets += 1` if won

**Fighter attack** (`attackFighter`, steps 1–11):
- Ratio is **floating-point**: `ratio = left2 > 0 ? (left1/left2)*100 : 0`
- **INTENTIONAL BUG PRESERVED** (FR-014-019, SC-008): when `left2 == 0`, `ratio = 0` — skipping ground AA, return-fire, counter-kill, item destruction. This matches the C source exactly.
- Ground anti-air: fires if troops > 500 AND `(gernd()%5-1) > 0`
- Defender return-fire if `left2 > 0`
- Counter-kill gated by `ratio > 1`
- Item destruction if `ratio > 5`
- Win if `left2 == 0 && troops < 5`
- Mail: MESG04 (lost) or MESG05 (won) if `ratio > 2 || won == 1`
- Call-for-help triggered if `ratio > 1 || won == 1`

**Balance coefficients** (all DI-injectable, env-var overrides): PLATTRT1=0.05, PLATTRT2=0.05, PLATTRF1=0.05, PLATTRF2=0.05, PLATTRF3=0.05, FIRETICKS=10

---

## cmd_pln — list owned planets (feature 014)

**Source**: GECMDS.C `cmd_pln`

**Syntax**: `pln`

Read-only. Queries `Planet` by `userid`, ordered by `plnum` ASC. Formats as `%-20s  (xx,yy)  #zzz`. Returns PLN_NONE if no planets owned.

---

## cmd_pri — price quote (feature 014)

**Source**: GECMDS.C:4284 `cmd_price`

**Syntax**: `pri` (bare listing) / `pri <amount> <item>` (quoted form)

Bare `pri`: lists all items with `sell=true` (or all items for the planet owner), one PRICE1 line each.

Quoted `pri <amount> <item>`: precondition ladder: BUY1 (orbit) → PRICEFMT (bad args) → BUY7 (no owner) → BUY5 (zero qty) → BUY4 (not for sale) → BUY8 (cargo full) → BUY3 (insufficient stock) → PRICE_NO_CASH (can't afford) → PRICE1 (quote).

Owner pricing uses BASEPRICE; foreign buyer uses item.markup2a. Read-only — no DB writes.

---

## cmd_maint — planet password gate (feature 014, deferred from 013)

**Source**: GECMDS.C:4471 MAINT2, :4479 MAINT3

Inserted between FR-209 (NZ non-Zygor) and FR-204 (no damage) in canonical source order.

- FR-014-060: planet has password and no arg provided → MAINT2 (password prompt)
- FR-014-061: wrong password → MAINT3 (incorrect password)
- FR-014-062: password == "none" (case-insensitive) → gate bypassed
- FR-014-063: correct password (case-insensitive `sameas`) → proceed to FR-204

---

## Autopilot (nav \<x\> \<y\>) (feature 016)

**Source**: GECMDS.C:5109 `cmd_navigate` (deviation: original was a one-shot bearing-report command; this port uses `holdcourse` for persistent steering — see DECISIONS.md D1 2026-05-07)

Player issues `nav <x> <y>` to set an autopilot destination. The command validates coordinates against `UNIVMAX=15`, sets `holdcourse=1`, `navTargetX`, `navTargetY` on the ship. On each 6-second physics tick, `PhysicsTickService` recomputes `head2b` toward the target cell center (`+0.5` offset), using the existing rotation step to steer. Arrival is detected when `Math.floor(xcoord) === navTargetX && Math.floor(ycoord) === navTargetY`; on arrival, `holdcourse`/`navTargetX`/`navTargetY` are cleared and `NAV_ARRIVED` is emitted to the player's socket room.

Manual `rot`, `imp`, or `war` silently disengages autopilot (`holdcourse=0`, targets cleared, no event).

---

## Spy (spy) (feature 016)

**Source**: GECMDS.C:6040 `cmd_spy`

Player in orbit of an enemy planet (`where >= 10`, not self-owned, not neutral zone, not wormhole) with one `I_SPY` item (index 13) plants a spy. Sets `planet.spyowner = ship.userid`, decrements `items[I_SPY]` by 1. A subsequent `scan pl <name>` by the spy owner reveals the planet's full item inventory (spy intel block). Prior spy is silently overwritten by a new spy.

**Known issue (A1)**: explicit spy removal mechanic (`FR-013`) is not implemented; `spyowner` is cleared only by overwrite or ownership change.

---

## Help (hel / ?) (feature 016)

**Source**: GECMDS.C `cmd_help`

`hel` with no args returns a topic catalog (five groups: navigation, combat, trade, planet, ship). `hel <topic>` returns the topic body. Unknown topic returns `HEL_UNKNOWN` listing valid topics. `?` is an alias bound to the same handler. Topic content is a frozen TypeScript catalog in `help-topics.ts`.

---

## Clear Screen (cls) (feature 016)

**Source**: GECMDS.C:117 `cmd_cls`

`cls` returns an empty `CommandResult` with `clearLog: true`. The frontend `command-result-handlers.ts` honours this by calling the `clearLines` callback after appending any lines (zero lines in this case), wiping the event log. No backend state is mutated. Other players' logs are unaffected (unicast via `command:result`).

---

## Player Mail (mai / rea / del) (feature 017)

**Source**: GEMAIN.H:220 (`MAIL_CLASS_DISTRESS=1`, `MAIL_CLASS_PRODRPT=3`), GEMAIN.H:531 (`MAILSTAT` struct)

Players receive mail in their `MailStat` inbox when planets are attacked (distress signals, class 1) or produce resources at midnight (production reports, class 3). Mail is accessed via three commands:

- **`mai`** — Lists all messages in newest-first order (stamp DESC, msgno DESC, class DESC). With an argument, delegates to maintenance gate (feature 014 FR-210 preserved).
- **`rea <index>`** — Reads the class-specific detail for message at 1-based index. Production reports show planet/cash/debt/tax/14-item table. Distress signals show attacker/planet/sector. Read-only.
- **`del <index>`** — Hard-deletes the message at 1-based index. Indices are re-resolved on each call (R5) — `del 2` twice against a 3-row inbox removes two different rows.

Sender resolution (R3): `MailStat.dtime` (sender userid) → ShipStateService.findByUserid → raw dtime → `"(system)"`.

Retention: midnight job purges `MailStat` rows older than 7 days (configurable via `MIDNIGHT_MAILDAYS`).

No schema change. No cross-player access. No soft-delete state (FR-014, SC-003).

---

## Source Fidelity Audit Corrections (feature 020)

**Source**: GEFUNCS.C, GEMAIN.H

Eight gaps between the C source and TS port were identified and resolved:

**Projectile hull damage roll** (`rollHullDamage`): The function previously named `randamage` computes `floor(rand * dmgMax * tonFact(ton))` — this is the projectile-hit hull damage roll, not the C `randamage()` routine. The C `randamage()` (GEFUNCS.C:1956) is a subsystem-damage function that only fires when `ptr->damage > 20.0` and rolls `rndm((101-damage)/1.5)` to decide if a subsystem is hit.

**Phaser reload** (`phaserReloadAmount`): Reload was `phasr += PRELOAD`. C source does `preload = phasrtype * PRELOAD; phasr += preload` (GEFUNCS.C:checkdam:1031). Fixed to `phaserReloadAmount(phasrtype) = phasrtype * PRELOAD`. The Interceptor class double-reload bonus is intentionally absent — it is commented out in the shipped C source.

**Wormhole visibility**: `getSectorWormholes` now returns `GalaxyWormholeView` with `visible: boolean` instead of the raw Prisma `Int`. Scan handler checks use `!wormhole.visible` (type-safe) instead of `!== 1`.

**Beacon-on-move**: When a ship crosses an integer sector boundary, `GameGateway.handleSectorTransition` now emits a `beacon` Socket.io event to the `toSector` room if: (a) there are observers in toSector, and (b) `gernd()%10===0` (1-in-10 probability from GEFUNCS.C:811).

**Set options** (`scanfull`, `filter`): `SetHandlerService` now handles all four options from `User.options[]`: scannames (index 0), scanhome (index 1), scanfull (index 2), filter (index 3). `ShipState` gains `scanFull` and `msgFilter` fields.

**Balance constants** (`GEMAIN_GAMEPLAY_PINS`): `ENGYMAX` corrected 50000→65000. 25+ missing constants added to `constants.ts`. `GEMAIN_GAMEPLAY_PINS` bidirectional pin map provides compile-time drift detection.
