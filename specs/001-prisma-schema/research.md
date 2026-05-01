# Phase 0 Research — Prisma Database Schema

All NEEDS CLARIFICATION resolved here. Decisions inform `data-model.md`,
`contracts/schema.prisma.contract.md`, and the eventual `schema.prisma`.

## R-1. C type → Prisma scalar mapping

**Decision**:

| C type / origin | Prisma scalar | Postgres type | Why |
|---|---|---|---|
| `char[N]` (fixed strings: `userid`, `shipname`, `name`, `password`, `secret`, `dtime`, `topic`, `string1`, `name1`, `name2`, `beacon`, `lastattack`, `spyowner`, `teamname`) | `String` | `text` | Postgres `text` has no perf penalty vs `varchar(N)`; the C length is a layout artifact, not a domain rule. Length is preserved as a comment + asserted in tests. |
| `int` | `Int` | `integer` | Original `int` is 16-bit on the DOS target but values are bounded (sector coords, ship numbers, taxrate, etc.). 32-bit signed is strictly wider and safe. |
| `unsigned` | `Int` | `integer` | 32-bit signed range covers the 16-bit unsigned source values (e.g. `decout[]`, `freq[]`, `timer`). |
| `unsigned long` (bounded counters: `rate`, `reserve`, `markup2a`, `noships`, `rospos`, `teamcount`, `teamcode`) | `Int` | `integer` | 32-bit signed clipping does not occur within original game ranges. Per FR-037. |
| `unsigned long` (unbounded accumulators: `User.cash/debt/score/plscore/klscore/population`, `Planet.cash/debt/tax`, per-item `qty`, `sold2a`, `MAILSTAT.itemqty[]`) | `BigInt` | `bigint` | Per FR-036 + FR-037 — 24/7 play with no DOS-era 4-byte ceiling. |
| `double` (`COORD.xcoord`, `COORD.ycoord`, `WARSHP.heading`, `head2b`, `speed`, `speed2b`, `damage`, `energy`, `phasr`) | `Float` | `double precision` | Per FR-033. Prisma `Float` maps to `double precision` in Postgres. |
| `byte` / `unsigned char` (`phasrtype`, `shieldtype`, `shieldstat`, `status`, `cybmine`, `cybskill`, `cybupdate`, `tick`, `emulate`, `minesnear`, `holdcourse`, `warncntr`, `destruct`, `MINE.channel`, `TORPEDO.channel`, `MISSILE.channel`, `ITEM.sell`) | `Int` (small) | `integer` | Postgres has no native `tinyint`. `smallint` would save 2 bytes per row but Prisma only exposes `Int` for `integer`. Storage is negligible at this scale. Meaning is enforced in code, not via Postgres `enum` (per spec Assumptions). |
| C `long` (`MAIL.long1/2/3`) | `BigInt` | `bigint` | Original `long` is 32-bit signed; we widen to 64-bit signed defensively because these are open-ended payload fields (`MAILSTAT` already uses `BigInt` for cash/debt; mixing `Int` and `BigInt` for the same `long1` semantic across mail variants would be inconsistent). |

**Rationale**: Map by *role* (bounded vs. accumulating), not by literal C width.
Preserves the original numeric range while avoiding overflow during multi-month
24/7 play.

**Alternatives considered**:
- Postgres native `enum` for `MAIL.class`, `phasrtype`, `shieldtype`, etc. **Rejected** — the original game expanded sentinel values over time; a Postgres enum requires a migration to add a value. Plain `Int` keeps schema changes painless and matches the spec's Assumptions section.
- `varchar(N)` for fixed-width strings to mirror C lengths. **Rejected** — Postgres treats `text` and `varchar` identically at the storage layer; the length cap was a Btrieve block-size constraint, not a domain rule. Length is documented in code comments and asserted in tests.

## R-2. Fixed-size C arrays → Postgres native array columns

**Decision**: Use Prisma scalar lists (`Int[]`, `BigInt[]`, `String[]`) backed
by Postgres native array columns. Per FR-034: no JSON columns, no child tables.

For `WARSHP.ltorps[MAXTORPS]` (each slot has `channel`, `distance`) and
`WARSHP.lmissl[MAXMISSL]` (each slot has `channel`, `distance`, `energy`) and
`GALPLNT.items[NUMITEMS]` (each slot has `qty`, `rate`, `sell`, `reserve`,
`markup2a`, `sold2a`): use **parallel native arrays**, one column per sub-field
(per FR-035). Slot N is reconstructed by reading index N of every parallel
array. Tests assert all parallel arrays for a given record share the same
length (`MAXTORPS`, `MAXMISSL`, `NUMITEMS`).

Concrete column shapes:

| Source array | Prisma columns |
|---|---|
| `WARSHP.items[NUMITEMS]` (cargo qty) | `items BigInt[]` (length 14) |
| `WARSHP.decout[MAXDECOY]` | `decout Int[]` (length 10) |
| `WARSHP.freq[3]` | `freq Int[]` (length 3) |
| `WARSHP.ltorps[MAXTORPS]` | `ltorpsChannel Int[]`, `ltorpsDistance Int[]` (each length 3) |
| `WARSHP.lmissl[MAXMISSL]` | `lmisslChannel Int[]`, `lmisslDistance Int[]`, `lmisslEnergy Int[]` (each length 3) |
| `WARUSR.options[30]` | `options Int[]` (length 30) |
| `GALPLNT.items[NUMITEMS]` | `itemsQty BigInt[]`, `itemsRate Int[]`, `itemsSell Int[]`, `itemsReserve Int[]`, `itemsMarkup2a Int[]`, `itemsSold2a BigInt[]` (each length 14) |
| `MAILSTAT.itemqty[NUMITEMS]` | `itemqty BigInt[]` (length 14) |

**Rationale**: Native arrays preserve the original "fixed slot N" semantics
without the join overhead and ordering ambiguity of a child table. `BigInt[]`
is used where individual cells can accumulate (qty, sold2a, mail itemqty);
`Int[]` for bounded fields. Postgres native arrays do not enforce a fixed
length — that constraint is asserted in tests, satisfying spec Assumption that
length fidelity is verified at runtime.

**Alternatives considered**:
- JSON column holding `{ slots: [...] }`. **Rejected** by FR-034.
- Child table `LockedTorpedo { shipId, slotIndex, channel, distance }`. **Rejected** by FR-034 + FR-035; also obscures the original "slot index is meaningful" semantic.
- Prisma's composite types (`type Torpedo { channel Int; distance Int }` + `ltorps Torpedo[]`). **Rejected** — composite types require Postgres composite types via raw SQL and are awkward to query; parallel scalar arrays are simpler and fully Prisma-native.

## R-3. Foreign-key strictness

**Decision**: Use Prisma relations (with FK constraints) for the relationships
where the original game treats a missing parent as a hard error, and
intentionally **omit** Prisma relations (store the column as a plain scalar)
where the original tolerates dangling references. Specifically:

| Relation | FK enforced? | Why |
|---|---|---|
| `Ship.userid → User.userid` | YES | A ship without an owning player is a corrupt invariant; original code always traverses ship→user. |
| `Planet.userid → User.userid` (owner) | NO (plain `String`, nullable) | Original allows unowned planets and ownership flips when a planet is conquered without a strict referential check. Storing as `String?`. |
| `Planet.lastattack → User.userid` | NO (plain `String`) | Spec edge case: `lastattack` may reference a deleted user. |
| `Planet.spyowner → User.userid` | NO (plain `String`) | Same rationale. |
| `Mail.userid → User.userid` | YES | Mail to a nonexistent user is meaningless. |
| `User.teamcode → Team.teamcode` | NO (plain `BigInt`, nullable) | Spec Edge Case explicitly preserves original tolerance for dangling teamcode. |
| `Mine.deployedBy → User.userid` | NO (plain `String`) | The deployer may have been deleted; we keep the attribution string for forensics. |
| `Planet.teamcode → Team.teamcode` | NO (plain `BigInt`) | Same rationale as `User.teamcode`. |

**Rationale**: Faithful to original game tolerance for dangling references in
the cases the spec calls out explicitly (Edge Cases section). Where the
original always assumes a parent exists, we add the FK to catch corruption
early.

**Alternatives considered**:
- All FKs strict. **Rejected** — would prevent reproducing original behavior on `teamcode` and `lastattack`.
- All FKs relaxed. **Rejected** — loses an easy correctness check on `Ship.userid` and `Mail.userid` for free.

## R-4. Composite primary keys

**Decision**: Use Prisma `@@id([...])` for the natural composite keys defined
by the original C `*KEY` structs.

| Entity | Composite key | Source |
|---|---|---|
| `Ship` | `(userid, shipno)` | `SHPKEY` |
| `Planet` | `(xsect, ysect, plnum)` | `PKEY` |
| `Wormhole` | `(xsect, ysect, plnum)` | analogous to `PKEY` (FR-017 assigns plnum to wormholes) |
| `Sector` | `(xsect, ysect)` | implicit (`plnum` is always 0 for sectors per FR-011) |
| `Mail` | `(userid, class, msgno)` | `MAILKEY` |

For these we do NOT add a synthetic `id Int @id @default(autoincrement())` —
the natural key is the source of truth and using a synthetic ID would create a
needless column and break the "every column traces to GEMAIN.H" rule (FR-031).

For `User`, `Team`, `ShipClass`, `Mine`: use a single-column primary key.
- `User.userid` is `@id` (string PK, matches `WARUSR`).
- `Team.teamcode` is `@id` (BigInt PK, matches `TEAM.teamcode`; FR-018 makes it unique anyway).
- `ShipClass.classNumber` is `@id` (Int PK, matches the wiki "#" column).
- `Mine.id` is the only synthetic surrogate in the schema — `Int @id @default(autoincrement())` — because the original `MINE` struct has no natural composite key (channel + coord can collide between deployments).

**Rationale**: Honor the original `KEY` structs. One synthetic key for `Mine`
is necessary because the original game indexed mines by linear scan, not by a
key.

## R-5. Ship class seed format

**Decision**: TypeScript file `backend/prisma/seed/ship-classes.ts` exporting
`export const SHIP_CLASSES: ShipClassSeed[]` with the 18 records (10 player +
5 combative CPU + 3 droid). The file uses no Prisma client — it exports plain
data — so the seed array is consumable both by a future `prisma db seed` script
and by the Jest test suite directly.

Number normalization for the test fixtures:
- "5k" / "10k" / "100k" / "1m" / "32m" / "1.25m" suffixes from the wiki are
  normalized to integers (`5000`, `10_000`, `100_000`, `1_000_000`, `32_000_000`,
  `1_250_000`).
- `Y`/`N` flags become booleans.
- Class names with `###` template (e.g. `"Cybertron ###"`, `"Cyber Base-###"`)
  are stored verbatim in `shipNameTemplate`; `###` is the runtime suffix
  placeholder, preserved literally.

**Rationale**: Exporting plain data keeps the seed reusable across
seed-the-prod-DB and seed-the-test-DB code paths. Putting the file under
`backend/prisma/seed/` matches Prisma's conventional `prisma/seed.ts` location
without committing to a specific seed script entry point yet (that wiring is
deferred to feature 002).

**Alternatives considered**:
- JSON or CSV seed file. **Rejected** — TypeScript catches typos and missing
  fields at compile time, and `Boolean` / `BigInt` literal forms keep the
  intent explicit.

## R-6. Test database lifecycle

**Decision**: A `docker-compose.test.yml` at `backend/docker-compose.test.yml`
runs a single `postgres:16-alpine` container exposing port 5433 (avoiding
conflict with a dev container on 5432). Connection string is provided via
`process.env.TEST_DATABASE_URL`. Each test file:

1. Uses a shared `PrismaClient` from `backend/test/prisma-schema/helpers/prisma-test-client.ts`.
2. The helper runs `npx prisma db push --force-reset --skip-generate` once
   per Jest run via `globalSetup` to apply `schema.prisma` to the empty DB,
   then truncates relevant tables in `beforeEach`.
3. There are no migration files yet — `db push` (not `migrate dev`) is used
   intentionally, since migrations are out of scope for this feature.

**Rationale**: Real Postgres catches array-length, BigInt range, and
uniqueness behavior that an in-memory SQLite or mock would miss. `db push`
without migrations is the intended Prisma workflow when the schema is still
in flux and migrations are deferred.

**Alternatives considered**:
- SQLite for test isolation. **Rejected** — SQLite lacks native array columns and `BigInt` semantics differ; it would not exercise the production type behavior the schema relies on.
- `pg-mem`. **Rejected** — same array/BigInt fidelity gap.

## R-7. Constants pinned by tests (balance-regression coverage)

The schema directly encodes these `GEMAIN.H` constants as array lengths.
Per Constitution II, every such constant gets a regression test:

| Constant | Value | Schema usage |
|---|---|---|
| `UIDSIZ` | 30 | length comment on every `userid String` column |
| `MAXTORPS` | 3 | `ltorpsChannel`, `ltorpsDistance` array length |
| `MAXMISSL` | 3 | `lmisslChannel`, `lmisslDistance`, `lmisslEnergy` array length |
| `MAXDECOY` | 10 | `decout` array length |
| `NUMITEMS` | 14 | `Ship.items`, `Planet.itemsQty/...`, `MailStat.itemqty` array length |
| `MAXX` | 30 | sector grid X cardinality (asserted via `MAXX*MAXY=450` rows) |
| `MAXY` | 15 | sector grid Y cardinality |
| `MAXTEAMS` | 50 | minimum capacity tested by inserting 50 teams |
| `BEACONMSGSZ` | 75 | `Planet.beacon` length asserted in test (75 chars writeable, round-trips) |

`UIDSIZ` is referenced from MajorBBS conventions (value 30 across all
MajorBBS games of the era). Tests assert that strings of length 30 fit
without truncation in every `userid` column.
