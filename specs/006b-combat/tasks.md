# Tasks: Ship-to-Ship Combat (006b)

**Input**: Design documents from `/specs/006b-combat/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/combat-events.md, quickstart.md
**Tests**: MANDATORY per Constitution Principle II — written before or alongside each implementation task. Pure-function tests, integration tests with seeded PRNG, balance-regression test, real-DB mine persistence test.

**Organization**: Grouped by user story. Phase 1 (setup) and Phase 2 (foundational) MUST complete before any user-story phase begins.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no incomplete dependencies → can run in parallel
- **[Story]**: US1–US5; setup/foundational/polish carry no story label
- All paths absolute from repo root `backend/`

---

## Phase 1: Setup

**Purpose**: Module skeleton for the new combat feature; no logic yet.

- [ ] T001 Create `backend/src/game/combat/` directory and an empty `combat.module.ts` exporting an empty `CombatModule` class with `imports: []`, `providers: []`, `exports: []`.
- [ ] T002 [P] Create `backend/test/game/combat/` directory and add a placeholder `combat.module.spec.ts` that asserts `CombatModule` compiles in a `Test.createTestingModule()`.
- [ ] T003 [P] Wire `CombatModule` into `backend/src/app.module.ts` `imports` (after `PhysicsModule`, so onModuleInit registers strictly later — see research R-1).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Constants, pure-math primitives, the `Random` port, the in-memory mine registry, the `MineRepository`, and the empty `CombatTickService` shell. Every user story depends on these. **No user-story work may begin until this phase is green.**

### Constants and DI

- [ ] T004 Extend `backend/src/game/constants.ts` with combat constants from research R-10: `PMINFIRE=60`, `PRELOAD=10`, `PHABIAS=2`, `SHHITENG=1000`, `FIRETICKS=10`, `DECOYTIME=15`, `HPBEAMW=5`, `MAXTORPS=3`, `MAXMISSL=3`, `MINERANGE=10000`, plus `TDAMMAX`, `MDAMMAX`, `MINEDAMMAX`, `DECODDS`, `TORPSPED`, `MISLSPED`, `MISENGFC`, `JAMTIME` (each pinned to its `GLOBAL.C` canonical default, with JSDoc citing `GEMAIN.H`/`GEGLOBAL.H` line numbers).
- [ ] T005 [P] Create `backend/src/game/combat/random.port.ts` exporting a `Random` interface (`next(): number` returning `[0,1)`), a `RANDOM` injection token, a default `MathRandomAdapter`, and a `seedable` Mulberry32 adapter for tests (research R-2).
- [ ] T006 [P] Create `backend/src/game/combat/combat-events.ts` exporting the six event-name constants and payload interfaces verbatim from `contracts/combat-events.md` (`COMBAT_PHASER_FIRED`, `COMBAT_HIT`, `COMBAT_MISS`, `COMBAT_DECOY_INTERCEPT`, `COMBAT_MINE_DETONATION`, `COMBAT_SHIP_DESTROYED` and corresponding `*Event` types).

### Pure combat math

- [ ] T007 [P] Write `backend/test/game/combat/combat-math.spec.ts` covering `cdistance`, line-of-fire (`firephas` arc test), `tonFact`, `shieldhit`, `randamage` (with seeded PRNG), `damstr`, mine cubic falloff, decoy-odds roll, jammer area-effect formula. Each assertion cites the C source line. Tests MUST FAIL before T008 lands.
- [ ] T008 Implement `backend/src/game/combat/combat-math.ts` as pure, side-effect-free functions: `cdistance(a, b)`, `lineOfFire(firer, victim, bearing, beamWidth)`, `phaserDamage(percent, range, ...)`, `tonFact(tonnage)`, `shieldhit(shield, damage, shieldUp)`, `randamage(rand, dmgMax, ton)`, `mineFalloff(distance, ton)`, `decoyIntercept(rand, decodds)`, `jammerCounter(distance, scanrange, jamtime)`, `damstr(damagePct)`. Every function has a `@see GEFUNCS.C:nnn` JSDoc citation. All randomness via injected `Random`.

### Mine persistence layer

- [ ] T009 [P] Write `backend/test/game/combat/mine-persistence.spec.ts` (real-DB integration, SC-006): seed two `Mine` rows, instantiate `MineRepository`, call `findAllActive()` → expect both; call `create({...})` → expect new row; call `delete(id)` → expect row gone.
- [ ] T010 Implement `backend/src/game/combat/mine.repository.ts` wrapping `PrismaService` with `findAllActive(): Promise<Mine[]>`, `create(input): Promise<Mine>`, `delete(id): Promise<void>`. No transactions (data-model.md). JSDoc `@see GECMDS.C:cmd_mine` and `GEFUNCS.C:minesweep`.
- [ ] T011 Create `backend/src/game/combat/mine.registry.ts` — in-memory `Map<mineId, MineState>` with `hydrate(mines: Mine[])`, `add(mine)`, `remove(id)`, `tickAll()` (decrements every mine's `timer`), `sweepCandidates()` (returns mines with `timer % 5 === 0`). Pure logic over a Map; no Prisma calls inside. Unit-tested by `backend/test/game/combat/mine.registry.spec.ts`.

### CombatTickService shell

- [ ] T012 Write `backend/test/game/combat/combat-tick.service.spec.ts` skeleton with Jest fake timers + seeded PRNG harness: instantiate `CombatTickService`, fire a synthetic `TickKind.PHYSICS` event, assert no exception is thrown on an empty ship Map. Add a fault-isolation case (one ship throws) — must not abort the batch (FR-030, SC-005). Tests MUST FAIL before T013.
- [ ] T013 Implement `backend/src/game/combat/combat-tick.service.ts` shell: subscribes to `TickKind.PHYSICS` in `onModuleInit()` via `TickService.subscribe()`; per-tick handler iterates `ShipStateService` snapshot, wrapping each ship's combat work in try/catch (logger.error on fault, continue batch). Empty pass bodies (filled in subsequent stories). Hydrate mines via `MineRepository.findAllActive()` on `onModuleInit` and pass to `MineRegistry`.
- [ ] T014 Wire `CombatModule` providers in `backend/src/game/combat/combat.module.ts`: imports `[PhysicsModule, ShipModule, PrismaModule, EventEmitterModule]`; providers `[CombatTickService, MineRepository, MineRegistry, { provide: RANDOM, useClass: MathRandomAdapter }]`; exports `[CombatTickService]`.

### Balance-regression test

- [ ] T015 [P] Write `backend/test/game/combat/balance-regression.spec.ts` (SC-003) — one `it` per constant in T004 (each asserts the exact value); plus behavior-pinning cases: (a) the `mptr->timer % 5` mine-sweep cadence, (b) `PHABIAS` widens phaser arc — a target outside `percent` but within `percent + PHABIAS` resolves as a hit (FR-005), (c) `FIRETICKS` is the value `cantexit` is set to on every weapon-fire / hit event and decrements one per tick (FR-028a).

### Helpers

- [ ] T016 [P] Add `findShip(query, contextShip)` resolver to `backend/src/game/commands/helpers/find-ship.ts`, mirroring `GEFUNCS.C:findshp`: name-match (case-insensitive prefix) within scan range; resolves the literal `@` token to `contextShip.lock` and re-validates it (lazy clear: if target `!ingegame` OR `cdistance × 10000 > scanrange`, set `lock = -1` and return `NOLOCK`) per research R-4.
- [ ] T016b Add `backend/test/game/combat/tick-subscription-order.spec.ts` — integration test asserting `CombatTickService` subscribes to `TickKind.PHYSICS` strictly after `PhysicsTickService`. Boot a real Nest testing module with both modules wired (CombatModule importing PhysicsModule); seed one ship with non-zero velocity; fire a single synthetic `TickKind.PHYSICS` event; assert that within that tick the combat pass observes the **post-move** coordinates (i.e. the ship's `xcoord`/`ycoord` reflect the physics update before combat reads them). Also add a JSDoc block on `CombatTickService.onModuleInit()` citing this ordering dependency and the `CombatModule imports PhysicsModule` convention that enforces it (research R-1).

**Checkpoint**: Foundation green. All four prior balance/regression tests pass. CombatTickService boots clean. User-story phases may now begin in parallel.

---

## Phase 3: User Story 1 — Phaser Combat (Priority: P1) 🎯 MVP

**Goal**: Two players in the same sector exchange phaser fire; bearing/range gates honored, hyper-phaser path used at warp, charge reloads at `PRELOAD` per tick.

**Independent Test**: Spec quickstart Scenario A — `pha 90 50` from Alice with Bob in the firing arc; Bob's `shield`/`damage` change correctly, Alice's `phasr` drops by 50% then recovers, both terminals see `combat.phaser-fired` and `combat.hit` events.

### Tests for User Story 1

- [ ] T017 [P] [US1] Write `backend/test/game/commands/handlers/phaser.spec.ts` — covers happy path, no-class-mounted reject, below-`PMINFIRE` reject, out-of-range bearing/percent reject, hyper-phaser path selection (warp speed gate), friendly-fire allowed (FR-005), `PHABIAS` arc-widening (a target outside `percent` but within `percent + PHABIAS` is hit, per `GECMDS.C:954`), JAMMER4 reject when firer's `jammer > 0` (FR-017), and `cantexit` set to `FIRETICKS` on firer and on any victim hit (FR-028a). Tests MUST FAIL before T019.
- [ ] T018 [P] [US1] Add `combat-tick.service.phaser.spec.ts` cases (in same file as T012's spec): seeded PRNG, two ships, `pha` handler invocation followed by tick → assert `combat.hit` payload and victim shield/damage mutation.

### Implementation for User Story 1

- [ ] T019 [US1] Implement `backend/src/game/commands/handlers/phaser.handler.ts` — parses `pha <bearing> <percent>`, validates `phasrtype` mounted, `phasr >= PMINFIRE`, args range; selects impulse vs hyper-phaser by `speed >= warpThreshold`; emits `combat.phaser-fired`; calls `combat-math.lineOfFire` against every ship in scan range (no team filter, FR-005); for each hit emits `combat.hit` and mutates victim via `ShipStateService.mutate()`; emits `combat.miss` if no targets in arc. Energy/charge consumed via `ShipStateService.mutate()`. JSDoc cites `GECMDS.C:cmd_phasor`, `GEFUNCS.C:firephas`.
- [ ] T020 [US1] Register `phaser.handler` in `backend/src/game/commands/command.service.ts` route table for keyword `pha`.
- [ ] T021 [US1] Add phaser-reload pass to `combat-tick.service.ts` per-ship loop: `phasr = min(maxPhaser, phasr + PRELOAD)` (FR-004). Mutate via `ShipStateService.mutate()`.
- [ ] T022 [US1] Subscribe `GameGateway` to `COMBAT_PHASER_FIRED`, `COMBAT_HIT`, `COMBAT_MISS` and broadcast to the firer/victim's sector room only (FR-031). Add `backend/test/gateway/combat-broadcast.spec.ts` covering these three events.

**Checkpoint**: US1 done. Phaser exchange plays end-to-end on the dev backend. Quickstart Scenario A green.

---

## Phase 4: User Story 2 — Torpedoes and Missiles (Priority: P1)

**Goal**: `tor` and `mis` register locked projectiles on the target's lock slot; ticks decrement distance; on `<=0` the hit resolves with randomized damage; an active decoy may intercept.

**Independent Test**: Quickstart Scenario B — `tor bob`; Bob sees inbound; deterministic decoy intercept under seeded PRNG.

### Tests for User Story 2

- [ ] T023 [P] [US2] Write `backend/test/game/commands/handlers/torpedo.spec.ts` covering: class-without-launcher reject (`shipclass[shpclass].max_torps == 0`, FR-007), warp reject, cloak reject, no torpedoes in cargo reject, target's `ltorps[]` slots all occupied → `MAXTORPS` exhausted reject (FR-006/FR-007 — slots live on the **target**, per `GECMDS.C:1191–1202`), happy-path slot allocation **on the target's `ltorps[]`** with `distance = cdistance × 10000 + 20` and `channel = firer.channel`, auto shields-down side effect on firer (FR-006), JAMMER4 reject when firer's `jammer > 0` (FR-017).
- [ ] T024 [P] [US2] Write `backend/test/game/commands/handlers/missile.spec.ts` covering: class-without-launcher reject (`shipclass[shpclass].max_missl == 0`, FR-008), charge range `1..50000`, energy cost = `charge / misengfc`, target's `lmissl[]` slots all occupied → `MAXMISSL` exhausted reject (slots live on the **target**), happy-path slot allocation on the target's `lmissl[]` with `channel = firer.channel` and `energy = charge`, missile-vs-warp-target allowed (FR-008), JAMMER4 reject when firer's `jammer > 0` (FR-017).
- [ ] T025 [P] [US2] Add `combat-tick.service.projectile.spec.ts` cases (seeded PRNG): tick travel decrement (`torpsped`/`mislsped`) walking each ship's **own** `ltorps[]`/`lmissl[]` (incoming projectiles, per `GEFUNCS.C:1546`), decoy intercept threshold (<5000 torp / <3000 missile) deterministic outcome (SC-004), hit resolution emitting `combat.hit` with `weapon: 'torpedo'`/`'missile'`, victim damage applied via `randamage` and `tonFact`, slot cleared on hit/decoy, and a **target-leaves-game** case (FR-027.3): a torpedo is in flight on Bob's `ltorps[]`; Bob is removed from the game (`!ingegame`) before the projectile reaches zero distance; on the next tick the slot is cleared with no `combat.hit` and no kill credit.

### Implementation for User Story 2

- [ ] T026 [US2] Implement `backend/src/game/commands/handlers/torpedo.handler.ts` per FR-006, FR-007: validates gates (class-mount via `shipclass.max_torps`, warp, cloak, cargo, target validity, target's `ltorps[]` slots not all occupied, JAMMER4 reject if firer's `jammer > 0`), allocates lowest free slot on the **target's** `ltorps[]` (`wptr->ltorps[i]` per `GECMDS.C:1191–1202`) with `.distance = cdistance(firer,target) × 10000 + 20` and `.channel = firer.channel`, decrements one torpedo from the firer's `items`, sets firer's `shieldstat = down`, sets `cantexit = FIRETICKS` on the firer (FR-028a), mutates via `ShipStateService.mutate()`. JSDoc cites `GECMDS.C:cmd_torpedo`, `GECMDS.C:torp 1178–1206`.
- [ ] T027 [US2] Implement `backend/src/game/commands/handlers/missile.handler.ts` per FR-008: validates class-mount (`shipclass.max_missl`), charge range `1..50000`, JAMMER4 reject, target's `lmissl[]` slots not all occupied; deducts `charge / misengfc` from firer's energy, allocates lowest free slot on the **target's** `lmissl[]` with `.distance = cdistance(firer,target) × 10000 + 20`, `.channel = firer.channel`, and `.energy = charge`, sets `cantexit = FIRETICKS` on the firer. JSDoc cites `GECMDS.C:cmd_missl`, `GEFUNCS.C:firemiss`.
- [ ] T028 [US2] Register both handlers in `command.service.ts`.
- [ ] T029 [US2] Add projectile-travel pass to `combat-tick.service.ts`: walk **each ship's own** `ltorps[]` and `lmissl[]` (these slots represent **incoming** projectiles, per `GEFUNCS.C:1546`); decrement distance by `TORPSPED`/`MISLSPED`. If distance falls inside decoy threshold AND the **carrier of the slot** (target) has an active decoy, roll `decoyIntercept(random, DECODDS)`; on success emit `COMBAT_DECOY_INTERCEPT` (`{ defenderId: shipOwningSlot, attackerId: lookup(channel) }`) and clear slot. If distance `<= 0`, resolve hit via `combat-math.randamage` + `tonFact` + `shieldhit`, emit `COMBAT_HIT { victimId: shipOwningSlot, attackerId: lookup(channel) }`, write `shipOwningSlot.lastfired = slot.channel`, set `cantexit = FIRETICKS` on both attacker and victim (FR-028a), clear slot. If the slot's carrier ship is no longer `ingegame`, clear the slot with no hit and no kill (FR-027.3). Per-ship try/catch.
- [ ] T030 [US2] Extend `GameGateway` to bridge `COMBAT_DECOY_INTERCEPT` to the defender's sector room. Update `combat-broadcast.spec.ts` accordingly.

**Checkpoint**: US2 done. Quickstart Scenario B green with seeded PRNG.

---

## Phase 5: User Story 3 — Mines, Zippers, Decoys, Jammers (Priority: P2)

**Goal**: `min` deploys a persistent mine; mine sweep on every 5th tick applies cubic-falloff damage when `timer === 0` (otherwise MINE6 warning only); `zip` clears mines in range; `dec` and `jam` add ephemeral state that decays per tick; `sys unjam` clears the jammer.

**Independent Test**: Quickstart Scenario C — mine row survives backend restart; Bob entering range gets MINE6 warnings until detonation tick. Plus zipper variant.

### Tests for User Story 3

- [ ] T031 [P] [US3] Write `backend/test/game/commands/handlers/mine.spec.ts` — happy-path persistence, coordinates match firer, mine appears in `MineRegistry` (FR-012).
- [ ] T032 [P] [US3] Write `backend/test/game/commands/handlers/zipper.spec.ts` — mines within zipper range deleted, mines outside range untouched, firer not damaged (FR-014).
- [ ] T033 [P] [US3] Write `backend/test/game/commands/handlers/decoy.spec.ts` — slot allocation with lifetime `DECOYTIME`, in-memory only, tick-decrement and expiry (FR-015, FR-016).
- [ ] T034 [P] [US3] Write `backend/test/game/commands/handlers/jammer.spec.ts` — area-effect including carrier itself (research R-5), counter `jamtime × (1 − distance/scanrange)`, distance scaling correctness, no self-exclusion.
- [ ] T035 [P] [US3] Write `backend/test/game/commands/handlers/sys-unjam.spec.ts` — clears the carrier's `jammer` to 0 immediately (FR-017).
- [ ] T036 [P] [US3] Add mine-sweep cases to `combat-tick.service.spec.ts`: `timer % 5 === 0` cadence, neutral-zone (0,0) skip (`GEFUNCS.C:1432`), no owner-exclusion (research R-3), `timer === 0` cubic-falloff damage + `lastfired` write + mine destroyed, `timer > 0` MINE6 warning only, deterministic seeded PRNG.

### Implementation for User Story 3

- [ ] T037 [US3] Implement `backend/src/game/commands/handlers/mine.handler.ts` — `MineRepository.create` + `MineRegistry.add`, decrement `items[mineSlot]`. JSDoc cites `GECMDS.C:cmd_mine`.
- [ ] T038 [P] [US3] Implement `backend/src/game/commands/handlers/zipper.handler.ts` — finds mines within zipper range of firer, deletes each via `MineRepository.delete` + `MineRegistry.remove`, emits `COMBAT_MINE_DETONATION` with no victim. JSDoc cites `GECMDS.C:cmd_zipper`.
- [ ] T039 [P] [US3] Implement `backend/src/game/commands/handlers/decoy.handler.ts` — allocate lowest zero slot in `decout`, set to `DECOYTIME`, decrement one decoy from `items`. JSDoc cites `GECMDS.C:cmd_decoy`.
- [ ] T040 [P] [US3] Implement `backend/src/game/commands/handlers/jammer.handler.ts` — iterates all ships within carrier's scanrange (including self), sets each affected ship's `jammer = JAMTIME × (1 − distance/scanrange)` via `ShipStateService.mutate`. Decrement one jammer from `items`. JSDoc cites `GECMDS.C:cmd_jammer` lines 1593–1651.
- [ ] T041 [P] [US3] Implement `backend/src/game/commands/handlers/sys.handler.ts` with the `unjam` sub-command — sets carrier's `jammer = 0`. Routed via `sys <subcommand>` parser. JSDoc cites `GECMDS.C` sys-unjam handling.
- [ ] T042 [US3] Register `min`, `zip`, `dec`, `jam`, `sys` handlers in `command.service.ts`.
- [ ] T043 [US3] Add mine-sweep + decoy/jammer-expiry pass to `combat-tick.service.ts`: call `MineRegistry.tickAll()` then iterate `sweepCandidates()`; for each candidate walk all ships in `MINERANGE` (skip neutral zone 0,0); on `timer === 0` apply `combat-math.mineFalloff`, write `victim.lastfired = mine.channel`, emit `COMBAT_HIT { weapon: 'mine' }` and `COMBAT_MINE_DETONATION`, then `MineRepository.delete` + `MineRegistry.remove`; otherwise emit MINE6 proximity warning. Decrement every ship's non-zero `decout[]` slots and `jammer` counter (FR-016, FR-017). Add JAMMER4 reject helper used by phaser/torpedo/missile/lock handlers when the firer's `jammer > 0`.
- [ ] T044 [US3] Subscribe `GameGateway` to `COMBAT_MINE_DETONATION` (sector-scoped to mine.sector). Update `combat-broadcast.spec.ts`.

**Checkpoint**: US3 done. Quickstart Scenario C green including post-restart hydrate.

---

## Phase 6: User Story 4 — Lock, Shields, Flux (Priority: P2)

**Goal**: `loc <name>` sets `lock`; `@` resolves lazily on use; `shi up`/`dn` toggles shields and the next tick does not auto-raise after a torpedo; `flux` consumes one flux pod and refills energy to `ENGYMAX`.

**Independent Test**: Quickstart Scenario D — drain energy, `flux` restores; `shi dn`/`shi up` toggles; firing a torpedo lowers shields and they remain lowered (FR-020).

### Tests for User Story 4

- [ ] T045 [P] [US4] Write `backend/test/game/commands/handlers/lock.spec.ts` — `loc <name>` happy path, self-lock reject, target-not-in-scan reject, `@` shorthand resolves through `findShip` lazy clear, NOLOCK on out-of-range stale lock (FR-018, R-4), JAMMER4 reject when firer's `jammer > 0` (FR-017, `GECMDS.C:1354–1358`).
- [ ] T046 [P] [US4] Write `backend/test/game/commands/handlers/shield.spec.ts` — `shi up` raises, `shi dn` lowers, no auto-raise on tick after torpedo (FR-019, FR-020).
- [ ] T047 [P] [US4] Write `backend/test/game/commands/handlers/flux.spec.ts` — happy path (consume one flux pod, set `energy = ENGYMAX`), no flux pod reject, energy already at max still consumes pod (edge case in spec lines 211–213, FR-021).

### Implementation for User Story 4

- [ ] T048 [P] [US4] Implement `backend/src/game/commands/handlers/lock.handler.ts` — `loc <name>` uses `findShip` (no `@` resolution here); rejects self-lock and out-of-scan; sets `lock = target.channel` via `mutate`. JSDoc cites `GECMDS.C:cmd_lock` lines 1441–1471.
- [ ] T049 [P] [US4] Implement `backend/src/game/commands/handlers/shield.handler.ts` — `shi up` / `shi dn` toggles `shieldstat`. JSDoc cites `GECMDS.C:cmd_shield`.
- [ ] T050 [P] [US4] Implement `backend/src/game/commands/handlers/flux.handler.ts` — decrement one flux pod from `items`, set `energy = ENGYMAX`. JSDoc cites `GECMDS.C:735–752`.
- [ ] T051 [US4] Register `loc`, `shi`, `flux` handlers in `command.service.ts`. Wire phaser/torpedo/missile/lock handlers to use `findShip` from T016 for `@` resolution and JAMMER4 reject from T043.
- [ ] T052 [US4] Confirm no auto-raise pass exists in `combat-tick.service.ts`; add an explicit assertion test in `combat-tick.service.spec.ts` that `shieldstat` is unchanged across a tick following torpedo fire (FR-020).

**Checkpoint**: US4 done. Quickstart Scenario D green.

---

## Phase 7: User Story 5 — Kills, Death Broadcast, Planet Revolt (Priority: P3)

**Goal**: When a ship's `damage >= 100`, the kill check credits `lastfired`, broadcasts galaxy-wide, and clears in-flight projectiles targeting the victim. Separately, planet revolt fires deterministically inside the economy tick when conditions are met.

**Independent Test**: Quickstart Scenario E (death broadcast) and Scenario F (planet revolt fixture).

### Tests for User Story 5

- [ ] T053 [P] [US5] Write `backend/test/game/combat/kill-attribution.spec.ts` (FR-026) — multi-hit same tick: torpedo from A, missile from C; kill credited to whichever processed last (torps before missiles, low-index first); deterministic via slot ordering.
- [ ] T054 [P] [US5] Write `backend/test/game/combat/in-flight-cleanup.spec.ts` (FR-027) — covers all three cleanup cases:
    1. **Firer dies**: every other ship's `ltorps[]` and `lmissl[]` slots whose `.channel == firer.channel` are cleared (`GEFUNCS.C:1755–1778`).
    2. **Target dies**: target's own slots are intrinsically removed with the ship.
    3. **Target leaves game mid-flight** (FR-027.3): a torpedo in flight on Bob's `ltorps[]`; Bob removed via `!ingegame` before reaching zero distance; slot cleared with no `combat.hit` and no kill credit. (Overlaps T025's tick-pass case; this test asserts the cross-ship invariant.)
- [ ] T055 [P] [US5] Write `backend/test/game/combat/death-broadcast.spec.ts` — on death, `COMBAT_SHIP_DESTROYED` payload populated correctly; gateway broadcasts to **galaxy-wide** (every connected client), not just sector (FR-031, R-7).
- [ ] T056 [P] [US5] Write `backend/test/game/planet/revolt.spec.ts` (SC-007) — fixture with `(taxrate/120) × 0.35 × men > troops` and seeded `Random.next() = 0` (so `gernd() % 10 === 0`); economy tick → `troops` reduced to `troops/((rand%8)+2)`, `MAIL_CLASS_DISTRESS` queued, `ownerUserId = null`, **no** combat events emitted, **no** ship damage applied.

### Implementation for User Story 5

- [ ] T057 [US5] Add kill-resolution pass to `combat-tick.service.ts` (after projectile + mine + phaser passes): for each ship with `damage >= 100`, look up `lastfired` channel → attacker; increment attacker's `kills`; emit `COMBAT_SHIP_DESTROYED` with the channel + weapon (derived from the last hit emitted on that victim this tick); call `ShipStateService.removeFromGame(victim)`. JSDoc cites `GEFUNCS.C:killem`, `acctm`, lines 1103, 1118.
- [ ] T058 [US5] Implement in-flight cleanup helper in `combat-tick.service.ts` — after each death, walk every other active ship's `ltorps[]`/`lmissl[]` and clear (`channel = 255`) any slot whose `.channel === deadShip.channel` (this handles the firer-dies case from `GEFUNCS.C:1755–1778`); the dead ship's own slots are discarded with the ship. Additionally, the projectile-travel pass (T029) clears slots whose carrier becomes `!ingegame` mid-flight (FR-027.3). Tested by T054.
- [ ] T059 [US5] Subscribe `GameGateway` to `COMBAT_SHIP_DESTROYED` and broadcast **galaxy-wide** (`server.emit(...)` rather than `server.to(room).emit(...)`). Update `combat-broadcast.spec.ts` to assert the galaxy-wide path.
- [ ] T060 [US5] Modify `backend/src/game/planet/planet-economy.service.ts` to add the revolt branch per FR-028 / R-11: per owned planet evaluated in the economy tick, when `(taxrate/120) × 0.35 × men > troops` AND `Random.next()` rolls `gernd()%10 === 0`, mutate `troops = troops / ((rand % 8) + 2)`, queue a `MAIL_CLASS_DISTRESS` row via the existing mail service, and set `ownerUserId = null`. No combat events emitted. JSDoc cites `GEPLANET.C:341–380`.
- [ ] T061 [US5] Inject `RANDOM` port into `PlanetEconomyService` and replace any existing `Math.random` callsite touched in T060 with `random.next()` so SC-007 remains deterministic. Update unit tests in `planet-economy.service.spec.ts` to bind the seedable adapter.

**Checkpoint**: US5 done. Quickstart Scenarios E and F green. SC-007 passes deterministically.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T062 [P] Update `docs/ARCHITECTURE.md` with the new `combat/` module map and event-bus topology.
- [ ] T063 [P] Update `docs/PROGRESS.md` with the 006b completion summary and links to new tests.
- [ ] T064 [P] Update `docs/GAME_MECHANICS.md` with phaser, torp/missile, mine, decoy, jammer, lock, shield, flux, and revolt sections — each with `@see` C-source references.
- [ ] T065 [P] Add `docs/DECISIONS.md` entries for: tick-subscription ordering (R-1), `Random` DI port (R-2), no-owner-exclusion mine sweep (R-3), galaxy-wide death broadcast (R-7), friendly-fire enabled (R-6).
- [ ] T066 Run `npm test` in `backend/` and confirm all 754 prior tests + the new combat suite are green (SC-001).
- [ ] T067 Run quickstart Scenarios A–F manually against `npm run start:dev`; record a green checkmark in `specs/006b-combat/quickstart.md` log section.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies.
- **Phase 2 (Foundational)**: depends on Phase 1. **Blocks all user stories.**
- **Phase 3 (US1 P1)**: depends on Phase 2.
- **Phase 4 (US2 P1)**: depends on Phase 2; can run in parallel with Phase 3 (different handlers, different tick passes).
- **Phase 5 (US3 P2)**: depends on Phase 2; can run in parallel with Phases 3, 4.
- **Phase 6 (US4 P2)**: depends on Phase 2; T051 integrates with Phases 3/4 handlers (touches their files), so finalize T051 only after Phases 3 and 4's handlers exist.
- **Phase 7 (US5 P3)**: depends on Phases 3 and 4 (uses their hit/projectile passes); T060/T061 (revolt) is independent of combat and can land any time after Phase 2.
- **Phase 8 (Polish)**: depends on all prior user-story phases.

### Within-story ordering

- Tests precede implementation (Constitution II).
- For each user story: T-test tasks → handler/service tasks → command-service registration → gateway broadcast wiring.
- Models (none in this feature — no schema change) precede services; pure-math precedes the tick service that uses it (already enforced by Phase 2).

### Parallel opportunities

- All [P] tasks within a phase touch different files and have no incomplete deps.
- Phases 3, 4, 5, 6 user-story implementations can be staffed in parallel by separate developers, sharing only Phase 2's outputs.
- All `[P] [US*]` test tasks within a single phase can be authored simultaneously.

---

## Parallel Example: Phase 5 (US3) tests

```
Task: backend/test/game/commands/handlers/mine.spec.ts        (T031)
Task: backend/test/game/commands/handlers/zipper.spec.ts      (T032)
Task: backend/test/game/commands/handlers/decoy.spec.ts       (T033)
Task: backend/test/game/commands/handlers/jammer.spec.ts      (T034)
Task: backend/test/game/commands/handlers/sys-unjam.spec.ts   (T035)
```

All five touch separate files; all can be drafted in parallel before any Phase 5 implementation lands.

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 → Phase 2 → Phase 3.
2. Validate Quickstart Scenario A with two real WebSocket clients.
3. Ship MVP. Phaser-only combat is a usable, demoable increment.

### Incremental Delivery

1. MVP (US1, phaser combat).
2. Add US2 (torpedoes/missiles + decoy intercept) — heavy weapons online.
3. Add US3 (mines/zippers/decoys/jammers) — area-denial and defense.
4. Add US4 (lock/shields/flux) — combat-quality-of-life polish.
5. Add US5 (kill broadcast + planet revolt) — closes the loop, closes the 005 carry-over.

Each step is independently demoable, ships its own tests, and never breaks earlier stories.

---

## Notes

- 68 tasks total. US-coverage breakdown: Setup 3, Foundational 14, US1 6, US2 8, US3 14, US4 8, US5 9, Polish 6.
- Parallel opportunities: 32 tasks marked `[P]` (different files, no incomplete deps).
- All combat math goes through the injected `Random` port — never `Math.random()` inline.
- Combat services emit `EventEmitter2` events only; the gateway is the sole Socket.io bridge (FR-031). Galaxy-wide is the single exception for `COMBAT_SHIP_DESTROYED`.
- No new Prisma migration. `Mine` table from 001 is reused unchanged.
- Constants extension in T004 is the single source of truth feeding the balance-regression test (T015) — adding a constant to one without the other is a review-blocker.
- Per-ship try/catch (T013) is non-negotiable for SC-005 and FR-030.
