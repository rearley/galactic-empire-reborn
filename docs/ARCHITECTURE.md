# Architecture

Current module map as of feature 003-ship-commands.
Updated at the end of every implement session per CLAUDE.md.

## Repository layout

```
galactic-empire-reborn/
  backend/
    prisma/
      schema.prisma          ← Prisma schema (10 models, all C structs mapped)
      seed/
        ship-classes.ts      ← 18 ShipClass seed rows (static reference data)
    test/
      prisma-schema/         ← Integration test suite (250 tests, 14 suites)
    package.json             ← Backend deps + db:up/db:down/db:reset/test scripts
    tsconfig.json            ← TypeScript strict mode
    jest.config.ts
  docker/
    postgres/
      init.sql               ← Creates ge_test alongside ge on first container start
  docker-compose.yml         ← postgres:16-alpine service (db only; backend container deferred to 002)
  .env.example               ← DATABASE_URL and TEST_DATABASE_URL templates
  reference/
    ge-source/               ← Original C source (READ ONLY)
    wiki/                    ← Game wiki (READ ONLY)
  specs/
    001-prisma-schema/       ← Spec, plan, research, data-model, contracts, tasks
  docs/                      ← Living architecture docs (this file)
```

## Prisma layer

`backend/prisma/schema.prisma` is the single source of truth for the database
schema. There are no migration files yet — `prisma db push` is used during
feature 001 because the schema is still in flux and migrations are deferred.
Migration files will be introduced in a future feature.

`PrismaService` (NestJS injectable wrapping `PrismaClient`) does not exist yet —
that is the first task of feature 002. For now, test code instantiates
`PrismaClient` directly.

## Database

Postgres 16 runs as the `db` service in `docker-compose.yml`. Two databases:

- `ge` — development database (empty until feature 002 seeds the galaxy)
- `ge_test` — test database (reset on every `npm test` run via `globalSetup`)

Connection strings are provided via environment variables:
- `DATABASE_URL` — used by Prisma CLI and (eventually) the NestJS app
- `TEST_DATABASE_URL` — used by the Jest test harness

## NestJS application (feature 002)

```
AppModule (app.module.ts)
  ├── PrismaModule (prisma/) — @Global(), exports PrismaService
  │     └── PrismaService — extends PrismaClient, connects on init, disconnects on destroy
  ├── TickModule (game/tick/) — @Global(), exports TickService
  │     └── TickService — raw setInterval(1000) + setInterval(6000) in onModuleInit;
  │                        clearInterval in onModuleDestroy; pluggable subscriber registry
  ├── GatewayModule (gateway/) — exports GameGateway
  │     └── GameGateway — @WebSocketGateway; handshake resolves active ship (lowest shipno);
  │                        emits welcome command:result; handles sector:join/leave;
  │                        dispatches `command` events → CommandRouterService → command:result
  ├── CommandsModule (game/commands/) — exports CommandRouterService
  │     ├── CommandRouterService — alias-keyed registry; tokenise→lower→dispatch; minArgs guard
  │     ├── ScanHandlerService — @Injectable scan/sc handler; reads ShipClass.scanRange; projects
  │     │                         all ships onto 30×15 grid; returns scanGrid payload
  │     ├── ReportHandlerService — @Injectable report/rep handler; reads ShipClass.typeName/hasCloak;
  │     │                           builds multi-line nav/sys/cargo/wpns read-out
  │     └── plain Command objects: rotateCommand, impulseCommand, warpCommand
  ├── ShipModule (game/ship/) — exports ShipStateService
  │     └── ShipStateService — owns in-memory Map<"userid:shipno", ShipState>; hydrates from
  │                             Postgres on init; subscribes SHIP_UPDATE tick → async dirty flush;
  │                             get/mutate/findByUserid/findAllShips/findByName
  └── DebugController (debug/) — GET /debug/tick-stats → {shipUpdate, physics}
```

### Command dispatch path

```
client  →  [command event]  →  GameGateway.handleCommand()
            │  resolves active ship from ShipStateService
            │  calls CommandRouterService.dispatch(input, ship, {client})
            │    │  tokenise + lowercase input
            │    │  look up alias-keyed registry
            │    │  minArgs check → argMissingMessage
            │    └  call handler(ship, args, ctx) → CommandResult
            └  emits [command:result] with { lines[], scanGrid? }
```

Error path: unhandled throw in handler → gateway `catch` → `{ lines: ['Internal error…'] }`.
Empty input → `{ lines: [] }` (silent drop). Unknown keyword → `{ lines: [UNKNOWN_CMD] }`.

### ShipStateService in-memory Map

`Map<string, ShipState>` keyed by `"userid:shipno"`. On SHIP_UPDATE tick (1s), iterates
dirty entries, calls `prisma.ship.update()` per dirty ship, clears `dirty` flag.
Error per-entry is caught and logged; other ships are not affected.
`mutate(userid, shipno, fn)` calls fn in-place and sets `dirty = true`.

### Socket.io sector rooms and handshake

Handshake: no userid → NO_USER + disconnect. No ships → NO_SHIP + disconnect.
1 ship → bind; ≥2 ships → bind lowest shipno + log warning.
Room key format: `sector:{X}:{Y}`. Clients join on `sector:join`, leave on `sector:leave`.

### TickService subscriber registry

`tickService.subscribe(kind, handler): Unsubscribe` — hand-rolled `Map<TickKind, Set<TickHandler>>`.
Handlers are called in registration order every tick. A throwing handler is caught and logged;
async handlers are fire-and-forget with `.catch` attached. Unsubscribe is idempotent.

### Repository layout (updated)

```
galactic-empire-reborn/
  backend/
    src/
      main.ts
      app.module.ts          ← PrismaModule, TickModule, ShipModule, CommandsModule, GatewayModule
      prisma/
        prisma.module.ts     ← @Global PrismaModule
        prisma.service.ts
      game/
        constants.ts         ← MAXX=30, MAXY=15, TICKTIME=6, TICKTIME2=1, SCAN_GRID_WIDTH=30,
        │                       SCAN_GRID_HEIGHT=15, projectRangeCell()
        tick/tick.{module,service,types}.ts
        ship/
          ship-state.types.ts   ← ShipState interface (47 fields + dirty), shipKey()
          ship-state.mappers.ts ← prismaShipToState(), stateToPrismaUpdate()
          ship-state.service.ts ← in-memory Map + dirty flush
          ship.module.ts
        commands/
          command.types.ts      ← Command, CommandHandler, CommandResult, CommandContext, ScanCell
          command-router.service.ts
          commands.module.ts
          messages.ts           ← MessageId enum, formatMessage()
          validators.ts         ← valdegree(-180..180), valpcnt(0..99)
          handlers/
            rotate.handler.ts, impulse.handler.ts, warp.handler.ts  ← plain Command objects
            scan.handler.ts, report.handler.ts                       ← @Injectable() services
      gateway/
        gateway.module.ts
        game.gateway.ts
      debug/debug.controller.ts
    test/
      prisma-schema/         ← 250 integration tests (feature 001)
      unit/
        command-router.spec.ts
        ship-state.service.spec.ts
        validators.spec.ts
        constants.spec.ts
        handlers/rotate.spec.ts, impulse.spec.ts, warp.spec.ts, scan.spec.ts, report.spec.ts
        tick.service.spec.ts, tick.service.subscribers.spec.ts
      integration/
        command-roundtrip.spec.ts  ← 11 E2E round-trip tests (US1 + US2 + error path)
        handshake-resolution.spec.ts
        game-gateway.spec.ts
        prisma-lifecycle.spec.ts
      e2e/
        boot.e2e.spec.ts
  frontend/
    src/
      types/contracts.ts     ← EventLogLine, ScanCell, CommandRequest/ResultPayload, grid constants
      socket/
        socketClient.ts      ← singleton io() + sendCommand/onCommandResult/onError
        useSocket.ts         ← useSocket() React hook, ConnectionStatus
      components/
        ConnectionIndicator.tsx
        EventLog.tsx
        CommandInput.tsx
        ScanMap.tsx
      App.tsx                ← 3-region terminal UI
      main.tsx
    test/                    ← 33 Vitest tests
```

  └── GalaxyModule (game/galaxy/) — exports GalaxyService
        └── GalaxyService — generates the full 30×15 galaxy inside a single Postgres transaction
        │                    on first boot (idempotency probe: checks for GalaxyMeta row in
        │                    onModuleInit, skips generation if present)
        │                    owns in-memory read model:
        │                      Map<"x,y", Planet[]>   (planetsBySector)
        │                      Map<"x,y", Wormhole[]> (wormholesBySector)
        │                      Map<string, Planet>    (planetsByName)
        │                    public read API: getSectorPlanets, getSectorWormholes,
        │                      findPlanetByName, getMeta
        │                    consumed by: ScanHandlerService (004), PlanetService (005),
        │                      CombatService (006), CybertronService (007)

`ScanHandlerService` (feature 004 additions): `scan lo` now projects planets (`'O'`)
and wormholes (`'W'`) from `GalaxyService` onto the tactical grid alongside ships.
`scan pl <name>` resolves named planets galaxy-wide via `GalaxyService.findPlanetByName`.

## PlanetModule (feature 005)

```
PlanetModule (game/planet/)
  ├── PlanetStateService — in-memory Map<planetKey, PlanetState>; hydrates from Postgres on init;
  │                         per-planet promise-chain mutex (runSerialized) for all writes;
  │                         per-mutation Postgres flush on every claim/buy/sell/admin/withdraw/tick;
  │                         public: get/all/size/claim/buy/sell/applyAdminChange/withdrawTax/runEconomicTickFor
  └── PlanetTickService  — subscribes to TickKind.PLANET_UPDATE; snapshots all planet keys on init;
                            round-robins one planet per firing (cursor % keys.length);
                            calls TickService.startPlanetUpdateTimer(floor(1800/N) clamped ≥ 4s)
```

`CommandsModule` imports `PlanetModule`, adding:
- `OrbitHandlerService` (orbit/orb) — resolves sector planets via GalaxyService; auto-orbits single planet; pick-list for multi; sets ship.where = 10+plnum
- `LandHandlerService` (land/lan) — claims unowned planet (name validation 1–19 printable ASCII); password-checks other-owned planets (none/team/exact)
- `BuyHandlerService` (buy) — password gate; cargo capacity check; calls planetService.buy(); credits ship cargo + debits user.cash
- `SellHandlerService` (sell) — neutral-zone plnum=1 gate; calls planetService.sell(); credits user.cash
- `AdminHandlerService` (admin/adm) — owner-only; dispatches rate/markup/sellflag/reserve/tax/beacon/password changes
- `WithdrawHandlerService` (withdraw/with) — owner-only; drains planet.tax to user.cash via Prisma increment

### Command dispatch path (updated — async handlers)

```
client  →  [command event]  →  GameGateway.handleCommand()
            │  resolves active ship
            │  calls CommandRouterService.dispatch(input, ship, {})
            │    └  handler(ship, args, ctx) → CommandResult | Promise<CommandResult>
            └  if Promise: .then(emit) .catch(emit error); else emit synchronously
```

### PlanetStateService per-planet mutex

`runSerialized<T>(key, fn)` — per-planet promise chain. Each write acquires the chain,
runs `fn` atomically (in-memory + Prisma flush), then releases. Different planets do not contend.
The double-spend prevention in `sell()` relies on both the sufficiency check and the
ship-side cargo decrement happening inside the same `runSerialized` call.

### Economy tick

`applyEconomyTick(state): PlanetState` (pure, `planet-economy.ts`) ports GEPLANET.C:multiply.
Troop starvation → food consumption → men starvation → gold-to-cash → per-item production
(qty formula × envFact × taxfact × optional cash-boost) → tax accrual. Revolt deferred to feature 006.

## What does not exist yet

- Combat (phasors, torpedoes, missiles, mines) — feature 006
- Cybertron AI — feature 007
- Droid AI — feature 008
- Midnight job — feature 009
