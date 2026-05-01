# Phase 1 Data Model — Prisma Database Schema

Every column traces to a named field in `reference/ge-source/GEMAIN.H` or to a
column in `reference/wiki/player-ships.md` / `reference/wiki/cpu-ships.md`.
The only deviations are the two FR-029 modernization fields on `Mine`.

Citation format: `GEMAIN.H:<line>` cites the source line in the original C
header. `wiki:player` / `wiki:cpu` cite the relevant wiki page's stat table.

---

## User (`WARUSR`)

| Prisma field | Type | Source | Notes |
|---|---|---|---|
| `userid` | `String @id` | `WARUSR.userid[UIDSIZ]` (GEMAIN.H:293) | `UIDSIZ=30`. PK. |
| `score` | `BigInt` | `WARUSR.score` (GEMAIN.H:294) | FR-036 |
| `noships` | `Int` | `WARUSR.noships` (GEMAIN.H:296) | |
| `topshipno` | `Int` | `WARUSR.topshipno` (GEMAIN.H:297) | |
| `kills` | `Int` | `WARUSR.kills` (GEMAIN.H:298) | |
| `rospos` | `Int` | `WARUSR.rospos` (GEMAIN.H:299) | |
| `planets` | `Int` | `WARUSR.planets` (GEMAIN.H:300) | |
| `cash` | `BigInt` | `WARUSR.cash` (GEMAIN.H:301) | FR-036 |
| `debt` | `BigInt` | `WARUSR.debt` (GEMAIN.H:302) | FR-036 |
| `plscore` | `BigInt` | `WARUSR.plscore` (GEMAIN.H:303) | FR-036 |
| `klscore` | `BigInt` | `WARUSR.klscore` (GEMAIN.H:304) | FR-036 |
| `population` | `BigInt` | `WARUSR.population` (GEMAIN.H:305) | FR-036 |
| `options` | `Int[]` | `WARUSR.options[30]` (GEMAIN.H:306) | length 30, FR-034 |
| `teamcode` | `BigInt?` | `WARUSR.teamcode` (GEMAIN.H:307) | nullable, no FK (R-3) |
| _(omitted: `waste[40]`, `filler[...]`)_ | — | GEMAIN.H:295, 308 | FR-003 |

Relations: `ships Ship[]`, `mails Mail[]`, `mailStats MailStat[]`.

---

## Ship (`WARSHP`)

| Prisma field | Type | Source | Notes |
|---|---|---|---|
| `userid` | `String` | `WARSHP.userid` (GEMAIN.H:317) | part of `@@id` |
| `shipno` | `Int` | `WARSHP.shipno` (GEMAIN.H:318) | part of `@@id` |
| `shipname` | `String` | `WARSHP.shipname[35]` (GEMAIN.H:319) | length 35 |
| `shpclass` | `Int` | `WARSHP.shpclass` (GEMAIN.H:322) | resolved to `ShipClass.classNumber` (FR-027); not an FK (avoids cycles, ship classes are static reference data) |
| `heading` | `Float` | `WARSHP.heading` (GEMAIN.H:323) | FR-033 |
| `head2b` | `Float` | `WARSHP.head2b` (GEMAIN.H:325) | |
| `speed` | `Float` | `WARSHP.speed` (GEMAIN.H:326) | |
| `speed2b` | `Float` | `WARSHP.speed2b` (GEMAIN.H:328) | |
| `xcoord` | `Float` | `WARSHP.coord.xcoord` (COORD, GEMAIN.H:331) | FR-033 |
| `ycoord` | `Float` | `WARSHP.coord.ycoord` | FR-033 |
| `damage` | `Float` | `WARSHP.damage` (GEMAIN.H:333) | |
| `energy` | `Float` | `WARSHP.energy` (GEMAIN.H:335) | |
| `phasr` | `Float` | `WARSHP.phasr` (GEMAIN.H:337) | |
| `phasrtype` | `Int` | `WARSHP.phasrtype` (GEMAIN.H:339) | |
| `kills` | `Int` | `WARSHP.kills` (GEMAIN.H:340) | |
| `lastfired` | `Int` | `WARSHP.lastfired` (GEMAIN.H:341) | |
| `shieldtype` | `Int` | `WARSHP.shieldtype` (GEMAIN.H:342) | |
| `shieldstat` | `Int` | `WARSHP.shieldstat` (GEMAIN.H:343) | |
| `shield` | `Int` | `WARSHP.shield` (GEMAIN.H:344) | |
| `cloak` | `Int` | `WARSHP.cloak` (GEMAIN.H:345) | |
| `degrees` | `Int` | `WARSHP.degrees` (GEMAIN.H:346) | |
| `percent` | `Int` | `WARSHP.percent` (GEMAIN.H:348) | |
| `tactical` | `Int` | `WARSHP.tactical` (GEMAIN.H:349) | |
| `helm` | `Int` | `WARSHP.helm` (GEMAIN.H:350) | |
| `train` | `Int` | `WARSHP.train` (GEMAIN.H:351) | |
| `where` | `Int` | `WARSHP.where` (GEMAIN.H:352) | |
| `ltorpsChannel` | `Int[]` | `WARSHP.ltorps[MAXTORPS].channel` (GEMAIN.H:353) | length 3, FR-035 |
| `ltorpsDistance` | `Int[]` | `WARSHP.ltorps[MAXTORPS].distance` | length 3 |
| `lmisslChannel` | `Int[]` | `WARSHP.lmissl[MAXMISSL].channel` (GEMAIN.H:355) | length 3, FR-035 |
| `lmisslDistance` | `Int[]` | `WARSHP.lmissl[MAXMISSL].distance` | length 3 |
| `lmisslEnergy` | `Int[]` | `WARSHP.lmissl[MAXMISSL].energy` | length 3 |
| `decout` | `Int[]` | `WARSHP.decout[MAXDECOY]` (GEMAIN.H:357) | length 10 |
| `jammer` | `Int` | `WARSHP.jammer` (GEMAIN.H:359) | |
| `freq` | `Int[]` | `WARSHP.freq[3]` (GEMAIN.H:360) | length 3 |
| `items` | `BigInt[]` | `WARSHP.items[NUMITEMS]` (GEMAIN.H:362) | length 14, FR-008 |
| `titem` | `Int` | `WARSHP.titem` (GEMAIN.H:364) | |
| `hostile` | `Int` | `WARSHP.hostile` (GEMAIN.H:365) | |
| `cantexit` | `Int` | `WARSHP.cantexit` (GEMAIN.H:366) | |
| `repair` | `Int` | `WARSHP.repair` (GEMAIN.H:367) | |
| `hypha` | `Int` | `WARSHP.hypha` (GEMAIN.H:368) | |
| `firecntl` | `Int` | `WARSHP.firecntl` (GEMAIN.H:370) | |
| `destruct` | `Int` | `WARSHP.destruct` (GEMAIN.H:371) | |
| `status` | `Int` | `WARSHP.status` (GEMAIN.H:372) | |
| `cybmine` | `Int` | `WARSHP.cybmine` (GEMAIN.H:373) | |
| `cybskill` | `Int` | `WARSHP.cybskill` (GEMAIN.H:374) | |
| `cybupdate` | `Int` | `WARSHP.cybupdate` (GEMAIN.H:375) | |
| `tick` | `Int` | `WARSHP.tick` (GEMAIN.H:376) | |
| `emulate` | `Int` | `WARSHP.emulate` (GEMAIN.H:377) | |
| `minesnear` | `Int` | `WARSHP.minesnear` (GEMAIN.H:378) | |
| `lock` | `Int` | `WARSHP.lock` (GEMAIN.H:379) | |
| `holdcourse` | `Int` | `WARSHP.holdcourse` (GEMAIN.H:380) | |
| `topspeed` | `Int` | `WARSHP.topspeed` (GEMAIN.H:381) | |
| `warncntr` | `Int` | `WARSHP.warncntr` (GEMAIN.H:382) | |
| _(omitted: `filler[...]`)_ | — | GEMAIN.H:384 | FR-010 |

Keys: `@@id([userid, shipno])` (matches `SHPKEY`, FR-009).
Relations: `user User @relation(fields: [userid], references: [userid])` (FK enforced, R-3).

---

## Sector (`GALSECT`)

| Prisma field | Type | Source |
|---|---|---|
| `xsect` | `Int` | `GALSECT.xsect` |
| `ysect` | `Int` | `GALSECT.ysect` |
| `plnum` | `Int` | `GALSECT.plnum` (always 0) |
| `type` | `Int` | `GALSECT.type` |
| `numplan` | `Int` | `GALSECT.numplan` |
| _(omitted: `ptab[MAXPLANETS]`, `filler`)_ | — | FR-013 |

Keys: `@@id([xsect, ysect])` (FR-012). 450 sectors total at `MAXX*MAXY` (FR-011).

---

## Planet (`GALPLNT` + `ITEM`)

| Prisma field | Type | Source |
|---|---|---|
| `xsect` | `Int` | `GALPLNT.xsect` |
| `ysect` | `Int` | `GALPLNT.ysect` |
| `plnum` | `Int` | `GALPLNT.plnum` |
| `type` | `Int` | `GALPLNT.type` |
| `xcoord` | `Float` | `GALPLNT.coord.xcoord` |
| `ycoord` | `Float` | `GALPLNT.coord.ycoord` |
| `userid` | `String?` | `GALPLNT.userid` (owner; nullable, no FK — R-3) |
| `name` | `String` | `GALPLNT.name[20]` (length 20) |
| `enviorn` | `Int` | `GALPLNT.enviorn` |
| `resource` | `Int` | `GALPLNT.resource` |
| `cash` | `BigInt` | `GALPLNT.cash` (FR-036) |
| `debt` | `BigInt` | `GALPLNT.debt` (FR-036) |
| `tax` | `BigInt` | `GALPLNT.tax` (FR-036) |
| `taxrate` | `Int` | `GALPLNT.taxrate` |
| `warnings` | `Int` | `GALPLNT.warnings` |
| `password` | `String` | `GALPLNT.password[10]` (length 10) |
| `lastattack` | `String` | `GALPLNT.lastattack[UIDSIZ]` (length 30, no FK) |
| `beacon` | `String` | `GALPLNT.beacon[BEACONMSGSZ]` (length 75) |
| `spyowner` | `String` | `GALPLNT.spyowner[UIDSIZ]` (length 30, no FK) |
| `technology` | `Int` | `GALPLNT.technology` |
| `teamcode` | `BigInt` | `GALPLNT.teamcode` (no FK) |
| `itemsQty` | `BigInt[]` | `GALPLNT.items[NUMITEMS].qty` — length 14, FR-016 |
| `itemsRate` | `Int[]` | `ITEM.rate` |
| `itemsSell` | `Int[]` | `ITEM.sell` |
| `itemsReserve` | `Int[]` | `ITEM.reserve` |
| `itemsMarkup2a` | `Int[]` | `ITEM.markup2a` |
| `itemsSold2a` | `BigInt[]` | `ITEM.sold2a` (FR-037) |
| _(omitted: `filler`)_ | — | FR-032 |

Keys: `@@id([xsect, ysect, plnum])` (matches `PKEY`, FR-015).

---

## Wormhole (`GALWORM`)

| Prisma field | Type | Source |
|---|---|---|
| `xsect` | `Int` | `GALWORM.xsect` |
| `ysect` | `Int` | `GALWORM.ysect` |
| `plnum` | `Int` | `GALWORM.plnum` |
| `type` | `Int` | `GALWORM.type` |
| `xcoord` | `Float` | `GALWORM.coord.xcoord` |
| `ycoord` | `Float` | `GALWORM.coord.ycoord` |
| `visible` | `Int` | `GALWORM.visible` |
| `destXcoord` | `Float` | `GALWORM.destination.xcoord` |
| `destYcoord` | `Float` | `GALWORM.destination.ycoord` |
| `name` | `String` | `GALWORM.name[20]` (length 20) |

Keys: `@@id([xsect, ysect, plnum])`.

---

## Team (`TEAM`)

| Prisma field | Type | Source |
|---|---|---|
| `teamcode` | `BigInt @id` | `TEAM.teamcode` (FR-018) |
| `teamname` | `String` | `TEAM.teamname[31]` (length 31) |
| `teamcount` | `Int` | `TEAM.teamcount` |
| `teamscore` | `BigInt` | `TEAM.teamscore` |
| `password` | `String` | `TEAM.password[11]` |
| `secret` | `String` | `TEAM.secret[11]` |
| `flag` | `Int` | `TEAM.flag` |

Capacity: schema permits ≥50 teams (FR-019); test seeds 50 to verify.

---

## Mail (`MAIL`)

| Prisma field | Type | Source |
|---|---|---|
| `userid` | `String` | `MAIL.userid` |
| `class` | `Int` | `MAIL.class` (accepts 1..5 per FR-023; not enum'd) |
| `msgno` | `BigInt` | `MAILKEY.msgno` (long) — composite PK component |
| `type` | `Int` | `MAIL.type` |
| `stamp` | `Int` | `MAIL.stamp` |
| `dtime` | `String` | `MAIL.dtime[20]` |
| `topic` | `String` | `MAIL.topic[30]` |
| `string1` | `String` | `MAIL.string1[80]` |
| `name1` | `String` | `MAIL.name1[25]` |
| `name2` | `String` | `MAIL.name2[25]` |
| `int1` | `Int` | `MAIL.int1` |
| `int2` | `Int` | `MAIL.int2` |
| `int3` | `Int` | `MAIL.int3` |
| `long1` | `BigInt` | `MAIL.long1` (R-1) |
| `long2` | `BigInt` | `MAIL.long2` |
| `long3` | `BigInt` | `MAIL.long3` |

Keys: `@@id([userid, class, msgno])` (matches `MAILKEY`, FR-022).
Relation: `user User @relation(fields: [userid], references: [userid])` (FK enforced).

---

## MailStat (`MAILSTAT`)

| Prisma field | Type | Source |
|---|---|---|
| `userid` | `String` | `MAILSTAT.userid` |
| `class` | `Int` | `MAILSTAT.class` |
| `msgno` | `BigInt` | composite key with class+userid |
| `type` | `Int` | `MAILSTAT.type` |
| `stamp` | `Int` | `MAILSTAT.stamp` |
| `dtime` | `String` | `MAILSTAT.dtime[20]` |
| `topic` | `String` | `MAILSTAT.topic[30]` |
| `name1` | `String` | `MAILSTAT.name1[25]` |
| `int1` | `Int` | `MAILSTAT.int1` |
| `int2` | `Int` | `MAILSTAT.int2` |
| `cash` | `BigInt` | `MAILSTAT.cash` |
| `debt` | `BigInt` | `MAILSTAT.debt` |
| `tax` | `BigInt` | `MAILSTAT.tax` |
| `itemqty` | `BigInt[]` | `MAILSTAT.itemqty[NUMITEMS]` — length 14, FR-021 |

Keys: `@@id([userid, class, msgno])`.

**Note**: `MailStat` is a separate model from `Mail`, not a polymorphic
discriminator. The original C uses two distinct structs sharing a Btrieve
file via union semantics; in Postgres, a separate table is cleaner and the
class numbers (1–5) disambiguate at the application layer.

---

## ShipClass (wiki tables)

| Prisma field | Type | Source |
|---|---|---|
| `classNumber` | `Int @id` | wiki "#" column |
| `typeName` | `String` | wiki "Class" column (e.g. "Interceptor") |
| `shipNameTemplate` | `String` | wiki "Name" column for CPU ships (e.g. "Cybertron ###"); for player ships, mirrors `typeName` |
| `category` | `String` | one of `"PLAYER"`, `"CPU_COMBATIVE"`, `"CPU_DROID"` (derived from which wiki page the row came from) |
| `maxShields` | `Int` | wiki Shi |
| `maxPhaser` | `Int` | wiki Pha |
| `hasTorpedo` | `Boolean` | wiki Tor |
| `hasMissile` | `Boolean` | wiki Mis |
| `hasDecoy` | `Boolean` | wiki Dec |
| `hasJammer` | `Boolean` | wiki Jam |
| `hasZipper` | `Boolean` | wiki Zip |
| `hasMine` | `Boolean` | wiki Mine/Min |
| `canAttackPlanet` | `Boolean` | wiki Atck/Att |
| `hasCloak` | `Boolean` | wiki Clo |
| `maxAcceleration` | `Int` | wiki Acc |
| `maxWarp` | `Int` | wiki Warp |
| `maxTons` | `Int` | wiki Tons |
| `maxPrice` | `BigInt` | wiki Price (player ships only — CPU rows use 0) |
| `scanRange` | `Int` | wiki Scan |
| `points` | `Int` | wiki Pts |
| `damageFactor` | `Int` | wiki Dmg |
| `cybCanAttack` | `Boolean` | wiki "Cyb" (player table) |
| `cybLowestClassAttacks` | `Int` | wiki "Cyb#" (player table; 0 for CPU) |
| `noClaim` | `Int` | wiki "User" column (CPU table) — count below which CPU may claim a kill; 0 for player |
| `make` | `Int` | wiki "Make" — total simultaneous instances; 0 for player ships |
| `tough` | `Int` | wiki "Tough" — AI level (0/1); 0 for player ships |

Seed coverage: classes **1, 2, 3, 4, 5, 6, 7, 8, 9, 34** (player) and
**21, 22, 23, 24, 25, 31, 32, 33** (CPU). Total 18 (FR-025, FR-026).

---

## Mine (`MINE` + modernization)

| Prisma field | Type | Source |
|---|---|---|
| `id` | `Int @id @default(autoincrement())` | synthetic surrogate (R-4) |
| `channel` | `Int` | `MINE.channel` |
| `timer` | `Int` | `MINE.timer` |
| `xcoord` | `Float` | `MINE.coord.xcoord` |
| `ycoord` | `Float` | `MINE.coord.ycoord` |
| `deployedBy` | `String` | **modernization, FR-029** — userid of laying ship (no FK) |
| `deployedAt` | `DateTime @default(now())` | **modernization, FR-029** — timestamp |
