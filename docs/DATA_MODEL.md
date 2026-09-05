# Data Model

Plain-English description of the 12 persisted entities and what they MEAN.
For column-level citations back to the original C source, see
`specs/001-prisma-schema/data-model.md`.

> **`backend/prisma/schema.prisma` is the source of truth for every column** —
> its name, type, nullability, default and index. This file explains intent; it
> does not re-list the schema, and where it names a field it may be behind.
> A 2026-09-05 audit found 13 discrepancies here, every one of them a restated
> schema fact that had gone stale (`MAXSHIPS=10` where canon and the code say 8,
> `username @unique` where the constraint is a raw `LOWER()` index, a `Team.flag`
> column nothing writes, "450 sector rows" for a galaxy that has 40,401).
> If you need the shape, read the schema. @see `docs/README.md` — single source
> of truth.

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

The `scan:render` Socket.io event is a UNICAST to the issuing socket, never a broadcast.

**The shape is declared in `backend/src/game/commands/command.types.ts`** (`ScanRenderEvent`,
`ScanCell`, `SidePanelRow`), mirrored for the client in
`frontend/src/hooks/useScanRender.ts`. It is deliberately NOT restated here: the copy that
used to live in this section had drifted on four field names and one shape — it called the
scan kind `mode`, called the cell list `grid`, described it as a dense 450-cell array when it
is sparse, and gave `SidePanelRow.speed` as a number when it is a preformatted string.

The two things worth saying that the type cannot:

- **`cells` is sparse.** Only occupied positions are sent — ships, planets, mines and the self
  marker — inside the 30×15 scan viewport. The client draws the empty space.
- **`mode` is the SCANHOME option**, `User.options[1]`: `'overwrite'` homes the cursor and
  replaces the last card, `'append'` adds one.

-------|-------|------|
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
