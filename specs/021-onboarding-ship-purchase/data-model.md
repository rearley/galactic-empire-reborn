# Data Model: Faithful Onboarding & Ship Purchase

## No Schema Changes

This feature requires no Prisma schema migrations. All necessary fields already exist:

| Field | Model | Type | Role |
|-------|-------|------|------|
| `User.cash` | User | BigInt (default 0) | Player credits — set to 5,000 on onboarding; decremented on `new ship` purchase |
| `Ship.items` | Ship | BigInt[] (length 14) | Cargo array — items[4] = flux pods; set to 3n on ship creation, 0n for all others |
| `Ship.shpclass` | Ship | Int | Ship class number — always 1 on onboarding; chosen class on `new ship` purchase |
| `ShipClass.maxPrice` | ShipClass | BigInt | Purchase price for `new ship` balance check |
| `ShipClass.category` | ShipClass | String | 'PLAYER' classes only are purchasable |
| `ShipClass.classNumber` | ShipClass | Int | Maps `new ship <N>` argument to a class row |

## New Constants (TypeScript, not DB)

Defined in `backend/src/game/constants/onboarding.ts`:

| Constant | Value | C Source Reference |
|----------|-------|-------------------|
| `START_CASH` | `5000n` (BigInt) | `GEMAIN.C:521 STRTCASH default × 1000` |
| `START_FLUX_PODS` | `3` | `GEFUNCS.C:initshp items[I_FLUX] = 3` |
| `START_CLASS` | `1` | `GEFUNCS.C:initshp "light freighter"` |

## Item Array Layout (existing, for reference)

```
items[0]  = I_FOOD   = 0   food
items[1]  = I_MEN    = 1   colonists
items[2]  = I_TORP   = 2   torpedoes
items[3]  = I_MINE   = 3   mines
items[4]  = I_FLUX   = 4   flux pods  ← 3 on ship creation
items[5]  = I_DECOY  = 5   decoys
items[6]  = I_ION    = 6   ion disruption charges
items[7]  = I_MISSL  = 7   missiles
items[8]  = I_JAMMER = 8   jammers
items[9]  = I_TROOPS = 9   troops
items[10] = I_GOLD   = 10  gold
items[11] = ?        = 11
items[12] = ?        = 12
items[13] = ?        = 13
```
(14 total per NUMITEMS=14 from GEMAIN.H:141)

## Entities Involved

### OnboardingService (modified)

- `finalize(userid, shipname)` — no longer accepts classNumber
- Creates Ship with shpclass=1, items=[0n×4, 3n, 0n×9], energy=ENGYMAX
- Updates User.cash = START_CASH (5000n)

### NewShipHandlerService (new)

- Validates: sector (0,0), orbiting any planet, valid PLAYER class, cash >= maxPrice
- Creates Ship with chosen class, same default items loadout
- Updates User.cash -= maxPrice
- Loads new ship into ShipStateService (inactive — player must board separately)

### GameGateway (modified)

- OnboardingState type narrows to `{ step: 'AWAITING_NAME' }` only
- Connection handler: no-ship path → emit `prompt:ship-name` directly (no class-list step)
