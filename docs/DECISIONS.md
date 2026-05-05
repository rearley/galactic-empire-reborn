# Architecture Decisions

Format: decision, Context, Reason, Alternatives rejected.

---

## 2026-05-02 — Physics tick uses `max_accel/10` for rotation (not ROTAMT)

**Context**: GEMAIN.H defines `ROTAMT=20` but it is never referenced in any `.C`
file (verified by grep). `GEFUNCS.C:441 rotship` uses
`rotamt = (double)(shipclass[ptr->shpclass].max_accel/10.0)`.

**Decision**: 006a's `rotationStep` uses `maxAccel / 10` per tick.

**Reason**: Faithful to the only formula the original actually executes; using
ROTAMT would erase per-class differentiation.

**Alternatives rejected**: Use ROTAMT (would make heavy and light ships pivot
identically, breaking class balance).

---

## 2026-05-02 — MOVENGUSE widened to `speed > 0` (with playtest fallback)

**Context**: `GEFUNCS.C:733-792 moveship` only debits MOVENGUSE when
`speed > 1000.0 && status == GESTAT_USER`. The 006a spec (FR-006) widens this to
`speed > 0` so impulse ships also pay maintenance.

**Decision**: 006a debits `MOVENGUSE = 10` whenever `speed > 0` and the ship is
a player (`status === 1`). AI ships skip the debit entirely (matches original).

**Reason**: Every spec reviewer asked "why doesn't impulse cost energy?". The
deliberate departure answers that with no new constant — same `MOVENGUSE` rate,
just a wider gate. Tracked here so a future revert is cheap.

**Alternatives rejected**: Match strict `speed > 1000.0` original gate
(reserved as the playtest fallback if impulse-only ships starve). Debit AI
ships too (rejected — original does not, spec clarification forbids).

---

## 2026-05-02 — Ascending-shipKey iteration order in physics tick

**Context**: `findAllShips()` returns the in-memory Map's value iterator;
insertion order under hydration race is implementation-dependent.

**Decision**: `PhysicsTickService` sorts `findAllShips()` lexicographically by
`${userid}:${shipno}` before iterating. O(n log n) at n≈200 is well under the
50 ms SC-004 budget.

**Reason**: Tests and bug reproductions need deterministic batch order
(FR-019); insertion order is brittle.

**Alternatives rejected**: Numeric `shipno` only (collisions across `userid`).
Insertion order (non-deterministic).

---

## 2026-05-02 — Per-ship try/catch over quarantine

**Context**: Original `RTKICK` does not crash on per-ship exceptions because C
runtime does not throw; we need an explicit isolation primitive in TS.

**Decision**: `PhysicsTickService.advanceAll` wraps each ship in `try { ... }
catch`, logs `{ shipId, tickAt, stack }`, increments an instance fault
counter, and continues. Faulted ship is re-tried next tick (no quarantine).

**Reason**: Mirrors the existing `TickService.dispatch` "one bad subscriber
must not stop siblings" pattern. Quarantine adds state and hides bugs; metrics
+ log is the correct first response.

**Alternatives rejected**: Quarantine after N consecutive faults (deferred —
revisit if telemetry shows the same ship faulting repeatedly).

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

## 2026-05-02 — Planet system decisions (feature 005)

Ten decisions made during the feature 005 research session. Full rationale in `specs/005-planet-system/research.md`.

**Decision 1 — Per-mutation Postgres flush, not the dirty-flag pattern**  
`PlanetStateService` writes to Postgres synchronously inside the same async critical section that mutates in-memory state. No dirty flag. Reason: planet mutations are sparse (player actions + economy tick); per-mutation I/O is acceptable and crash-safe. The original's `gesdb(GEUPDATE,...)` calls in `cmd_buy`/`cmd_sell`/`cmd_admin`/`multiply()` each executed synchronously. Ships use a dirty flag because the 1 Hz tick batch-flushes many ships; planets do not have that property.

**Decision 2 — Per-planet async mutex via promise chain (`runSerialized`)**  
Every public write on `PlanetStateService` serializes through a per-planet promise chain. Reason: single-process backend makes in-process serialization sufficient; the pattern is < 20 lines, has no external dep, and directly satisfies SC-005 (no double-spend). Rejected: Postgres advisory lock (round-trip per acquire), `async-mutex` npm dep, per-planet worker queue.

**Decision 3 — Cadence: `max(4, floor(1800 / N))` one-planet-per-firing**  
`PlanetTickService` processes exactly one planet per `PLANET_UPDATE` firing; interval is derived from the planet count. Reason: matches the original's per-planet cadence intent (`GEMAIN.C:656`), produces a more even cadence than the original's bursty `MAXTIC=20` approach, and is directly unit-testable. Rejected: hardcoded 1 Hz with N planets per firing; recompute cadence after every claim.

**Decision 4 — Sell only at neutral-zone plnum=1**  
`cmd_sell` refuses unless the pilot is on `plnum=1` at sector `(0,0)`. Reason: strict fidelity — the galactic-market sink is a single fixed planet (`GECMDS.C:4127`). Rejected: allow sell at any owned planet (economic deviation from original).

**Decision 5 — Production-report mail deferred to feature 009**  
`multiply()` clamps items at `maxpl[i]` but does not emit `MAIL_CLASS_PRODRPT` rows. Reason: the mail service does not yet exist; spec FR-016/SC-006 only require the production formula to match, not the mail side-effect. Deferred cleanly to feature 009.

**Decision 6 — Revolt and `check_spy` deferred to feature 006**  
`applyEconomyTick` ports `GEPLANET.C:195–340` only (through end of tax accrual). Lines 341+ (revolt, spy check) require combat resolution. Deferred to feature 006.

**Decision 7 — Trade password literal `"team"` preserved as-is**  
When `planet.password == "team"` and the planet has a non-zero `teamcode`, buy/sell access gates on matching `teamcode`. Reason: strict fidelity to `GECMDS.C:4232-4248`; breaking this breaks team economies.

**Decision 8 — `report cargo` zero-suppresses per-item lines**  
`report cargo` emits one line per non-zero cargo slot plus a total-tonnage line; zero-quantity slots are omitted. Reason: matches the terse style of the original in-game report display. Full 14-slot table coverage is in `balance-planet.spec.ts`, not the display path.

**Decision 9 — Item canonical arrays hardcoded, not env-configurable**  
`ITEM_NAMES`, `BASEPRICE`, `MANHOURS`, `MAXPL`, `ITEM_TONS` are frozen constants in source. Reason: balance is a project-level decision; env override would silently defeat the FR-028 balance regression tests. Rebalancing still has a clean path: edit the constant and the regression test in the same commit.

**Decision 10 — Beacon visibility through existing `scan` projection**  
Non-empty `planet.beacon` surfaces as a `beacon: string` field on the projected `ScanCell`. Reason: cheapest faithful path — `scan` already projects sector contents on demand; no new socket channel needed. Test: `scan.spec.ts` beacon case.

---

## 2026-05-03 — Combat tick subscribes after physics tick (CombatModule imports PhysicsModule)

**Context**: `CombatTickService` reads ship coordinates during each tick pass. If combat fires before
physics has moved ships, projectile positions and hit geometry are based on stale coordinates.

**Decision**: `CombatModule` lists `PhysicsModule` in its `imports` array. NestJS resolves module
dependencies before calling `onModuleInit`, so `PhysicsTickService.onModuleInit` (which subscribes
to `TickKind.PHYSICS`) runs before `CombatTickService.onModuleInit`. Both subscribe to the same tick
event but the subscription order enforced by module init order guarantees combat always reads
post-physics coordinates.

**Reason**: Tick subscriber order is the only ordering guarantee available inside a single Node.js
process and a shared `TickService` registry. Module import dependency is the least-invasive way to
enforce it without introducing a separate event or a secondary tick kind.

**Alternatives rejected**: Separate `COMBAT_TICK` event fired by PhysicsTickService after its own
pass (adds coupling between modules in the opposite direction); explicit subscriber priority field on
`TickHandler` (overengineered for a two-subscriber case).

---

## 2026-05-03 — Injectable Random port (RANDOM token + Mulberry32Adapter for tests)

**Context**: Several combat math functions require a PRNG. Using `Math.random()` inline makes
deterministic unit tests impossible — seeded reproducibility is required for SC-004 and SC-007.

**Decision**: Define a `Random` interface (`next(): number`) and a `RANDOM` NestJS injection token.
Production code binds `MathRandomAdapter` (delegates to `Math.random()`). Tests inject
`Mulberry32Adapter` (seeded, deterministic, pure 32-bit Mulberry32 PRNG).

**Reason**: Keeps all combat math and tick service code free of direct `Math.random()` calls.
The token is DI-injected so every test module can supply the seeded adapter without monkey-patching.
`PlanetModule` binds its own local `{ provide: RANDOM, useClass: MathRandomAdapter }` to avoid a
circular dependency through `CombatModule → PhysicsModule → ShipModule`.

**Alternatives rejected**: Pass `rng` as a plain function parameter to every combat-math call (no
DI, awkward for services); global seeded PRNG singleton (not testable in isolation).

---

## 2026-05-03 — Mine damage applied to all ships including deployer (no owner exclusion)

**Context**: The mine-sweep pass applies cubic-falloff damage to every ship within `MINERANGE`.
A question arose whether the mine deployer should be excluded from their own blast.

**Decision**: No owner exclusion. The deployer can be hit by their own mine.

**Reason**: Faithful reproduction of `GEFUNCS.C:minesweep` — the original C code has no owner
check; the for-loop iterates all ships unconditionally. Excluding the owner would be a gameplay
deviation without a fidelity justification.

**Alternatives rejected**: Skip deployer (rejected — not in original); warn deployer but skip
damage (rejected — original has no such gate).

---

## 2026-05-03 — Friendly fire enabled in phaser lineOfFire

**Context**: `lineOfFire` iterates all ships in scan range when resolving phaser hits.

**Decision**: No team filter applied. Friendly fire is allowed.

**Reason**: `GECMDS.C:cmd_phasor` iterates all ships with no team check. The original game design
treats weapon arc geometry as the sole inclusion criterion; team membership is irrelevant to phaser
resolution. A team filter would be a gameplay deviation.

**Alternatives rejected**: Skip teammates (rejected — not in original, changes balance).

---

## 2026-05-03 — COMBAT_SHIP_DESTROYED broadcast galaxy-wide

**Context**: On ship death, connected clients need to see the kill announcement regardless of which
sector they occupy. Other combat events are sector-scoped.

**Decision**: `GameGateway` handles `COMBAT_SHIP_DESTROYED` via `server.emit(...)` (broadcasts to
all connected clients). All other combat events use `server.to(sectorRoom).emit(...)`.

**Reason**: Kill announcements are a global game event ("Bob destroyed Alice" scrolls on every
terminal). Sector-scoping death events would hide kills from players not currently in either
combatant's sector, breaking the shared game world feel that is core to the original experience.
@see GECMDS.C:killem broadcast behavior.

**Alternatives rejected**: Sector-scope death event (breaks shared narrative); dedicated
"galaxy-news" room (extra room management with no benefit over `server.emit` at current scale).

---

## 2026-05-01 — CommandsModule explicitly imports PrismaModule

**Context**: `PrismaModule` is `@Global()`, making `PrismaService` available in the full app without explicit imports. However, in integration tests that mount `CommandsModule` or `GatewayModule` in isolation (without `AppModule`), the global registration never happens, so `ScanHandlerService` and `ReportHandlerService` cannot resolve `PrismaService`.

**Decision**: Add `PrismaModule` to `CommandsModule`'s `imports` array.

**Reason**: Makes `CommandsModule` self-contained and testable in isolation. In the full app, NestJS deduplicates module instances, so the double-import has no runtime cost.

**Alternatives rejected**:
- Override `PrismaService` in every test: brittle, requires each new test file to know this detail.
- Remove `@Global()` from PrismaModule: breaks the established pattern for TickModule and would require every module to import PrismaModule explicitly.

---

## 2026-05-03 — 007-cybertron-ai: R-1 through R-11 (Cybertron AI architecture)

### R-1: CybertronModule imports CombatModule — tick ordering guarantee

**Context**: `CybertronTickService` must fire AFTER `CombatTickService` on each PHYSICS tick
so that kill resolution and shield damage happen before the AI reads victim state.

**Decision**: `CybertronModule` imports `CombatModule` (which in turn imports `PhysicsModule`).
NestJS runs `onModuleInit` in import-dependency order, guaranteeing subscription registration
order: Physics → Combat → Cybertron.

**Alternatives rejected**: Manual ordering via injection tokens — fragile and not idiomatic NestJS.

---

### R-2: Spawn cadence — modulo-30 physics-tick counter

**Context**: `GEMAIN.C` outer loop runs the Cybertron spawn slot roughly once every 30 ticks.

**Decision**: `CybertronTickService.spawnTickCounter` increments each PHYSICS tick; `createSpawn`
is called when `counter % 30 === 0`. Each call picks one under-populated class at random.

**Alternatives rejected**: Separate `@Interval` timer — adds scheduling complexity; using the
existing PHYSICS tick subscription keeps Cybertron behavior deterministic under the seeded PRNG.

---

### R-3: Per-ship AI tick, not per-class batch

**Context**: The original C loop iterates individual Cybertron records, not ship-class buckets.
Each ship has its own `tick` countdown field.

**Decision**: `cybLives` is called per-ship when `ship.tick` reaches 0. Max `CYBMAXPERTICK=2`
activations per physics tick to prevent one slow Cybertron wave from monopolizing the tick budget.

**Alternatives rejected**: Per-class batch activation — diverges from C source and loses
per-ship `cybskill` variance.

---

### R-4: Gold transfer via `combat.ship-destroyed` event

**Context**: When a Cybertron is killed, its `User.cash` must be transferred to the killer atomically.
The kill is already signalled by `CombatTickService` via `combat.ship-destroyed`.

**Decision**: `CybertronTickService` listens for `combat.ship-destroyed`. If `victimUserid` starts
with `Cybrg-` it calls `repository.transferGold(victimUserid, attackerUserid)` which runs a
Prisma `$transaction` (zero victim cash, increment attacker cash).

**Alternatives rejected**: Poll DB on next tick — non-atomic, adds latency, misses kills during downtime.

---

### R-5: Random port reuse from 006b

**Context**: The same `Random` interface and `RANDOM` injection token introduced in 006b
for seeded PRNG determinism applies to Cybertron decisions.

**Decision**: `CybertronTickService` injects `@Inject(RANDOM) random: Random`; tests use
`Mulberry32Adapter` for deterministic replay. No `Math.random()` calls anywhere in the AI.

**Alternatives rejected**: Separate RANDOM token for AI — unnecessary duplication; same token
lets the whole tick be replayed from a single seed.

---

### R-6: Constants split between `constants.ts` and `cybertron.config.ts`

**Context**: Some Cybertron tuning values (tot_to_create, tooclose, hyperdist) are per-class;
others (CYB_BE_NICE, CYBSLO) are global balance constants from GEMAIN.H.

**Decision**: Global balance constants go in `game/constants.ts` (balance-tested in
`balance-regression.spec.ts`). Per-class values go in `cybertron.config.ts` with env override
support. Balance-regression tests pin all global constants.

**Alternatives rejected**: All in `cybertron.config.ts` — blurs the distinction between
balance-critical constants and per-deployment tuning knobs.

---

### R-7: Single `Cybrg-` userid prefix for all AI combatives (Cybertrons + Sarterns)

**Context**: `GECYBS.C:104-105` constructs all CPU combative userids as `Cybrg-<N>` regardless
of ship class. There is no separate Sartern prefix in the original source.

**Decision**: `createSpawn`, `hydrateAll`, and the gold-transfer regex all use the single
`Cybrg-` prefix. Sarterns (classes 24, 25) share this prefix and ride the same code path.

**Alternatives rejected**: Separate `Sartn-` prefix — diverges from C source; breaks the gold-transfer
filter and hydrate query.

---

### R-8: Sarterns use the Cybertron code path (no fork)

**Context**: Sarterns are `CLASSTYPE_CYBORG` ships with different class stats but the same AI behavior.

**Decision**: No branching on class number in `cybLives`, `cybCheckLockon`, or `runEngagementScan`.
Sarterns get `CybertronClassConfig` entries (24, 25) in `CYBERTRON_CLASS_DEFAULTS`; the code
reads per-class config at runtime.

**Alternatives rejected**: Separate SarternTickService — duplicate state machine, harder to maintain.

---

### R-9: Hyperwarp shield drop faithful to C source

**Context**: `GECYBS.C` sets `shieldstat=0` when a Cybertron enters hyperwarp and restores
`shieldstat` to `maxShields` on exit. This is a deliberate gameplay vulnerability window.

**Decision**: `cybCheckLockon` sets `shield=0, shieldstat=0` on hyperwarp entry and
`shield=maxShields, shieldstat=maxShields` on exit per `ShipClassCacheService.get(shpclass).maxShields`.

**Alternatives rejected**: Keep shields up — diverges from original; removes a key tactical counterplay.

---

### R-10: Taunt broadcast via existing `GameGateway` @OnEvent handler

**Context**: `CybertronTickService` must not import Socket.io (architecture constraint). Taunts
need to reach the target player's sector room.

**Decision**: `CybertronTickService` emits `cybertron.taunt` on the shared `EventEmitter2`.
`GameGateway` has an `@OnEvent(CYBERTRON_EVENT.TAUNT)` handler that looks up the target's sector
via `ShipStateService.get` and emits to `sector:${x}:${y}`.

**Alternatives rejected**: Inject Socket.io server into CybertronTickService — violates separation
of concerns; AI service would depend on transport layer.

---

### R-11: Immediate flush after cybCheckDamage defensive response

**Context**: When a Cybertron deploys a mine or jammer in response to damage, the inventory
change should be durable before the next tick to avoid double-deploys on crash.

**Decision**: `cybCheckDamage` calls `repository.flushShipsImmediate([shipKey])` when any
inventory was decremented. This is the same pattern used for target-acquisition persistence.

**Alternatives rejected**: Rely on the 30s dirty flush — acceptable for most state but a
mine/jammer deploy is a significant action worth persisting immediately.

---

### R-12: Ephemerality via in-memory `isEphemeral` flag rather than a separate Prisma model

**Context**: Droid ships (classes 31/32/33) must never be written to the database. They exist
only for the duration of a server session and must not clutter the `Ship` or `User` tables.

**Decision**: Add an optional `isEphemeral?: boolean` field to the in-memory `ShipState` type.
`ShipStateService.flush()` skips any state where `isEphemeral === true` (early continue).
`removeFromGame` likewise skips any Prisma delete for ephemeral states. No new Prisma model,
no migration, no schema change.

**Alternatives rejected**: Separate `DroidState` type — would require duplicating the entire
ShipState interface and forking every service that touches ship state. A Prisma `isDroid` column
was also considered but adds DB rows for something that should never be persisted.

---

### R-13: Single 30-tick counter drives both spawn and per-Droid action evaluation

**Context**: `GEDROIDS.C` uses a per-Droid `tick` countdown for individual action timing, but
the spawn evaluation fires on a fixed cadence. The implementation needs one coherent clock.

**Decision**: `DroidTickService` maintains a single `spawnTickCounter` incremented on every
physics tick. On the 30th rollover it runs spawn evaluation (fill population to cap) and
per-Droid action evaluation for all live Droids. Each Droid's `tick` field is initialized to
`CYBTICKTIME + rnd % CYBTICKTIME` at spawn for staggered first-action timing per `GEDROIDS.C:170`.

**Alternatives rejected**: Per-Droid separate timers — too fine-grained; the C source evaluates
Droids in a batch loop per game tick (`GEMAIN.C:2325`), not on individual schedules.

---

### R-14: Droid class numbers 31/32/33 (not 10/11/12 as originally planned)

**Context**: The original spec/tasks.md referenced class numbers 10/11/12 following the
`droid_act_class_10/11/12` function names in `GEDROIDS.C`. However, the DB seed already
populated `ShipClass` rows with `classNumber IN (31, 32, 33)` under `CLASSTYPE_DROID` (category 3)
before this feature was designed, using the MajorBBS typename convention.

**Decision**: Use 31/32/33 throughout the implementation (`DROID_CLASS_SCOW=31`,
`DROID_CLASS_TRANSPORT=32`, `DROID_CLASS_VAKORY=33`). The C source dispatches by typename string
comparison (`sameas`), not by class number, so both numbering schemes are valid at the C level.

**Alternatives rejected**: Renumber seed rows to 10/11/12 — would require a migration and would
diverge from the existing seed without benefit; 31/32/33 is already live in `ge_dev`.
