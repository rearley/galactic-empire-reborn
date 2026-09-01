# Phase 1 Data Model — Planet System

## Schema delta

**None.** The Prisma `Planet` model (`backend/prisma/schema.prisma:196-255`)
already exposes every field this feature needs:

| Spec field | Prisma column | Notes |
|---|---|---|
| owner reference | `userid String?` | nullable, no FK (R-3) |
| planet name | `name String` | matches `char name[20]` (≤19 chars + null) |
| beacon message | `beacon String` | matches `BEACONMSGSZ=75` |
| trade password | `password String` | matches `password[10]` |
| tax rate | `taxrate Int` | matches `int taxrate` |
| accumulated tax pool | `tax BigInt` | matches `unsigned long tax` |
| planet cash | `cash BigInt` | matches `unsigned long cash` |
| planet debt | `debt BigInt` | matches `unsigned long debt` |
| environment factor | `enviorn Int` | drives `multiply()` |
| resource factor | `resource Int` | drives `multiply()` |
| 14-slot item inventory | `itemsQty BigInt[]`, `itemsRate Int[]`, `itemsSell Int[]`, `itemsReserve Int[]`, `itemsMarkup2a Int[]`, `itemsSold2a BigInt[]` | parallel arrays per FR-035; one entry per ITEM in `GEPLANET.C` |

No migration is created or required.

## In-memory state

```ts
// backend/src/game/planet/planet-state.types.ts

export interface PlanetItem {
  qty: bigint;       // ITEM.qty       — `unsigned long`
  rate: number;      // ITEM.rate      — production rate (int)
  sell: boolean;     // ITEM.sell == 'Y'
  reserve: number;   // ITEM.reserve   — purchase floor
  markup2a: number;  // ITEM.markup2a  — non-owner price
  sold2a: bigint;    // ITEM.sold2a    — running counter
}

export interface PlanetState {
  // Composite key (matches @@id([xsect, ysect, plnum]))
  xsect: number;
  ysect: number;
  plnum: number;

  type: number;               // GALPLNT.type
  xcoord: number;             // float
  ycoord: number;

  userid: string | null;      // owner; null = unowned
  name: string;               // ≤19 chars
  enviorn: number;
  resource: number;

  cash: bigint;               // BigInt (FR-036)
  debt: bigint;
  tax: bigint;                // accumulated tax pool
  taxrate: number;
  warnings: number;

  password: string;           // ≤10 chars; "" or "none" = no password
  lastattack: string;
  beacon: string;             // ≤75 chars
  spyowner: string;
  technology: number;
  teamcode: bigint;

  items: PlanetItem[];        // length === NUMITEMS (14)
}

export function planetKey(xsect: number, ysect: number, plnum: number): string {
  return `${xsect}:${ysect}:${plnum}`;
}
```

The mapper (`planet-state.mappers.ts`) provides:

- `prismaPlanetToState(row: Planet): PlanetState` — explodes the six
  parallel arrays into 14 `PlanetItem` records.
- `stateToPrismaUpdate(state: PlanetState): Prisma.PlanetUpdateInput` —
  re-assembles the parallel arrays for write-through. Used by every
  mutation method, not by a tick.

## Constants added

```ts
// backend/src/game/constants/items.ts (NEW)

export const NUMITEMS = 14 as const;            // GEMAIN.H:141

// Item index aliases — GEMAIN.H:143-156
export const I_MEN     = 0 as const;
export const I_MISSL   = 1 as const;
export const I_TORP    = 2 as const;
export const I_ION     = 3 as const;
export const I_FLUX    = 4 as const;
export const I_FOOD    = 5 as const;
export const I_FIGHTER = 6 as const;
export const I_DECOY   = 7 as const;
export const I_TROOPS  = 8 as const;
export const I_ZIPPER  = 9 as const;
export const I_JAMMER  = 10 as const;
export const I_MINE    = 11 as const;
export const I_GOLD    = 12 as const;
export const I_SPY     = 13 as const;

// Canonical defaults from MBMGEMSG.MSG (reference/wiki/items.md table)
export const ITEM_NAMES = Object.freeze([
  'Men','Missiles','Torpedoes','Ion Cannons','Flux Pods','Food Cases',
  'Fighters','Decoys','Troops','Zippers','Jammers','Mines','Gold','Spies',
]) as readonly string[];

export const BASEPRICE = Object.freeze(
  [2, 20, 7, 33, 200, 2, 50, 18, 1, 99, 21, 16, 100, 100],
) as readonly number[];

export const MANHOURS = Object.freeze(
  [3500, 300, 500, 4, 200, 8000, 100, 900, 200, 100, 300, 500, 30, 20],
) as readonly number[];

// `maxpl[]` from the original is computed from item-specific caps; we pin
// the wiki defaults here. Test in balance-planet.spec.ts pins these.
export const MAXPL = Object.freeze(
  [
    1_000_000_000,     // Men
        50_000_000,    // Missiles
        50_000_000,    // Torpedoes
           500_000,    // Ion Cannons
        20_000_000,    // Flux Pods
       100_000_000,    // Food Cases
           500_000,    // Fighters
        50_000_000,    // Decoys
        20_000_000,    // Troops
        50_000_000,    // Zippers
        20_000_000,    // Jammers
        50_000_000,    // Mines
         5_000_000,    // Gold
            10_000,    // Spies
  ],
) as readonly number[];

export const ITEM_TONS = Object.freeze(
  [1, 5, 3, 250, 20, 2, 15, 3, 2, 5, 4, 5, 0.5, 1],   // wiki: items.md
) as readonly number[];
```

```ts
// backend/src/game/constants.ts — append

/** Planet lock-time, in seconds. @see GEMAIN.C:469 (PLANTOCK; canonical default 30 minutes) */
export const PLANTOCK_SECONDS = 1800 as const;

/** Minimum planet-update tick interval; @see GEMAIN.C:658 */
export const PLANTIME_MIN_SECONDS = 4 as const;
```

## State transitions

### Planet ownership

```
Unowned (userid=null, name="")
  ── orbit + land + provide name (FR-001)
   →  Owned by P (userid="P", name=<supplied>)
       ── (no transfer command — FR-003)
       ── destruction path delivered in feature 006
```

### Planet trade ledger

```
Buy outside neutral zone:
  planet.items[i].qty       -= amount
  planet.cash               += amount × price
  ship.items[i]              += amount
  user.cash                  -= amount × price
  (price = baseprice if buyer == owner, else markup2a — GECMDS.C:cmd_buy)

Buy inside neutral zone:
  planet.items[i].qty        UNCHANGED
  planet.cash                UNCHANGED
  ship.items[i]              += amount
  user.cash                  -= amount × price

Sell at neutral-zone plnum=1:
  ship.items[i]              -= amount
  user.cash                  += baseprice × amount − fee
                              where fee = 1 + (baseprice × amount)/1000
                              clamped: if (doll-fee) < 0 → fee = doll
  planet.items[i].qty        UNCHANGED
  planet.cash                UNCHANGED
```

### Planet update (production) tick

```
For each planet processed by PLANET_UPDATE:
  // troop/men starvation
  if items[I_TROOPS].qty/100 > items[I_FOOD].qty:
      items[I_TROOPS].qty -= items[I_TROOPS].qty / 8
  food_eaten = min(items[I_FOOD].qty, items[I_TROOPS].qty/100)
  items[I_FOOD].qty -= food_eaten
  if items[I_MEN].qty/100 > items[I_FOOD].qty:
      items[I_MEN].qty -= items[I_MEN].qty / 8

  // gold-to-cash
  cash += items[I_GOLD].qty * baseprice[I_GOLD]
  items[I_GOLD].qty = 0

  // production
  taxfact = 1 - taxrate/120
  for i in 0..NUMITEMS:
      qty = (men * (rate/100) * (manhours[i]/10000/6)) / 7
      fact = (enviorn + resource + 2) * 0.25
      fact *= taxfact
      tfact = 0.95 - ((6 - resource - enviorn) * 10)/100
      cash *= tfact
      if cash > 0: fact *= 1.5
      items[i].qty = min(items[i].qty + qty*fact, maxpl[i] * fact)

  // population tax
  tax += (taxrate/1200) * items[I_MEN].qty

  // (revolt and check_spy deferred to feature 006 — research Decision 6)
  // (production-report mail deferred to feature 009 — research Decision 5)
```

## Validation rules

| Rule | Enforced where |
|---|---|
| Planet name 1-19 printable ASCII, trimmed | `land.handler.ts` before `applyMutation` |
| Trade password ≤10 chars | `admin.handler.ts` |
| Beacon message ≤75 chars | `admin.handler.ts` |
| Tax rate ∈ [0, 100] (integer) | `admin.handler.ts` — C's ceiling, `if (amt <= 100)` GEMAIN.C:3224. **Superseded 2026-09-01**: was [0,119], derived from the revolt formula's /120 divisor rather than from C's setter. |
| Per-item rate, markup, reserve are non-negative integers | `admin.handler.ts` |
| Buy amount ≤ available cargo capacity | `buy.handler.ts` (uses `ITEM_TONS` × qty vs. ship `maxTons`) |
| Buy amount ≤ planet qty − reserve | `buy.handler.ts` |
| Sell amount ≤ ship's per-item qty | `sell.handler.ts` |
| Buy/sell only when ship.where >= 10 (landed) | each handler — `BUY1`/`SELL1` |
| Admin/withdraw only when buyer == owner | `admin.handler.ts`, `withdraw.handler.ts` |

## Live entities at runtime

```
GalaxyService               (existing)
  ├─ in-memory planet read model (used for sector → planet lookup, name lookup, scan)
  └─ does NOT mutate planets after generation

PlanetStateService          (NEW)
  ├─ in-memory Map<planetKey, PlanetState>
  ├─ hydrated in onModuleInit from prisma.planet.findMany
  ├─ all mutations go through runSerialized(planetKey, ...)
  └─ each mutation writes through to Postgres synchronously

PlanetTickService           (NEW)
  ├─ subscribes to TickService.PLANET_UPDATE
  ├─ holds round-robin cursor (index into hydrated planet keys)
  └─ on each firing, applies `multiply()` to one planet via PlanetStateService

ShipStateService            (existing)
  └─ buy/sell/withdraw mutate ship.items / ship.user.cash through this service
```
