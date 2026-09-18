# Architecture

Module map — what each part OWNS and how the pieces talk to each other.
Updated at the end of every implement session per CLAUDE.md.

> **The `src/` tree is the source of truth for names and paths.** This file
> explains responsibility and data flow; it is not an inventory. A 2026-09-05
> audit found 13 discrepancies here, almost all of them names that had moved on
> — six service classes that no longer exist, an `ai/` directory that never did,
> an onboarding state machine describing a class picker the game does not have,
> and a canon-extraction diagram naming the FORBIDDEN `GE/MSG/` copy as its
> source. Where a name here disagrees with the tree, the tree wins.
> @see `docs/README.md` — single source of truth.

## Repository layout

```
galactic-empire-reborn/
  package.json               ← npm workspace root (restructure phase 1, `restructure` branch):
                                workspaces ["packages/*", "backend", "frontend"]; ONE
                                root package-lock.json — the two per-app lockfiles it
                                replaced are gone, `npm ci` from backend/ or frontend/
                                now installs against this one
  packages/
    wire/                    ← @ge/wire — see "The wire contract" below
  backend/
    prisma/
      schema.prisma          ← Prisma schema — THE source of truth for every column
      migrations/            ← Versioned migration files (never edit after creation)
      seed/
        ship-classes.ts      ← GENERATED from canon — see "Canon pipeline" below
    src/                     ← NestJS application (see module map below)
    test/                    ← Jest test suite (run it for the count; a number here only rots)
    config/
      game.config.json       ← DEVIATIONS ONLY; defaults come from canon
    package.json             ← Backend deps + db:up/db:down/db:reset/test scripts; depends
                                on `@ge/wire` via `file:../packages/wire`
    tsconfig.json            ← TypeScript strict mode
    jest.config.ts
  frontend/
    src/                     ← React + Vite + Tailwind terminal UI
    test/                    ← Vitest test suite
  .env.example               ← DATABASE_URL, TEST_DATABASE_URL, JWT_SECRET templates
  tools/                     ← Canon extractors (see "Canon pipeline" below)
  reference/                 ← ALL READ ONLY; see reference/README.md
    ge-source/               ← The nine original C files
    ge-upstream/             ← The FULL original distribution (data files, manuals)
    wiki/                    ← Community wiki transcription
  specs/
    001-prisma-schema/ … 016-navigation-spy/  ← spec-kit feature specs
  docs/                      ← Living architecture docs (this file)
```

## The wire contract (`packages/wire`, restructure phase 1, 2026-09-10/11)

```
@ge/wire (packages/wire/)
  ├── src/events.ts    — WIRE_EVENTS: 30 server-to-client + 2 client-to-server
  │                       Socket.io event name strings, `as const` and frozen.
  │                       Frozen strings, mixed dot/colon convention kept on
  │                       purpose — see docs/DECISIONS.md 2026-09-11. Five
  │                       server-to-client names are JSDoc-flagged "RECORDED,
  │                       NOT ENDORSED" (no frontend listener today):
  │                       combat.miss, combat.mine-detonation,
  │                       cybertron.broke-off, beacon, command.notice.
  ├── src/payloads.ts  — every payload interface that travels on the wire.
  ├── src/socket.ts    — ServerToClientEvents / ClientToServerEvents, Socket.io's
  │                       typed-events generic maps, keyed by the literal
  │                       strings above.
  ├── src/index.ts     — re-exports all three, plus WIRE_CONTRACT_VERSION.
  └── dist/{cjs,esm}   — dual build: the backend is CommonJS (Jest/ts-jest),
                          the frontend is ESM (Vite) — one declaration, two
                          runtime shapes via `exports` map. Collapses to a
                          single ESM build once phase 5 moves the backend to
                          ESM (docs/DECISIONS.md 2026-09-11).

GameGateway (gateway/) — Server<ClientToServerEvents, ServerToClientEvents>,
Socket<ClientToServerEvents, ServerToClientEvents> throughout (was untyped
`Server`/`Socket`; every emit was an inline object literal before this phase).
`CommandResult.broadcasts` is now `CommandBroadcast[]`, a discriminated union
on `event` (5 members: command.notice, event.log, message.send,
player.snapshot, ship.renamed) so `dispatchBroadcast`'s switch narrows
`payload` per branch with no cast, and has an exhaustiveness-asserted
`default: never` arm.

frontend/src/ — imports ServerToClientEvents/ClientToServerEvents and every
payload type directly from `@ge/wire`. The hand-synced duplicate that used to
live at frontend/src/types/contracts.ts, and the parity test at
frontend/test/contracts-parity.spec.ts that kept it in sync, are both
DELETED — there is nothing left to keep in sync, and neither path exists any
more.
`specs/003-ship-commands/contracts/shared-types.ts` (the other historical
copy) is kept, annotated SUPERSEDED rather than deleted, per
`docs/CLAUDE.md`'s keep-the-reasoning rule.

**Known gap, not yet closed:** neither `backend/Dockerfile` nor
`frontend/Dockerfile` was updated for the new `file:../packages/wire`
dependency — their build context is still per-app, so `npm ci` fails inside
either image build today. See `docs/DECISIONS.md` 2026-09-11 and
`docs/PROGRESS.md` 2026-09-11's known issues.
```


## Canon pipeline

Original values reach the codebase by extraction, never by hand. Every table
that was once hand-transcribed had drifted, so the path is now one-directional
and pinned at both ends:

```
reference/ge-upstream/mbmgemp/GE/REL/*.MSG      the shipped 3.2e option database
                                                (NOT GE/MSG/ — that is the pre-3.2d snapshot)
        │
        ├── tools/extract-ship-classes.mjs --ts ──→ backend/prisma/seed/ship-classes.ts
        ├── tools/extract-sysop-options.mjs ──────→ SYSOP_OPTIONS[].canonDefault
        └── tools/extract-item-tables.mjs ────────→ constants/items.ts
                                                          │
                          test/balance/*-canon.balance.spec.ts
                          re-parses the .MSG INDEPENDENTLY and fails on drift
```

The conformance tests deliberately re-implement the parse rather than importing
the extractor, so a bug in the generator cannot hide behind a test that shares
it. That caught a real one immediately: `SNAME`'s trailing space is significant,
and trimming it turns `"Cyberquad " + 223` into `Cyberquad223`.

**Config resolution** is `canon default → config/game.config.json → env`, each
step clamped to the C's `numopt`/`lngopt` bounds. `game.config.json` holds
DEVIATIONS ONLY: every entry must be a declared deviation carrying a written
reason, must actually differ from canon, and must sit inside the C bounds —
enforced by `sysop-options-canon.balance.spec.ts`. Restating a value nobody
chose is how the previous drift stayed hidden.

**Private config loaders are a smell.** `droid.config.ts`, `attack.config.ts`,
`cloak.config.ts` and `galaxy.config.ts` each kept their own defaults for values
the option table already owned, and each had drifted. They now read
`GAME_CONFIG` and keep only their env override.

## Prisma layer

`backend/prisma/schema.prisma` is the single source of truth for the database schema.
All schema changes go through `prisma migrate dev --name <name>` — migration files are
committed alongside the schema change and deployed via `prisma migrate deploy` in CI.
`PrismaService` extends `PrismaClient` and is provided globally via `@Global() PrismaModule`.

`PrismaService` resolves its connection string through `src/prisma/database-url.ts`
rather than letting Prisma read `DATABASE_URL` implicitly. Under Jest
(`JEST_WORKER_ID` set, or `NODE_ENV=test`) it binds to `TEST_DATABASE_URL`, and
throws if that variable is missing instead of falling back to the dev database.
This is a data-safety guard: ~20 specs build a testing module around
`PrismaModule` and then truncate tables, so without it a full `npm test` run
destroyed development game state.

## Database

Postgres 16 runs on the host machine (not in Docker). Two databases owned by role `ge`:

- `ge` — development database
- `ge_test` — test database (reset on every `npm test` run via `globalSetup`)

Set up locally with:

```sql
CREATE ROLE ge WITH LOGIN PASSWORD 'ge' CREATEDB;
CREATE DATABASE ge OWNER ge;
CREATE DATABASE ge_test OWNER ge;
```

Connection strings are provided via environment variables:
- `DATABASE_URL` — used by Prisma CLI and (eventually) the NestJS app
- `TEST_DATABASE_URL` — used by the Jest test harness

## NestJS application (feature 002)

```
AppModule (app.module.ts)
  ├── PrismaModule (prisma/) — @Global(), exports PrismaService
  │     ├── PrismaService — extends PrismaClient, connects on init, disconnects on destroy
  │     │     └── datasource URL from database-url.ts (test runs bind to TEST_DATABASE_URL)
  │     └── database-url.ts — resolveDatabaseUrl(): dev vs test DB selection
  ├── HealthController (health/) — GET /health, unauthenticated
  │     └── 200 {status,database,uptime} | 503 when Postgres unreachable
  │     └── backs the docker-compose backend healthcheck
  ├── TickModule (game/tick/) — @Global(), exports TickService + SectorTransitionSubscriber
  │     ├── TickService — raw setInterval(1000) + setInterval(6000) in onModuleInit;
  │     │                 clearInterval in onModuleDestroy; pluggable subscriber registry
  │     └── SectorTransitionSubscriber — subscribes physics tick; holds prev-tick integer-cell
  │                                       snapshot; emits batched physics.sector-transition via
  │                                       EventEmitter2 iff ≥1 cell change (all ship types)
  ├── GatewayModule (gateway/) — exports GameGateway
  │     └── GameGateway — @WebSocketGateway; handshake resolves active ship (lowest shipno);
  │                        emits welcome command:result; handles sector:join/leave;
  │                        dispatches `command` events → CommandRouterService → command:result;
  │                        emitCommandResult() splits scan results: header-only → command:result (unicast),
  │                        full grid payload → scan:render (unicast, feature 015);
  │                        emits player.snapshot (joining socket), player.joined / player.left (all),
  │                        physics.sector-transition (all); enforces single-socket-per-ship via registry
  │     └── ConnectedShipsRegistry — @Injectable singleton; byShipId + bySocketId maps;
  │                                   upsert(shipId, socketId) returns prior socketId for takeover;
  │                                   remove(socketId) returns shipId for player.left emission;
  │                                   list() returns ConnectedPlayer[] for snapshot payload
  ├── AuthModule (auth/) — HTTP REST auth endpoints (register/login)
  │     ├── AuthService — register(username, password): bcrypt cost-12 hash + User insert;
  │     │                  login(username, password): case-insensitive lookup + bcrypt compare;
  │     │                  both throw typed errors (USERNAME_TAKEN, INVALID_CREDENTIALS)
  │     ├── AuthController — POST /auth/register → 201 {token}, POST /auth/login → 200 {token};
  │     │                     400/401/409 on failures; JWT signed with JWT_SECRET (30-day expiry)
  │     └── WsAuthGuard — validates `socket.handshake.auth.token` JWT before handleConnection runs;
  │                        disconnects with AUTH_REQUIRED error if token is absent or invalid
  ├── OnboardingModule (game/onboarding/) — new-player and rename flows
  │     ├── OnboardingService — single-step name flow. Public API:
  │     │                        buildClassListPayload(), validateClassReply(),
  │     │                        validateNameReply(name), finalize(userid, shipname).
  │     │                        There is no class picker: a shipless captain goes straight
  │     │                        to the name prompt. The gateway owns the flow, not a
  │     │                        per-socket state machine in this service.
  │     ├── RenameService — rename(userid, shipno, newName): validates format (1-19 printable, no spaces),
  │     │                    checks case-insensitive uniqueness, updates DB + in-memory; case-identical = no-op
  │     └── OnboardingState — declared in gateway/game.gateway.ts, not here:
  │                          { step: 'AWAITING_NAME' }
  ├── MailModule (game/mail/) — exports MailInboxService
  │     ├── MailInboxRepository — Prisma queries on MailStat; findByUserid (stamp DESC, msgno DESC, class DESC); deleteOne (returns false on P2025)
  │     ├── MailInboxService — list(userid)/resolveIndex(userid,index)/deleteByIndex(userid,index); R3 sender resolution (ShipStateService → raw dtime → "(system)"); R5 re-query per call
  │     └── mail-render.ts — pure functions classLabel/formatListLine/formatDetail; no DI
  │           (the listing is reached by bare `rea`; `mai` is maintenance, per canon)
  ├── TeamModule (game/team/) — exports TeamService, TeamRepository
  │     ├── TeamRepository — Prisma queries on Team/User: findByNameLower (case-insensitive name lookup),
  │     │                     insertTeam (creates row with teamcount=1/teamscore=0/secret=""/flag=0),
  │     │                     liveCountsGroupBy (User GROUP BY teamcode for live member counts),
  │     │                     findTeamsByCodes (batch fetch by teamcode list — no N+1),
  │     │                     getMaxTeamcode (MAX aggregate, 0n when empty)
  │     ├── TeamService — create({ship,name,password}): Prisma $transaction(getMaxTeamcode+1 → insertTeam → User.update),
  │     │                  retries up to 3× on P2002; mirrors ShipState.teamcode on success.
  │     │                  joinByPassword({ship,name,password}): case-insensitive name, case-sensitive password.
  │     │                  list(): two-query leaderboard (liveCountsGroupBy → findTeamsByCodes), sorted teamscore DESC/teamcode ASC, capped 20.
  │     └── team-render.ts — renderTeamList(entries): header + fixed-width rows; "No teams have been formed." when empty.
  │                           renderTeamCell(name|null): 12-char fixed-width column; truncate 11+… for >12; "---" for null/0/missing.
  ├── CommandsModule (game/commands/) — exports CommandRouterService
  │     ├── CommandRouterService — alias-keyed registry; keyword lowercased, args preserve casing; minArgs guard
  │     ├── ScanHandlerService — @Injectable scan/sc handler; reads ShipClass.scanRange;
  │     │                         subcommand dispatch: lo / ra <1-9> / se / sh / pl / lo full;
  │     │                         owns per-socket scantab Map<letter, shipKey> (lazy init, cleared on
  │     │                         disconnect/death/dock); builds scantab from nearest-first ship ordering;
  │     │                         emits scan:render (unicast) for grid payload; command:result for headers
  │     ├── ReportHandlerService — @Injectable report/rep handler; reads ShipClass.typeName/hasCloak;
  │     │                           builds multi-line nav/sys/cargo/wpns read-out
  │     └── plain Command objects: rotateCommand, impulseCommand
  │         (warp is WarpHandlerService, an @Injectable — see below)
  ├── ShipModule (game/ship/) — exports ShipStateService, MaintenanceService, ShipTickService
  │     ├── ShipStateService — owns in-memory Map<"userid:shipno", ShipState>; hydrates from
  │     │                       Postgres on init; subscribes SHIP_UPDATE tick → async dirty flush;
  │     │                       get/mutate/findByUserid/findAllShips/findByName
  │     ├── MaintenanceService — extracted gate logic + cash debit + repair-queue mutation from
  │     │                         MaintHandlerService; public API: evaluateGates(ship, passwordArg?)
  │     │                         and runMaintenance(ship, passwordArg?); shared by command handlers
  │     │                         and ShipTickService; JSDoc @see GECMDS.C:cmd_maint
  │     └── ShipTickService — subscribes TickKind.SHIP_UPDATE; per-ship processShip pipeline:
  │                            decideOverspeed → apply deltas + emit WARPBRK/WARPSPD/WARPFAST;
  │                            autoRepair gate → MaintenanceService.runMaintenance;
  │                            autoShield gate → decideAutoShield → shieldstat=1 + clear trigger
  └── DebugController (debug/) — GET /debug/tick-stats → {shipUpdate, physics}

### Auth & onboarding flow

```
POST /auth/register  →  AuthService.register()  →  bcrypt hash + DB insert  →  JWT
POST /auth/login     →  AuthService.login()     →  bcrypt compare           →  JWT

Socket connect  →  WsAuthGuard validates JWT  →  GameGateway.handleConnection()
  →  seat cap: ≥ MAXPLRS other pilots in flight  →  notice + disconnect
  →  GameGateway.presentShipEntry()
       ├─ 1 flyable ship   →  boardShipAndWelcome  →  welcome command:result
       ├─ ≥2 flyable ships →  prompt:ship-select (does NOT board)
       │      client replies: prompt:reply {value: index}  →  board the chosen hull
       └─ 0 flyable ships  →  prompt:ship-name
              client replies: prompt:reply {value: shipName}
                →  OnboardingService.finalize()  →  create Ship  →  player.snapshot
```

### GameGateway broadcast resolution

`CommandResult.broadcasts` decouples handlers from Socket.io. After dispatching a command,
`GameGateway.processBroadcasts()` iterates the array:
- `room === '__player_snapshot__'` sentinel → `server.emit('player.snapshot', registry.list())`
- `room === 'galaxy'` → `server.emit(event, payload)` (all connected clients)
- `room === 'hail'` → iterate all sockets; skip if ShipState has `cloak === 1`
- Any other room → `server.to(room).emit(event, payload)` (sector-scoped)

This allows `RenameHandlerService`, `SenHandlerService`, and `TeaHandlerService` to
trigger sector, galaxy, hail, and snapshot broadcasts without importing the Socket.io server.
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

Room membership: every path that boards a ship calls `joinPlayerRooms`, which joins
`sector:{x}:{y}` (sector-scoped events — combat, radio on a sector frequency, ships entering and
leaving, self-destruct warnings) and `user:{userid}` (per-captain alerts — planet under attack,
cloak collapse). The onboarding finalize path used to hand-roll its own welcome and skip both,
leaving a first-session pilot deaf until they reloaded.

The inverse is `ConnectionLifecycleService.detachFromWorld`, and every path that stops a captain
flying without dropping the connection goes through it: `x` (`maybeExitGame`), `abandon`
(`maybeReenterShipEntry`) and death (`GameGateway.recoverAfterDeath`). It leaves every room but the
socket's own id room, drops the `ConnectedShipsRegistry` entry and broadcasts `player.left`, clears
`client.data.activeShipNo`, and pushes an empty `player.snapshot`. All three paths previously undid
the ship half and none of the socket half, so a captain at the ship-select screen was still being
fed the traffic of the sector they had left.

Client listeners: `command:result` carries replies to typed commands; `event.log` is the catch-all
for unsolicited notices and `message.send` carries radio traffic. All three must have listeners in
`App.tsx` — the gateway emitting is not enough, and a missing listener is silent.

Broadcast filtering: `broadcasts[]` entries may carry `freq` (deliver only to ships tuned to that
frequency on one of their three channels — C's `outsect`/`outwar` frequency argument) and
`excludeSelf` (drop the sender, C's `usrnum` exclude). A `hail` broadcast carries no frequency and
reaches every uncloaked socket. `excludeSelf` applies on all five dispatch branches — it was
honoured only on the three that filter recipients themselves, so the two that take a room as given
(`galaxy`, `sector:{x}:{y}`) silently dropped it, which is what let `x` and `clo off` narrate a
pilot's own departure and decloak back to them.

Re-entry path: a handler that leaves the captain shipless returns
`CommandResult.reenterShipEntry: true`. The gateway then re-runs `presentShipEntry`, which resolves
the usable fleet (abandoned hulls excluded) and lands the captain in onboarding, straight aboard, or
at the ship-selection menu. Used by `abandon`.

Follow-up path: a handler that asked the player an open question returns
`CommandResult.expectFollowup: '<verb>'`. `emitCommandResult` parks the verb on
`client.data.pendingFollowup`; the next `command` event is re-dispatched as `<verb> <answer>`
instead of being routed on its own, then the parked verb is cleared. One-shot; an empty answer
cancels. Used by `land` on an unowned planet (name prompt) — without it the answer hits the command
router and a planet called "New Terra" matches the `new` verb.

### ShipStateService in-memory Map

`Map<string, ShipState>` keyed by `"userid:shipno"`. On SHIP_UPDATE tick (1s), iterates
dirty entries, calls `prisma.ship.update()` per dirty ship, clears `dirty` flag.
Error per-entry is caught and logged; other ships are not affected.
`mutate(userid, shipno, fn)` calls fn in-place and sets `dirty = true`.

### Socket.io sector rooms and handshake

Handshake: WsAuthGuard validates the JWT and disconnects on failure — there is no
NO_USER or NO_SHIP path. A shipless captain is prompted for a name rather than
disconnected, and ≥2 ships prompts for a choice rather than binding the lowest.
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
            who.handler.ts    ← lists all active non-cloaked ships sorted by name (US1)
            dat.handler.ts    ← full stat block for a named ship; team name via Prisma (US2)
            ros.handler.ts    ← leaderboard top-N human players, AI excluded (US3)
            fre.handler.ts    ← sets channel A/B/C frequency; validates range; sets dirty (US5)
            sen.handler.ts    ← sends message to hail/sector/galaxy room (US4)
            tea.handler.ts    ← join/leave/show team; updates User+ShipState; snapshot (US6)
            _freq-thresholds.ts ← FREQ_HAIL=0, FREQ_SECTOR_MAX=19999, FREQ_GALAXY_MIN=20000
            cloak.handler.ts  ← on/off; energy gate; ramp init to CLOAK_RAMP_INIT=1 (013)
            maint.handler.ts  ← orbit+pop+cash gates; 200 cr or 2500 cr Zygor; repair queue (013)
            transfer.handler.ts ← ship-to-ship atomic cargo/gold; user:${uid} broadcast (013)
            jettison.handler.ts ← numeric|ALL amount; items permanently lost (013)
            set.handler.ts    ← auto-shield/auto-repair/scannames/scanhome flags; set ? listing (013/015)
            destruct.handler.ts ← sets ship.destruct=20; NZ+already-active gates (013)
            abort.handler.ts  ← clears destruct; sector broadcast if destruct<10 (013)
            abandon.handler.ts ← status=3; clears destruct; detaches activeShipNo (013)
            _item-keywords.ts ← resolveItemKeywordByName(); gold synonym for I_GOLD
          cloak.config.ts     ← CLOAK_ENERGY_USE DI token + loadCloakEnergyUse() factory
          _ship-management-constants.ts ← COUNTDOWN=20, CLOAK_RAMP_*, MAINT_COST_*, SHIP_STATUS_ABANDONED=3
          ship-management-tick.service.ts ← PHYSICS tick; cloakTick (ramp+drain); destructTick (countdown→boom)
          helpers/
            ai-userid.ts      ← isAiUserid(userid): Cybrg-* | @Droid-* detection
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
      types/contracts.ts     ← EventLogLine, ScanCell, ScanRenderEvent, CommandRequest/ResultPayload, grid constants
      socket/
        socketClient.ts      ← singleton io() + sendCommand/onCommandResult/onError
        useSocket.ts         ← useSocket() React hook, ConnectionStatus
        useScanRender.ts     ← subscribes to scan:render; maintains scan cards with overwrite/append mode
      components/
        ConnectionIndicator.tsx
        EventLog.tsx
        CommandInput.tsx
        ScanMap.tsx
        ScanPanel.tsx        ← renders 30×15 monospace grid with colour; optional side panel (sca lo full)
      App.tsx                ← 3-region terminal UI; ScanPanel mounted adjacent to ScanMap
      main.tsx
    test/                    ← Vitest tests (feature 015 added ~10 new frontend suites)
```

  └── GalaxyModule (game/galaxy/) — exports GalaxyService
        └── GalaxyService — generates the universe square, -UNIVMAX..+UNIVMAX on both
            axes (201×201 = 40,401 sectors at our UNIVMAX=100), in one Postgres transaction
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
  └── PlanetTickService  — subscribes to TickKind.PLANET_UPDATE; sweeps every PLANTIME (55s);
                            a planet is due when PLANTOCK (30 min) has elapsed since its own
                            Planet.lastTickAt, and at most MAXTIC (20) run per sweep;
                            the schedule is a PERSISTED column, not process state — an in-memory
                            map made every planet due at boot and gave the galaxy a free
                            PLANTOCK per restart (DECISIONS.md 2026-09-06);
                            calls TickService.startPlanetUpdateTimer(PLANTIME * 1000)
```

`CommandsModule` imports `PlanetModule`, adding:
- `OrbitHandlerService` (orbit/orb) — resolves sector planets via GalaxyService; auto-orbits single planet; pick-list for multi; sets ship.where = 10+plnum
- `AdminHandlerService` (admin/adm) — `adm claim` claims an unowned planet (name validation 1-19
  printable ASCII) and password-checks other-owned planets (none/team/exact); the rest of the
  planet administration menu lives here too. There is no `land`/`lan` command, in this port or in
  canon's command table (GECMDS.C:120-171).
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
(qty formula × envFact × taxfact × optional cash-boost) → tax accrual. The revolt
branch (FR-028) and both halves of `check_spy` live in `PlanetEconomyService`,
which wraps this pure function.

## PhysicsModule (feature 006a)

```
PhysicsModule (game/physics/)
  ├── ShipClassCacheService — hydrated once on boot from prisma.shipClass.findMany;
  │                            Map<classNumber, {maxAcceleration, maxWarp}>; sync getters
  │                            consumed by PhysicsTickService and WarpHandlerService
  ├── PhysicsTickService    — subscribes to TickKind.PHYSICS (6s); per ship advanceOne():
  │                            (1) skip destroyed; (2) if not orbit/docked, run
  │                            rotate→accel→move→maintenance; (3) unconditionally tick
  │                            countdowns (hypha, cantexit). Per-ship try/catch logs and
  │                            increments getFaultCount() on fault; batch continues.
  │                            Iterates ships in ascending shipKey order (FR-019).
  │                            Emits typed events on EventEmitter2:
  │                              physics.sector-transition (on floor(coord) change)
  │                              physics.hyperspace        (on warp-threshold crossing)
  └── physics-math.ts       — pure: rotationStep, accelerationStep, positionIntegration,
                                tryEnergyDebit, sectorOf, normalizeHeading
```

Tick → physics flow:
```
TickService (6s) → PhysicsTickService.advanceAll(ctx)
   └─ for each ship in shipKey order:
        ShipStateService.mutate(...)  (sets dirty for the 1s flush)
        EventEmitter2.emit(physics.sector-transition | physics.hyperspace)
```

`WarpHandlerService` (replaces the old plain `warpCommand` const) injects
`ShipClassCacheService` to evaluate the full five-gate sequence:
WARP01 (class.maxWarp=0) → WARPSPD2 (topspeed=0) → WARP02 (negative) →
WARP03 (>topspeed+floor(topspeed/2)) → WARP04 (overspeed warning + apply) → normal apply.

## CombatModule (feature 006b)

```
CombatModule (game/combat/)
  ├── CombatTickService    — subscribes to TickKind.PHYSICS (after PhysicsTickService, enforced by
  │                          CombatModule importing PhysicsModule so onModuleInit fires later);
  │                          per-tick passes: phaser-reload, cantexit decrement, decoy/jammer expiry,
  │                          torpedo travel, missile travel, mine sweep, kill resolution.
  │                          Each ship wrapped in try/catch (SC-005); batch continues on per-ship fault.
  │                          On init: hydrates MineRegistry from MineRepository.findAllActive().
  ├── MineRegistry         — in-memory Map<mineId, MineState>; hydrate/add/remove/tickAll/sweepCandidates.
  │                          Pure logic over a Map; no Prisma calls inside.
  ├── MineRepository       — Prisma wrapper: findAllActive(), create(), delete(). @see GECMDS.C:cmd_mine
  ├── random.port.ts       — Random interface (next(): number), RANDOM injection token,
  │                          MathRandomAdapter (production), Mulberry32Adapter (seeded, for tests)
  └── combat-math.ts       — Pure, side-effect-free functions (all randomness via injected Random):
                               cdistance, lineOfFire, phaserDamage, tonFact, shieldhit, randamage,
                               mineFalloff, decoyIntercept, jammerCounter, damstr
                             @see GEFUNCS.C:cdistance, firephas, shieldhit, killem
```

### Combat command handlers (game/commands/handlers/)

```
phaser.handler.ts   — `pha <bearing> <percent>`: validates phasrtype/charge/bearing/percent/jammer;
                       hyper-phaser at warp; lineOfFire arc + PHABIAS widening; emits COMBAT_PHASER_FIRED;
                       mutates victim shield/damage; emits COMBAT_HIT / COMBAT_MISS.
torpedo.handler.ts  — `tor <target>`: validates class-mount, warp/cloak/cargo gates, target ltorps[]
                       slots (lives on target, GECMDS.C:1191-1202); allocates slot on target.
missile.handler.ts  — `mis <target> <charge>`: validates class-mount, charge range, energy cost;
                       allocates slot on target.lmissl[].
mine.handler.ts     — `mine`: MineRepository.create + MineRegistry.add; decrements cargo.
zipper.handler.ts   — `zip`: deletes mines in scan range via repo+registry; no self-damage.
decoy.handler.ts    — `decoy`: allocates lowest zero slot in decout[], set to DECOYTIME.
jammer.handler.ts   — `jam`: area-effect on all ships within scanrange (including self); sets
                       jammer = JAMTIME × (1 − distance/scanrange) on each.
sys.handler.ts      — `sys unjam`: clears carrier's jammer to 0.
lock.handler.ts     — `lock <name>`: resolves ship by name/prefix; lazy `@` clear on use.
shield.handler.ts   — `shi up|dn`: toggles shieldstat; no auto-raise after torpedo.
flux.handler.ts     — `flux`: consumes one flux pod, sets energy = ENGYMAX.
```

### Event bus topology

```
Emitters (combat-tick.service.ts, phaser.handler.ts):
  COMBAT_PHASER_FIRED  → GameGateway: sector-scoped (firer's sector room)
  COMBAT_HIT           → GameGateway: sector-scoped (victim's sector room)
  COMBAT_MISS          → GameGateway: sector-scoped (firer's sector room)
  COMBAT_DECOY_INTERCEPT → GameGateway: sector-scoped (defender's sector room)
  COMBAT_MINE_DETONATION → GameGateway: sector-scoped (mine's sector room)
  COMBAT_SHIP_DESTROYED  → GameGateway: galaxy-wide (server.emit — all connected clients)

Listener (game.gateway.ts):
  @OnEvent(COMBAT_*) → emits to Socket.io room (sector or galaxy-wide)

Player-presence wire events (feature 010):
  player.snapshot          → joining socket only (client.emit); full ConnectedPlayer[] snapshot
  player.joined            → all clients (server.emit); ConnectedPlayer payload
  player.left              → all clients (server.emit); { shipId } payload
  physics.sector-transition → all clients (server.emit); batched SectorTransition[] per tick
    Source: SectorTransitionSubscriber subscribes physics tick via EventEmitter2;
            GameGateway @OnEvent(PHYSICS_SECTOR_TRANSITION_EVENT) forwards to all clients

Scan wire events (feature 015):
  command:result           → issuing socket only; header lines for scan subcommands
  scan:render              → issuing socket only; ScanRenderEvent:
                             { kind, mode, cells, header, sidePanel? }
    kind:   'ra' | 'se' | 'lo' | 'lo-full'   — which scan produced it
    mode:   'overwrite' | 'append'           — driven by SCANHOME User.options[1];
                                               'overwrite' homes the cursor
    cells:  ScanCell[] — SPARSE. Only occupied cells are sent (ships, planets,
            mines, the self marker) within the 30×15 viewport, not 450 entries.
    header: string — the scan's own heading line
    sidePanel: SidePanelRow[] — only for 'lo-full'
```

### Frontend state (feature 010)

```
usePlayerList (frontend/src/state/usePlayerList.ts)
  └── useReducer hook; internal Map<shipId, ConnectedPlayer>
  └── actions: SNAPSHOT (replace-all), JOIN (upsert), LEFT (delete), TRANSITION (update sector)
  └── output: sorted ConnectedPlayer[] (alphabetical by name, FR-018)
  └── fed by useSocket player-event subscriptions

useSocket (frontend/src/socket/useSocket.ts)
  └── wraps socket singleton; maps lifecycle events → ConnectionStatus
  └── accepts optional playerDispatch → subscribes player.snapshot/joined/left + physics.sector-transition + ship.renamed
  └── derives localShipId from player.snapshot (first entry with non-null shipId)
  └── onboardingPrompt state: null (normal play) or { type: 'class-list' | 'ship-name', payload }
  └── emitPromptReply(value): emits prompt:reply to server
  └── clears onboardingPrompt on player.snapshot (onboarding complete)

usePlayerList (frontend/src/state/usePlayerList.ts)
  └── actions: SNAPSHOT, JOIN, LEFT, TRANSITION, RENAMED
  └── RENAMED: updates name for matching shipId without full refresh

Components (frontend/src/components/)
  ConnectionBanner    ← renders top banner for connecting/disconnected/reconnecting; null when connected
  PlayerListPanel     ← renders sorted ConnectedPlayer[] rows with name, sector (x,y)
  ScanMap             ← 30×15 ASCII grid; clears on physics.sector-transition for local ship
  EventLog            ← sticky-scroll log; capped at 500 entries
  CommandInput        ← monospace input with 20-entry ↑/↓ history

Auth / onboarding components (frontend/src/auth/, frontend/src/onboarding/)
  AuthScreen          ← register/login form; calls /auth/register; stores JWT via tokenStore.setToken
  PreFlightScreen     ← the whole screen while onboardingPrompt is non-null: banner, TitleBar and one
                         prompt, and NONE of the game. Hosts the two below
  ShipSelectPrompt    ← rendered on prompt:ship-select; lists the fleet, emits prompt:reply with the
                         chosen index. Also reached by `x` with a single hull, which is where logout lives
  ShipNamePrompt      ← rendered when onboardingPrompt.type === 'ship-name'; emits prompt:reply; shows
                         role="alert" on error="name-taken"
  tokenStore          ← localStorage wrapper: getToken / setToken / clearToken (key: 'ge_jwt')

App.tsx flow:
  getToken() present → connectSocket(); onboardingPrompt set → PreFlightScreen, else Terminal
  getToken() absent  → render AuthScreen → onAuthenticated → setToken + connectSocket + re-render Terminal

The event log is CLEARED when ship entry begins — on the arriving prompt, not on the answer,
because `player.snapshot` clears the prompt and boarding emits the WELCOM `command:result` before
it. Canon prints WELCOM on every boarding in tossingegame,
GEFUNCS.C:172 `prfmsg(WELCOM,waruptr->userid);`, and its main-menu redraw
kept the repeats apart; our single scrollback stacked them. The cost is that a captain killed
mid-session loses the YOURDEAD lines when they board the replacement.
@see docs/DECISIONS.md 2026-09-18
```

### Planet revolt (game/planet/planet-economy.service.ts)

Added to the economy tick: when `(taxrate/120) × 0.35 × men > troops` AND the Random roll
hits, troops are reduced, a `MAIL_CLASS_DISTRESS` row is queued, and `ownerUserId` is
cleared. No combat events emitted. @see GEPLANET.C:341-380.

## CybertronModule (feature 007)

```
CybertronModule (game/cybertron/)
  ├── CybertronTickService    — subscribes to TickKind.PHYSICS (after CombatTickService, enforced
  │                            by CybertronModule importing CombatModule); per-tick passes:
  │                            (1) modulo-30 spawn slot (runSpawnSlot → repository.createSpawn);
  │                            (2) per-ship cybLives loop (max CYBMAXPERTICK=2 activations/tick);
  │                            Fault-isolation: each cybLives is wrapped in try/catch; a throwing
  │                            ship logs the error and the batch continues (Constitution III).
  │                            On boot: onApplicationBootstrap → repository.hydrateAll().
  │                            Listens: combat.ship-destroyed → transferCybertronGold (Cybrg-* only).
  │                            Emits: cybertron.target-acquired, cybertron.taunt, cybertron.broke-off.
  ├── CybertronRepository     — Prisma wrapper: hydrateAll (loads all Cybrg-* ships into
  │                            ShipStateService + clamps cash), createSpawn (inserts User+Ship
  │                            rows + clamps cash), flushShipsImmediate, flushUsersImmediate,
  │                            transferGold (atomic tx: zero victim cash, increment attacker),
  │                            clampCybertronCash (cap to CYB_MAXCASH=2_000_000 at every boundary)
  ├── CybertronDebugController — GET /debug/cybertron-stats (dev-only, NODE_ENV≠production):
  │                              per-class population snapshot vs. tot_to_create targets
  ├── cybertron.config.ts     — CybertronClassConfig interface; CYBERTRON_CLASS_DEFAULTS for
  │                            classes 21–25 (Cybertron Scout/Cyberquad/Base Star/Sartern);
  │                            buildCybertronClassConfigs() merges env overrides
  ├── cybertron-events.ts     — CYBERTRON_EVENT const map + typed payload interfaces
  ├── cyb-decisions.ts        — pure AI decision functions (all randomness via injected Random):
  │                            pickSpawnClass, randomInitLoadout, randomCybSkill, pickPursuitBand,
  │                            cybwhoops, gebemean, rollTorpedoCount
  ├── taunt-pool.ts           — band selection over the generated canon catalogue
  │                             (cyb-taunt-catalog.generated.ts); pickTaunt(rand, class, band)
  └── constants (game/constants.ts additions) — CYBTICKTIME=6, CYBSLO=3, CYB_ALLOW=35,
                               CYB_MAXCASH=2_000_000, CYB_BE_NICE=30, CYB_BE_EASY=60,
                               CYB_BREAKOFF=500, CYB_MINDAM=75, CYBMAXPERTICK=2,
                               CYB_TOUGH_0=0, CYB_TOUGH_1=1, CLASSTYPE_CYBORG=2
```

### Cybertron AI per-ship state machine (cybLives)

```
onPhysicsTick (every 6s)
  └─ for each AUTO (status=2) ship, ship.tick--; if tick===0:
       cybLives(ship, ctx) [try/catch — fault isolated]
         ├─ energy += CYB_ALLOW (allowance credit)
         ├─ cybUpdateDb — decrement cybupdate; randomize direction if idle
         ├─ if jammer===0: runEngagementScan
         │     ├─ Zipper branch (hasZipper + minesnear>0 + inventory>0 → retreat)
         │     ├─ Breakoff (non-quad, 1-in-500 per visible target → disengage)
         │     ├─ Warp-fire path (both in hyperwarp: gebemean+range gate → cybFirePhaser)
         │     └─ Normal-space path (point-toward + canAttack gate → cybAttack | cybAnnoy)
         │           cybAttack: cybwhoops gate → cybFirePhaser + rollTorpedoCount torpedoes
         │           cybAnnoy: pickTaunt → emit cybertron.taunt
         │           cybLayDecoys: cybwhoops gate → fill empty decout slot
         ├─ else (jammed): lay mine + randomize course
         ├─ cybCheckDamage — damage>75: lay mine + deploy jammer + randomize heading
         └─ cybCheckLockon — holdcourse countdown; validate/update target; hyperwarp pursuit bands
```

### Cybertron event bus topology additions

```
Emitters (cybertron-tick.service.ts):
  cybertron.target-acquired  → GameGateway: sector-scoped
  cybertron.taunt            → GameGateway: sector-scoped (target's sector)
  cybertron.broke-off        → GameGateway: sector-scoped (target's sector)
  combat.phaser-fired        → (existing COMBAT_PHASER_FIRED path via EventEmitter2)
  combat.hit                 → (existing COMBAT_HIT path)

Listener (cybertron-tick.service.ts):
  combat.ship-destroyed (victimUserid starts with 'Cybrg-') → transferCybertronGold
```

## InvariantsModule (feature 022 — fidelity audit v2)

```
InvariantsModule (game/invariants/)
  ├── InvariantRegistry  — in-process registry; register() / runAll(world) / count().
  │                         Per-invariant try/catch — a throwing invariant surfaces as a
  │                         HIGH violation rather than crashing the tick.
  ├── invariants.types.ts — Severity, Violation, WorldSnapshot, Invariant interfaces.
  ├── harness.ts          — InvariantRegistry implementation.
  ├── combat-ranges.invariants.ts    — weaponFireRangeRespected
  ├── ai-targeting.invariants.ts     — aiCannotFireAcrossMap, aiRespectsNeutralZone
  ├── scanners.invariants.ts         — scanRangeMatchesScanType
  └── ship-persistence.invariants.ts — inMemoryShipMatchesDb, noOrphanShipState
```

Wired into `TickService` via a post-physics hook gated by `INVARIANTS_RUNTIME=1`
(off in prod by default). The hook calls `snapshotForInvariants()` — a
snapshot-provider pattern that pulls slices from `ShipStateService`,
`CombatTickService`, and the AI tick services. Violations are logged at
`warn` level with `rule(severity):detail`. The `dbShips` slice is gated
behind a second flag `INVARIANTS_DB_CHECK=1` (deferred runtime wiring —
see finding P-021). Jest specs under `backend/test/invariants/` are the
authoritative coverage; runtime invocation is a defense-in-depth tripwire.

## MidnightModule (feature 009)

```
MidnightModule (game/midnight/)
  ├── MidnightService     — @Cron('0 0 * * *') scheduledRun() + manual run() entry point.
  │                         Acquires pg_try_advisory_lock before opening a single
  │                         prisma.$transaction() that wraps all four phases:
  │                           Phase 1: reset user accumulators (planets/score/plscore/population → 0)
  │                           Phase 2: processOwnedPlanets — accumulate per-owner deltas in-memory,
  │                                    batch-update users, batch-insert MailStat production reports
  │                           Phase 3: purgeMail — delete mail older than mailDays days
  │                                    and mail to *-prefixed recipients
  │                           Phase 4: setUserScores (raw SQL: score = plscore + klscore),
  │                                    team reconciliation (zeroAllTeams → countTeamMembersAndResetOrphans
  │                                    → applyPerMemberTeamScore → markEmptyTeamsRemoved),
  │                                    assignRosterPositions (raw SQL ROW_NUMBER window fn)
  │                         Advisory lock is always released in `finally`.
  │                         onApplicationBootstrap: checks MidnightRun ledger; runs if absent.
  │                         Exports MidnightLockHeldError for 409 mapping in controller.
  ├── MidnightRepository  — Prisma helpers for all four phases; all methods accept a TxClient.
  │                         processOwnedPlanets: bulk-loads planets + valid user IDs in two
  │                         queries, accumulates in-memory, batch-updates via Promise.all,
  │                         batch-inserts MailStat rows in chunks of 50 (SC-005 budget).
  ├── AdminMidnightController — POST /admin/midnight/run, guarded by AdminTokenGuard.
  │                             Returns 202 with PhaseCounters + durationMs on success,
  │                             409 on MidnightLockHeldError, 401/503 from the guard.
  ├── AdminTokenGuard     — Returns 503 if MIDNIGHT_ADMIN_TOKEN env unset; 401 on mismatch.
  │                         Uses timingSafeEqual for constant-time comparison.
  ├── midnight-run.ledger.ts — hasRunForToday / recordRun helpers; idempotency probe against
  │                            MidnightRun table (PK: runDate @db.Date).
  ├── midnight.constants.ts  — TEAMBONU, PLTVCASH, PLTVDIV, ADVISORY_LOCK_KEY, mail class constants.
  ├── midnight.config.ts     — loadMidnightConfig(env): reads MIDNIGHT_MAILDAYS, MIDNIGHT_CHGLOSER.
  ├── value-pl.ts            — valuePlanet(): pure BigInt scorer for one planet row.
  ├── rank-roster.ts         — rankRoster(): pure fn, assigns rospos ranks in-memory.
  └── mailstat-builder.ts    — buildProductionMailStat(): builds MailStat insert payload.
```

### Midnight pass phases (GEMAIN.C:1084-1335)

```
1. resetUserAccumulators    → User.updateMany (planets/score/plscore/population = 0)
2. processOwnedPlanets      → bulk-load owned planets + valid user IDs →
                               in-memory delta map → Promise.all(User.update) →
                               MailStat.createMany (chunks of 50)
3. purgeMail                → Mail.deleteMany (by age) + Mail.deleteMany (*-prefix)
4. setUserScores            → raw SQL: UPDATE User SET score = plscore + klscore
   zeroAllTeams             → Team.updateMany (teamcount=0, teamscore=0)
   countTeamMembersAndResetOrphans → per-user: increment teamcount or reset orphan
   applyPerMemberTeamScore  → per-user: teamscore += TEAMBONU + (score / teamcount)
   markEmptyTeamsRemoved    → Team.updateMany (removed=true for teamcount=0 teams;
                              teamcode is the PK, so the marker gets its own column)
   assignRosterPositions    → raw SQL: ROW_NUMBER() OVER (ORDER BY score DESC, userid ASC)
```

### ChgLoser (cash-penalty on PvP kill)

`PlayerScoreService` (game/player/) listens to `COMBAT_SHIP_DESTROYED`. When both
attacker and victim are non-AI players and `chgLoserPercent > 0`, calls
`PlayerScoreRepository.applyCashPenalty()` — a Prisma transaction that transfers
`floor(loser.cash × percent / 100)` from loser to killer. Rate is injected via
`CHGLOSER_PERCENT` token from `midnight.config.ts`.

```
PlayerScoreModule (game/player/)
  ├── PlayerScoreService    — COMBAT_SHIP_DESTROYED listener; AI detection via prefix regex
  ├── PlayerScoreRepository — transferKillScore (score/klscore); applyCashPenalty (cash tx)
  └── CHGLOSER_PERCENT      — factory provider reading MIDNIGHT_CHGLOSER env at boot
```

## DroidModule additions (feature 008)

```
DroidTickService (game/droid/)
  └── subscribes to TickKind.PHYSICS after CybertronTickService (onModuleInit order)
  └── maintains livePopulation: Map<classNumber, Set<userid>> (ephemeral only, not DB)
  └── spawnTickCounter: every 30th physics tick → runSpawnEvaluation + runDroidActions
  └── gates spawning on ≥1 GESTAT_USER ship online (same pattern as CybertronTickService)
  └── dispatches per-class decision trees: droidActClass10 / 11 / 12
  └── combat.ship-destroyed listener → handleDroidDied (removeFromGame, emit droid.killed)
                                     → handleDroidWon (winning Droid speed2b = rndm(5000))

DroidSpawner (game/droid/)
  └── builds ShipState with isEphemeral=true (never written to Prisma)
  └── allocates @Droid-<n> userids (monotonic counter, wraps at 9999)
  └── calls ShipStateService.loadShip() — same path as Cybertron createSpawn

Pure decision modules (game/droid/)
  droid-decisions.ts        ← rollAnnoy, rollConfuseHeading, rollAlterAttackVector,
                               rollVakoryTorpedoVolley, pickHoldCourseDuration,
                               missileAttached, randomMurdonianLoadout, randomSparseLoadout
  droid-act-class-10.ts     ← Lydorian Garbage Scow: scan + shield toggle, no fire
  droid-act-class-11.ts     ← Murdonian Transport: fight-back, confuse heading, torp
  droid-act-class-12.ts     ← Vakory Survey Drone: torpedo volley, mine+flee, missile evade

DroidModule event bus topology:
  Emitters (droid-tick.service.ts):
    droid.annoy    → GameGateway: target socket + sector room
    droid.spawned  → GameGateway → client sector roster (useSectorRoster.ts)
    droid.killed   → GameGateway → client sector roster (useSectorRoster.ts)

  Listener (droid-tick.service.ts):
    combat.ship-destroyed (victimUserid starts with '@Droid-') → cleanup + droid.killed
    combat.ship-destroyed (attackerUserid starts with '@Droid-') → droid_won speed reset

ShipStateService.flush() modification:
  └── added early-continue when state.isEphemeral === true → zero Prisma calls for Droids
```

## PlanetAttackService additions (feature 014)

```
PlanetAttackService (game/planet/)
  └── attackTroop(num, ship, planet): AttackOutcome — GECMDS.C:3580–3750
  └── attackFighter(num, ship, planet): AttackOutcome — GECMDS.C:3788–3950
  └── callForHelp (private) — GECMDS.C:3952–3994
        owner real-time alert via EventEmitter2 → ATTACK_OWNER_ALERT_EVENT
        spy-mail roll: won==1 OR gernd()%6==0, guarded by sendSpyMail flag
  └── insertDistressMail (private) — Prisma mailStat.create, class=MAIL_CLASS_DISTRESS
  └── injects: RANDOM, PLATTRT1, PLATTRT2, PLATTRF1, PLATTRF2, PLATTRF3, FIRETICKS

attack.config.ts (game/commands/)
  └── DI tokens: PLATTRT1, PLATTRT2, PLATTRF1, PLATTRF2, PLATTRF3, FIRETICKS
  └── Defaults: PLATTR* resolve from canon via GAME_CONFIG (F1 0.18, F2 1.00, F3 0.55,
      T1 1.25, T2 0.35); FIRETICKS 10. The old 0.05 was numopt's FLOOR, not a default.
  └── Env-var overrides follow the CLOAK_ENERGY_USE pattern from feature 013

Planet attack handlers (game/commands/handlers/)
  AttackHandlerService  — "att": planet attack with troops or fighters
    └── preconditions: orbit, canAttackPlanet, non-wormhole, self-attack, arg shape, cargo
    └── per-planet mutex via PlanetStateService.withPlanetLock
    └── re-validates self-attack and cargo inside lock (research.md D1)
    └── injects: FIRETICKS, ShipClassCacheService, PlanetAttackService

  PlnHandlerService     — "pln": list owned planets (read-only, no state mutation)
    └── Prisma findMany({ where: {userid}, orderBy: {plnum: 'asc'} })
    └── formats as %-20s  (xx,yy)  #zzz

  PriceHandlerService   — "pri": price quote at orbited planet (read-only)
    └── bare: lists all sellable items (or all items for owner)
    └── quoted: BUY1→PRICEFMT→BUY7→BUY5→BUY4→BUY8→BUY3→PRICE_NO_CASH ladder

GameGateway additions (feature 014):
  └── @OnEvent(ATTACK_OWNER_ALERT_EVENT) → emits to user:${ownerUserid} Socket.io room
```

## ScanModes additions (feature 015)

```
ScanHandlerService (game/commands/handlers/scan.handler.ts) — extended
  ├── scanLo()       — range-centred tactical grid; ship symbols now scantab letters (A-Z)
  ├── scanRa(level)  — range radar; effectiveRange = scanRange / (10-level)^2; zoom 1-9;
  │                     3-colour channel: self (*), human (A-Z), ai (A-Z); shared scantab
  ├── scanSe()       — sector close-up; bounded to current 1×1 sector; 4-colour channel adds planet (1-9 digits)
  ├── scanLoFull()   — scanLo grid + side panel (letter/distance/bearing/heading/speed/name);
  │                     name visibility gated by User.options[0] (SCANNAMES flag)
  └── scantab        — lazy-initialized per-socket Map<letter, shipKey> (A-Z, up to 26 entries);
                        cleared on: disconnect, ship death (COMBAT_SHIP_DESTROYED), dock/undock

SetHandlerService (game/commands/handlers/set.handler.ts) — extended (feature 015)
  ├── set scannames on|off  → persists to User.options[0] via Prisma + in-memory ShipState
  ├── set scanhome on|off   → persists to User.options[1] via Prisma + in-memory ShipState
  └── set ?                 → now lists all 4 options: auto-shield, auto-repair, scannames, scanhome

useScanRender (frontend/src/hooks/useScanRender.ts)
  └── subscribes to scan:render Socket.io event
  └── maintains array of ScanCard objects; overwrite mode (SCANHOME=on) replaces last card,
      append mode (SCANHOME=off) pushes new card (capped)
  └── exposes cards[] to ScanPanel

ScanPanel (frontend/src/components/ScanPanel.tsx)
  └── renders 30×15 monospace grid from ScanCell[]; colour-coded by channel field
  └── optional side panel (sidePanel rows) rendered right of grid for 'lo-full' mode
  └── mounted adjacent to ScanMap in App.tsx
```

## PublicModule + frontend routing (public web presence, 2026-09-07)

```
PublicModule (backend/src/public/)
  ├── StatsController   — GET /public/stats, unauthenticated, Cache-Control: 15s
  ├── StatsService       — builds { commanders, online, roster } from Prisma +
  │                        PresenceService; response cached in-memory 15s
  │                        (Date.now()-based; cache cannot be poisoned by an
  │                        error path since assignment is post-await)
  └── PresenceService     — Set<userid>, add()/remove()/count(); fed entirely by
                            GameGateway.handleConnection/handleDisconnect. A
                            plain (non-dynamic) module, so PublicModule resolves
                            to ONE PresenceService shared by the gateway and the
                            stats endpoint. Process-local — a restart empties it
                            immediately; not the channel registry (which
                            includes AI) and not a raw socket count (which
                            double-counts reconnects).

game/player/roster-query.ts
  └── ROSTER_WHERE / ROSTER_ORDER_BY — canon predicate and ordering extracted
      from ros.handler.ts (score > 0, AI excluded by userid prefix, score
      desc/kills desc/userid asc). Imported by BOTH ros.handler.ts and
      StatsService so the public roster cannot silently disagree with `ros`.
      See docs/DECISIONS.md 2026-09-07 for the CORRECTION this replaced
      (the design originally, and wrongly, named midnight/rank-roster.ts).

GameGateway additions (public web presence)
  └── handleConnection → PresenceService.add(userid)
  └── handleDisconnect  → PresenceService.remove(userid)
```

### Frontend routes (react-router-dom, added this feature)

`frontend/src/main.tsx` wraps `<BrowserRouter>`; `App.tsx` lost its own
`if (!token)` branch in favor of route-level gating.

| Route | Element | Notes |
|---|---|---|
| `/` | `Landing` | Public marketing page; header carries login/register or logout depending on `tokenStore` state |
| `/login` | `Login` | Email + password; on success routes to `location.state.from` (default `/play`), or to `/register/name` if the returned user has no username |
| `/register` | `Register` | Email + password; posts to `POST /auth/register` |
| `/register/name` | `ChooseUsername` | Authenticated; posts to `POST /auth/username` with the bearer token, stores the fresh token returned |
| `/stats` | `Stats` | Public; renders `GET /public/stats` |
| `/play` | `RequireAuth` wrapping `App` | Redirects an anonymous visit to `/login` (preserving the intended path in `location.state.from`); redirects an authenticated but username-less visit to `/register/name` |
| `*` | redirect to `/` | Catch-all |

`auth/tokenStore.ts` (`getToken`/`setToken`/`clearToken`) wraps every
`localStorage` call in `try/catch` — hardened during this feature after
`SiteHeader` started reading it on the landing page, where a browser that
blocks site data would otherwise throw during render for every visitor.
