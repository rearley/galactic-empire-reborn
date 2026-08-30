# Game Mechanics

Implemented mechanics with C source references.
Updated at the end of every implement session per CLAUDE.md.

---

## Fleet Ownership (feature 030-multi-ship)

**Source**: GEFUNCS.C:104-145 (`lookupshp`), 264-267 (`initshp` counter wiring), 319-384 (`findships`/`selectship`), 1270-1281 (`killem`); GECMDS.C:4558-4583 (`cmd_new` — new ship at Zygor); GEMAIN.H:296-297 (`noships`/`topshipno`), 550-556 (`SHPKEY`).

### Buying a ship — Zygor neutral-zone purchase

A player in sector (0,0) orbiting a Zygor planet may issue `new ship <class>` to purchase an additional hull. Rules enforced:

1. **Fleet cap**: `noships >= MAXSHIPS` (default 10, env-tunable 1–50) → rejected (`NEW_FLEET_FULL`).
2. **Credit check**: `cash < shipClass.maxPrice` → rejected.
3. **Allocate**: `shipno = User.topshipno + 1` (monotonic; never reuses a deleted number).
4. **Create dormant**: new Ship row created with `status = GESTAT_AVAIL` (0). It is NOT loaded into the live in-memory map — the buyer continues flying their current ship.
5. **Atomic update**: ship create + `User.cash` decrement + `noships++` + `topshipno = newShipno` all in one Prisma transaction.

To fly the new hull, the player disconnects and reconnects; the login ship-selection menu appears (see below).

### Login ship-selection (`prompt:ship-select`)

On every connection `handleConnection` runs the C `lookupshp` count-branch:

| Ships owned | Action |
|-------------|--------|
| 0 | New-player onboarding: emit `prompt:ship-name`, grant free `START_CLASS` starter, `noships=1`. |
| 1 | Auto-board: load the single ship into the live map, `status = GESTAT_USER`, emit welcome. |
| >1 | Emit `prompt:ship-select { step: 'SHIP_SELECT', ships: [...] }` — a numbered fleet list (index, shipno, className, shipname, sector). Wait for `prompt:reply { value: '<1-based-index>' }`. |

**Selection reply**:
- Invalid index or non-numeric → re-emit `prompt:ship-select` (mirrors C `selectship` re-prompt).
- Valid index → load the chosen ship, board it (`status = GESTAT_USER`), emit welcome + `player.snapshot`.
- Race: if the chosen ship no longer exists in DB between menu and reply → re-emit menu.

@see GEFUNCS.C:319-384 `findships`/`selectship`.

### Dormancy — idle ships are DB-only

Only the **active** ship (the one boarded at login) is in the live in-memory map. Idle owned ships are dormant: DB rows only, not ticked, not scannable, not attackable.

- **Boot hydration**: `ShipStateService.onModuleInit` loads **AI ships** (`status=GESTAT_AUTO`) only. Player ships are not loaded until their owner connects.
- **Board** (login): Prisma row → `ShipState`, `status = GESTAT_USER`, inserted into the live map.
- **Unboard** (clean logout): `status = GESTAT_AVAIL` persisted, state flushed, evicted from live map.
- **Tick/combat**: operate only on the live map; dormant ships are automatically excluded.

### Death — delete + free-starter-if-empty

Death permanently removes the hull:

1. `handleCombatShipDestroyed` (from combat tick or P-001 disconnect-kill).
2. `prisma.ship.deleteMany({ where: { userid, shipno } })` — `deleteMany` is a safe no-op if the row was already removed (race guard).
3. If `count > 0` and `User.noships > 0`: `noships--`. Never decrements below 0.
4. `removeFromGame` evicts from the in-memory map. Other owned ships are untouched.
5. On next login: if `noships == 0`, the 0-ship branch fires (onboarding free-starter grant).

`topshipno` is **never** decremented — ship numbers are monotonic and not reused.

@see GEFUNCS.C:1087 `killem`, 1270-1281; GEFUNCS.C:266-267 `initshp` counter wiring.

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

### cmd_phasor / pha (features 006b + 023)

**Source**: GECMDS.C:829-912 `cmd_phas`, GECMDS.C:914-1017 `firep`, GEFUNCS.C:2060-2093 `pdamage`

Keywords: `pha <bearing> [focus]`

Syntax (restored in feature 023 to match C source exactly):
- `bearing` — relative heading delta, integer `-180..180` (GEFUNCS.C:1933 `valdegree`).
- `focus` — beam focus, integer `0..5`, default `1` when omitted (GECMDS.C:829 `margc` check; GEFUNCS.C:1906 `valpcnt(margv[2],0,5)`).

Gates (in order per GECMDS.C:914-941): `phasrtype` mounted on ship class; `phasr >= PMINFIRE (60)`;
bearing `-180..180`; focus `0..5`; firer not cloaked (`cloak == 0` — C line 923-927);
firer not in neutral zone (neutral-zone self-zap, C line 937 — see below);
firer's `jammer == 0` (JAMMER4 reject). Hyper-phaser path selected when `speed >= WARP_THRESHOLD (1000)`.

**Beam half-angle**: `focus + PHABIAS (2)` degrees (GECMDS.C:954 `smallest(heading,deg) < percent+PHABIAS`).
Effective cone range: 4° (focus=2) to 14° (focus=12, but focus is capped at 5 so max practical cone is
7° half-angle). This is a tight directional weapon — the previous implementation used `percent` (0-99) as
the beam width, producing 77–204° arcs that hit almost everything.

Always full discharge: `phasr` is set to 0 on fire (GECMDS.C:1006 `warsptr->phasr = 0`). The `phasr`
charge governs how much of `PDAMMAX` is delivered, not how much arc is covered.

**Damage formula** (ported from GEFUNCS.C:2060-2093 `pdamage`, feature 023):
```
disfact = 20000 + phasrtype * 4000
dd      = max(0, 1 - dist / disfact)          // dist in cdistance units (×10000 scale)
fd      = 1 - focus / 11
dp      = dd^PFIRDST * fd² * (phasr / 100)
damage  = PDAMMAX * dp
```
With type-1 phaser and `PDAMMAX=200`/`PFIRDST=1`, damage falls to zero at `disfact=24000` ≈ 2.4 sectors.
Previously TS used an ad-hoc `(p/100)*maxPhaser/(1+range/100)` formula with near-full damage at 20 sectors.

Phaser reload: `CombatTickService` adds `phasrtype * PRELOAD (10)` to `phasr` per tick (F-002 fix),
clamped to `maxPhaser`.

Events emitted: `COMBAT_PHASER_FIRED`, `COMBAT_HIT` (per hit target), `COMBAT_MISS` (if arc empty).
All sector-scoped.

---

### Phaser damage balance constants (feature 023)

**Source**: GEMAIN.C:491-600 `numopt` calls — these are sysop-configurable defaults, not hardcoded.

`numopt(NAME, lo, hi)` supplies the CLAMP BOUNDS, not a default — the value itself came from a
sysop `.cnf` that is not part of the reference source. Two consequences the port originally got
wrong, both found during playtesting:

1. Where the bounds are wide, the value is a free balance choice (`PDAMMAX`).
2. Where the port exceeded a bound, the value was one the original **cannot produce** — a fidelity
   defect, not a preference (`TDAMMAX`, `MDAMMAX`, `JAMTIME`).

| Constant | Value | numopt bounds | Notes |
|----------|-------|---------------|-------|
| `PDAMMAX` | 25 | 1..200 | Max phaser damage. Was 200 — every phaser type one-shot, since ships die at damage >= 100 (phasrtype 1 computed 155). 25 gives combat an arc: only heavy phasers one-shot at point-blank. Env-overridable. |
| `TDAMMAX` | 100 | 1..**100** | Max torpedo damage roll. Was **200** — twice the maximum the original permits. Torpedo damage rolls `tdammax * rndm(.5)`, so at 200 a single torpedo reached the kill threshold outright. |
| `MDAMMAX` | 100 | 1..**100** | Max missile damage roll. Was **300** — three times the permitted maximum. |
| `JAMTIME` | 10 | 1..**10** | Jammer counter on deploy. Was **20** — jammers lasted twice the maximum duration. |
| `MINEDAMMAX` | 150 | 1..200 | Max mine damage. Checked and correct. |
| `PFIRDST` | 1 | 1..20 | Distance-falloff exponent; 1 = linear, >1 = steeper. |
| `PHATOWRP` | 0 | 0..100 | Min `phasrtype` to hit a warping victim with a normal phaser. 0 = any phaser can. |
| `TORFACT` | 0.1 | 1..50, then `/10` | Torpedo lock-quality divisor. Raw option 1 — correct. |
| `MISFACT` | 0.1 | 1..50, then `/10` | Missile lock-quality divisor. Raw option 1 — correct. |
| `SE100DAM` | 101 | 1..101 | Self-zap hull damage for firing inside neutral zone (instant kill). |

**`DECODDS` is deliberately NOT comparable to its 1..20 bound.** C uses a 1-in-N roll
(`gernd()%decodds==0`); `decoyIntercept` uses a percentage (`rand*100 < decodds`). The port's 50
means 50% intercept, inside C's achievable 5..100% range — a different parameterisation, not an
out-of-range value.

All are pinned in `backend/src/game/constants.ts` and covered by balance-regression tests;
`TDAMMAX`/`MDAMMAX`/`JAMTIME`/`PDAMMAX` are additionally env-overridable for playtest tuning.

---

### Neutral-zone self-zap / fire gate (feature 023)

**Source**: GECMDS.C:937-941 `firep`, GECMDS.C:1029-1035 `firehp`, GECMDS.C:1159-1163 `cmd_torp`,
GECMDS.C:1234-1238 `cmd_missl`; GECMDS.C:1525-1532 `zaphim`

Firing any weapon (phaser, torpedo, or missile) from inside the neutral zone sector (floor(x)==0 &&
floor(y)==0) calls `zaphim`: `firer.damage += SE100DAM (101)`. Because `damage >= 100` triggers
kill resolution on the next tick, this is an instant kill for the firer. No damage is applied to
the intended target. The `cantexit` timer is still set (battle-lock persists).

The neutral zone is checked using `isInNeutralZone(coord)` from `backend/src/game/combat/neutral-zone.ts`
(extracted in feature 023 from the inline check in `combat-tick.service.ts` so all handlers share one predicate).

Mine deployment in the neutral zone (C-004) is separately deferred.

---

### Cloak-fire gates (feature 023)

**Source**: GECMDS.C:923-927 `firep` (`if (warsptr->cloak > 0) { prfmsg(PCLOKUP); return; }`);
GECMDS.C:1234-1238 `cmd_missl`

A cloaked ship cannot fire phasers or missiles. Torpedo already had this gate (GECMDS.C:1123-1128).
With feature 023, all three player weapon commands are now consistent: the firer must be uncloaked
(`ship.cloak === 0`) to fire. The gate is checked before arc/target resolution.

Mine handler cloak gate (C-004) remains deferred.

---

### Ship class table — canon vs. this port

Canonical values: `reference/wiki/player-ships.md` (GE 3.2e, from MBMGESHP.MSG). There are **nine**
player classes (1-9); class 34 is the admin-only Sysopian Death Star. Pinned by
`test/balance/ship-class-scaling.balance.spec.ts`.

Every attribute matches canon exactly — shields, phaser, acceleration, warp, tons, price, points,
damage factor, and every capability flag. `scanRange` is compressed, because canon values reach
500 000 raw units (a 50-sector radius) on a 30x15 grid.

**The compression is a single proportional factor (x0.15)**, so every canonical relationship
survives:

| Class | canon | ours | weapon gate | sca-lo radius |
|-------|------:|-----:|------------:|--------------:|
| Interceptor | 100 000 | 15 000 | 1.5 | 4.5 |
| Stealth Fighter | 200 000 | 30 000 | 3.0 | 9.0 |
| Heavy Freighter | 50 000 | 7 500 | 0.75 | 2.3 |
| Destroyer | 100 000 | 15 000 | 1.5 | 4.5 |
| Star Cruiser | 200 000 | 30 000 | 3.0 | 9.0 |
| Battle Cruiser | 250 000 | 37 500 | 3.75 | 11.3 |
| Frigate | 250 000 | 37 500 | 3.75 | 11.3 |
| Dreadnought | 500 000 | 75 000 | 7.5 | 22.5 |
| Freight Barge | 200 000 | 30 000 | 3.0 | 9.0 |

Two radii derive from `scanRange` and differ by the sca-lo multiplier of 3:

```
weapon / lock gate (sectors) = scanRange / 10_000
sca-lo projection radius     = scanRange * 3 / 10_000
```

Rounds 1-2 compressed ad-hoc (factor 0.075..0.300, a 4x spread), which broke canonical ties and
reordered the classes — the Freight Barge lost its 2:1 scanner advantage over the Interceptor, and
the Dreadnought's canonical 2x lead became 1.14x. Round 3 fixes that. The earlier round's stated
concern, "no single ship sees half the map", was really about the STARTER: verbatim canon gives the
Interceptor a 30-sector projection radius. At x0.15 the Interceptor is unchanged at 4.5, so that
concern is preserved.

The Dreadnought does now project 22.5 sectors — most of the galaxy. That is canonical: its canon
scanRange is a 50-sector radius, so out-ranging everything is the flagship's defining trait. A
smaller anchor (0.10) would cap it at 15 sectors but drop the Interceptor to 1.0-sector detection
while Cybertrons still detect at 2.5, which is worse for new pilots.

#### AI classes — rescaled on the same factor

The AI table is compressed on the **same x0.15 factor** as the player classes, so player-vs-AI
relationships are canonical too (the Dreadnought at 75 000 still out-scans the Sarten Obliterator at
60 000, exactly as canon's 500 000 vs 400 000 does).

| Class | canon | ours | gate (sectors) |
|-------|------:|-----:|---------------:|
| Cybertron Scout | 50 000 | 7 500 | 0.75 |
| Cybertron Battle Cruiser | 100 000 * | 15 000 | 1.5 |
| Cybertron Base Star | 200 000 | 30 000 | 3.0 |
| Sarten Attack Drone | 20 000 | 3 000 | 0.3 |
| Sarten Obliterator | 400 000 | 60 000 | 6.0 |
| Lydorian Scow | 25 000 | 3 750 | 0.375 |
| Murdonian Transport | 25 000 | 3 750 | 0.375 |
| Vakory Survey Drone | 25 000 | 3 750 | 0.375 |
| Sysopian Death Star | 1 000 000 | 150 000 | 15.0 (admin-only) |

\* **One correction to canon.** `reference/wiki/cpu-ships.md` lists the Cybertron Battle Cruiser at
1 000 — 0.1 sectors, 50x below the Scout and 200x below the Base Star. That reads as a dropped zero
rather than design intent, so it is treated as 100 000, placing it between the two.

Before this rescale the AI table ranged 0.05..35x canon — a 700x spread, with two values left at raw
canon and two inflated ABOVE it. Because C-001 gates phaser reach on the firer's `scanRange`, an
inflated scanner was also an inflated weapon envelope.

**Verified live after the rescale**: a player parked beside a Sarten Obliterator was engaged and
destroyed (`ship destroyed: victim=... attacker=Cybrg-222`, hull -149% from a single phaser — the
Obliterator's phasrtype is 16). The round-2 failure mode this guards against — "Cybertrons appeared
inert in playtest" — has not returned.

Note the elite AI one-shots a light hull: 149% against a 100% kill threshold. That is a consequence
of canon phaser levels (Obliterator Pha=16 vs Interceptor Pha=10) rather than of the scan rescale.

Engagement distances themselves (`tooclose` 3000, `hyperdist1` 25, `hyperdist2` 10) are uniform
across Cybertron classes and match the wiki.

---

### The neutral zone (sector 0,0)

Two different things share the name, and conflating them causes bugs:

| Concept | Test | Used for |
|---------|------|----------|
| Neutral **bubble** | `isInNeutralZone(coord)` — coords within ±0.5 of the origin | Combat rules: firing here self-zaps for SE100DAM, mines skip ships inside it |
| Neutral **sector** | `NEUTRAL_ZONE_SECTOR` — `floor(coord) === 0` on both axes | Sector-wide rules, e.g. nothing here is claimable |

The sector is the larger area. The five neutral-zone planets sit at 0.2..0.8 on each axis — inside
sector 0,0, but mostly OUTSIDE the combat bubble.

**Neutral-zone planets cannot be claimed.** Sector 0,0 holds Zygor-3 (where `new ship <N>` is bought
and most trade happens), Nexus Prime, Caldor IV, Minera and Draconis. Found in playtest: landing on
Zygor-3 prompted for a name and the claim succeeded — the hub was renamed and player-owned.

C prevents this differently: `build_plan_1`/`build_plan_2` copy `s00[idx].owner` into
`planet.userid` (GEPLANET.C:671, 737), so neutral-zone planets are created ALREADY OWNED and the
claim path — which only fires when `plptr->userid[0] == 0` (GECMDS.C:3486) — never triggers. This
port's `S00Entry` has the same `owner` field but leaves it empty, so they were created unowned.

The guard here is on the SECTOR rather than on ownership: it states the rule directly and holds even
if a neutral-zone planet is somehow released. The C `s00[]` table is not in the reference source, so
the intended owner value is unknown and inventing a system account would be a guess.

Midnight restocks the hub by COORDINATES (`xsect: 0, ysect: 0, plnum: 1`), not by name, so a rename
never corrupted the nightly refresh — the damage was purely to gameplay.

---

### Trading requires ORBIT, not landing

`buy`, `admin` and `withdraw` all gate on `where < 10`, and `orb` sets `where = 10 + plnum`, so
`>= 10` IS the orbit state. That matches C's `cmd_buy` exactly (GECMDS.C:4212
`if (warsptr->where < 10)`).

Their messages used to read "You must be landed on a planet…", which is wrong and actively
misleading — a playtester went looking for a landing step that does not gate trade. All three now
say "in orbit". Verified live: `buy 5 foo` from orbit returns "5 Food Cases purchased for 4 credits".

Bare `pri` lists all 14 items with their 3-letter codes and prices; `buy <qty> <item-code>` takes a
quantity first.

---

### Which AI attacks unprovoked?

**Only Cybertrons.** Droids are purely reactive.

| AI | Initiates? | Gate |
|----|-----------|------|
| Cybertron / Cyberquad (classes 21-25) | **Yes** | `gebemean` (GECYBS.C:432): cyberquads always; players over `CYB_BE_NICE` (30) kills always; otherwise `gernd()%CYBSLO == 0` — with `CYBSLO=3` that is still **1 in 3** for a brand-new pilot |
| Lydorian Garbage Scow (31) | No | fight-back only |
| Murdonian Transport (32) | No | fight-back only |
| Vakory Survey Drone (33) | No | fight-back only |

The droid fight-back trigger is `cantexit > 0 && lastfired >= 0` (GEDROIDS.C:447) — `cantexit` is
set by `FIRETICKS` when the droid is hit and `lastfired` records the attacker's channel. A droid
that has never been shot at never shoots. Confirmed in playtest: a Murdonian Transport ignored a
ship parked 300 units away until it was torpedoed, then returned fire immediately.

So leaving the neutral zone exposes a new pilot to Cybertrons only — but a 1-in-3 hostility roll
against a class 1 Interceptor is enough to be lethal, which matched playtest experience (three
starter ships lost in quick succession).

**Note the port's droid gate uses `lastfired >= 0` where C uses `> 0`** (flagged in a code comment
in `droid-act-class-11.ts`). That makes channel 0 a valid attacker in the port but not in C.

---

### Population limits vs. galaxy size — NOT IMPLEMENTED

The original caps population through four sysop options. **None of them exist in this port:**

| C option | Bound | Purpose | Port |
|----------|-------|---------|------|
| `MAXPLRS` | 1..256 | Maximum concurrent players | **absent** |
| `NUMSHIPS` | 1..500 | Total ships in the universe | **absent** |
| `MAXDROID` | 0..500 | Droid population cap | **absent** |
| `MAXPLNTS` | 1..256 | Planet cap | **absent** |

Player registration is therefore unbounded, and nothing ties population to galaxy size.

Current density: **450 sectors** (30x15) with **24 Cybertrons** seeded at boot (per-class
`tot_to_create`, env-tunable via `CYBERTRON_CLASS_<n>_TOT_TO_CREATE`). Droid population is separate.

**A caveat on what MAXX/MAXY mean.** In the original these are the dimensions of the ASCII SCAN
GRID, not the galaxy: `xfactor = (univmax*2)/(MAXX-1)`, `yfactor = (univmax*2)/(MAXY-1)`
(GECMDS.C:2746) projects a universe spanning `-univmax..+univmax` on BOTH axes onto a 30x15
character display. Sectors are created lazily on demand — `getsector()` is documented as "look up
sector, if not found make one" (GEPLANET.C:384).

This port instead pre-generates a fixed 30x15 sector grid, which is a deliberate, documented
decision (DECISIONS.md, feature 004 — wormhole destinations were clamped to the grid for the same
reason). The unreconciled consequence is that **AI spawn still uses the C formula**
`rndm(univmax*2) - univmax` (GECYBS.C:158, GEDROIDS.C:135), placing ships at negative sectors
outside the generated grid — `who` routinely lists Cybertrons at coordinates like (-13,-7). That is
what made `scan se` throw out of bounds. Spawn bounds should be reconciled with the grid decision
the same way wormhole destinations were.

---

### Weapon reach — can a starter ship shoot across the galaxy?

No. Two independent limits apply to the normal phaser, and both are pinned by
`phaser-range-characterisation.spec.ts`:

1. **C-001 scanRange gate** — the beam is capped at the firer's `scanRange`: 15 000 units
   (1.5 sectors) for a class 1 Interceptor.
2. **`pdamage` falloff** — damage reaches zero at `disfact = 20000 + phasrtype*4000`, i.e. 60 000
   units (6 sectors) at phasrtype 10.

A shot one galaxy-width away (300 000 units) does nothing.

**Divergence worth knowing:** the port is STRICTER than the original here. In C only the
HYPER-phaser checks `scanrange` (GECMDS.C:1054). The normal phaser (GECMDS.C:946) iterates every
ship in the game and relies solely on the `pdamage` falloff, applying damage only `if (damage >= 1)`.
The C-001 gate added in feature 022 is a port addition.

Because the gate binds at roughly a quarter of `disfact`, falloff across a starter ship's usable
envelope is shallow — at `PDAMMAX=25` an Interceptor deals 108 at point-blank and 81 at its maximum
range.

---

### Lock-quality gate for torpedoes and missiles (feature 023)

**Source**: GECMDS.C:1339-1430 `lockon`, invoked by `cmd_torp` (line 1188) and `cmd_missl` (line 1302)

Lock acquisition requires a quality roll before the weapon slot is allocated:

**Torpedo lock quality** (GECMDS.C:1358-1370):
```
lockFact = (1.2 - speed / 5000) * ((5.0 - dist) / TORFACT)
```
- Fails if target speed > `WARP_THRESHOLD` (warping target).
- Fails if target is fully cloaked (`cloak >= 10`).
- Fails if target is in the neutral zone.
- Lock succeeds only if `lockFact > 0.7`.

**Missile lock quality** (GECMDS.C:1394-1406):
```
lockFact = (5.0 - dist) / MISFACT
```
- No speed penalty for missiles (they can lock a warping target — matches C line 1232).
- Same cloak and neutral-zone gates apply.
- Lock succeeds only if `lockFact > 0.7`.

With `TORFACT=0.1` and `MISFACT=0.1`, the `(5.0 - dist)` term reaches 0.7 at `dist ≈ 4.93` sectors,
so both weapons reliably fail to lock beyond ~4.9 sectors. At 1 sector the torpedo quality is ≈5.8×
the threshold (reliable); at 3 sectors ≈2.8× (still reliable but starting to degrade). The speed
factor in torpedo lock penalises targets in hyperspace (`speed >= 1000`): `(1.2 - 1000/5000) = 1.0`
at warp-1 but `(1.2 - 5000/5000) = 0.2` at warp-5 — combined with distance, a torpedo lock on a
fast-warping target at 3+ sectors will fail.

Before feature 023, TS allowed locks at any distance up to `scanRange` (~10 sectors for a starter ship)
with no quality degradation.

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

### Mine blast radius — unit handling

**Source**: GEFUNCS.C:1428-1432, GEMAIN.H:195 `MINERANGE 10000`

`MINERANGE` is 10000 RAW units, i.e. exactly one sector. `cdistance` returns SECTORS, so the
comparison must convert first — C does exactly that:

```c
ddist = cdistance(&mptr->coord, &wptr->coord);
ddist *= 10000;                        /* sectors -> raw units */
if (ddist < (double)MINERANGE && ...)
```

The port compared the sector-valued `cdistance` result directly against 10000. Since sector
distances are single digits, `dist > MINERANGE` was never true, the guard never skipped anyone, and
**every ship in the galaxy sat inside every mine's blast**. Found in playtest: one mine destroyed
all 20 Cybertrons in a single tick, every kill credited to the deployer.

This is the general hazard — `cdistance` is in sectors while every range constant
(`MINERANGE`, `scanRange`, `disfact`, `MISLRANGE`) is in raw units. Any comparison between them
needs the `* 10_000` conversion. Covered by `mine-range-units.spec.ts` and a `processMineSweep`
regression in `combat-tick.service.spec.ts`.

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

#### What shields actually do — it differs per weapon

Shields are gated on BOTH `shieldstat === 1` and `shield > 0`: raised shields with no charge behave
exactly like shields down.

**Shield CHARGE never scales hull damage for any weapon.** Charge is the pool that decides how long
shields stay up. What varies the damage is the shield MARK (`shieldtype`) and, for projectiles, the
binary raised/lowered state.

| Weapon | Hull damage with shields UP | Shield charge drain | C reference |
|--------|------------------------------|---------------------|-------------|
| Phaser | **None** — fully deflected (`PDEFLECT`) | `shieldhit(victim, damage)` — scales with the deflected damage | GECMDS.C:982-995 |
| Torpedo / missile | **Halved** — roll is `[0, 0.5) * tdammax` instead of `[0.5, 1)` | `shieldhit(victim, (gernd()%20)+10)` — an independent 10..29 roll | GEFUNCS.C:1552-1576 |
| Mine | **Divided by `(gernd()%5 + shieldtype)`** — the shield Mark is the divisor | `shieldhit(victim, damage + 20)` — uses the REDUCED damage | GEFUNCS.C:1441-1463 |

The phaser is the only weapon that confers outright immunity. For torpedoes, missiles and mines the
`damage +=` assignment sits OUTSIDE the shield if/else in the C source, so hull damage always lands.
Mines are the only weapon where the Mark scales hull damage directly.

`shieldhit` itself (GEFUNCS.C:2430) only drains charge and never applies hull damage — the caller
owns that decision, which is why the three weapons differ. Drain is
`knock = (80 - shieldtype*SHIELD_FACTOR) * (dam/100)`, so a higher Mark loses less charge per hit.
Below `SHMINCHG` the shield is knocked down; at `<= 2` it takes an extra `knock*3` and collapses.

**Port history:** all three paths originally set `hullDamage = 0` whenever shields were up, making a
shielded ship invulnerable to every weapon. Only the phaser case was correct. The torpedo/missile
and mine paths were fixed after playtesting showed a direct mine hit reporting `Hull -0%`. Covered by
`shield-projectile-fidelity.spec.ts`, `mine-shield-fidelity.spec.ts`, and the phaser deflect case in
`phaser.spec.ts`.

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

### Per-class damage scaling / damageFactor (feature 024, C-005)

**Source**: GEFUNCS.C:2661-2672 `ton_fact` — `damfact / (shipclass[shpclass].damfact / 100.0)`

Every projectile hit and mine-sweep damage roll is multiplied by a per-class vulnerability scalar
derived from the **victim's** `ShipClass.damageFactor`:

```
damageScale(damageFactor) = 100 / damageFactor
```

Higher `damageFactor` = tougher (takes less damage). A ship with `damageFactor=200` receives
half damage (`scale=0.5`); one with `damageFactor=50` receives double (`scale=2.0`). Direction
matches the C formula exactly — the divisor is `damfact/100`, so larger values suppress damage.

Seeded example values (from `prisma/seed/ship-classes.ts`):

| Class | damageFactor | damageScale | Interpretation |
|-------|-------------|-------------|----------------|
| Interceptor (1) | 90 | 1.11 | fragile starter — takes 11% extra |
| Heavy Freighter (5) | 200 | 0.50 | durable cargo hull — half damage |
| Cybertron Base Star (23) | 2000 | 0.05 | near-invincible; boss-tier |
| Sarten Attack Drone (24) | 30 | 3.33 | glass cannon; triple damage taken |

`CombatTickService` reads the victim's `damageFactor` via `ShipClassCacheService.getDamageFactor(shpclass)`
and applies `damageScale` inside `rollHullDamage` (projectile hits) and `processMineSweep` (mine detonations).
No change to the attacker's stats.

The previous TS implementation used `clamp(tonnage/10000, 0.1, 1.0)` — a pure tonnage curve with the
wrong direction (heavier = took more damage). That implementation has been removed.

---

### Mine-laying validations + timer (feature 025, C-004)

**Source**: GECMDS.C:1722-1781 `cmd_mine`

The `min [timer]` command enforces six gates (in order):

1. **Class gate** — `ShipClassCacheService.getHasMine(shpclass)` must be true; rejects with `MINE_NOCLASS` otherwise.
2. **Cloak gate** — `ship.cloak === 0`; a cloaked ship cannot lay mines (GECMDS.C:1741-1745 — same gate as phaser/torpedo/missile).
3. **Neutral-zone gate** — `isInNeutralZone(coord)` causes a plain refusal (`MINE_NEUT`) with no damage to the firer. This differs from phaser/torpedo/missile (`zaphim` self-zap); C `cmd_mine` simply returns with a message and does not call `zaphim`.
4. **Inventory gate** — `items[I_MINE] > 0` in cargo; rejects with `MINE_NONE`.
5. **Per-player cap** — `MineRegistry.countByDeployer(ship.channel) < USERMINES (200)`. Prevents carpet-bombing a sector with an entire ammo stack.
6. **Timer arg** — optional integer `1..50`, default 30. Parsed from `args[0]` if present; out-of-range rejected with `MINE_TIMER`.

On success: create mine via `MineRepository.create()` + `MineRegistry.add()`, decrement `items[I_MINE]`, set `cantexit = FIRETICKS` (GECMDS.C:1778).

New constants: `USERMINES=200`, `MINE_TIMER_MIN=1`, `MINE_TIMER_MAX=50`.

---

### Phaser fire drops shields (feature 025, C-008)

**Source**: GECMDS.C:930-933 `firep` (`shielddn(ptr,usrn)` before fire; `shieldup` at end)

When a player fires phasers, `PhaserHandlerService` now sets `ship.shieldstat = 0` immediately on fire (shields down). This mirrors the C source's momentary shield-drop so the firer is vulnerable to incoming hits during the `FIRETICKS` battle-lock window. Shields are not auto-raised after the lock expires — the player must issue `shi up` to restore them.

Firing is not gated on shield state (the C source drops shields as a side effect, not a precondition). The shield drop applies to both normal phaser (`firep`) and hyperphaser (`firehp`) paths.

---

### Hyperphaser separation (feature 025, C-009)

**Source**: GECMDS.C:841-865 `cmd_phas` (hyper branch), GECMDS.C:1020-1094 `firehp`, GEFUNCS.C:2069-2077 `pdamage` warp branch

When the firer's speed is at or above `WARP_THRESHOLD (1000)`, `PhaserHandlerService` routes to the real `firehp` path instead of treating it as a wide-arc normal phaser. Differences from the normal phaser path:

| Property | Normal phaser (`firep`) | Hyperphaser (`firehp`) |
|----------|------------------------|------------------------|
| Energy cost | `phasr` charge (debited on reload tick) | `HPFIRAMT (5000)` flux energy on fire |
| Energy gate | `phasr >= PMINFIRE (60)` | `energy >= HPMINFIR (6000)` (else `HP_NOPOW`) |
| `hypha` flag | not set | set on firer (`hypha = 1`) |
| Beam arc | `focus + PHABIAS` degrees half-angle | fixed `HPBEAMW (5°)` half-angle |
| Target gate | any target in arc | victim must ALSO be at warp (`where === 1`) |
| Damage formula | `PDAMMAX * (1-dist/disfact)^PFIRDST * (1-focus/11)^2 * (phasr/100)` | `HPDAMMAX * (1-dist/40000)^HPFIRDST * phasrtype / (1+victim.maxTons/TONFACT)` |
| Range cap | `inScanRange` (soft via damage falloff) | hard `ddistance < scanRange` |
| Neutral-zone | self-zap (`zaphim`) | self-zap (`zaphim`) |

**`hyperPhaserDamage(dist, phasrtype, maxTons)`** is a new pure function in `combat-math.ts`. The `withinArc` helper refactors the existing `lineOfFire` arc check, keeping `lineOfFire` byte-identical.

AI droid hyper-phaser call sites (`droid-act-class-11.ts`, `droid-act-class-12.ts`) now call `hyperPhaserDamage` instead of the normal `phaserDamage`.

New constants: `HPDAMMAX=200`, `HPFIRDST=1` (tunable defaults; C `.cnf` sentinel is `1`).

---

### Combat-disconnect kill (feature 025, P-001)

**Source**: GEMAIN.C:1397 `warhupa` (`if (warsptr->cantexit > 0) killem(warsptr,usrn)`)

A player who disconnects while combat-locked (`cantexit > 0`) is now killed — the canonical anti-rage-quit mechanic. `GameGateway.handleDisconnect` checks the disconnect reason before applying:

- **Client-side reasons** (`transport close`, `transport error`, `ping timeout`, `client namespace disconnect`) → kill path: `CombatService.processKill(ship, lastFiredAttacker)` + `COMBAT_SHIP_DESTROYED` broadcast (galaxy-wide, identical to a normal death). Kill credit is awarded to `ship.lastfired` attacker if one exists; otherwise `null` attacker (crash-kill).
- **Server-side reasons** (`server namespace disconnect`, `forced close`) → no kill; ship is flushed and unloaded as before. This preserves hot-reload behavior in development without a `NODE_ENV` gate.

Non-combat-locked disconnects (`cantexit === 0`) are unaffected.

The `COMBAT_SHIP_DESTROYED` event reuse means the kill flow is byte-identical to a normal in-combat death: cargo loot, score transfer, lock-slot cleanup, `removeFromGame`, and broadcast all fire via the existing `CombatService.processKill` path.

---

### Subsystem damage + repair (feature 026, C-010 / S-007)

**Source**: GEFUNCS.C:1956 (`randamage`), GECMDS.C:2143-2150 (`cmd_scan` TABROKE/JAMMER4 gates)

After every weapon hit (phaser, hyperphaser, torpedo, missile, mine, Cybertron phaser/torp, droid phaser/torp), `applyRandamageAndEmit(victim, rng, emit)` is called. It:

1. **Checks the precondition** — skipped if `victim.damage <= 20`. Only a ship already meaningfully damaged (>20%) is at risk of subsystem failure.
2. **Rolls `gernd()%6`** to select a subsystem slot (0–5), then maps to the subsystem:

| Roll | Subsystem | State change | Gate produced |
|------|-----------|--------------|---------------|
| 0 | Shields | `shield` set negative, `shieldstat = SHIELDDM (3)` | Shield recharge suspended |
| 1 | Phasers | `phasr` set negative | Can't fire phasers |
| 2 | Fire control | `firecntl = gernd()%20` | Lock command returns `FCBROKE` |
| 3 | Cloak | `cloak` set negative | Can't activate cloak; ramp blocked |
| 4 | Tactical | `tactical` set negative | `cmd_scan` returns `TABROKE` |
| 5 | Helm | `helm` set negative | Heading change returns `HLBROKE` |

3. **Class gate** — `shieldtype === 20` ships (the Zygor class) are immune; the roll returns discriminator `'skipped'` rather than `'none'` for call-site clarity.
4. **Emits** `COMBAT_SUBSYSTEM_DAMAGED` (sector-scoped) with `{ shipId, subsystem, value }`.

#### Subsystem effects

| Subsystem | Blocked action | Message |
|-----------|---------------|---------|
| `tactical != 0` | `cmd_scan` (all subcommands) | `TABROKE` |
| `jammer > 0` (self-jammed) | `cmd_scan` | `JAMMER4` |
| `phasr < 0` | `cmd_pha` (fire) | Insufficient charge (existing gate) |
| `firecntl > 0` | `cmd_lock` | `FCBROKE` |
| `cloak < 0` | `cmd_cloak on` | Damaged-cloak gate (existing) |
| `helm != 0` | `cmd_rot` (heading change) | `HLBROKE` |

#### Subsystem repair over time

`ShipTickService` (1s SHIP_UPDATE tick) calls `repairSubsystems(ship)` after the energy/shield update passes. Repair rules:

- **Tactical, helm, cloak** (when negative): increment +1 per tick toward 0. Recovery: |value| ticks after the hit.
- **Fire control** (`firecntl > 0`): decrement -1 per tick toward 0. Recovery: firecntl ticks after the hit.
- **Phasers** (`phasr < 0`): recovered by the existing phaser reload (`phasrtype * PRELOAD` per physics tick); no special repair path needed.
- **Shields** (damaged: `shield < 0`): increment +1 per tick. When `shield` reaches 0, `shieldstat` is reset to `down (0)` so the normal shield-recharge cycle can resume. Note: `shieldstat = SHIELDDM (3)` suspends recharge for the duration; the repair tick is the only way to exit this state.
- **Cloak** (negative only): repaired by the subsystem tick. A *positive* cloak value is active cloaking and is managed by the cloak tick — not touched here.

Repair runs regardless of `cantexit` (subsystem damage is temporary; it does not extend battle-lock).

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

**Boot-seed** (feature 024): `CybertronTickService.onModuleInit` immediately fills the population
to each class's `tot_to_create` target (24 Cybertrons total across all classes) via the extracted
`spawnOne` helper. This avoids the ~70-minute warm-up delay the one-per-slot runtime cadence would
require to fully populate a cold server. Controlled by env var `CYBERTRON_BOOT_SEED` (default
`true`; set `false` to restore the slow-fill behaviour, e.g. for integration tests that pre-seed
their own ships). The per-slot runtime spawn cadence is unchanged and still fires for ongoing
population maintenance after players kill Cybertrons.

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

**Source**: GECYBS.C:432-453 (`gebemean`), GECYBS.C:514-520 (`cyb_attack`)

- `kills < CYB_BE_NICE (30)`: 1-in-`CYBSLO (3)` chance of being mean (ordinary Cybertrons).
- `kills >= CYB_BE_NICE`: always mean.
- `kills >= CYB_BE_EASY (60)`: torpedo volley uses `rnd%6` (0–5); otherwise `rnd%2` (0–1).
- Cyberquad (`tough=1`) is always mean regardless of player kills.

`gebemean` is evaluated **once per `cyb_attack` call** (feature 024, A-003) and the resulting boolean
is shared with the torpedo-count branch — matches GECYBS.C:514-520 where `gebemean` is called before
both the phaser gate (`gebemean && !cybwhoops → firep`) and the torp-count roll. Prior to this fix,
the phaser gate was missing the `gebemean` check, so Cybertrons fired phasers every tick against
low-kill players instead of the intended `1-in-CYBSLO` frequency.

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

### Midnight teamcode refresh (feature 026, P-016)

**Source**: GEMAIN.C:gemidnighta (team reconciliation, lines 1204-1332)

The midnight transaction can reassign or clear `User.teamcode` for any player (orphan handling, team dissolution). Players connected across midnight would keep a stale `ShipState.teamcode` until they disconnected.

Fix: after the Prisma transaction commits successfully, `MidnightService` emits `MIDNIGHT_COMPLETED` on the shared EventEmitter2 bus. `ShipStateService` listens via `@OnEvent(MIDNIGHT_COMPLETED)` and calls `refreshTeamcodes()`, which re-reads `User.teamcode` for every ship currently in the in-memory map via a single `prisma.user.findMany` batched query. The handler is guarded with `.catch(err => logger.error(...))` to prevent an unhandled rejection from crashing the process if the DB call fails.

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

---

## Range Model & AI Engagement

**Coordinate scales** (three, intentional — do not "unify"):
- **sector-units** (0..30 × 0..15): ship `xcoord`/`ycoord`, return value of `cdistance(a, b)`.
- **raw units** (1 sector = 10,000): `ShipClass.scanRange`, `MINERANGE`, `DESTRUCTRANGE`, persisted `ltorpsDistance` / `lmisslDistance`, projectile speeds `TORPSPED`/`MISLSPED`, nav display.
- **physics-integration units** (1 sector = `COORD_SCALE` = 65,000): denominator inside `dx = speed * sin(heading) / COORD_SCALE`. Never compared against a range.

**Bridge between sector-units and raw units** — single helper:

```ts
// backend/src/game/combat/combat-math.ts
export function inScanRange(a, b, scanRange): boolean {
  return cdistance(a, b) * 10_000 <= scanRange;
}
```

Every weapon range gate, scan visibility check, and AI fire decision goes through `inScanRange()`. Earlier code duplicated `cdistance(a, b) * 10_000 > scanRange` at ≈10 call sites; the helper is now the only place that knows the conversion factor.

**Per-class scanRange calibration** (30×15 galaxy, diagonal ≈ 33.5 sectors). Pinned in `prisma/seed/ship-classes.ts` and `backend/src/game/droid/droid.config.ts`. Pinned by `test/unit/ship-class-scanrange-pin.spec.ts` and `test/game/droid/balance-regression.spec.ts`.

| Class | Sectors | Reason |
|-|-|-|
| Interceptor / Stealth Fighter | 1.5 / 1.8 | starter-tier |
| Heavy Freighter / Freight Barge | 1.5 | cargo, light scanners |
| Destroyer / Star Cruiser | 2.5 / 2.8 | mid-tier combat |
| Frigate / Battle Cruiser | 3.0 / 3.5 | heavy combat |
| Dreadnought / Death Star | 4.0 / 5.0 | endgame |
| Cybertron Scout | 2.5 | engages new players in adjacent sectors |
| Cybertron Battle Cruiser / Base Star | 3.5 / 4.0 | mid/late-game antagonists |
| Sarten Attack Drone / Obliterator | 2.0 / 3.5 | |
| Lydorian Garbage Scow (passive) | 1.0 | trivial; never fights |
| Murdonian Transport / Vakory | 2.5 / 3.0 | reactive fightback when attacked |

**Cybertron AI** (`backend/src/game/cybertron/cybertron-tick.service.ts`): fully implemented per `GECYBS.C`. Per physics tick:
- `runEngagementScan` — for each visible (in-scanRange, not-in-NZ) target: deploy zipper if mines nearby, roll breakoff, fire phasers + torpedoes via `cybAttack`.
- `cybCheckLockon` — `pickPursuitBand` sets `speed2b` + `head2b` to close on the locked target, raising shields when transitioning out of hyperwarp.
- `gebemean` — Cyberquads (`tough=CYB_TOUGH_1`) always mean; otherwise scales aggression with the target's kill count via `CYB_BE_NICE` (30 kills) and `CYB_BE_EASY` (60 kills). New players see softer Cybertrons.
- `cybwhoops` — per-spawn `cybskill` in [3, 17] gives a 1-in-cybskill miss chance on weapon decisions.

**Droid AI**:
- Class 31 (Lydorian Garbage Scow) — passive, never fires.
- Class 32 (Murdonian Transport) — reactive fightback only: requires `cantexit > 0` (battle-locked) and `lastfired >= 0`. Fires phasers in normal space and hyperspace.
- Class 33 (Vakory Survey Drone) — reactive fightback + mine-laying + jammer deployment when damaged.

**Test fixture**: `backend/test/integration/range-and-ai.spec.ts` is the canonical regression net for range + AI behavior. Scan matrix across every class at varied distances; end-to-end Cybertron lock → pursuit → phaser fire; neutral-zone immunity; far-distance closure proof.
