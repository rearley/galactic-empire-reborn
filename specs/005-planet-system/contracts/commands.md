# Contract — Player command handlers

All handlers conform to the existing `Command` interface from
`backend/src/game/commands/command.types.ts`. Each handler is a NestJS
provider that exposes a `command` getter for `CommandsModule` to
register.

## Call boundary (pure math vs. service writes)

All planet/ship state writes — and the synchronous Postgres flush that
goes with them — live in `PlanetStateService` (and `ShipStateService` for
ship-side updates). The pure-math modules `planet-economy.ts` and
`planet-trade.ts` perform NO I/O and NO mutation; they take read-only
snapshots and return typed result objects (e.g. `TradeOutcome`,
`EconomyTickDelta`). Handlers MUST NOT call the pure-math modules
directly to mutate state. The flow is always:

```
handler  →  PlanetStateService.<mutation>(...)
                ├─ acquires per-planet async lock
                ├─ snapshots state
                ├─ calls pure-math (planet-trade.ts | planet-economy.ts)
                ├─ applies the returned delta to the in-memory state
                ├─ writes through to Postgres (prisma.planet.update + ship/user updates)
                └─ releases lock and returns result to handler
            ↓
            handler emits message lines
```

This is what FR-018 (per-mutation flush) and FR-013 (serialized
mutations) expect. Reviewers verifying contract conformance: any
`prisma.*.update(...)` call inside a handler file or inside
`planet-trade.ts` / `planet-economy.ts` is a bug.

## `orbit` / `orb`

| Property | Value |
|---|---|
| Keyword | `orbit` |
| Aliases | `orb` |
| minArgs | 0 |
| `argMissingMessage` | n/a (no args) |
| C source | `GECMDS.C:758 cmd_orbit` |

**Behavior**:
1. If ship is already in orbit (`where >= 10`), emit `ORBITALR` and exit.
2. If ship is in hyperspace or warping, emit `ORBITNO` and exit.
3. Look up planets in current sector via `GalaxyService.getPlanetsBySector(xsect, ysect)`.
4. If zero planets: emit `ORBITNO` (faithful to spec FR/edge case).
5. If multiple planets and no arg: emit a numbered list with `ORBITPK` (pick one).
6. If `arg = number` matches a planet: set `ship.where = 10 + plnum`. Emit `ORBIT01 <name>`.
7. Mutates `ship.speed = 0`, `ship.speed2b = 0` (must be stopped to orbit). Per-mutation `ShipStateService.mutate`.

## `land` / `lan`

| Property | Value |
|---|---|
| Keyword | `land` |
| Aliases | `lan` |
| minArgs | 0 |
| C source | `GECMDS.C:cmd_land` (cf. `GECMDS.C:128`) |

**Behavior**:
1. If ship is not in orbit (`where < 10`), emit `LAND_NOT_ORBIT` and exit.
2. Look up planet via current orbit (`plnum = where - 10`).
3. If planet has no owner (`userid == null`):
   a. If no name provided as arg, emit prompt `LAND_NAME_PROMPT`. State machine note: this handler returns a `prompt` line; the gateway re-dispatches with the supplied input as the next `land <name>` invocation.
   b. With `arg = name`, validate (1-19 printable ASCII, trim), then `PlanetStateService.claim(...)`. On success, set `ship.where = 10 + plnum` (already set by orbit), emit `LAND_CLAIMED <name>`.
4. If owner == ship's userid: emit `LAND_OK <name>` (free pass). Set in-memory ship flag `landed=true` (we use `where` for this; nothing else needed).
5. If owner != ship's userid:
   a. If `password` is empty or "none": refuse with `LAND_REFUSED`.
   b. If `password == "team"` and team-codes match: allow, emit `BUYPAS4`.
   c. If `arg = password` provided as plaintext: compare; allow on match, emit `LAND_OK`; refuse with `LAND_PASSFAIL` on mismatch.

**Validation** (FR-001): name is rejected if it contains non-printable bytes, empty after trim, or exceeds 19 chars. Returns `LAND_INVALID_NAME` line.

## `buy`

| Property | Value |
|---|---|
| Keyword | `buy` |
| Aliases | (none) |
| minArgs | 2 |
| `argMissingMessage` | `BUYFMT` |
| C source | `GECMDS.C:4201 cmd_buy` |

**Args**: `buy <quantity> <itemKeyword>` — itemKeyword resolved via `genearas` against `ITEM_NAMES` and the original short keywords (`men`, `mis`, `tor`, `ion`, `fla`, `foo`, `fig`, `dec`, `tro`, `zip`, `jam`, `min`, `gol`, `spy`).

**Behavior**:
1. Refuse if `where < 10` (not landed) → `BUY1`.
2. Resolve planet via current orbit. If password gating applies (non-owner without correct password) → `BUYPAS1`.
3. Compute remaining cargo capacity: `maxTons - sum(items[i] * ITEM_TONS[i])`.
4. Call `PlanetStateService.buy(...)`. The service caps the requested qty by reserve and capacity.
5. On `ok`: emit `BUY2 <qty> <itemName> <unitPrice> <total>`. Apply ship-side mutations: `ship.items[item] += qty`, `user.cash -= total`. Sync flush user via `prisma.user.update`.
6. On `AT_RESERVE`: `BUY3` (would deplete past reserve). On `CAPACITY_FULL`: `BUY4`. On `SELL_FLAG_OFF`: `BUY5`.

**Neutral-zone exception**: when the planet is in sector (0,0), `PlanetStateService.buy` returns `ok: true` without mutating planet state but ship-side mutations still apply.

## `sell` / `sel`

| Property | Value |
|---|---|
| Keyword | `sell` |
| Aliases | `sel` |
| minArgs | 2 |
| `argMissingMessage` | `SELLFMT` |
| C source | `GECMDS.C:4103 cmd_sell` |

**Args**: `sell <quantity> <itemKeyword>`.

**Behavior**:
1. Refuse if `where < 10` (not landed) → `SELL1`.
2. Refuse if not in neutral zone or not on plnum=1 → `SELL1` (matches original error path).
3. Refuse if ship doesn't carry enough → `SELL3`.
4. Compute `proceeds = baseprice[item] * qty - fee`, `fee = 1 + (baseprice[item]*qty)/1000`. Clamp negative proceeds: `if doll-fee < 0 → fee = doll`.
5. Apply ship-side: `ship.items[item] -= qty`, `user.cash += proceeds`. Sync flush.
6. Emit `SELL2 <fee> <proceeds> <qty> <itemName>`.

**No planet mutation** (galactic-market model).

## `admin` / `adm`

| Property | Value |
|---|---|
| Keyword | `admin` |
| Aliases | `adm` |
| minArgs | 0 |
| C source | `GECMDS.C:3462 cmd_admin` |

**Behavior**:
1. Refuse if not landed (`where < 10`) → `ADM_NOT_LANDED`.
2. Refuse if not owner → `ADM_NOT_OWNER`.
3. With no args: emit menu (`ADM_MENU`) with options 1..7 documented in `quickstart.md`.
4. With sub-arg: dispatch to one `AdminChange` and call `PlanetStateService.applyAdminChange`.
   - `admin rate <itemKeyword> <int>` → `{ type: 'rate', itemIndex, value }`
   - `admin markup <itemKeyword> <int>`
   - `admin sellflag <itemKeyword> <on|off>`
   - `admin reserve <itemKeyword> <int>`
   - `admin tax <int>` — value clamped to [0, 119]
   - `admin beacon <free text up to 75 chars>`
   - `admin password <text up to 10 chars or "none">`

**Validation**: all numeric args parsed via the existing `parseUint32` helper; invalid → `ADM_INVALID`.

## `withdraw` / `with`

| Property | Value |
|---|---|
| Keyword | `withdraw` |
| Aliases | `with` |
| minArgs | 0 |
| C source | `GECMDS.C:cmd_with` (line 113 dispatch) |

**Behavior**:
1. Refuse if not landed → `WTHDR_NOT_LANDED`.
2. Refuse if not owner → `WTHDR_NOT_OWNER`.
3. Call `PlanetStateService.withdrawTax(...)`.
4. On `ok` with amount > 0: `user.cash += amount` (sync flush). Emit `WTHDR_OK <amount>`.
5. On `ok` with amount == 0: emit `WTHDR_NONE`.

## `report cargo` (extension to existing `report` handler)

The existing `ReportHandlerService` (`report.handler.ts:74-81`) currently
emits a placeholder. Replace the body with:

```ts
if (sub === 'cargo') {
  // header lines (REP01 + DASHES) already pushed
  const tonsByIndex: number[] = [];
  let totalTons = 0;
  for (let i = 0; i < NUMITEMS; i++) {
    const qty = Number(ship.items[i] ?? 0n);
    if (qty <= 0) continue;
    const tons = qty * ITEM_TONS[i];
    totalTons += tons;
    tonsByIndex[i] = tons;
    lines.push({
      text: formatMessage(MessageId.REP_CARGO_LINE, qty, ITEM_NAMES[i]),
      category: 'info',
    });
  }
  if (totalTons === 0) {
    lines.push({ text: formatMessage(MessageId.REP_CARGO_NONE), category: 'info' });
  }
  const cap = this.classCache.get(ship.shpclass)?.maxTons ?? 0;
  lines.push({
    text: formatMessage(MessageId.REP_CARGO_TOTAL, totalTons, cap),
    category: 'info',
  });
  return { lines };
}
```

`ReportHandlerService.classCache` is extended in `onModuleInit` to also
read `maxTons` from each ShipClass row.

## Message IDs added

```ts
// backend/src/game/commands/messages.ts — append

ORBIT01,        // "Now in orbit at %s."
ORBITALR,       // "You are already in orbit."
ORBITNO,        // "There is nothing to orbit here."
ORBITPK,        // "Multiple planets — orbit which? %s"
LAND_NOT_ORBIT, // "You must enter orbit first."
LAND_NAME_PROMPT, // "What would you like to name this planet? (Up to 19 characters.)"
LAND_INVALID_NAME, // "That is not a valid planet name."
LAND_CLAIMED,   // "You have claimed %s. It is now your planet."
LAND_OK,        // "You have landed on %s."
LAND_REFUSED,   // "Landing refused — this planet is closed."
LAND_PASSFAIL,  // "Landing refused — incorrect password."

BUYFMT,         // "Use: buy <quantity> <item>"
BUY1,           // "You must be landed on a planet to buy goods."
BUY2,           // "%d %s purchased for %d credits."
BUY3,           // "That would deplete the planet's reserve."
BUY4,           // "Your cargo holds are full."
BUY5,           // "This planet is not selling that item."
BUYPAS1,        // "Trade password required."
BUYPAS3,        // "This planet trades only with its team."
BUYPAS4,        // "Welcome, fellow team-mate."

SELLFMT,        // "Use: sell <quantity> <item>"
SELL1,          // "You can only sell at the galactic market on Zygor-3."
SELL2,          // "Sold %d %s for %d credits (fee %d)."  -- order: fee, proceeds, qty, item
SELL3,          // "You don't have that many %s."

ADM_NOT_LANDED,
ADM_NOT_OWNER,
ADM_MENU,
ADM_INVALID,
ADM_OK,         // "Setting saved."

WTHDR_NOT_LANDED,
WTHDR_NOT_OWNER,
WTHDR_OK,       // "Withdrew %d credits from planet tax pool."
WTHDR_NONE,     // "There are no taxes to withdraw."

REP_CARGO_LINE,  // "%6d %s"
REP_CARGO_TOTAL, // "Total: %d tons in cargo (capacity: %d tons)."
REP_CARGO_NONE,  // "(no items aboard)"
```

## Test contract per handler

Each handler ships with a `test/unit/handlers/<name>.spec.ts` covering:
- happy path,
- every documented refusal branch,
- argument-parsing edge cases,
- one mutation-roundtrip case asserting the `ShipStateService` /
  `PlanetStateService` mock is called with the expected arguments.
