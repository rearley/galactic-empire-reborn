# Quickstart — Planet System

How a developer or reviewer exercises this feature end-to-end after merge.

## Prerequisites

- Feature 004 already merged on the branch under test (galaxy generation produces planets at boot).
- Postgres reachable; backend dev server can boot.
- A test user with at least one ship in their inventory (use the existing `prisma/seed/` flow).

## Walk-through

```bash
# 1) Boot — galaxy is generated on first run; planets are hydrated into PlanetStateService.
cd backend
npm run start:dev

# Expected log lines (in order):
#   [GalaxyService]    galaxy ready — seed=... planets=N wormholes=M ...
#   [PlanetStateService] hydrated N planets from Postgres
#   [PlanetTickService]  PLANET_UPDATE cadence: every Xs (plantock=1800s, planets=N)
#   [TickService]      Started SHIP_UPDATE @1000ms, PHYSICS @6000ms, PLANET_UPDATE @<X*1000>ms
```

```text
# 2) Connect a player session via the existing Socket.io gateway.
#    Issue commands as plain text input (the harness used in command-roundtrip tests).

> orbit
You are now in orbit around Zygor-3.

> land
What would you like to name this planet?  (Up to 19 characters.)
> Aurora
You have claimed Aurora. It is now your planet.

> report cargo
   --- ship cargo ---
   (no items aboard)
   Total: 0 tons (capacity: 1000 tons).

> buy 30 food
30 Food Cases purchased for 60 credits.

> report cargo
   --- ship cargo ---
   30 Food Cases
   Total: 60 tons (capacity: 1000 tons).

> sell 10 food
Sold 10 Food Cases for 19 credits (fee 1 credit).

# 3) Restart the backend; reconnect; verify ledger persisted.

> rep nav
   ... in orbit at Aurora ...
> report cargo
   20 Food Cases
   Total: 40 tons ...

# 4) Wait for the planet-update tick to fire on Aurora.
#    With ~150 planets and PLANTOCK=1800s, the average wait is ~12s.

> scan
   ... Aurora — owner: <you>, beacon: "(none)", men: 1003 ...   # men ticked up

# 5) Owner administration.
> admin
   1) Set production rate
   2) Set markup
   3) Set sell flag
   4) Set reserve
   5) Set tax rate
   6) Set beacon message
   7) Set/change trade password
   q) quit
> 6 Welcome traders!
Beacon set.

# 6) Withdraw accumulated tax.
> with
Withdrew 12 credits from planet tax pool.
```

## What to verify

- After step 2, the `Planet` row for the claimed sector has `userid` set
  to the test user and `name = 'Aurora'` even before any tick fires
  (per-mutation flush).
- After step 3, ship `items[I_FOOD]` reflects 20 (cargo persisted).
- After step 4, planet `itemsQty[I_MEN]` has grown — exact growth equals
  the formula in `data-model.md` ("planet update tick" pseudocode).
- After step 5, planet `beacon` is updated and visible to other ships
  scanning in sector (0,0).
- After step 6, planet `tax` decreases by the withdrawn amount and the
  user's `cash` increases by the same amount.

## Test commands

```bash
cd backend

# Unit (formula + handlers + cadence + balance regression)
npx jest test/unit/planet-economy.spec.ts \
         test/unit/planet-trade.spec.ts \
         test/unit/planet-state.spec.ts \
         test/unit/planet-tick-cadence.spec.ts \
         test/unit/balance-planet.spec.ts \
         test/unit/handlers/orbit.spec.ts \
         test/unit/handlers/land.spec.ts \
         test/unit/handlers/buy.spec.ts \
         test/unit/handlers/sell.spec.ts \
         test/unit/handlers/admin.spec.ts \
         test/unit/handlers/withdraw.spec.ts \
         test/unit/handlers/report-cargo.spec.ts

# Integration (real Postgres; full module wiring)
npx jest test/integration/planet-bootstrap.spec.ts \
         test/integration/planet-tick-roundrobin.spec.ts \
         test/integration/planet-trade-persistence.spec.ts \
         test/integration/planet-trade-concurrent.spec.ts \
         test/integration/planet-claim.spec.ts \
         test/integration/command-roundtrip-planet.spec.ts

# All
npx jest
```

## Troubleshooting

- **"No planet to orbit"** — the ship is not in a sector containing a
  planet. Use `scan lo` to find one, then warp to it. Confirm planet
  density is non-zero with `SELECT COUNT(*) FROM "Planet"` (should be
  100-300 from feature 004).
- **`PLANET_UPDATE` interval is 4 seconds and seems too fast** — that's
  the floor (`PLANTIME_MIN_SECONDS`). Means `PLANTOCK / planet_count`
  rounded below 4. Either intentional (small DB) or planet generation
  produced more planets than expected; verify with `GalaxyService.stats()`.
- **Buy fails with "no surplus"** — planet inventory is at or below
  reserve for that item; `admin` to lower the reserve or wait for the
  next production tick to refill.
- **Sell fails with "not on Zygor-3"** — sells are only allowed at
  neutral-zone plnum=1 (research Decision 4). This is faithful to the
  original.
