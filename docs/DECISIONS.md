# Architecture Decisions

Format: decision, Context, Reason, Alternatives rejected.

---

## 2026-05-01 — BigInt for unbounded accumulator columns

**Context**: The original C source uses `unsigned long` (32-bit on DOS/MajorBBS)
for player cash, debt, score, and planet/kill score fields. In a 24/7 game these
accumulate without bound over days or months.

**Decision**: Store `score`, `cash`, `debt`, `plscore`, `klscore`, `population`
on User, `cash`/`debt`/`tax` on Planet, `teamscore` on Team, and per-item
`qty`/`sold2a` on Planet as Prisma `BigInt` (Postgres `bigint` = 64-bit signed).

**Reason**: A 32-bit signed value wraps at ~2.1 billion — reachable in a busy
game session. The 64-bit signed range (9.2 × 10^18) is effectively unbounded at
any realistic gameplay rate.

**Alternatives rejected**:
- Postgres `integer` (32-bit signed): clips original values; unacceptable for
  a fidelity-first project.
- Postgres `numeric`/`decimal`: arbitrary precision but slower and overkill;
  no game balance reason to exceed 64-bit range.

---

## 2026-05-01 — Parallel native arrays for fixed-size C struct arrays

**Context**: `WARSHP` has `items[14]`, `ltorps[3]` (each with `channel` +
`distance`), `lmissl[3]` (channel + distance + energy), `decout[10]`, `freq[3]`,
and `options[30]`. `GALPLNT` has `ITEM items[14]` (6 sub-fields each).
`MAILSTAT` has `itemqty[14]`.

**Decision**: Persist each as Postgres native array columns via Prisma scalar
lists (e.g. `items BigInt[]`). For sub-field structs (TORPEDO, MISSILE, ITEM)
use parallel arrays — one column per sub-field (e.g. `ltorpsChannel Int[]`,
`ltorpsDistance Int[]`). No JSON columns. No child tables.

**Reason**: Preserves the "slot N is meaningful" indexing semantics of the
original C arrays. Native arrays are first-class in Postgres and Prisma;
no join overhead; simpler migration path. Length is enforced in tests, not
at the DB level (acceptable per spec FR-034 — Postgres arrays don't enforce
fixed cardinality anyway).

**Alternatives rejected**:
- JSON column: violates FR-034; opaque to SQL queries and Prisma types.
- Child tables (e.g. `LockedTorpedo { shipId, slotIndex, channel, distance }`):
  adds ordering ambiguity, requires joins, and obscures the fixed-slot semantics.
- Prisma composite types: require raw-SQL Postgres composite types; complex
  migration story; parallel scalars are simpler and fully Prisma-native.

---

## 2026-05-01 — Selective FK enforcement (relaxed for dangling-reference cases)

**Context**: The original game tolerates dangling references in several places
(teamcode on User pointing to a deleted team; planet `lastattack` userid
pointing to a deleted player; planet `userid` ownership flipping without
strict referential integrity). Other relationships (Ship→User, Mail→User)
are always dereferenced and would represent corruption if the parent was missing.

**Decision**: Enforce FK for Ship→User, Mail→User, MailStat→User. Store
`User.teamcode`, `Planet.userid`, `Planet.lastattack`, `Planet.spyowner`,
`Planet.teamcode`, `Mine.deployedBy` as plain scalar fields with no Prisma
relation or Postgres FK constraint.

**Reason**: Faithfully reproduces original game behavior. The three enforced
FKs catch genuine data corruption early at no behavioral cost. The relaxed
fields match the original's tolerance for soft references.

**Alternatives rejected**:
- All FKs strict: would prevent reproducing original teamcode/lastattack behavior.
- All FKs relaxed: loses a free correctness guard on Ship and Mail.

---

## 2026-05-01 — Synthetic autoincrement PK for Mine

**Context**: The original `MINE` struct (`GEMAIN.H:267`) has no natural
composite key — mines were indexed by linear scan in volatile in-memory state.
Two mines can occupy the same coordinates simultaneously.

**Decision**: Use `id Int @id @default(autoincrement())` as a synthetic PK.

**Reason**: There is no natural candidate key. The autoincrement ID is the
simplest solution and matches the original's model of mines as unnamed,
unkeyed world objects.

**Alternatives rejected**:
- Composite `(channel, xcoord, ycoord)`: not unique (multiple mines at same
  point are valid per the original game).
- UUID: overkill for a small in-world entity table.

---

## 2026-05-01 — MailStat as a separate model from Mail

**Context**: The original C uses two distinct structs (`MAIL` and `MAILSTAT`)
sharing a single Btrieve file via union semantics. `MAILSTAT` has entirely
different fields (item-quantity array, structured cash/debt/tax) vs. `MAIL`'s
free-text payload.

**Decision**: Separate Prisma models `Mail` and `MailStat`, both with the same
composite key `(userid, class, msgno)`. Application code chooses which table
to query based on the `class` value.

**Reason**: Separate tables with typed columns are cleaner in Postgres than
a single polymorphic table with many nullable columns. Prisma types for each
are precise; no need for runtime type narrowing or a discriminator column.

**Alternatives rejected**:
- Single `Mail` table with union of all fields: sparse, many NULLs, harder to
  query and type.
- Prisma `@@map` trick to alias both to the same table: defeats the typing benefit.

---

## 2026-05-01 — raw setInterval over @nestjs/schedule for heartbeats

**Context**: Feature 002 introduces two game heartbeats (1s SHIP_UPDATE, 6s PHYSICS). NestJS ships `@nestjs/schedule` with `@Interval` decorators, which is the most common NestJS pattern.

**Decision**: Use raw `setInterval` in `TickService.onModuleInit()` / `onModuleDestroy()`. `@nestjs/schedule` is intentionally deferred to feature 009's midnight `@Cron` job.

**Reason**: The constraint is the exact cadence and no-drift behavior, not the specific scheduling primitive. `setInterval` fires relative to the start of the previous interval, not the end of the callback — this satisfies the no-drift requirement (FR-012). Adding `@nestjs/schedule` before its sole legitimate use (the midnight cron) would introduce a dependency prematurely. Jest's `jest.useFakeTimers()` patches `setInterval` directly, making cadence and subscriber tests reliable without wall-clock waits.

**Alternatives rejected**: `@nestjs/schedule @Interval` (premature dep), chained `setTimeout` (drifts under load), `node-cron` (coarse-grained), `bull`/Redis (violates no-Redis principle).

---

## 2026-05-01 — Single-process tick engine (no distributed lock)

**Context**: `setInterval` only fires in one Node.js process. If the deployment ever runs >1 backend node, two instances would each run the heartbeats, double-firing every subscriber.

**Decision**: Accept the single-process constraint for now. No distributed-lock infrastructure.

**Reason**: Deployment is single-process (Hetzner CPX32, one container). Adding `pg_try_advisory_lock` or Redis leader election today is premature and violates the no-Redis principle. The risk only materialises when a second backend node is added; the mitigation at that time is a Postgres advisory lock so exactly one node runs the tick loop.

**Alternatives rejected**: Postgres advisory lock now (premature, adds test complexity), Redis leader election (violates Principle III).

---

## 2026-05-01 — Hand-rolled subscriber registry (Map<TickKind, Set<TickHandler>>)

**Context**: Feature 003+ systems (combat, AI, ship state) need to react to each tick without coupling to `TickService` internals.

**Decision**: Expose `tickService.subscribe(kind, handler): Unsubscribe`. Backed by `Map<TickKind, Set<TickHandler>>`. Error isolation via `try/catch` per handler; async handlers are fire-and-forget with `.catch` for logging.

**Reason**: Two heartbeats × a small handler set — a `Set` is sufficient and trivially testable. A returned unsubscribe closure is idiomatic and idempotent (Set#delete returns false safely). Error isolation keeps one bad subscriber from stopping siblings or the next tick (FR-011).

**Alternatives rejected**: `@nestjs/event-emitter` (extra dep, weaker types), RxJS Subject (subscriber must learn RxJS, error semantics harder).

---

## 2026-05-01 — Handshake active-ship resolution (no BOARD command)

**Context**: Players may own more than one ship. The original GECMDS.C command table has no BOARD or SELECT_SHIP command — the active ship is determined at login time. FR-030 requires the active ship to be resolved on handshake.

**Decision**: On `handleConnection`, call `shipStateService.findByUserid(userid)`. Zero ships → NO_SHIP disconnect. One ship → bind it. Two or more → bind the lowest `shipno` and log a warning.

**Reason**: Faithfully reproduces original game behavior. The lowest-shipno tie-break is deterministic and produces a stable binding across reconnects. The warning log allows operators to investigate multi-ship anomalies.

**Alternatives rejected**:
- Require the client to specify a shipno at handshake time: not in the original protocol; adds client complexity.
- Pick a random ship: non-deterministic; bad for debugging.

---

## 2026-05-01 — Synchronous command handlers via pre-cached ShipClass data

**Context**: `Command.handler` has a synchronous signature `(ship, args, ctx) => CommandResult`. The `scan` and `report` handlers need ShipClass data (scanRange, typeName, hasCloak) to produce correct output, and that data lives in Postgres.

**Decision**: Make `ScanHandlerService` and `ReportHandlerService` `@Injectable()` services that implement `OnModuleInit`. In `onModuleInit()` they call `prisma.shipClass.findMany()` once and cache the results in a `Map`. Handlers remain synchronous and read from the cache.

**Reason**: Keeps the `Command` type synchronous — no `Promise` in the hot path. ShipClass data is static reference data (18 rows, never mutated during gameplay) so a one-time cache is correct and safe. The `@Injectable()` + `OnModuleInit` pattern is idiomatic NestJS.

**Alternatives rejected**:
- Async `Command.handler` signature: propagates `Promise` through CommandRouterService and GameGateway; complicates error handling; not worth it for static reference data.
- Pass ShipClass data as part of CommandContext: requires gateway to load it on every command dispatch; defeats the caching purpose.

---

## 2026-05-01 — Galaxy generator deviations from GEPLANET.C

**Context**: The procedural galaxy generator (feature 004) reimplements the sector
population logic from `GEPLANET.C:455-650 (xgetsector)`. Three areas required
deliberate deviations from the original due to missing assets or web-game constraints.

**Decision 1 — Wormhole destinations bounded to 30×15 grid** (research.md Decision 5):
Wormhole destination coordinates are clamped to `destX ∈ 0..29`, `destY ∈ 0..14`.
The original C code allowed destinations in `[-univmax..+univmax]`, which produced
out-of-bounds sectors unreachable in normal play.

**Reason**: The web port has a fixed 30×15 grid; sectors outside this range cannot
exist. Destinations pointing off-grid would produce dead wormholes. Bounding to the
valid grid ensures every wormhole leads somewhere playable.

**Alternatives rejected**: Allow out-of-bounds destinations and clamp at runtime —
adds a class of degenerate state; easier to fix at generation time.

**Decision 2 — `scan pl <name>` resolves by galaxy-wide planet name** (research.md Decision 8):
`scan pl <name>` looks up the planet by name across the entire galaxy via
`GalaxyService.findPlanetByName`. The original `cmd_scan` resolved by numeric `plnum`
within the current sector only.

**Reason**: Player-typed names are more usable than numeric IDs for a text-command
interface. Galaxy-wide lookup matches the original intent (players refer to planets
by name, not slot index). The original's local-sector `plnum` approach was a
Btrieve file-offset artefact, not a gameplay decision.

**Alternatives rejected**: Keep local-sector numeric lookup — poor UX for a web game
where players discover planet names from `scan lo` output, not from memory of slot numbers.

**Decision 3 — Neutral-zone `s00` table authored in code** (research.md Decision 4):
The `(0,0)` sector fixture (neutral zone with fixed planets/wormholes) is hardcoded
as a TypeScript constant array in `GalaxyService`. The original loaded this data from
an `.MSG` message file that is not recoverable from the available reference source.

**Reason**: The `.MSG` binary asset is not present in `/reference/ge-source/`. The
neutral-zone layout is well-documented in the wiki and broadly known from the original
game; hardcoding it in source is auditable and testable. A future operator could
override via config if needed.

**Alternatives rejected**: Derive neutral-zone content from procedural seed — would
produce a different layout each seed, breaking the canonical neutral-zone experience.
Load from a config file — adds an external asset dependency with no benefit over a
typed constant.

---

## 2026-05-01 — CommandsModule explicitly imports PrismaModule

**Context**: `PrismaModule` is `@Global()`, making `PrismaService` available in the full app without explicit imports. However, in integration tests that mount `CommandsModule` or `GatewayModule` in isolation (without `AppModule`), the global registration never happens, so `ScanHandlerService` and `ReportHandlerService` cannot resolve `PrismaService`.

**Decision**: Add `PrismaModule` to `CommandsModule`'s `imports` array.

**Reason**: Makes `CommandsModule` self-contained and testable in isolation. In the full app, NestJS deduplicates module instances, so the double-import has no runtime cost.

**Alternatives rejected**:
- Override `PrismaService` in every test: brittle, requires each new test file to know this detail.
- Remove `@Global()` from PrismaModule: breaks the established pattern for TickModule and would require every module to import PrismaModule explicitly.
