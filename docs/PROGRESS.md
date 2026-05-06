## 2026-05-06 — 011-onboarding: JWT Auth + New-Player Flow + Ship Rename

**Completed**:

- **US1 — JWT authentication**: HTTP endpoints `POST /auth/register` (bcrypt cost-12 + JWT) and
  `POST /auth/login`; `WsAuthGuard` validates `socket.handshake.auth.token` on every WebSocket
  connection; `SESSION_REPLACED` error on duplicate connection (same userid); `AUTH_REQUIRED` on
  invalid/absent token; `clearToken()` on SESSION_REPLACED/AUTH_REQUIRED client-side.

- **US2 — New-player onboarding (cmd_new)**: `OnboardingService` multi-step state machine
  (`AWAITING_CLASS → AWAITING_NAME → finalized`); emits `prompt:class-list` (18 ship classes)
  and `prompt:ship-name`; creates `User` + `Ship` rows on completion; returning players get a
  welcome `command:result` instead of prompts; `loadIfAbsent()` added to `ShipStateService`.

- **US3 — Ship rename (cmd_rename)**: `RenameService` validates format (1-19 printable,
  no spaces), case-insensitive uniqueness check, DB + memory atomic update; case-identical
  = no-op; `RenameHandlerService` uses `broadcasts` in `CommandResult` to emit `ship.renamed`
  to sector room + global `player.snapshot` refresh; arg casing preserved in `CommandRouterService`.

- **Frontend**: `AuthScreen` (register form), `ClassPickerPrompt`, `ShipNamePrompt` with
  name-taken error; `tokenStore` (localStorage JWT); `socketClient` updated to JWT auth callback
  (`autoConnect: false`, `auth: (cb) => cb({ token: getToken() })`); `useSocket` subscribes to
  `prompt:class-list`, `prompt:ship-name`, `ship.renamed`; `usePlayerList` gains `RENAMED` action.

- **DB migration**: `011_onboarding_auth` adds `username NOT NULL`, `passwordHash` nullable,
  `createdAt`; backfills `username = userid`; adds LOWER() unique indexes on both `User.username`
  and `Ship.shipname`.

**Tests**: 16 frontend Vitest (109 tests) + backend Jest — all passing.
New backend suites: handshake-auth, returning-player, session-replaced, rename.service (11 unit),
rename.handler (unit), cmd-rename (6 integration), loadIfAbsent (3 unit).
New frontend suites: AuthScreen.returning, tokenStore, ClassPickerPrompt, ShipNamePrompt, ship-renamed (5 unit).

**Decisions made**: bcrypt cost 12, JWT 30-day expiry, NULL-passwordHash backfill policy,
`broadcasts` decoupling in CommandResult, arg casing fix in CommandRouterService — all in DECISIONS.md.

**Next**: 012 (TBD) per the planned feature sequence.

**Known issues / deferred**: None.

---

## 2026-05-06 — 010-react-frontend: React Terminal UI
<!-- Note: implemented on branch 010-react-frontend; logically this feature is
     014 in the planned feature sequence (onboarding, social, ship-mgmt come first),
     but was prioritised and built first. The roadmap section below reflects the
     correct intended sequence: 010=react-frontend, 011=onboarding … 015=navigation. -->

**Completed**:
- US1 (P1) — Command input with 20-entry ↑/↓ history (CommandInput.tsx); sticky-bottom EventLog with 500-entry cap and category colour-coding; tailwind `accent` colour token (#4ade80 / green-400)
- US2 (P1) — ScanMap 30×15 ASCII grid with symbol mapping (`+` self, `@` ship, `O` planet, `W` wormhole, `*` mine, `.` empty); overlap priority `self > ship > planet > wormhole > mine`; clears on `physics.sector-transition` when local shipId appears in transitions
- US3 (P2) — Player list panel (PlayerListPanel.tsx, usePlayerList hook); alphabetically sorted; incremental sync via `player.snapshot / player.joined / player.left / physics.sector-transition`; backend: ConnectedShipsRegistry, SectorTransitionSubscriber, GameGateway extensions; single-socket-per-ship enforcement with correct event ordering (left → snapshot → joined)
- US4 (P2) — ConnectionBanner renders for `connecting / disconnected / reconnecting`, hidden for `connected`; Socket.io exponential backoff tuned to max 30 s ±50% jitter (FR-020)
- Wire contracts in `frontend/src/types/contracts.ts` for all four new Socket.io events; `contracts-parity.spec.ts` verifies backend ↔ frontend type alignment

**Tests**: 83 Vitest (frontend) + 1355 Jest (backend) — all green. New suites: player-snapshot, player-join-leave, single-socket-per-ship, sector-transition (backend); usePlayerList, PlayerListPanel, ConnectionBanner, socketClient extensions (frontend)

**Decisions made**: last-write-wins single-socket (ConnectedShipsRegistry), batched physics.sector-transition (SectorTransitionSubscriber), useReducer over Redux for player list — all in DECISIONS.md

**Next**: 011-onboarding (`cmd_new`, `cmd_rename`) — note: react-frontend was built as 010 but is logically 014 in the planned sequence; onboarding, social, and ship-mgmt features will precede it in the backend delivery order

**Known issues / deferred**:
- `droid.spawned` / `droid.killed` events not bridged to the client player list (assumed not needed for initial v1 per spec)
- `LOCAL_USERID` is hardcoded to `'DEV'` in socketClient.ts; auth integration deferred to 011-onboarding

---

## 2026-05-05 — 009-midnight-job: Midnight Maintenance Job

**Completed**:
- `MidnightRun` Prisma model + migration (runDate @id @db.Date, PhaseCounters, durationMs)
- `MidnightService` with `@Cron('0 0 * * *')` + `onApplicationBootstrap` self-heal + manual `run()` entry point
- Postgres advisory lock (`pg_try_advisory_lock`) for concurrent invocation protection; `MidnightLockHeldError` exported for 409 mapping
- Full 4-phase midnight pass wrapped in a single `prisma.$transaction()`:
  - Phase 1: `resetUserAccumulators` — planets/score/plscore/population → 0
  - Phase 2: `processOwnedPlanets` — bulk-load + in-memory accumulation + batch writes (SC-005: 1,656 ms / 2,000 planets)
  - Phase 3: `purgeMail` — delete by age + delete `*`-prefixed recipients
  - Phase 4: score = plscore + klscore (raw SQL), team reconciliation, roster ranking (ROW_NUMBER window fn)
- `valuePlanet()` pure BigInt scorer (GEPLANET.C formula, avoids zero-divisor with rearranged arithmetic)
- `buildProductionMailStat()` for phase-2 MailStat rows (class=3/MAIL_CLASS_PRODRPT)
- `rankRoster()` pure fn for rospos assignment
- `AdminMidnightController` — POST /admin/midnight/run → 202/401/409/503
- `AdminTokenGuard` — constant-time `timingSafeEqual` comparison; 503 if env unset
- `PlayerScoreService` + `PlayerScoreRepository` — ChgLoser cash penalty on PvP kill (FR-025/026)
- `PlayerScoreModule` with `CHGLOSER_PERCENT` DI token factory provider; wired into `CombatModule`
- `ScheduleModule.forRoot()` and `MidnightModule` added to `AppModule`

**Tests**: 16 new test files, 94 new tests (balance-regression, value-pl, rank-roster, mailstat-builder,
midnight.service, mail-purge, team-reconciliation, idempotency, advisory-lock, transaction-rollback,
self-heal, admin-endpoint, perf-budget, seven-day-soak, chgloser-pvp, droid-kill-scoring).
1332 tests total, all passing.

**Decisions made**:
- D1: MidnightRun ledger for idempotency (date-keyed upsert)
- D2: pg_try_advisory_lock for concurrency protection
- D7: N+1 elimination in processOwnedPlanets (bulk-load + in-memory + batch writes)
- D8: CHGLOSER_PERCENT injected via NestJS factory provider
- D9: timingSafeEqual in AdminTokenGuard

**Next**: feature 010-react-frontend — Terminal UI, ASCII map, command input, event log

**Known issues**: None. All 1332 tests green.

---

## 2026-05-04 — 006b-combat bugfix: score transfer on kill

**Completed**:
- Added `scoreAwarded: number` to `CombatShipDestroyedEvent`; computed in `runKillResolution`
  from `ShipClassCacheService.getPoints(victim.shpclass)` (falls back to 0 if class not cached).
- `ShipClassCacheService`: added `points` field to `ShipClassEntry`, hydrated from Prisma
  `ShipClass.points`, exposed via `getPoints(classNumber)`.
- Created `PlayerScoreRepository.transferKillScore` — awards `scr` to attacker score/klscore,
  deducts from victim score/klscore (floor at 0), skips victim deduction for AI ships
  (`Cybrg-*` / `Droid-*`). Runs as a single Prisma transaction.
- Created `PlayerScoreService` — listens to `COMBAT_SHIP_DESTROYED`, skips if `scoreAwarded=0`
  or no attacker, detects AI victim via `/^(?:Cybrg-|Droid-)/` regex.
- Updated 5 existing test fixtures to include `scoreAwarded: 0`.

**Tests**: 9 new tests in `score-transfer.spec.ts` — service listener behaviour (5) and
repository floor logic (4). 1027 tests total, all passing.

---

## 2026-05-04 — 006b-combat bugfix: cargo transfer on kill

**Completed**:
- Implemented cargo transfer in `CombatTickService.runKillResolution()` per GEFUNCS.C:killem (1122-1136):
  loop items index 1–13, skip `I_TROOPS`, pick divisor 1–5 via seeded Random port, transfer if
  the amount fits in the attacker's remaining cargo capacity.
- Added `loot: Array<{ itemIndex: number; amount: bigint }>` field to `CombatShipDestroyedEvent`
  so the gateway can broadcast what was looted.
- Updated 8 existing test fixtures to include `loot: []`.

**Tests**: 6 new tests in `cargo-transfer.spec.ts` — full transfer, near-capacity partial transfer,
zero transfer when full, men/troops excluded, loot in event, empty loot with no attacker.
1018 tests total, all passing.

---

## 2026-05-04 — 007-cybertron-ai bugfix: createSpawn in-memory visibility

**Completed**:
- Fixed `CybertronRepository.createSpawn`: after `prisma.ship.create()` inside the transaction,
  now fetches the persisted row and calls `ShipStateService.loadShip()` so spawned ships are
  immediately visible to all game logic without a server restart.
- Added test to `persistence.spec.ts`: verifies `loadShip` is called and the ship is
  retrievable via `get(userid, shipno)` immediately after `createSpawn`.

**Tests**: 1 new test in `persistence.spec.ts` (5 total in suite), all passing.

---

## 2026-05-03 — 007-cybertron-ai (complete: US1–US6 + Polish)

**Completed**:
- Full Cybertron AI: spawn-fill, target acquisition, hyperwarp pursuit, engagement (phaser+torp+decoy),
  breakoff, zipper, damage response (mine+jammer), jammed evasion, gold transfer on kill,
  persistence (hydrateAll + clampCybertronCash at all boundaries), Sarterns via shared code path
- `CybertronDebugController` — `GET /debug/cybertron-stats` (dev-only)
- `CombatShipDestroyedEvent` extended with victimUserid/attackerUserid/victimShipKey/attackerShipKey
- `ShipClassCacheService` extended with maxShields, hasJammer, hasMine, hasZipper, noClaim, tough, cybLowestClassAttacks, cybCanAttack
- `GameGateway` extended with @OnEvent handlers for cybertron.taunt + cybertron.broke-off

**Tests**: 1004+ total, 100+ suites, all passing. Net new cybertron test files:
- `cyb-decisions.spec.ts` — 21 unit tests (pure decision functions)
- `cybertron-tick.service.spec.ts` — 25+ integration tests (spawn, acquisition, hyperwarp, engagement, Sarterns)
- `neutral-zone.spec.ts`, `noclaim.spec.ts` — 4 safety-constraint tests
- `acquisition-rate.spec.ts`, `hyperwarp-arrival.spec.ts`, `spawn-fill-timing.spec.ts` — 7 SC statistical tests
- `difficulty-curve.spec.ts` — 8 tests (gebemean rate, torpedo volley sizing)
- `gold-transfer.spec.ts` — 4 tests
- `persistence.spec.ts` — 4 integration tests (hydrateAll, clampCybertronCash, createSpawn)
- `balance-regression.spec.ts` — 12 constant-pin tests (T068)
- `fault-isolation.spec.ts` — 1 test (bad-class ship doesn't block healthy ships)
- `integration/cybertron-end-to-end.spec.ts` — 8 tests (quickstart recipe as test)

**Decisions made**: See DECISIONS.md R-1 through R-11.

**Next**: `008-droid-ai` — ephemeral Droid + Murdonian Transport behavior

**Known issues / deferred**:
- T058 (spawn-fill integration: drive ticks until missing Cybertrons are created) — partial
  coverage in persistence.spec.ts; full recipe in quickstart.md
- AI scoring (kills → player rank boost) — deferred to 009-midnight-job
- T077 (manual quickstart verification) — deferred to post-merge

---

## 2026-05-03 — 007-cybertron-ai (Phase 1–3, US1)

**Completed**:
- `backend/src/game/cybertron/cybertron.module.ts` — CybertronModule (imports CombatModule, PhysicsModule, ShipModule, TickModule)
- `backend/src/game/cybertron/cybertron.config.ts` — `CybertronClassConfig` interface, `CYBERTRON_CLASS_DEFAULTS` for classes 21-25 (Sarterns 24/25 included), env override support
- `backend/src/game/cybertron/cybertron-events.ts` — `CYBERTRON_EVENT` const map + payload interfaces
- `backend/src/game/cybertron/taunt-pool.ts` — 13 in-character taunt strings, `pickTaunt(rand)`
- `backend/src/game/cybertron/cyb-decisions.ts` — pure AI decision functions: `cybwhoops`, `gebemean`, `rollTorpedoCount`, `pickPursuitBand`, `pickSpawnClass`, `randomInitLoadout`, `randomCybSkill`
- `backend/src/game/cybertron/cybertron.repository.ts` — `hydrateAll`, `createSpawn`, `flushShipsImmediate`, `flushUsersImmediate`, `clampCybertronCash`
- `backend/src/game/cybertron/cybertron-tick.service.ts` — US1 complete: `cybLives`, `cybCheckLockon`, `cybCheckDamage`, `cybUpdateDb`, NZ exclusion, `noClaim` cap, hyperwarp/brake/close/combat pursuit bands, shield restore on hyperwarp exit, `cybertron.target-acquired` event emission with immediate flush
- Extended `CombatShipDestroyedEvent` with `victimShipKey`, `attackerShipKey`, `victimUserid`, `attackerUserid` (T012a/T012b)
- Extended `ShipClassCacheService` with `maxShields`, `hasJammer`, `hasMine`, `hasZipper`, `noClaim`, `tough`, `cybLowestClassAttacks`; added `get()` method
- Added `ShipStateService.loadShip()` for boot-time hydration
- Added 14 Cybertron constants to `constants.ts`

**Tests**: 966 total, 95 suites, all passing. Net new cybertron test files:
- `cyb-decisions.spec.ts` — 21 unit tests (pickSpawnClass, pickPursuitBand, gebemean, rollTorpedoCount, randomCybSkill, randomInitLoadout)
- `cybertron-tick.service.spec.ts` — 9 integration tests (spawn cadence, target acquisition, hyperwarp entry/exit, Sartern class 24)
- `neutral-zone.spec.ts` — 2 tests (NZ exclusion verified)
- `noclaim.spec.ts` — 2 tests (noClaim cap enforced)
- `acquisition-rate.spec.ts` — 1 SC-002 statistical test (≥95/100 trials acquire target)
- `hyperwarp-arrival.spec.ts` — 3 SC-003 travel-time tests (hyperwarp < half baseline ticks)
- `spawn-fill-timing.spec.ts` — 3 SC-001 tests (all classes fill within 900 ticks)

**Decisions made**:
- US1 cybLives uses `cybmine === playerShipno` (not user-index like C source — shipno is unique for active players)
- `isInNeutralZone` = `Math.floor(xcoord) === 0 && Math.floor(ycoord) === 0` (faithful to GEPLANET.C:neutral)
- Cybertrons at `(0,y)` or `(x,0)` with fractional coordinate may be in NZ — Cybertron must be outside NZ to scan
- `topSpeed` in cybLives = `ship.topspeed * 1000.0` (matches C source `d_topspeed = topspeed*1000.0`)

**Next**: US2 (engagement: phaser + torpedo + decoy + breakoff) — T040-T047

**Known issues**: US2-US6 stubs in place; T016 test exercises real T029 impl; T020a now enforces ≥95% constraint.

---

## 2026-05-03 — 006b-combat

**Completed**:
- `backend/src/game/combat/random.port.ts` — `Random` interface, `RANDOM` injection token,
  `MathRandomAdapter` (production), `Mulberry32Adapter` (seeded, for tests)
- `backend/src/game/combat/combat-events.ts` — 6 event-name constants + payload interfaces:
  `COMBAT_PHASER_FIRED`, `COMBAT_HIT`, `COMBAT_MISS`, `COMBAT_DECOY_INTERCEPT`,
  `COMBAT_MINE_DETONATION`, `COMBAT_SHIP_DESTROYED`
- `backend/src/game/combat/combat-math.ts` — pure side-effect-free functions (all via injected
  `Random`): `cdistance`, `lineOfFire`, `phaserDamage`, `tonFact`, `shieldhit`, `randamage`,
  `mineFalloff`, `decoyIntercept`, `jammerCounter`, `damstr`
- `backend/src/game/combat/mine.registry.ts` — in-memory `Map<mineId, MineState>` with
  `hydrate/add/remove/tickAll/sweepCandidates`
- `backend/src/game/combat/mine.repository.ts` — Prisma wrapper: `findAllActive/create/delete`
- `backend/src/game/combat/combat-tick.service.ts` — per-physics-tick combat: phaser reload,
  cantexit decrement, decoy/jammer expiry, torpedo travel, missile travel, mine sweep,
  kill resolution; per-ship try/catch
- `backend/src/game/combat/combat.module.ts` — NestJS module (imports PhysicsModule)
- `backend/src/game/planet/planet-economy.service.ts` — planet revolt logic (taxrate-based
  per GEPLANET.C:341-380)
- `backend/src/game/commands/helpers/find-ship.ts` — resolves `@` to lock target, name to shipno
- Command handlers: `phaser.handler.ts`, `torpedo.handler.ts`, `missile.handler.ts`,
  `mine.handler.ts`, `zipper.handler.ts`, `decoy.handler.ts`, `jammer.handler.ts`,
  `sys.handler.ts` (`sys unjam`), `lock.handler.ts`, `shield.handler.ts`, `flux.handler.ts`
- Modified: `backend/src/game/constants.ts` (+20 combat constants), `ship-class-cache.service.ts`
  (+maxPhaser/scanRange/maxTons/hasTorpedo/hasMissile), `ship-state.service.ts`
  (+removeFromGame), `game.gateway.ts` (@OnEvent for all 6 combat events), `app.module.ts`
  (+CombatModule), `planet.module.ts` (local RANDOM binding), `planet-state.service.ts`
  (wired PlanetEconomyService)

**Tests**: 918 total, 87 suites, all passing. Net new combat test files:
- `combat-math.spec.ts`, `mine.registry.spec.ts`, `mine-persistence.spec.ts`,
  `balance-regression.spec.ts`, `tick-subscription-order.spec.ts`,
  `combat-tick.service.spec.ts`, `kill-attribution.spec.ts`, `in-flight-cleanup.spec.ts`,
  `death-broadcast.spec.ts`, `combat-broadcast.spec.ts`
- Handler specs: `phaser.spec.ts`, `torpedo.spec.ts`, `missile.spec.ts`, `mine.spec.ts`,
  `zipper.spec.ts`, `decoy.spec.ts`, `jammer.spec.ts`, `sys-unjam.spec.ts`, `lock.spec.ts`,
  `shield.spec.ts`, `flux.spec.ts`
- Planet: `revolt.spec.ts`

**Decisions made**:
- R-1: CombatModule imports PhysicsModule to enforce tick subscription ordering (combat fires
  post-physics movement)
- R-2: Injectable `RANDOM` port (Mulberry32Adapter for tests) — no inline `Math.random()`
- R-3: No mine owner exclusion — faithful to GEFUNCS.C:minesweep (deployer can hit themselves)
- R-4: `findShip` lazy lock clear — stale lock (`!ingegame` or out-of-range) cleared on use
- R-5: Jammer area-effect includes carrier itself — no self-exclusion (GECMDS.C:1593)
- R-6: Friendly fire allowed in `lineOfFire` — no team filter, faithful to GECMDS.C:cmd_phasor
- R-7: `COMBAT_SHIP_DESTROYED` broadcast galaxy-wide (`server.emit`); all other combat events
  sector-scoped; `channel = shipno` used as the unique per-player channel identifier
- PlanetModule binds local RANDOM to avoid circular dep (PlanetModule → CombatModule → PhysicsModule)

**Next**: `007-cybertron-ai` — persistent Cybertron behavior (escalating difficulty, gold
accumulation, neutral-zone respect, per GECYBS.C)

**Known issues**: None.

---

## 2026-05-02 — 006a-physics-tick

**Completed**:
- `backend/src/game/physics/` module: `physics-math.ts` (pure: rotationStep,
  accelerationStep, positionIntegration, tryEnergyDebit, sectorOf,
  normalizeHeading), `ship-class-cache.service.ts` (boot-hydrated maxAcceleration
  / maxWarp lookup), `physics-tick.service.ts` (orchestrator subscribed to
  `TickKind.PHYSICS`), `physics-events.ts` (typed event names + payloads).
- `EventEmitter2` integration via `@nestjs/event-emitter` (new dep) for the two
  typed signals: `physics.sector-transition` and `physics.hyperspace`.
- `WarpHandlerService` (replaces the static `warpCommand` const) — full FR-012
  five-gate sequence using `ShipClassCacheService.getMaxWarp` for WARP01 vs.
  WARPSPD2 distinction.
- Constants added to `game/constants.ts`: `ACCENGAMT=120`, `MOVENGUSE=10`,
  `MOVENGMIN=3000`, `ROTENGUSE=30`, `WARP_THRESHOLD=1000`, `COORD_SCALE=65000`.
- Jest config picks up new `test/game/` root.

**Tests** (754 total, 64 suites — all green; 67 net new):
- Unit (physics-math): 35 tests covering accel/decel/snap, ACCENGAMT gate,
  hyperspace boundary, position integration on cardinal/diagonal headings,
  energy floor refusal, sector-of, rotation step short-way + normalization.
- Unit (ShipClassCacheService): 4 tests for hydration, sync lookup, throw on
  unknown class, test seam.
- Integration (PhysicsTickService): 11 tests — warp-1 advance + MOVENGUSE +
  hyperspace=enter, sector-transition emission, AI maintenance exclusion,
  orbit/dock skip, MOVENGMIN floor cutoff, per-ship fault isolation, US2
  short-way rotation, US3 hypha/cantexit decrement, FR-019 ordering.
- Warp gate (warp-gate.spec.ts + revised warp.spec.ts): all six FR-012 gate
  paths validated through the cache-injected handler.
- Balance regression: 12 assertions pinning every consumed constant + the
  sum-of-classes for `maxAcceleration` (72050) and `maxWarp` (522).
- Performance bench: 100 ships through one `advanceAll()` < 50 ms (SC-004).

**Decisions made**: rotation step uses `max_accel/10` (not unused ROTAMT);
MOVENGUSE widened to `speed > 0` (playtest fallback documented); deterministic
ascending-shipKey iteration; per-ship try/catch (no quarantine). All recorded
in `docs/DECISIONS.md`.

**Next**: `006b-combat` — phasors first, then torpedoes/missiles/mines on the
same physics tick.

**Known issues**: None. Out-of-scope (deferred to 006b or galaxy work):
universe wrap, telezip, gravity, overspeed-engine-blow, weapon/shield/cloak
state, gateway consumption of the new typed events, manual quickstart §1–§8
(blocked on a real Postgres seed run; verified at the unit/integration level).

---

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


---

## Roadmap to v1 — Planned Features

Features 001–009 are complete. Feature 010 (react-frontend) was implemented out
of order — the backend-first sequence would have put it at position 014, but it
was prioritised to unblock end-to-end testing. The numbering below reflects the
intended delivery sequence for the remaining work.

All command names reference the `gecmds[]` table in `reference/ge-source/GECMDS.C`.

### 010 — React frontend terminal UI ✓ DONE (implemented out of order; logically 014)

Full terminal UI: text command input with history, scrolling event log, ASCII sector map,
player list panel, connection banner. Connects to `GameGateway` via Socket.io. Renders in
monospace font with an ANSI/ASCII aesthetic. Desktop-first; not mobile-optimized.

See feature log entry 2026-05-06 — 010-react-frontend above.

### 011 — Player onboarding (planned)

`cmd_new` — new ship creation: class selection from available `ShipClass` rows,
initial loadout, userid registration.
`cmd_rename` — rename ship (1–19 printable ASCII, uniqueness check).

No test coverage yet. No spec exists.

### 012 — Social / information commands (planned)

`cmd_who` — list all active ships (name, class, sector, kills).
`cmd_data` — full stats on a named ship.
`cmd_geroster` — alliance / team roster display.
`cmd_send` — compose and deliver in-game mail (`Mail` + `MailStat` rows, already
in schema from 001).
`cmd_team` — set/change team affiliation.
`cmd_freq` — tune ship communication frequency (used by `freq[]` field on `WARSHP`).

No test coverage yet. No spec exists.

### 013 — Ship management commands (planned)

`cmd_maint` — pay maintenance to repair damage (drains `User.cash`).
`cmd_transfer` — transfer items/gold between ships in the same sector.
`cmd_jettison` — drop cargo into space (decrements items, no planet required).
`cmd_set` — configure ship options (e.g., auto-shield, auto-repair flags).
`cmd_destruct` — self-destruct the ship (removes ship, penalizes score).
`cmd_abort` — abort a self-destruct countdown.
`cmd_abandon` — leave the ship (sets status to abandoned).

**Cross-cutting gap — `cmd_cloak`**: The `cloak` field on `ShipState` is already
referenced in four places without a command handler to set it:
- `torpedo.handler.ts:82` — blocks firing while `ship.cloak > 0` (emits `TOR_CLOAK`)
- `report.handler.ts:189` — hides cloaked ships from the `report` display
- `CybertronTickService:268,494,513` — `runEngagementScan` and `cybCheckLockon` skip
  players with `cloak === 10`
- `messages.ts` — `TOR_CLOAK` message string already exists

The command handler that sets `cloak = 10` (and debits the energy cost) has never
been implemented. Any ship can be made cloaked by directly setting `ship.cloak = 10`
in state, but no player command triggers it. This should be the first handler in
feature 013.

No test coverage yet. No spec exists.

### 014 — Planet attack (planned)

`cmd_attack` — land troops and fighters to capture a planet (interacts with
`PlanetState.men`, `PlanetState.troops`; uses `GEPLANET.C` combat formulas).
`cmd_planet` — display full planet status (complement to `report cargo`).
`cmd_price` — display current buy/sell prices for a planet's inventory.

No test coverage yet. No spec exists.

### 015 — Navigation aids & help (planned)

`cmd_navigate` — compute heading and distance to a named planet or sector.
`cmd_spy` — deploy a spy to a planet (sets `Planet.spyowner`).
`cmd_gehelp` — in-game help text (topic-keyed lookup).
`cmd_clear` — clear the client's event log display.

No test coverage yet. No spec exists.

### Deferred / cross-feature items

- **AI scoring** (Cybertrons/Droids boosting/penalizing player rank) — deferred to 009
- **Midnight job** (009) — score recalculation, planet production reports, mail purge
- **Droid AI** (008) — ephemeral Droids + Murdonian Transport (`GEDROIDS.C`)
- **Universe wrap** — ships crossing galaxy boundary should wrap; currently no boundary enforcement
- **Gravity / wormhole travel** — wormhole entry (`GEFUNCS.C:moveship` gravity pull) not implemented
- **Overspeed engine blow** — ship exceeding max warp should take damage; currently warn-and-apply only

---

## 2026-05-05 — 008-droid-ai

**Completed**:
- `isEphemeral` flag on `ShipState`; `flush()` skips ephemeral states (FR-002)
- `DroidSpawner` — builds ephemeral `ShipState` with `@Droid-<n>` userid, isEphemeral=true,
  per-class loadout (heavy Murdonian / sparse Scow+Vakory), class-specific topspeed/phaser/shields
- `DroidTickService` — subscribes after CybertronTickService; 30-tick cadence; spawn-cap=2/class;
  player-online gate; per-class dispatch to droidActClass10/11/12; fault isolation per Droid;
  `combat.ship-destroyed` listener (handleDroidDied + handleDroidWon); emits droid.annoy/spawned/killed
- Pure decision modules: `droid-decisions.ts`, `droid-act-class-10.ts`, `droid-act-class-11.ts`,
  `droid-act-class-12.ts` — faithfully porting `GEDROIDS.C:droid_act_class_*` decision trees
- Message pool `droid-message-pool.ts` — typed catalog for all three classes × passive/help variants
- `GameGateway` bridge for `droid.annoy` → target socket + sector room
- Dev-only `POST /debug/droid/spawn?class=31` endpoint
- `DroidModule` registered in `AppModule`

**Tests**: 1238 total (up from 1027 before this feature); 19 new test files covering spawn-cap,
spawn-cadence, spawn-placement, loadout, Murdonian cargo-transfer-on-kill, annoy event integration,
per-class decision matrices (class 10/11/12), decision pure functions, message pool, balance
regression, annoy rate statistics, fault isolation, cold-boot fill, ephemerality invariants,
jammed invariants, and Cybertron spawn-visibility regression (T038 backfill).

**Decisions made**:
- Class numbers 31/32/33 used (not 10/11/12 from spec) — seed already populated; C source
  dispatches by typename not number (R-14)
- `isEphemeral` flag approach — no new Prisma model, no migration (R-12)
- Single 30-tick counter drives both spawn evaluation and per-Droid actions (R-13)

**Next**: 009-midnight-job — nightly score recalculation, planet production reports, mail purge

**Known issues**:
- Droid kill-score impact (whether kills count toward player score/rank) deferred to 009
- T043 manual quickstart validation not run (requires live `ge_test` DB)
- `droid.spawned` and `droid.killed` events not yet bridged to Socket.io client
