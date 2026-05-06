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
  │     ├── OnboardingService — multi-step state machine per socketId:
  │     │                        AWAITING_CLASS → AWAITING_NAME → finalized.
  │     │                        handleNewPlayer(): emits prompt:class-list; handleReply(): advances
  │     │                        state; on completion, creates User+Ship rows and emits player.snapshot.
  │     │                        handleReturningPlayer(): emits welcome command:result for existing ship.
  │     ├── RenameService — rename(userid, shipno, newName): validates format (1-19 printable, no spaces),
  │     │                    checks case-insensitive uniqueness, updates DB + in-memory; case-identical = no-op
  │     └── OnboardingState type — { step, classNumber?, shipId? }
  ├── CommandsModule (game/commands/) — exports CommandRouterService
  │     ├── CommandRouterService — alias-keyed registry; keyword lowercased, args preserve casing; minArgs guard
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

### Auth & onboarding flow

```
POST /auth/register  →  AuthService.register()  →  bcrypt hash + DB insert  →  JWT
POST /auth/login     →  AuthService.login()     →  bcrypt compare           →  JWT

Socket connect  →  WsAuthGuard validates JWT  →  GameGateway.handleConnection()
  ├─ ship found  →  OnboardingService.handleReturningPlayer()  →  welcome command:result
  └─ no ship     →  OnboardingService.handleNewPlayer()        →  prompt:class-list
       client replies: prompt:reply {value: classNumber}
         →  OnboardingService.handleReply()  →  prompt:ship-name
       client replies: prompt:reply {value: shipName}
         →  OnboardingService.handleReply()  →  create Ship  →  player.snapshot
```

### GameGateway broadcast resolution

`CommandResult.broadcasts` decouples handlers from Socket.io. After dispatching a command,
`GameGateway.processBroadcasts()` iterates the array:
- `room === '__player_snapshot__'` sentinel → `server.emit('player.snapshot', registry.list())`
- Any other room → `server.to(room).emit(event, payload)`

This allows `RenameHandlerService` to trigger a `ship.renamed` sector broadcast and a global
`player.snapshot` refresh without importing the Socket.io server.
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
  ClassPickerPrompt   ← rendered when onboardingPrompt.type === 'class-list'; emits prompt:reply
  ShipNamePrompt      ← rendered when onboardingPrompt.type === 'ship-name'; emits prompt:reply; shows
                         role="alert" on error="name-taken"
  tokenStore          ← localStorage wrapper: getToken / setToken / clearToken (key: 'ge_jwt')

App.tsx flow:
  getToken() present → connectSocket() + render Terminal (with ClassPickerPrompt or ShipNamePrompt overlay)
  getToken() absent  → render AuthScreen → onAuthenticated → setToken + connectSocket + re-render Terminal
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
  ├── taunt-pool.ts           — 13 in-character taunt strings, pickTaunt(rand)
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
   markEmptyTeamsRemoved    → Team.update (teamcode=-1 for teamcount=0 teams)
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
    droid.spawned  → (informational; not yet bridged to client)
    droid.killed   → (informational; not yet bridged to client)

  Listener (droid-tick.service.ts):
    combat.ship-destroyed (victimUserid starts with '@Droid-') → cleanup + droid.killed
    combat.ship-destroyed (attackerUserid starts with '@Droid-') → droid_won speed reset

ShipStateService.flush() modification:
  └── added early-continue when state.isEphemeral === true → zero Prisma calls for Droids
```
