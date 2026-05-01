# Architecture

Current module map as of feature 002-tick-engine.
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
  │     └── GameGateway — @WebSocketGateway; handles sector:join, sector:leave;
  │                        validates X∈[1,30] Y∈[1,15]; manages Socket.io sector rooms
  └── DebugController (debug/) — GET /debug/tick-stats → {shipUpdate, physics}
```

### TickService subscriber registry

`tickService.subscribe(kind, handler): Unsubscribe` — hand-rolled `Map<TickKind, Set<TickHandler>>`.
Handlers are called in registration order every tick. A throwing handler is caught and logged;
async handlers are fire-and-forget with `.catch` attached. Unsubscribe is idempotent.
Feature 003+ hooks in via `TickKind.PHYSICS` and `TickKind.SHIP_UPDATE` subscriptions.

### Socket.io sector rooms

Room key format: `sector:{X}:{Y}` (1-indexed integers). Clients join on `sector:join`,
leave on `sector:leave`; Socket.io clears all memberships on disconnect (FR-008).
Error events carry `{ event, code, message }` (OUT_OF_BOUNDS, INVALID_PAYLOAD).

### Repository layout (updated)

```
galactic-empire-reborn/
  backend/
    src/
      main.ts                ← Nest bootstrap with IoAdapter + enableShutdownHooks()
      app.module.ts          ← Root module: PrismaModule, TickModule, GatewayModule, DebugController
      prisma/
        prisma.module.ts     ← @Global PrismaModule
        prisma.service.ts    ← PrismaService (extends PrismaClient + lifecycle)
      game/
        constants.ts         ← MAXX=30, MAXY=15, TICKTIME=6, TICKTIME2=1 (@see GEMAIN.H)
        tick/
          tick.module.ts     ← @Global TickModule
          tick.service.ts    ← setInterval heartbeats + subscriber Map
          tick.types.ts      ← TickKind, TickContext, TickHandler, Unsubscribe
      gateway/
        gateway.module.ts    ← GatewayModule
        game.gateway.ts      ← @WebSocketGateway sector room management
      debug/
        debug.controller.ts  ← GET /debug/tick-stats
    test/
      prisma-schema/         ← Existing 250 integration tests (feature 001)
      unit/
        tick.service.spec.ts           ← Cadence + lifecycle (fake timers)
        tick.service.subscribers.spec.ts ← Subscriber registry + error isolation
        constants.spec.ts              ← TICKTIME/TICKTIME2/MAXX/MAXY regression pins
      integration/
        prisma-lifecycle.spec.ts       ← PrismaService connect/disconnect
        game-gateway.spec.ts           ← sector:join/leave/disconnect with socket.io-client
      e2e/
        boot.e2e.spec.ts               ← Full Nest app boot (<5s), client connect, clean shutdown
```

## What does not exist yet

- Galaxy generator — feature 004
- Ship state in-memory Map — feature 003
- Command routing — feature 003
- Any gameplay logic (combat, movement, planets)
