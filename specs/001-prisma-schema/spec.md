# Feature Specification: Prisma Database Schema

**Feature Branch**: `001-prisma-schema`
**Created**: 2026-04-30
**Status**: Draft
**Input**: User description: "Translate the core data structures from the original C source (reference/ge-source/GEMAIN.H) into a Prisma schema for PostgreSQL. Cover: ships (WARSHP), users (WARUSR), planets (GALPLNT), sectors (GALSECT), teams (TEAM), mail (MAIL/MAILSTAT), wormholes (GALWORM), and ship class definitions (player + CPU ships from wiki). Do not invent fields — every field must trace back to the C structs or wiki reference docs."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Persist Player and Ship State (Priority: P1)

The game backend must be able to durably persist every player account and the
ships they own, so that when a player disconnects or the server restarts, their
score, kills, cash, debt, and the full state of every ship they own (position,
heading, speed, damage, energy, shields, locked weapons, cargo items, repair
status, etc.) are restored exactly as they were.

**Why this priority**: Without persistence of users and ships, the game cannot
survive a single restart and no other feature can be built on top. This is the
load-bearing slice that everything else depends on.

**Independent Test**: Seed a player record with a known ship state, simulate a
backend restart, then read both records back and confirm every field — coordinates,
heading, energy, damage, shields, cargo (`items[NUMITEMS]`), locked torpedoes
(`ltorps[MAXTORPS]`), locked missiles (`lmissl[MAXMISSL]`), decoys out
(`decout[MAXDECOY]`) — round-trips byte-for-byte equivalent to what was stored.

**Acceptance Scenarios**:

1. **Given** a fresh database, **When** a new player account is created with a userid, **Then** the user row reflects the initial values defined in `WARUSR` (score=0, kills=0, planets=0, cash=starting amount, debt=0).
2. **Given** an active ship with mid-flight state (non-zero speed, partial damage, locked torpedoes, items in cargo), **When** the ship state is flushed and re-read, **Then** every field defined in `WARSHP` round-trips losslessly.
3. **Given** a user owns multiple ships, **When** querying ships by userid, **Then** all ships are returned and `WARUSR.noships` matches the count.

---

### User Story 2 - Persist the Galaxy (Sectors, Planets, Wormholes) (Priority: P1)

The game backend must durably store the procedurally generated 30×15 galaxy:
every sector (with its type and the planetary objects it contains), every
planet (with environment, resources, ownership, taxes, items, beacon, team
code, etc.), and every wormhole (with its visible flag and destination).

**Why this priority**: The galaxy is the world the game takes place in. Without
durable storage of sectors, planets, and wormholes, the world resets on every
restart and player investment in colonization is meaningless.

**Independent Test**: Generate a galaxy, write it to the schema, then read it
back and confirm: (a) all 30×15 sectors exist with correct `xsect`/`ysect` and
type, (b) every planet's `GALPLNT` fields including the full `items[NUMITEMS]`
inventory and `beacon` text round-trip, (c) wormhole entries preserve their
`coord` → `destination` mapping.

**Acceptance Scenarios**:

1. **Given** a generated galaxy, **When** the sector grid is queried, **Then** exactly `MAXX * MAXY` (30 × 15 = 450) sector rows exist, each with a unique `(xsect, ysect)` pair.
2. **Given** a colonized planet with cash, debt, tax, items inventory, and a beacon message, **When** the planet record is round-tripped, **Then** all `GALPLNT` fields including the per-item ITEM substructure (qty, rate, sell, reserve, markup2a, sold2a) are preserved exactly.
3. **Given** a wormhole at coord A with destination B, **When** the wormhole is read back, **Then** `coord`, `destination`, `visible`, and `name` match what was written.

---

### User Story 3 - Persist Teams and Player Mail (Priority: P2)

The game backend must store team definitions (teamcode, name, password, secret,
score, member count, flag) and the per-player mail inbox, including the special
mail-stat report variant used for nightly production reports and game stats.

**Why this priority**: Teams shape PvP and alliance behavior; mail is how the
nightly midnight job communicates production reports, distress calls, kill
notifications, and game-stat broadcasts to players. Both can be added after
the core ship/galaxy slice is durable, but neither can ship without storage.

**Independent Test**: Create a team, assign two users to it via `WARUSR.teamcode`,
send each user one of every mail class (distress, maxout, prodrpt, gamestats,
plstats), then read everything back and confirm fields and per-user inbox
contents match.

**Acceptance Scenarios**:

1. **Given** a team is created with `teamcode`, name, password, and secret, **When** the team row is read, **Then** all `TEAM` fields are preserved.
2. **Given** a user receives a `MAIL_CLASS_PRODRPT` mail-stat with item quantities for all `NUMITEMS` items, **When** the message is read back, **Then** the full `itemqty[NUMITEMS]` array, cash, debt, and tax round-trip exactly.
3. **Given** a player has multiple mail messages of mixed classes, **When** queried by userid, **Then** the full inbox is returned ordered by `(class, msgno)`.

---

### User Story 4 - Look Up Ship Class Definitions (Priority: P2)

The game logic must be able to look up the static stat sheet for any ship
class — both player ship classes (Interceptor, Stealth Fighter, Heavy Freighter,
Destroyer, Star Cruiser, Battle Cruiser, Frigate, Dreadnought, Freight Barge,
Sysopian Death Star) and CPU ship classes (Cybertron Scout, Cyberquad,
Cyber Base, Sarten Attack Drone, Sarten Obliterator, Lydorian Garbage Scow,
Murdonian Transport, Vakory Survey Drone) — to drive purchase, combat, AI, and
display logic.

**Why this priority**: Combat math, ship purchase at Zygor, AI behavior, and
the scan display all need to read these definitions. They're static reference
data — they can be seeded as fixed rows rather than created dynamically — but
the schema must hold them.

**Independent Test**: Seed all ship class definitions from the wiki tables,
then for each class confirm that the looked-up record contains every column
listed in the wiki (max shields, max phaser, has torpedo, has missile, has
decoy, has jammer, has zipper, has mine, can attack planets, has cloak,
acceleration, top warp, tonnage, price, scan range, points, cyb-pursuit-flag,
cyb-pursue-count, damage factor, plus the CPU-only `make` and `tough` fields).

**Acceptance Scenarios**:

1. **Given** ship class definitions are seeded, **When** class 1 (Interceptor) is fetched, **Then** all 19 player-ship columns from the wiki match.
2. **Given** ship class definitions are seeded, **When** class 22 (Cybertron Battle Cruiser) is fetched, **Then** the `make` (max simultaneous), `tough` (AI level), and CPU-pursuit columns are present and correct.
3. **Given** a `WARSHP` row has `shpclass = 32`, **When** the class definition is joined, **Then** the Murdonian Transport stat sheet is returned.

---

### Edge Cases

- A player with `noships > 0` whose ship rows have all been deleted (orphaned counter) — the schema must allow detecting this inconsistency, but does not need to enforce it at the DB level.
- A planet at the same `(xsect, ysect)` as another planet but a different `plnum` — the composite identity of a planet is `(xsect, ysect, plnum)`, not just sector coordinates.
- A wormhole whose destination falls outside the 30×15 grid — schema must permit it (the original allows arbitrary `COORD`); validation is a runtime concern.
- A ship at exactly `(0, 0)` (origin / neutral zone) — coordinates are floating-point doubles and zero is valid.
- Mail with a `class` value that does not match any of the five known constants — schema must store the integer; meaning is enforced in code.
- A player ship with `shpclass = 34` (Sysopian Death Star, admin-only) — schema does not gate this; admin-only is a runtime policy.
- A user belongs to a team whose `teamcode` no longer exists — original game tolerates dangling teamcode; schema should not hard-foreign-key in a way that prevents this if it conflicts with original behavior.
- A locked torpedo or missile slot that is empty — the original uses fixed-size `[MAXTORPS]` / `[MAXMISSL]` arrays with sentinel values; the schema must represent "no torp in slot N".

## Requirements *(mandatory)*

### Functional Requirements

#### User entity (from `WARUSR`)

- **FR-001**: Schema MUST store user records with the following fields, each tracing to `WARUSR` in `GEMAIN.H`: `userid` (string, length `UIDSIZ`), `score` (unsigned long), `noships` (unsigned), `topshipno` (int), `kills` (int), `rospos` (unsigned), `planets` (int), `cash` (unsigned long), `debt` (unsigned long), `plscore` (unsigned long), `klscore` (unsigned long), `population` (unsigned long), `options` (30 bytes), `teamcode` (unsigned long).
- **FR-002**: `userid` MUST be the unique identifier for a user.
- **FR-003**: The `waste[40]` and trailing `filler` fields from `WARUSR` MUST NOT be reproduced in the schema (they are C struct padding only).

#### Ship entity (from `WARSHP`)

- **FR-004**: Schema MUST store ship records with the following fields, each tracing to `WARSHP`: `userid`, `shipno`, `shipname` (35), `shpclass`, `heading`, `head2b`, `speed`, `speed2b`, `coord` (xcoord + ycoord, both doubles per `COORD`), `damage`, `energy`, `phasr`, `phasrtype`, `kills`, `lastfired`, `shieldtype`, `shieldstat`, `shield`, `cloak`, `degrees`, `percent`, `tactical`, `helm`, `train`, `where`, `jammer`, `freq[3]`, `titem`, `hostile`, `cantexit`, `repair`, `hypha`, `firecntl`, `destruct`, `status`, `cybmine`, `cybskill`, `cybupdate`, `tick`, `emulate`, `minesnear`, `lock`, `holdcourse`, `topspeed`, `warncntr`.
- **FR-005**: Schema MUST persist the `MAXTORPS` (3) locked-torpedo slots per ship, each carrying a `channel` (unsigned char) and `distance` (unsigned), tracing to `TORPEDO` in `GEMAIN.H`.
- **FR-006**: Schema MUST persist the `MAXMISSL` (3) locked-missile slots per ship, each carrying a `channel`, `distance`, and `energy`, tracing to `MISSILE`.
- **FR-007**: Schema MUST persist the `MAXDECOY` (10) decoys-out slots per ship as unsigned values, tracing to `WARSHP.decout`.
- **FR-008**: Schema MUST persist the `NUMITEMS` (14) cargo quantities per ship (one unsigned long per item index), tracing to `WARSHP.items`.
- **FR-009**: A ship MUST be uniquely identified by the composite of `(userid, shipno)`, matching `SHPKEY` in `GEMAIN.H`.
- **FR-010**: The `filler` field from `WARSHP` MUST NOT be reproduced.

#### Sector entity (from `GALSECT`)

- **FR-011**: Schema MUST store sector records with the fields: `xsect`, `ysect`, `plnum` (always 0 for sectors), `type`, `numplan`, tracing to `GALSECT`.
- **FR-012**: A sector MUST be uniquely identified by the composite of `(xsect, ysect)`.
- **FR-013**: The embedded `ptab[MAXPLANETS]` and `filler` of `GALSECT` MUST NOT be duplicated as sector columns; per-planet data lives in the Planet entity (FR-014).

#### Planet entity (from `GALPLNT` and `ITEM`)

- **FR-014**: Schema MUST store planet records with the fields: `xsect`, `ysect`, `plnum`, `type`, `coord` (xcoord, ycoord), `userid` (owner), `name` (20), `enviorn`, `resource`, `cash`, `debt`, `tax`, `taxrate`, `warnings`, `password` (10), `lastattack` (`UIDSIZ`), `beacon` (`BEACONMSGSZ` = 75), `spyowner` (`UIDSIZ`), `technology`, `teamcode`.
- **FR-015**: A planet MUST be uniquely identified by the composite of `(xsect, ysect, plnum)`, matching `PKEY` in `GEMAIN.H`.
- **FR-016**: Schema MUST persist the `NUMITEMS` (14) per-planet `ITEM` substructure entries, each carrying `qty` (unsigned long), `rate` (unsigned), `sell` (char/bool), `reserve` (unsigned), `markup2a` (unsigned), `sold2a` (unsigned long), tracing to `ITEM`.

#### Wormhole entity (from `GALWORM`)

- **FR-017**: Schema MUST store wormhole records with the fields: `xsect`, `ysect`, `plnum`, `type`, `coord` (xcoord, ycoord), `visible`, `destination` (xcoord, ycoord), `name` (20), tracing to `GALWORM`.

#### Team entity (from `TEAM`)

- **FR-018**: Schema MUST store team records with the fields: `teamcode` (long, unique), `teamname` (31), `teamcount` (unsigned int), `teamscore` (unsigned long), `password` (11), `secret` (11), `flag` (int), tracing to `TEAM`.
- **FR-019**: The schema MUST permit at least `MAXTEAMS` (50) teams, matching the original cap.

#### Mail entities (from `MAIL` and `MAILSTAT`)

- **FR-020**: Schema MUST store standard mail records with the fields from `MAIL`: `userid`, `class`, `type`, `stamp`, `dtime` (20), `topic` (30), `string1` (80), `name1` (25), `name2` (25), `int1`, `int2`, `int3`, `long1`, `long2`, `long3`.
- **FR-021**: Schema MUST store mail-stat records (the production-report variant) with the fields from `MAILSTAT`: `userid`, `class`, `type`, `stamp`, `dtime`, `topic`, `name1`, `int1`, `int2`, `cash`, `debt`, `tax`, plus `itemqty[NUMITEMS]` (14 unsigned longs).
- **FR-022**: Each mail record MUST be uniquely identified by `(userid, class, msgno)`, matching `MAILKEY`.
- **FR-023**: Mail `class` values MUST accept at minimum the five known constants from `GEMAIN.H`: `MAIL_CLASS_DISTRESS` (1), `MAIL_CLASS_MAXOUT` (2), `MAIL_CLASS_PRODRPT` (3), `MAIL_CLASS_GAMESTATS` (4), `MAIL_CLASS_PLSTATS` (5).

#### Ship class entity (from wiki tables)

- **FR-024**: Schema MUST store a ship class definition record per class number, populated from `reference/wiki/player-ships.md` and `reference/wiki/cpu-ships.md`, with the columns: class number, type name, ship-name template, max shields, max phaser, has-torpedo, has-missile, has-decoy, has-jammer, has-zipper, has-mine, can-attack-planet, has-cloak, max acceleration, max warp, max tons, max price, scan range, points awarded, damage factor, cyb-can-attack flag, lowest-class-cyb-attacks, no-claim flag, total-to-create (CPU `make`), tough factor (CPU `tough`).
- **FR-025**: The schema MUST cover the player ship classes 1, 2, 3, 4, 5, 6, 7, 8, 9, and 34 (Sysopian Death Star) as listed in `reference/wiki/player-ships.md`.
- **FR-026**: The schema MUST cover the CPU ship classes 21, 22, 23, 24, 25 (combative) and 31, 32, 33 (droid) as listed in `reference/wiki/cpu-ships.md`.
- **FR-027**: A ship's `WARSHP.shpclass` MUST be resolvable to exactly one ship class definition.

#### Mine entity (from `MINE` in `GEMAIN.H`)

- **FR-028**: Schema MUST store deployed mines as a separate Mine entity with the fields from `MINE`: `channel` (byte), `timer` (unsigned), `xcoord` (double), `ycoord` (double), tracing to the `MINE` struct in `GEMAIN.H` (`channel`, `timer`, `coord`).
- **FR-029**: Mine records MUST additionally carry a `deployedBy` (the userid of the ship that laid the mine) and a `deployedAt` (timestamp). These two fields are explicit modernization additions — in the original game, mine ownership was held implicitly in volatile in-memory tables; persisting it lets the server restore mines after a restart and attribute kills correctly.
- **FR-030**: The Mine entity MUST be distinct from the per-ship `items[I_MINE]` cargo count on Ship — the Ship cargo array tracks how many mines a ship is carrying; the Mine entity tracks mines that have been deployed into the world.

#### Cross-cutting

- **FR-031**: Every column in the schema MUST trace to a named field in `GEMAIN.H` or to a column listed in the two ship wiki pages, with the sole exception of the explicit modernization fields called out in FR-029. The schema MUST NOT introduce other gameplay fields beyond those sources.
- **FR-032**: Where a C `filler[N]` byte array exists purely to round out a fixed struct size for Btrieve storage, the schema MUST omit it.
- **FR-033**: Floating-point fields (heading, speed, coord) MUST be stored at double precision to preserve the original `COORD` definition (`double xcoord`, `double ycoord`).
- **FR-034**: Fixed-size C arrays (`items[14]`, `ltorps[3]`, `lmissl[3]`, `decout[10]`, `freq[3]`, `options[30]`, `itemqty[14]`) MUST be persisted as PostgreSQL native array columns via Prisma scalar lists (e.g. `items Int[]`). Child tables MUST NOT be used for these arrays.
- **FR-035**: For `ltorps[MAXTORPS]` and `lmissl[MAXMISSL]`, each slot carries multiple sub-fields (`channel`, `distance`, and for missiles `energy`); these MUST be represented as parallel native array columns (e.g. `ltorpsChannel Int[]`, `ltorpsDistance Int[]`), preserving the per-index value and the array length, without introducing child tables.
- **FR-036**: Fields that represent unbounded accumulation across the lifetime of a player or planet — specifically `User.cash`, `User.debt`, `User.score`, `User.plscore`, `User.klscore`, `User.population`, and `Planet.cash`, `Planet.debt`, `Planet.tax` — MUST be stored as `BigInt`, not `Int`, to prevent overflow during long-running 24/7 play.
- **FR-037**: Other numeric fields originally typed `unsigned long` (e.g. per-item `qty`, `sold2a`, `MAILSTAT.itemqty`) MUST be stored at a precision that preserves the original 32-bit unsigned range without loss; `BigInt` is acceptable but not required where a 32-bit signed integer would clip the original range.

### Key Entities

- **User** — A player account, keyed by `userid`. Holds score, kills, cash, debt, planet count, ship count, team membership, and player option flags. Source: `WARUSR`.
- **Ship** — An active warship belonging to a user, keyed by `(userid, shipno)`. Holds full real-time state (position, heading, speed, damage, energy, weapons lock-ons, cargo, repair flags). Source: `WARSHP` + supporting structs `COORD`, `TORPEDO`, `MISSILE`.
- **ShipClass** — Static stat sheet for a ship class number. Drives purchase, combat, AI, and display logic. Source: `reference/wiki/player-ships.md` and `reference/wiki/cpu-ships.md`, mirroring the in-memory `SHIP` struct.
- **Sector** — One of 30×15 cells of the galaxy grid, keyed by `(xsect, ysect)`. Holds sector type and a count of planetary objects within. Source: `GALSECT`.
- **Planet** — A planet inside a sector, keyed by `(xsect, ysect, plnum)`. Holds environment, resources, ownership, taxes, beacon, team code, technology, and a 14-item economy inventory. Source: `GALPLNT` + `ITEM`.
- **Wormhole** — A bidirectional teleport link inside a sector, keyed by `(xsect, ysect, plnum)`. Holds origin coord, destination coord, visible flag, and name. Source: `GALWORM`.
- **Team** — A faction grouping for alliance play. Holds teamcode, name, member count, score, password, secret, and flag. Source: `TEAM`.
- **Mail** — A message in a player's inbox, keyed by `(userid, class, msgno)`. Two shapes: standard `MAIL` for distress/announcements and `MAILSTAT` for nightly production reports with per-item quantities. Source: `MAIL`, `MAILSTAT`.
- **Mine** — A mine that has been deployed into the world (as opposed to a mine carried as cargo). Holds `channel`, `timer`, and a `(xcoord, ycoord)` position from `MINE` in `GEMAIN.H`, plus the modernization fields `deployedBy` (owner userid) and `deployedAt` (timestamp) needed to persist mine ownership across restarts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every C struct field listed in `WARUSR`, `WARSHP`, `GALSECT`, `GALPLNT`, `GALWORM`, `TEAM`, `MAIL`, and `MAILSTAT` (excluding `filler` and `waste` padding bytes) is present in the schema and reachable from a query — verified by a fidelity audit test that lists fields per entity and asserts no source-of-truth field is missing.
- **SC-002**: Every column listed in `reference/wiki/player-ships.md` and `reference/wiki/cpu-ships.md` (Shi, Pha, Tor, Mis, Dec, Jam, Zip, Mine, Atck, Clo, Acc, Warp, Tons, Price, Scan, Pts, Dmg, plus CPU `Make` and `Tough`) is present on the ShipClass entity for every defined class number.
- **SC-003**: A round-trip test seeds one record per entity with non-default values for every persisted field, then re-reads each record and asserts byte-equivalent (or numerically equivalent for floats) values for 100% of fields.
- **SC-004**: Inserting one record for each of the 18 ship classes (10 player + 5 combative CPU + 3 droid) succeeds and looking up each by class number returns the seeded stat sheet.
- **SC-005**: Inserting `MAXX * MAXY` (450) sector rows and `MAXTEAMS` (50) teams succeeds, and uniqueness constraints reject duplicate `(xsect, ysect)` and duplicate `teamcode`.
- **SC-006**: A schema-fidelity report can be generated that, for each entity, lists the column → source-line citation in `GEMAIN.H` (or wiki page) for every column, with zero unattributed columns.

## Assumptions

- The schema is for PostgreSQL and is expressed as a Prisma schema; no other DB engine is in scope. (Per project `CLAUDE.md`.)
- C `unsigned long` is treated as a 32-bit value (the original target was DOS/16-bit-era MajorBBS C); preserving the original range is the goal, not preserving the original storage layout.
- C `byte` (single-byte enum-like fields such as `phasrtype`, `shieldtype`, `status`, `cybskill`) is stored as a small integer; meaning of values is enforced in code, not as a DB enum, to keep schema changes painless when game logic adds new sentinel values.
- C fixed-size arrays inside structs (`items[14]`, `ltorps[3]`, `lmissl[3]`, `decout[10]`, `freq[3]`, `options[30]`, `itemqty[14]`) are persisted as PostgreSQL native array columns via Prisma scalar lists (per FR-034). No JSON columns, no child tables.
- Mine ownership (`deployedBy`, `deployedAt`) is the one explicit modernization addition in this schema. The original game tracked mine ownership only in volatile in-memory state; persisting it is a deliberate fidelity-improving deviation, not a feature scope expansion.
- The target stack is NestJS + Prisma + PostgreSQL 16. This feature defines the Prisma schema only — no migrations, no seed scripts, no Prisma client wiring, no NestJS service code.
- `filler` and `waste` byte arrays inside the original C structs exist only to round structs to fixed Btrieve block sizes (e.g. 256 or 512 bytes). They carry no game state and are excluded.
- Ship class definitions are seeded as static reference rows from the wiki tables; they are not user-editable through gameplay. The original `MBMGESHP.MSG` sysop-edit path is out of scope for v1.
- Indexes beyond the natural primary/unique keys are part of the implementation plan, not the spec.
- The galaxy is generated procedurally on first boot per project `CLAUDE.md`; no import path from the original Btrieve `.DAT` files is required.
- Foreign-key strictness (e.g. ship.userid → user.userid) is left to the planning phase. The original game tolerated dangling references in some places (e.g. `lastattack` userid, dangling `teamcode`); the schema may choose to relax those FKs to preserve original behavior.
