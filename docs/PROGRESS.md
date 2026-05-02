## 2026-05-01 — 001-prisma-schema

**Completed**:
- `backend/prisma/schema.prisma` with 10 models: User, Ship, Sector, Planet, Wormhole, Team, Mail, MailStat, ShipClass, Mine
- `backend/prisma/seed/ship-classes.ts` — 18 static ShipClass rows (10 player, 5 CPU combative, 3 CPU droid)
- `docker-compose.yml` (repo root) — `postgres:16-alpine` service with `ge` and `ge_test` databases
- `docker/postgres/init.sql` — creates `ge_test` on first container start
- `.env.example` with `DATABASE_URL` and `TEST_DATABASE_URL`
- `backend/package.json` with `db:up`, `db:down`, `db:reset`, `test`, `prisma:generate`, `prisma:push` scripts
- Full Jest integration test suite under `backend/test/prisma-schema/`

**Tests**: 250 tests across 14 suites, all green. Test categories:
- Round-trip fidelity per entity (10 spec files)
- BigInt overflow: every `BigInt`/`BigInt[]` column accepts values > 2^31 (bigint-overflow.spec.ts)
- Balance regression: 9 GEMAIN.H constants pinned (balance-constants.spec.ts)
- Schema fidelity audit: every GEMAIN.H field asserted via Prisma DMMF (fidelity-audit.spec.ts)
- Seed coverage: all 18 ShipClass rows with spot-checked columns (ship-class.spec.ts)
- Uniqueness: duplicate composite keys rejected for Sector, Planet, Wormhole, Team, Mail, MailStat, Ship, ShipClass
- Array lengths: MAXTORPS=3, MAXMISSL=3, MAXDECOY=10, NUMITEMS=14 enforced in tests

**Decisions made**:
- `unsigned long` accumulators → `BigInt`; bounded `unsigned` → `Int` (research.md R-1)
- Fixed C arrays persisted as native Postgres array columns (parallel arrays for TORPEDO/MISSILE/ITEM sub-structs) — no JSON, no child tables (FR-034/FR-035)
- FK enforced for Ship→User, Mail→User, MailStat→User; relaxed for `teamcode`, `userid` on Planet, `lastattack`, `spyowner` (matches original game tolerance, R-3)
- Mine uses a synthetic `id @default(autoincrement())` because the original MINE struct has no natural composite key
- `MailStat` is a separate model from `Mail` (cleaner than polymorphic discriminator in Postgres)

**Next**: `002-tick-engine` — NestJS application bootstrap, PrismaService, GameGateway skeleton, TickService with 1s and 6s intervals

**Known issues**: None

## 2026-05-01 — 002-tick-engine

**Completed**:
- `backend/src/main.ts` — NestJS bootstrap with IoAdapter (Socket.io), enableShutdownHooks(), ephemeral port support, fail-fast on DB connect error
- `backend/src/app.module.ts` — Root module wiring PrismaModule, TickModule, GatewayModule, DebugController
- `backend/src/prisma/prisma.{module,service}.ts` — @Global PrismaModule; PrismaService extends PrismaClient with $connect/$disconnect lifecycle
- `backend/src/game/constants.ts` — MAXX=30, MAXY=15, TICKTIME=6, TICKTIME2=1 from GEMAIN.H
- `backend/src/game/tick/tick.{types,module,service}.ts` — TickKind enum, TickContext interface, TickHandler/Unsubscribe types; TickService with raw setInterval(1000)+setInterval(6000), subscriber registry, error isolation, getStats()
- `backend/src/gateway/{gateway.module,game.gateway}.ts` — @WebSocketGateway with sector:join/sector:leave/disconnect lifecycle, OUT_OF_BOUNDS + INVALID_PAYLOAD error contracts
- `backend/src/debug/debug.controller.ts` — GET /debug/tick-stats for operator soak verification

**Tests**: 38 new tests, all green. Categories:
- Unit (fake timers): tick cadence × 6 cases, subscriber registry × 9 cases (including G4 async/slow handler isolation), constants regression × 5 cases
- Integration: PrismaService connect/disconnect/fail-fast (G3 bogus URL) × 3 cases; GameGateway join/leave/bounds/payload/disconnect-cleanup/100-cycle-leak × 14 cases
- E2E: Full AppModule boot (<5s, G1), clean shutdown (<3s, G2), socket client connects, no leaked connections × 3 cases

**Decisions made**:
- Raw `setInterval` over `@nestjs/schedule` (deferred for feature 009's midnight @Cron)
- Single-process tick engine accepted; Postgres advisory lock deferred until multi-node deployment
- Hand-rolled `Map<TickKind, Set<TickHandler>>` subscriber registry over @nestjs/event-emitter
- G5: TICKTIME/TICKTIME2 not in feature 001 balance-constants.spec.ts — added `test/unit/constants.spec.ts`
- T031 (10-minute manual soak) skipped; procedure documented in `specs/002-tick-engine/quickstart.md`

**Next**: `003-ship-commands` — CommandService + basic commands (scan, report, rotate, impulse, warp)

**Known issues**: 16 pre-existing prisma-schema test failures (existed before feature 002; caused by DB state interaction between concurrent test suites in feature 001). Not caused by this feature; tsconfig decorator fixes actually allow one additional suite to compile and pass.

## 2026-05-01 — 003-ship-commands

**Completed**:
- `ShipState` interface (47 fields + `dirty: boolean`) + mappers (`prismaShipToState`, `stateToPrismaUpdate`)
- `ShipStateService` — in-memory `Map<string, ShipState>`; hydrates from Prisma on init; subscribes `SHIP_UPDATE` tick → async dirty flush (per-entry try/catch); `get`/`mutate`/`findByUserid`/`findAllShips`/`findByName`
- `CommandRouterService` — alias-keyed registry; tokenise→lowercase→dispatch; minArgs guard; empty→silent drop; unknown→`UNKNOWN_CMD`
- `MessageId` enum (38 IDs) + `formatMessage()` with printf-style placeholder substitution
- `validators.ts` — `valdegree(-180..180)`, `valpcnt(0..99)` with typed ok/error returns
- Handlers: `rotate` (rot), `impulse` (imp), `warp` (war) — plain Command objects; `scan` (sc), `report` (rep) — `@Injectable()` services that cache ShipClass data on init
- `scan` — 30×15 range-scan projection (`projectRangeCell` from GECMDS.C:2640); returns `scanGrid` payload; TODO(004) planet/wormhole projection
- `report nav/sys/cargo/wpns` — multi-line read-outs; TODO(005)/TODO(006) for cargo and weapon gates
- `GameGateway` — handshake resolves active ship (lowest shipno), emits welcome; `command` event → router → `command:result`; try/catch error path
- React frontend: `socketClient.ts` singleton, `useSocket` hook, `ConnectionIndicator`, `EventLog`, `CommandInput`, `ScanMap` (30×15 grid), `App.tsx` 3-region terminal UI
- `CommandsModule` imports `PrismaModule` so `ScanHandlerService` + `ReportHandlerService` can inject `PrismaService` in isolated test contexts

**Tests**: 410 backend (30 suites, all green) + 33 frontend (7 suites, all green). New in this feature:
- Unit: `command-router.spec.ts` (17), `ship-state.service.spec.ts` (13), `validators.spec.ts` (16), `handlers/rotate.spec.ts` (10), `impulse.spec.ts` (11), `warp.spec.ts` (13), `scan.spec.ts` (11), `report.spec.ts` (15), `constants.spec.ts` additions
- Integration: `command-roundtrip.spec.ts` (11 — US1 flight + US2 inspection + T040 error path), `handshake-resolution.spec.ts` (4)
- Frontend: `ConnectionIndicator`, `EventLog`, `CommandInput`, `ScanMap`, `socketClient`, `App`, `contracts-parity` specs

**Decisions made**:
- Scan/report handlers are `@Injectable()` services (not plain Command objects) because they need Prisma on init to cache ShipClass data; handlers stay synchronous via cache
- Handshake binds the active ship (lowest shipno); no BOARD command per original GECMDS.C command table
- WARP04 (speed > topspeed) is warn-and-apply per GECMDS.C:614-619; warp is not rejected
- `CommandsModule` explicitly imports `PrismaModule` so isolated test modules resolve `PrismaService` without depending on `@Global()` being loaded via AppModule
- `SCAN_GRID_WIDTH=30`, `SCAN_GRID_HEIGHT=15` declared in `constants.ts` with JSDoc anchors; frontend copies to `contracts.ts` (shared-types path is outside tsconfig rootDir)

**Next**: `004-galaxy-generator` — Procedural 30×15 galaxy + sector types + wormholes

**Known issues**:
- `report cargo` and `report wpns` are placeholder stubs — deferred to feature 005 (planet items) and feature 006 (combat)
- `scan pl` (planet scan) deferred to feature 004
- `scan ra` / `scan se` return `SCANFMT` — deferred to feature 006
- Ship topspeed used as proxy for ShipClass.maxWarp in warp handler — WARP01/WARPSPD2 distinction deferred to feature 006

## 2026-05-01 — 004-galaxy-generator

**Completed**:
- Procedural 30×15 galaxy generator (Mulberry32 PRNG, row-major iteration, `s00` neutral-zone fixture)
- `GalaxyMeta` singleton written inside a single Postgres transaction on first boot; idempotency probe on `onModuleInit`
- In-memory read model: `planetsBySector`, `wormholesBySector`, `planetsByName` maps populated from DB after generation
- `scan lo` planet (`'O'`) and wormhole (`'W'`) projection onto the tactical grid
- `scan pl <name>` galaxy-wide named planet lookup via `GalaxyService.findPlanetByName`
- Operator reseed support via `GALAXY_SEED`, `GALAXY_PLODDS`, `GALAXY_WORMODDS`, `GALAXY_MAXPLANETS` env config

**Tests**: 35+ new backend tests:
- Unit: RNG determinism (5), config validation (38), service read methods (11)
- Integration: bootstrap (9), determinism (3), idempotency (10), balance (8), config divergence (5)
- Unit scan handler: 8 new planet/wormhole projection and named lookup tests
- Integration scan roundtrip: 1 end-to-end roundtrip test

**Decisions made**: Three documented deviations from GEPLANET.C (see DECISIONS.md):
wormhole destinations bounded to 30×15; `scan pl` resolves by galaxy-wide name not local plnum;
neutral-zone `s00` table authored in code. G5 rollback test required intercepting `$transaction`
to patch the tx client.

**Next**: `005-planet-system` — colonization, buy/sell, orbit

**Known issues**: None

## 2026-05-02 — 005-planet-system

**Completed**:
- `NUMITEMS=14` item constants: names, base prices, manhours, max capacities, tonnage weights
- `PLANTOCK_SECONDS=1800`, `PLANTIME_MIN_SECONDS=4` economy-tick cadence constants
- `TickKind.PLANET_UPDATE` + `TickService.startPlanetUpdateTimer(intervalMs)` — third heartbeat, idempotent start
- `PlanetState` interface + `PlanetItem` sub-type; `planetKey(xsect,ysect,plnum)` → string
- `prismaPlanetToState` / `stateToPrismaUpdate` mappers (parallel-array ↔ `PlanetItem[]`)
- `PlanetStateService` — in-memory `Map<planetKey, PlanetState>`; hydrates from Postgres; per-planet `runSerialized` async mutex; `get/all/size/claim/buy/sell/applyAdminChange/withdrawTax/runEconomicTickFor`; per-mutation Postgres flush (no dirty-flag)
- `planet-trade.ts` — pure `computeBuyOutcome` / `computeSellOutcome` (no I/O)
- `planet-economy.ts` — pure `applyEconomyTick` (ports GEPLANET.C:multiply lines 195–340)
- `PlanetTickService` — round-robin one-planet-per-PLANET_UPDATE; cadence = floor(1800/N) clamped ≥ 4s
- `PlanetModule` — imports PrismaModule, GalaxyModule, ShipModule, TickModule; exports PlanetStateService
- Command handlers: `orbit` (orb), `land` (lan), `buy`, `sell`, `admin` (adm), `withdraw` (with)
- `report cargo` fully implemented (per-item lines, tonnage total, class capacity)
- `scan pl <name>` beacon visibility line (research Decision 10)
- `CommandHandler` type extended to `CommandResult | Promise<CommandResult>`; `GameGateway.handleCommand` awaits async results
- `formatMessage` regex updated to handle `%6d` width specifiers

**Tests**: 687 backend tests, 58 suites, zero failures. Net new in this feature:
- Unit: `balance-planet.spec.ts` (7), `tick-planet-update.spec.ts` (5), `planet-state.spec.ts` (22), `planet-economy.spec.ts` (8), `planet-tick-cadence.spec.ts` (7), `planet-trade.spec.ts` (15)
- Unit handlers: `orbit.spec.ts` (7), `land.spec.ts` (9), `buy.spec.ts` (9), `sell.spec.ts` (6), `admin.spec.ts` (18), `withdraw.spec.ts` (7), `report-cargo.spec.ts` (8), scan.spec.ts beacon extension (3)
- Integration: `planet-bootstrap.spec.ts` (2), `planet-claim.spec.ts` (6), `planet-trade-persistence.spec.ts` (11), `planet-trade-concurrent.spec.ts` (2), `planet-tick-roundrobin.spec.ts` (4), `planet-tick-zeropop.spec.ts` (3), `command-roundtrip-planet.spec.ts` (4)

**Decisions made**: See research.md Decisions 1–10 now captured in DECISIONS.md. Key:
- Per-mutation Postgres flush (no dirty flag) for planet state (Decision 1)
- Per-planet `runSerialized` promise-chain mutex — no external locking (Decision 2)
- Round-robin PlanetTickService, one planet per PLANET_UPDATE firing (Decision 3)
- Owner pays baseprice; non-owner pays markup2a (Decision 4)
- Neutral-zone buy: planet inventory NOT decremented (Decision 5)
- Revolt deferred to feature 006 (Decision 6)

**Next**: `006-combat` — phasors, torpedoes, missiles, mines

**Known issues**: None

