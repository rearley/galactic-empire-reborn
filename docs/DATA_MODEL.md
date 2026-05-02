# Data Model

Plain-English description of the 10 persisted entities and their relationships.
For column-level citations back to the original C source, see
`specs/001-prisma-schema/data-model.md`.

## User

A player account identified by a string `userid` (max 30 chars, from MajorBBS
`UIDSIZ=30`). Holds the lifetime score and economic state: accumulated score,
kills, planet count, ship count, cash on hand, debt, team membership, and a
30-element byte array of player option flags. The `teamcode` field links to a
Team but the foreign key is intentionally relaxed — the original game tolerates
a teamcode referencing a deleted team. Source: `WARUSR` in `GEMAIN.H`.

**Relations**: owns many Ships, has many Mail messages and MailStat messages.

## Ship

A warship owned by a User, identified by the composite key `(userid, shipno)`.
Carries the complete real-time flight state: floating-point position and
heading, speed, energy, phaser charge, shield state, damage percentage, class,
a 14-element cargo inventory (`BigInt[]`), three locked-torpedo slots
(parallel `Int[]` arrays for channel and distance), three locked-missile slots
(channel, distance, energy), ten active-decoy slots, and all AI/Cybertron
control fields. Source: `WARSHP` in `GEMAIN.H`.

**Relations**: belongs to one User (FK enforced).

## Sector

One cell of the 30×15 galaxy grid (`MAXX=30`, `MAXY=15`), identified by
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
a name. Destination may fall outside the 30×15 grid (the schema allows it;
validation is a runtime concern). Source: `GALWORM` in `GEMAIN.H`.

## Team

An alliance faction, identified by a `BigInt teamcode`. Holds a team name,
member count, cumulative score, password, secret pass-phrase, and a flag.
Capacity is at least `MAXTEAMS=50`. Source: `TEAM` in `GEMAIN.H`. Players
reference teams via `User.teamcode` (no enforced FK — original tolerance).

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
They are no longer empty placeholder tables — after first boot all 450 sector rows exist,
and every planet and wormhole that was generated is present and queryable.

## Mine

A mine that has been deployed into the galaxy, distinct from mines carried as
cargo in `Ship.items`. Holds the original `MINE` struct fields (channel, timer,
position) plus two modernization additions (`deployedBy` userid, `deployedAt`
timestamp) that let the server restore mine ownership across restarts. Uses an
auto-increment integer PK because the original game had no natural mine key.
Source: `MINE` in `GEMAIN.H`.
