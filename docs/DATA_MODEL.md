# Data Model

Plain-English description of the 12 persisted entities and their relationships.
For column-level citations back to the original C source, see
`specs/001-prisma-schema/data-model.md`.

## User

A player account identified by a string `userid` (max 30 chars, from MajorBBS
`UIDSIZ=30`). Holds the lifetime score and economic state: accumulated score,
kills, planet count, ship count, cash on hand, debt, team membership, and a
30-element byte array of player option flags. The `teamcode` field links to a
Team but the foreign key is intentionally relaxed — the original game tolerates
a teamcode referencing a deleted team. Source: `WARUSR` in `GEMAIN.H`.

**Feature 011 additions**:
- `username String` — human-readable display name used for login. NOT `@unique` at the
  Prisma level: the model declares a plain `@@index([username])`, and case-insensitive
  uniqueness comes from a raw `LOWER(username)` expression index created in a migration.
  Backfilled from
  `userid` for pre-existing rows. A `LOWER(username)` expression index enforces case-insensitive
  uniqueness across all login attempts. Cannot be NULL after migration.
- `passwordHash String?` — bcrypt cost-12 hash of the password. Nullable at the DB level;
  rows with NULL hash cannot authenticate (pre-existing AI/seed accounts).
- `createdAt DateTime @default(now())` — timestamp of account creation.

**Unique indexes**:
- `User_username_lower_idx` — `UNIQUE ON "User" (LOWER("username"))` (raw SQL; Prisma cannot
  express expression indexes natively). Enforces case-insensitive username uniqueness.
- `Ship_shipname_lower_idx` — `UNIQUE ON "Ship" (LOWER("shipname"))` (same pattern). Enforces
  case-insensitive ship name uniqueness for `cmd_rename`.

**Feature 030 additions** (`030-multi-ship`):
- `noships Int @default(0)` — current count of the user's ship rows. Incremented on `new ship` purchase and onboarding grant; decremented on ship death. Never goes below 0 (underflow guard). @see GEMAIN.H:296 WARUSR.noships; GEFUNCS.C:266 initshp; GEFUNCS.C:1272 killem.
- `topshipno Int @default(0)` — highest `shipno` ever allocated to this user. Monotonically increasing; **never decremented** even when ships are deleted, so ship numbers are never reused. A new hull is always allocated `shipno = topshipno + 1`. @see GEMAIN.H:297 WARUSR.topshipno; GEFUNCS.C:267.

Both were previously dead columns (always 0). They are now live after branch 030 and kept in sync atomically with ship creation/death transactions.

**Relations**: owns many Ships (one-to-many, enforced by FK; previously one-to-one), has many Mail messages and MailStat messages.

## Ship

A warship owned by a User, identified by the composite primary key `(userid, shipno)`.
**As of branch 030:** a single User may own up to `MAXSHIPS` Ship rows simultaneously — a
sysop option whose canon default is **8** (`MBMGEMSG.MSG:92`), env-tunable 1–50 (the old `@@unique([userid])` constraint was dropped). Each ship is individually identified by its `shipno` — allocated monotonically (`topshipno+1`) and never reused after deletion.

Carries the complete real-time flight state: floating-point position and
heading, speed, energy, phaser charge, shield state, damage percentage, class,
a 14-element cargo inventory (`BigInt[]`), three locked-torpedo slots
(parallel `Int[]` arrays for channel and distance), three locked-missile slots
(channel, distance, energy), ten active-decoy slots, and all AI/Cybertron
control fields. Source: `WARSHP` in `GEMAIN.H`.

**Feature 008 addition**:
- `isEphemeral?: boolean` — in-memory only flag set to `true` on Droid ships (`@Droid-*` userid).
  `ShipStateService.flush()` skips entries where `isEphemeral === true` — zero Prisma calls for
  Droids. `removeFromGame` also skips the Prisma delete. Not persisted to the DB schema.

**Feature 013 additions**:
- `autoShield Boolean @default(false)` — player-toggled flag; when true the ship management tick
  should auto-raise shields (wiring to repair tick deferred to feature 019).
- `autoRepair Boolean @default(false)` — player-toggled flag; when true the ship management tick
  should queue repair automatically (wiring deferred to feature 019).
  Both columns added via migration `20260506235607_ship_auto_flags`.

`navTargetX` and `navTargetY` were added by feature 016 for a port-original
autopilot and dropped on 2026-09-05 by migration
`20260905134143_drop_autopilot_nav_target`. Nothing wrote them by then: canon's
`nav` is a bearing report, not a course-holder. @see GECMDS.C:5109

**Relations**: belongs to one User (FK enforced).

---

## User.options index map (feature 015)

`User.options Int[]` is a 30-element array mapping directly to `GEMAIN.H WARUSR.options[30]`.
The first two indices are assigned display-option flags by feature 015:

| Index | Flag | Values | Source |
|-------|------|--------|--------|
| 0 | SCANNAMES | 0 = off (default), 1 = on | GEMAIN.H options[] SCANNAMES |
| 1 | SCANHOME | 0 = off (default), 1 = on | GEMAIN.H options[] SCANHOME |

Indices 2–29 are unassigned and default to 0. The array is initialized to all-zeros for new
users (no migration required — the existing column already has a default in the Prisma schema).

`SetHandlerService` updates these values via `prisma.user.update({ where: { userid }, data: { options: updatedArray } })` and also updates the in-memory `ShipState` so subsequent scan commands read the correct setting without a DB round-trip.

---

## Scantab (in-memory, feature 015)

`ScanHandlerService` owns a per-SHIP scantab, keyed `"userid#shipno"` — not per-socket, and
not a letter map: the value is an ordered `Scantab` array of up to 26 entries.
It is not persisted to the database — it exists only for the lifetime of a socket connection.

```
scantab key:   one of 'A'..'Z' (up to 26 entries)
scantab entry shipKey: `"userid#shipno"` — deliberately a DIFFERENT separator from the
ShipStateService map key, which uses `:` (see helpers/scantab.ts:36-41)
```

The scantab is rebuilt on every `scan lo`, `scan ra`, `scan se`, or `scan lo full` invocation:
1. Collect all in-range ships except self.
2. Sort by `cdistance` ascending (nearest first).
3. Assign letters A, B, C, … in order (up to Z = 26th).

**Cleared** on: socket disconnect, ship death (own ship destroyed), dock event (where >= 10).
**Lazy init**: no Map entry exists until the first scan command is issued on a socket.

---

## ScanRenderEvent wire payload (feature 015)

The `scan:render` Socket.io event carries a `ScanRenderEvent` object emitted as a unicast
to the issuing socket only (never broadcast):

```ts
interface ScanRenderEvent {
  kind:       'ra' | 'se' | 'lo' | 'lo-full';
  mode:       'overwrite' | 'append';  // 'overwrite' when User.options[1] (SCANHOME) is on
  cells:      ScanCell[];              // SPARSE — only occupied cells, not 450
  header:     string;                  // the scan's own heading line
  sidePanel?: SidePanelRow[];          // present only when kind === 'lo-full'
}

interface ScanCell {
  x:       number;   // 0-29
  y:       number;   // 0-14
  type:    'ship' | 'planet' | 'mine' | 'self' | 'wormhole';
  char:    string;   // display character: '*', 'A'-'Z', 'O', 'W', '1'-'9', '.'
  colour?: 'self' | 'human' | 'ai' | 'planet';   // optional; there is no 'empty'
}

interface SidePanelRow {
  letter:   string;   // 'A'-'Z'
  distance: number;   // parsecs (cdistance × 10000)
  bearing:  number;   // degrees 0-359
  heading:  number;   // target ship heading degrees
  speedDisplay: string;   // 'Warp 4.5' | 'Impulse' | 'Stopped'
  name?:    string;   // only present when SCANNAMES = on (User.options[0] === 1)
}
```

The frontend `useScanRender` hook subscribes to `scan:render` and maintains a `ScanCard[]`.
When `mode === 'overwrite'`, the hook replaces the last card (SCANHOME mode). Otherwise
it appends a new card (capped at a display limit). `ScanPanel` renders the most-recent card.

## Sector

One cell of the universe square, which runs `-UNIVMAX..+UNIVMAX` on both axes
(`MAXX`/`MAXY` are the scan VIEWPORT, not the galaxy), identified by
`(xsect, ysect)`. Records the sector type and the count of planetary objects
inside it. Source: `GALSECT` in `GEMAIN.H`. The galaxy generator seeds 450
rows on first boot.

## Planet

A colonizable body inside a sector, identified by `(xsect, ysect, plnum)`.
Multiple planets can share the same sector coordinates with different `plnum`
values. Holds environment, resources, economy (cash/debt/tax as `BigInt`),
taxes, ownership (`userid`, no FK), a 75-char beacon message, and a 14-slot
economy inventory — each slot has quantity, rate, sell-flag, reserve, and
two running-total fields, all stored as parallel native arrays. Source:
`GALPLNT` + `ITEM` in `GEMAIN.H`.

## Wormhole

A teleport link inside a sector, identified by `(xsect, ysect, plnum)`. Stores
both the origin coordinate and a destination coordinate, a visibility flag, and
a name. Destinations are generated inside the universe square (the schema imposes no bound;
validation is a runtime concern). Source: `GALWORM` in `GEMAIN.H`.

## Team

An alliance faction, identified by a `BigInt teamcode`. Holds a team name,
member count, cumulative score, password, secret pass-phrase, and a flag.
Capacity is at least `MAXTEAMS=50`. Source: `TEAM` in `GEMAIN.H`. Players
reference teams via `User.teamcode` (no enforced FK — original tolerance).

**Feature 018 additions**:
- `Team_teamname_lower_key` — `CREATE UNIQUE INDEX ON "Team" (LOWER("teamname")) WHERE "teamcount" >= 0`
  (migration `20260508003817_team_name_unique_lower`). Enforces case-insensitive team name uniqueness
  at the DB level. The `WHERE teamcount >= 0` predicate is always true (column default 0, never negative)
  and is present to allow future refinement (e.g. exclude soft-deleted teams via `flag != 1`).
- `Team.secret` — remains in schema but is unused by feature 018; stored as `""` on creation.
- `Team.flag` — remains in schema (canon's TEAM.flag) but NOTHING writes it. Disbandment is
  recorded in the dedicated `removed Boolean` column by the midnight job.
- `Team.teamcount` — maintained by midnight job; **NOT** read by `tea list` (FR-023 requires live
  `GROUP BY teamcode` on `User` table instead of this denormalised counter).

## Mail

A standard message in a player's inbox, identified by `(userid, class, msgno)`.
The `class` discriminates the mail type (values 1–5 per `GEMAIN.H`: distress,
maxout, production-report, gamestats, plstats). Carries string fields, three
integer and three `BigInt` payload fields. Source: `MAIL` in `GEMAIN.H`.

**Relations**: belongs to one User (FK enforced).

## MailStat

A structured production-report variant of mail, identified by the same
`(userid, class, msgno)` composite key as Mail. The two are separate models
because their field shapes differ significantly — MailStat has a 14-element
`BigInt[]` item-quantity array (`itemqty`) plus cash/debt/tax fields, and no
free-text `string1`/`name2`/`long1-3` fields that Mail has. Source: `MAILSTAT`
in `GEMAIN.H`.

**Relations**: belongs to one User (FK enforced).

## ShipClass

A static stat sheet for one ship class number. 18 rows seeded at startup: 10
player classes (Interceptor through Sysopian Death Star) and 8 CPU classes
(5 Cybertron/Sarten combatives, 3 droids). Every column maps to a stat in the
wiki tables (`reference/wiki/player-ships.md`, `reference/wiki/cpu-ships.md`).
Used by combat math, purchase logic, AI, and the scan display. The field
`WARSHP.shpclass` resolves to exactly one ShipClass row.

## GalaxyMeta

A singleton row (id always 1, enforced by a `CHECK (id=1)` DB constraint) that signals
a complete, valid galaxy generation. Its presence is the idempotency probe checked by
`GalaxyService.onModuleInit()` — if a `GalaxyMeta` row exists the generator skips
regeneration entirely. The fields `seed`, `plodds`, `wormodds`, and `maxplanets` capture
the exact generation parameters used, providing a complete audit trail of how the current
galaxy was produced.

The `Sector`, `Planet`, and `Wormhole` tables are populated by `GalaxyService.onModuleInit()`
on first boot within a single Postgres transaction that also writes the `GalaxyMeta` row.
They are no longer empty placeholder tables — after first boot all (2·UNIVMAX+1)² sector
rows exist (40,401 at the deployed UNIVMAX=100),
and every planet and wormhole that was generated is present and queryable.

## Planet (in-memory PlanetState — feature 005)

The `Planet` Prisma row is loaded once on boot by `PlanetStateService.onModuleInit()` and held in a `Map<planetKey, PlanetState>`. `planetKey(xsect, ysect, plnum)` returns `"xsect,ysect,plnum"`.

The parallel `items*` columns in Postgres (`itemsQty BigInt[]`, `itemsRate Int[]`, `itemsSell Int[]`, `itemsReserve BigInt[]`, `itemsMarkup2a Int[]`, `itemsSold2a BigInt[]`) are projected into a `PlanetItem[14]` array inside `PlanetState`. Each element:

```ts
interface PlanetItem {
  qty:      bigint;   // items[i].qty    — current stock
  rate:     number;   // items[i].rate   — per-tick production rate (set by admin)
  sell:     boolean;  // items[i].sell   — whether pilots can buy this item (0/1 in DB)
  reserve:  bigint;   // items[i].reserve — qty below which selling is refused
  markup2a: number;   // items[i].markup2a — non-owner price (set by admin)
  sold2a:   bigint;   // items[i].sold2a — running total sold (BigInt accumulator)
}
```

`prismaPlanetToState(row)` explodes the six parallel arrays into `PlanetItem[14]`. `stateToPrismaUpdate(state)` reassembles them back into `Prisma.PlanetUpdateInput`.

No migration was required for this feature — the `Planet` model already had all columns from feature 001.

### Item constants (`backend/src/game/constants/items.ts`)

`NUMITEMS = 14`. Item indices:

| Const | Value | Name |
|-------|-------|------|
| `I_MEN` | 0 | Men |
| `I_FOOD` | 5 | Food Cases |
| `I_GOLD` | 12 | Gold |
| `I_SPY` | 13 | Spy Robots |

Five frozen arrays (length 14, hardcoded from wiki/GEMAIN.H): `ITEM_NAMES`, `BASEPRICE`, `MANHOURS`, `MAXPL`, `ITEM_TONS`. Pinned by `balance-planet.spec.ts` snapshot tests.

---

## Mine

A mine that has been deployed into the galaxy, distinct from mines carried as
cargo in `Ship.items`. Holds the original `MINE` struct fields (channel, timer,
position) plus two modernization additions (`deployedBy` userid, `deployedAt`
timestamp) that let the server restore mine ownership across restarts. Uses an
auto-increment integer PK because the original game had no natural mine key.
Source: `MINE` in `GEMAIN.H`.

---

## MidnightRun

A ledger row written at the end of each successful midnight maintenance pass.
Primary key is `runDate DateTime @id @db.Date` — one row per calendar day.
Stores the completion timestamp, wall-clock duration in milliseconds, and the
six `PhaseCounters` (usersUpdated, planetsProcessed, mailReportsCreated,
mailDeleted, teamsReconciled, teamsRemoved). Used by `MidnightService` as
the idempotency probe: if today's row already exists, the pass is skipped.
The probe is checked both on `onApplicationBootstrap` (self-heal) and on
every admin-triggered run. `recordRun` uses upsert so same-day re-runs update
the counters rather than failing on a unique constraint. There is no FK to any
other table — this is a standalone audit row.
