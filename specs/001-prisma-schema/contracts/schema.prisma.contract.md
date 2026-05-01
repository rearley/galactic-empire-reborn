# Schema Contract — `backend/prisma/schema.prisma`

This document specifies the **required surface** of the Prisma schema for
feature 001. The Jest test suite asserts every item below. Implementation
details (column ordering, comment style, generator output target) are free
within the bounds of these contracts.

## Datasource & generator

- `datasource db` MUST use `provider = "postgresql"` and read `url` from
  `env("DATABASE_URL")`.
- `generator client` MUST be present with `provider = "prisma-client-js"`.

## Required models

The schema MUST declare these models with exactly these names:

| Model | PK shape | FK relations |
|---|---|---|
| `User` | `userid String @id` | (← Ship.user, Mail.user, MailStat.user) |
| `Ship` | `@@id([userid, shipno])` | `user → User.userid` (FK enforced) |
| `Sector` | `@@id([xsect, ysect])` | none |
| `Planet` | `@@id([xsect, ysect, plnum])` | `userid String?` (no FK), `lastattack`/`spyowner` plain strings (no FK), `teamcode BigInt` (no FK) |
| `Wormhole` | `@@id([xsect, ysect, plnum])` | none |
| `Team` | `teamcode BigInt @id` | none |
| `Mail` | `@@id([userid, class, msgno])` | `user → User.userid` (FK enforced) |
| `MailStat` | `@@id([userid, class, msgno])` | `user → User.userid` (FK enforced) |
| `ShipClass` | `classNumber Int @id` | none |
| `Mine` | `id Int @id @default(autoincrement())` | none |

## Required field set

For each model, the field set listed in `data-model.md` is the contract.
The test suite enumerates every field by name and asserts:
- presence (Prisma DMMF includes the field)
- type (`Int` / `BigInt` / `Float` / `String` / `Boolean` / `DateTime`)
- nullability matches the data-model spec
- list-ness matches (scalar vs. `Int[]` etc.)

## Array length contract

Postgres native arrays do not enforce a fixed cardinality. The schema is
contracted to **accept** the fixed C array lengths (round-trip a length-N
array faithfully); tests verify by writing arrays of the exact length and
reading them back unchanged:

| Model.field | Required length | Type |
|---|---|---|
| `User.options` | 30 | `Int[]` |
| `Ship.items` | 14 | `BigInt[]` |
| `Ship.decout` | 10 | `Int[]` |
| `Ship.freq` | 3 | `Int[]` |
| `Ship.ltorpsChannel` | 3 | `Int[]` |
| `Ship.ltorpsDistance` | 3 | `Int[]` |
| `Ship.lmisslChannel` | 3 | `Int[]` |
| `Ship.lmisslDistance` | 3 | `Int[]` |
| `Ship.lmisslEnergy` | 3 | `Int[]` |
| `Planet.itemsQty` | 14 | `BigInt[]` |
| `Planet.itemsRate` | 14 | `Int[]` |
| `Planet.itemsSell` | 14 | `Int[]` |
| `Planet.itemsReserve` | 14 | `Int[]` |
| `Planet.itemsMarkup2a` | 14 | `Int[]` |
| `Planet.itemsSold2a` | 14 | `BigInt[]` |
| `MailStat.itemqty` | 14 | `BigInt[]` |

## BigInt contract

The following fields MUST be `BigInt` (not `Int`). The test suite writes a
value greater than `2^31 - 1` and asserts it round-trips:

`User.score`, `User.cash`, `User.debt`, `User.plscore`, `User.klscore`,
`User.population`, `User.teamcode`,
`Planet.cash`, `Planet.debt`, `Planet.tax`, `Planet.teamcode`,
`Mail.long1/long2/long3`, `Mail.msgno`,
`MailStat.cash/debt/tax/msgno`,
`Team.teamcode`, `Team.teamscore`,
`ShipClass.maxPrice`,
plus the `BigInt[]` array columns above.

## Uniqueness contract

- Inserting two `Sector` rows with the same `(xsect, ysect)` MUST fail.
- Inserting two `Team` rows with the same `teamcode` MUST fail.
- Inserting two `Planet` rows with the same `(xsect, ysect, plnum)` MUST fail.
- Inserting two `Mail` rows with the same `(userid, class, msgno)` MUST fail.
- Inserting two `Ship` rows with the same `(userid, shipno)` MUST fail.
- Inserting two `ShipClass` rows with the same `classNumber` MUST fail.

## Seed contract — `backend/prisma/seed/ship-classes.ts`

Exports `SHIP_CLASSES: ReadonlyArray<ShipClassSeed>` with exactly 18 entries.
The test suite asserts:

- `SHIP_CLASSES.length === 18`
- The set of `classNumber` values equals
  `{1, 2, 3, 4, 5, 6, 7, 8, 9, 34, 21, 22, 23, 24, 25, 31, 32, 33}`.
- Inserting all 18 via `prisma.shipClass.createMany` succeeds.
- For each class, `prisma.shipClass.findUnique({ where: { classNumber } })`
  returns a record whose every column matches the seed value (Boolean flags
  match Y/N from the wiki, numeric "5k"/"1m" suffixes resolve to integers,
  CPU-only fields `make`/`tough` are present).

Spot checks (per spec acceptance scenarios):
- Class 1 (Interceptor): `maxShields=10, maxPhaser=10, hasTorpedo=true, hasCloak=false, maxAcceleration=5000, maxWarp=10, maxTons=1000, maxPrice=65000n, scanRange=100000, points=750, cybCanAttack=true, cybLowestClassAttacks=1, damageFactor=90`.
- Class 22 (Cybertron Battle Cruiser / "Cyberquad ###"): `category="CPU_COMBATIVE", make=5, tough=1`.
- Class 32 (Murdonian Transport / "Trans-Gal #2###"): `category="CPU_DROID", maxShields=2, maxPhaser=5, make=2, tough=0, damageFactor=100`.
- Class 34 (Sysopian Death Star): `maxWarp=255, maxTons=100_000_000, maxPrice=32_000_000n`.

## Test deliverable contract

The Jest suite under `backend/test/prisma-schema/` MUST cover, at minimum,
one `describe` block per FR group:

- `User` round-trip + BigInt overflow + `options[30]` length (FR-001..003, FR-034, FR-036).
- `Ship` round-trip + `(userid, shipno)` PK + every parallel array length + FK to User (FR-004..010, FR-035).
- `Sector` 450-row insert + duplicate `(xsect, ysect)` rejected (FR-011..013, SC-005).
- `Planet` round-trip with non-default values for every parallel-array column + 75-char `beacon` + composite PK (FR-014..016).
- `Wormhole` round-trip including `destination` coord (FR-017).
- `Team` round-trip + 50-team capacity + duplicate teamcode rejected (FR-018..019).
- `Mail` standard-class round-trip + 5 known classes accepted + composite PK (FR-020, FR-022..023).
- `MailStat` round-trip with `itemqty[14]` (FR-021).
- `ShipClass` 18-row seed + per-class lookup with full column equality (FR-024..027, SC-004).
- `Mine` round-trip including modernization fields (FR-028..030).
- `fidelity-audit.spec.ts` — for each model, enumerate fields via Prisma
  DMMF and assert every C-source field listed in `data-model.md` is present
  (SC-001/SC-002/SC-006). Also asserts the `MAXTORPS=3`, `MAXMISSL=3`,
  `MAXDECOY=10`, `NUMITEMS=14`, `MAXX=30`, `MAXY=15`, `MAXTEAMS=50`,
  `BEACONMSGSZ=75`, `UIDSIZ=30` constants are pinned via named constants in
  the test file (Constitution II — balance regression coverage).
