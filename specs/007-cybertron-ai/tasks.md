---

description: "Task list for Cybertron AI (feature 007)"
---

# Tasks: Cybertron AI

**Input**: Design documents from `/specs/007-cybertron-ai/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cybertron-events.md, quickstart.md

**Tests**: Mandatory per Constitution Principle II. Tests are written before or alongside implementation. The 006b `Random` port (seeded Mulberry32 in tests) is reused for determinism (R-5).

**Organization**: Grouped by user story (US1–US6). Setup (Phase 1) and Foundational (Phase 2) are blocking prerequisites for every story. Each story is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no dependency on incomplete tasks
- **[Story]**: User story label (US1..US6); omitted for Setup/Foundational/Polish

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Module scaffolding and constant additions that every later phase depends on.

- [X] T001 Create `backend/src/game/cybertron/` directory and add an empty `cybertron.module.ts` exporting `CybertronModule` that imports `CombatModule` and `PhysicsModule` (R-1 module-import ordering).
- [X] T002 [P] Add Cybertron behavioral constants to `backend/src/game/constants.ts`: `CYBTICKTIME=6`, `CYB_MINCLASS=3`, `CYBSLO=3`, `CYB_ALLOW=35`, `CYB_MAXCASH=2_000_000`, `CYB_BE_NICE=30`, `CYB_BE_EASY=60`, `CYB_BREAKOFF=500`, `CYB_MINDAM=75`, `CYBMAXPERTICK=2`, `CYB_TOUGH_0=0`, `CYB_TOUGH_1=1`, `CLASSTYPE_CYBORG=2` — all `as const`, with `@see GEMAIN.H` JSDoc references (R-6).
- [X] T003 [P] Create `backend/src/game/cybertron/cybertron.config.ts` — typed `CybertronClassConfig` interface (`tot_to_create`, `tooclose`, `hyperdist1`, `hyperdist2`, `cyb_gold`) keyed by `classNumber`, registered with NestJS `ConfigModule` via `registerAs('cybertron', …)`. Defaults verbatim from `reference/ge-source/GECYBS.C` class table; env override pattern `CYBERTRON_CLASS_<N>_TOT_TO_CREATE` etc. (R-6, FR-017 spec assumption).
- [X] T004 [P] Create `backend/src/game/cybertron/cybertron-events.ts` — `CYBERTRON_EVENT` const map (`TAUNT`, `SPAWNED`, `TARGET_ACQUIRED`, `BROKE_OFF`) and exported payload interfaces `CybertronTauntPayload`, `CybertronSpawnedPayload`, `CybertronTargetAcquiredPayload`, `CybertronBrokeOffPayload` matching `contracts/cybertron-events.md` exactly.
- [X] T005 [P] Create `backend/src/game/cybertron/taunt-pool.ts` — `TAUNT_MESSAGES: readonly string[]` (10–15 hostile in-character strings inspired by the original) and `pickTaunt(rand: Random): string` helper using the injected `Random` port (R-5, FR-006a).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pieces every user story needs in place before its slice can be exercised.

**⚠️ CRITICAL**: Phase 2 must complete before any US-labelled task starts.

- [X] T006 Extend `backend/prisma/seed/ship-classes.ts` with classes 24 and 25 (Sarterns) — every column (`category='CPU_COMBATIVE'`, `tough`, `scanRange`, `maxShields`, `maxPhaser`, `hasTorpedo`, `hasMine`, `hasJammer`, `hasZipper`, `noClaim`, `cybCanAttack`, `cybLowestClassAttacks`) sourced verbatim from `reference/ge-source/GECYBS.C` class table; idempotent upsert (FR-017).
- [X] T007 Extend `backend/src/game/cybertron/cybertron.config.ts` with default per-class entries for classes 24 and 25, mirroring T006 values for `tot_to_create`, `tooclose`, `hyperdist1`, `hyperdist2`, `cyb_gold` (FR-017).
- [X] T008 Create `backend/src/game/cybertron/cyb-decisions.ts` skeleton (no logic yet) exporting pure-function signatures: `cybwhoops`, `gebemean`, `pickPursuitBand`, `rollTorpedoCount`, `pickSpawnClass`, `randomInitLoadout`, `randomCybSkill`. All take `Random` and plain inputs; return plain values. No NestJS imports.
- [X] T009 Create `backend/src/game/cybertron/cybertron.repository.ts` skeleton — methods `hydrateAll(): Promise<HydratedCybertron[]>`, `createSpawn(slot: SpawnSlotInit): Promise<void>`, `flushUsersImmediate(userids: string[]): Promise<void>`, `flushShipsImmediate(shipKeys: string[]): Promise<void>`. Stub bodies; wired to `PrismaService`.
- [X] T010 Create `backend/src/game/cybertron/cybertron-tick.service.ts` skeleton — `@Injectable()` provider with `onModuleInit` that calls `tickService.subscribe(TickKind.PHYSICS, this.onPhysicsTick)` (R-1) and `eventEmitter.on('combat.ship-destroyed', this.onShipDestroyed)` (R-4). `onPhysicsTick` is empty.
- [X] T011 Wire `CybertronModule` providers (`CybertronTickService`, `CybertronRepository`) and register it in `backend/src/game/game.module.ts` after `CombatModule` so subscription order is enforced (R-1).
- [X] T012 **HARD BLOCKING GATE — must complete before any US5 task starts.** Verify the existing 006b `combat.ship-destroyed` event payload contains all four required fields: `attackerShipKey`, `victimShipKey`, `attackerUserid`, `victimUserid`. Read the emitter in `backend/src/game/combat/` and the payload type definition; write an assertion test in `backend/test/game/combat/ship-destroyed-payload.spec.ts` that fails if any of the four fields is absent or wrongly typed. **If any field is missing**, do NOT proceed to US5: instead create sub-tasks T012a / T012b / etc. that extend the 006b emitter to include the missing fields (with corresponding payload-type updates and tests in the combat module), and finish those before starting Phase 7. FR-005a / R-4 / T061 cannot function without this contract being met. Do not defer this to `docs/PROGRESS.md`.

**Checkpoint**: Module is wired, constants pinned, decision module stubbed, repository stubbed, Sartern seed in place. User story slices can begin.

---

## Phase 3: User Story 1 — Cybertrons populate the universe and hunt players (P1) 🎯 MVP

**Goal**: Spawn-fill on boot, target acquisition + pursuit speed bands (including hyperwarp drop-shield), neutral-zone exclusion.

**Independent Test**: Boot fresh DB; over simulated ticks, observe per-class population reach `tot_to_create`. Place a player ship of class ≥ `CYB_MINCLASS` outside the NZ in scan range — within one Cybertron tick the closest Cybertron sets `cybmine`. Place player ≥25 sectors away → Cybertron transitions to hyperwarp; close to <10 → brakes.

### Tests for User Story 1 (write first, must FAIL initially)

- [X] T013 [P] [US1] Unit test `pickSpawnClass` and `randomInitLoadout` in `backend/test/game/cybertron/cyb-decisions.spec.ts` — seeded PRNG; assert: 1% random-class branch, loadout ranges (`I_FLUXPOD = rnd%5`, `I_DECOYS = rnd%25`, `I_TORPEDO = rnd%25`, `I_MINE = rnd%100`, `I_JAMMERS = rnd%100`, `I_GOLD = rnd%cyb_gold`), `cybskill` in `[3,17]` (FR-004, FR-013).
- [X] T014 [P] [US1] Unit test `pickPursuitBand` in `backend/test/game/cybertron/cyb-decisions.spec.ts` — assert hyperwarp band (`distance ≥ hyperdist1` → `where=1`, speed `distance*2000`, shield `0`), brake band (`hyperdist2 ≤ d < hyperdist1` → top speed), close band (`3.0 < d < hyperdist2`), combat band (`d ≤ 3.0`). Verify exact threshold ordering (FR-010, FR-016, R-9).
- [X] T015 [P] [US1] Integration test `cybertron-tick.service.spec.ts` — fake-timer + seeded PRNG: boot service, drive 30 ticks, assert one spawn slot fires (R-2 modulo-30 cadence) and creates a `Ship` row with `Cybrg-<n>` userid (FR-003).
- [X] T016 [P] [US1] Integration test in same file — populate one Cybertron + one player at distance < `scanRange` outside NZ, drive one tick, assert `cybertron.target-acquired` event emitted and `Ship.cybmine` set to player `shipno` (FR-006, FR-010).
- [X] T017 [P] [US1] Integration test — populate Cybertron with target ≥ `hyperdist1` away, drive one lockon tick, assert `Ship.where = 1`, `Ship.shield = 0`, desired speed ~ `distance*2000` (R-9, FR-010).
- [X] T018 [P] [US1] Integration test — Cybertron drops from hyperspace (`where: 1→0` transition), assert `Ship.shield` restored to `ShipClass.maxShields` (R-9 spec clarification).
- [X] T019 [P] [US1] `backend/test/game/cybertron/neutral-zone.spec.ts` — player inside NZ, drive 100 ticks, assert zero target-acquisitions and zero phaser/torpedo emissions toward that player (SC-007, FR-006).
- [X] T020 [P] [US1] `backend/test/game/cybertron/noclaim.spec.ts` — one player surrounded by N+1 Cybertrons of a class with `noClaim=N`; assert at most N Cybertrons claim the player at any tick (SC-006, FR-010).
- [X] T020a [P] [US1] **SC-002 statistical test** in `backend/test/game/cybertron/acquisition-rate.spec.ts` — run 100 seeded trials. Each trial: fresh in-memory state, one Cybertron at random position outside NZ, one player ship of class ≥ `CYB_MINCLASS` placed within the Cybertron's `scanRange` outside NZ, drive exactly one Cybertron tick. Assert ≥95 of 100 trials end with `cybmine` set to that player's `shipno`. Use distinct PRNG seeds across trials, seed list checked into test (SC-002).
- [X] T020b [P] [US1] **SC-003 hyperwarp travel-time test** in `backend/test/game/cybertron/hyperwarp-arrival.spec.ts` — two paired runs with identical seeds and geometry: target placed exactly `hyperdist1 + 5` sectors away. Run A: full pursuit (hyperwarp band engaged). Run B: synthetic baseline that forces `pickPursuitBand` to always return the close-band (top speed only). For both, count physics ticks until the Cybertron is co-sector with the target. Assert `arrivalTicksA < arrivalTicksB / 2` (SC-003).
- [X] T020c [P] [US1] **SC-001 spawn-fill timing test** in `backend/test/game/cybertron/spawn-fill-timing.spec.ts` — fast-clock simulation: drive `CybertronTickService.onPhysicsTick` for 150 simulated ticks (15 in-game minutes ÷ 6s per tick). Seed empty DB. Assert that for **every** AI class with `tot_to_create > 0` (including Sartern classes 24, 25), the AUTO-status ship count equals `tot_to_create`. No real timers — use `jest.useFakeTimers()` with the seeded `Random` port (SC-001).

### Implementation for User Story 1

- [X] T021 [P] [US1] Implement pure functions in `backend/src/game/cybertron/cyb-decisions.ts`: `cybwhoops(skill, rand)`, `randomCybSkill(rand)`, `randomInitLoadout(cybGold, rand)`, `pickSpawnClass(classCounts, configs, rand)` (1% random-class branch). Each function carries `@see GECYBS.C:` line reference.
- [X] T022 [P] [US1] Implement `pickPursuitBand(distance, hyperdist1, hyperdist2, currentWhere, classMaxShields)` returning `{ desiredSpeed, where, shield, raiseShields }` per FR-010 / R-9. Encode the four-band ordering exactly.
- [X] T023 [US1] Implement `CybertronRepository.hydrateAll()` — `prisma.user.findMany({ where: { userid: { startsWith: 'Cybrg-' } }, include: { ships: true } })`; clamp `cash` to `CYB_MAXCASH`; load into `ShipStateService` with `status = AUTO` (FR-018, FR-020). NOTE: All `CLASSTYPE_CYBORG` ships including Sarterns (classes 24/25) use the `Cybrg-` prefix — verified against `GECYBS.C:104-105`. Do not add a `Sartn-` filter.
- [X] T024 [US1] Implement `CybertronRepository.createSpawn(slot)` — pick next AVAIL `shipno` above `nterms`, build `User` row (`userid: Cybrg-<n>`, `cash: rnd%cyb_gold`) and `Ship` row (coords, `phasr=100`, `cybmine=255`, `phasrtype/shieldtype=class max`, `items[]` per `randomInitLoadout`, `cybskill`, `status=AUTO`, `tick=CYBTICKTIME+rnd%CYBTICKTIME`) in a single transaction (FR-004).
- [X] T025 [US1] Hook boot-time hydrate: `CybertronTickService.onApplicationBootstrap()` calls `repository.hydrateAll()` before the first physics tick fires (FR-020).
- [X] T026 [US1] Implement spawn slot in `CybertronTickService.onPhysicsTick`: increment `spawnTickCounter`; on `% 30 === 0` call `pickSpawnClass`, count current AUTO ships of chosen class against `tot_to_create`, if below cap call `repository.createSpawn` and emit `cybertron.spawned` (FR-003, R-2).
- [X] T027 [US1] Implement per-tick iteration: filter `ShipStateService` Map for `status === AUTO`, decrement `tick` for each; for ships at zero invoke `cybLives(ship)` private method; honor `CYBMAXPERTICK = 2` activations cap per service tick using `activationsThisTick` counter (FR-002, R-3).
- [X] T028 [US1] Implement `cybLives` shell: credit `+CYB_ALLOW` to `User.cash`; branch on `jammer === 0` (engagement scan) vs `!== 0` (jammed branch — stubbed for US4); call `cyb_check_damage` (stub for US4); call `cyb_check_lockon`; reset `energy=50_000`; recompute next `tick` per FR-011.
- [X] T029 [US1] Implement `cyb_check_lockon` — early-return on `holdcourse > 0` (decrement); validate current `cybmine` (clear if logged out / cloaked / out of range); else scan in-game uncloaked humans of class ≥ `cybLowestClassAttacks` not already claimed by `noClaim` other Cybertrons; pick closest; set `cybmine`; emit `cybertron.target-acquired`; apply `pickPursuitBand` result to `where`/`shield`/`speed2b`/`heading` (FR-010).
- [X] T030 [US1] Implement neutral-zone exclusion using `physics-math.ts:neutral(coord)` for both candidate target filter and engagement gate (FR-006, SC-007).
- [X] T031 [US1] Detect hyperspace exit (`where: 1 → 0`) inside `cyb_check_lockon` and restore `Ship.shield = ShipClass.maxShields` (R-9).
- [X] T032 [US1] Add immediate-flush hooks: on target acquired and on target lost/cleared, call `repository.flushShipsImmediate([shipKey])` and `flushUsersImmediate([userid])` (FR-019).

**Checkpoint**: US1 fully functional — universe spawns up to caps, Cybertrons acquire targets, hyperwarp/brake/close/combat speed bands work, NZ players never engaged, `noClaim` honored. MVP shippable.

---

## Phase 4: User Story 2 — Cybertrons engage with the full combat toolkit (P1)

**Goal**: Phaser + torpedo + decoy + Zipper engagement composing 006b primitives, plus breakoff roll and `cyb_annoy` taunt.

**Independent Test**: Place player adjacent to Cybertron with phasers + torpedoes; within a small number of physics ticks observe phaser fire emission via 006b helper, torpedo volley scaled by player kills, decoy refresh, and (occasionally) `cybertron.broke-off` event after a long engagement.

### Tests for User Story 2 (write first)

- [X] T033 [P] [US2] Unit test `gebemean` in `backend/test/game/cybertron/cyb-decisions.spec.ts` — assert: cyberquad always true, target `kills > CYB_BE_NICE` always true, otherwise 1-in-`CYBSLO` (FR-014).
- [X] T034 [P] [US2] Unit test `rollTorpedoCount` — assert cyberquad → `rnd%6`, ordinary + target `kills ≥ CYB_BE_EASY` → `rnd%6`, ordinary + `kills < CYB_BE_EASY` → `rnd%2`, `gebemean false` → 0, class `hasTorpedo=false` → 0 (FR-015).
- [X] T035 [P] [US2] Integration test in `cybertron-tick.service.spec.ts` — Cybertron at phaser range with charged phasers + `gebemean=true`; assert 006b phaser-fire helper invoked with bearing toward target (FR-006, FR-014).
- [X] T036 [P] [US2] Integration test — Cybertron in normal space at `tooclose` range with target's class `cybs_can_att=false` and target `cantexit=0`; assert `cyb_annoy` branch — `cybertron.taunt` event emitted with message from pool, NO weapon-fire helper called, NO heading/shield change (FR-006, FR-006a).
- [X] T037 [P] [US2] Integration test — `cybwhoops` "miss" roll suppresses `firep` in `cyb_attack` and decoy refresh in `cyb_lay_decoys` (FR-012). Use seeded PRNG to force whoops.
- [X] T038 [P] [US2] Integration test — non-quad Cybertron with target visible, force the seeded PRNG so 1-in-`CYB_BREAKOFF` succeeds → assert `cybertron.broke-off` emitted, `cybmine` cleared, speed reset to top (FR-007).
- [X] T039 [P] [US2] Integration test — class with `hasZipper=true` detects mines in scan range; assert Zipper-launch helper called and Cybertron breaks off + circles back (FR-006 / US2 acceptance #3).

### Implementation for User Story 2

- [X] T040 [P] [US2] Implement `gebemean(cybTough, targetKills, rand)` and `rollTorpedoCount(cybTough, targetKills, classHasTorpedo, gebemeanResult, rand)` in `cyb-decisions.ts` (FR-014, FR-015).
- [X] T041 [US2] Implement engagement scan branch inside `cybLives` (FR-006): for each in-game human ship with `substate ≥ FIGHTSUB` and `cloak !== 10`:
  - skip if Cybertron in NZ or target outside class `scanRange`,
  - warp-fire path (`where==1` both sides + `gebemean` + range/`cybs_can_att`/`cantexit` test + `distance*10000 < 30000`) → call 006b phaser helper,
  - normal-space path (`where==0`, target not in warp) → set bearing, `accelDesire=2`, decide `cyb_attack` vs `cyb_annoy`, then `cyb_lay_decoys`.
- [X] T042 [US2] Implement `cyb_attack` — gate `firep` call by `cybwhoops`; volley size from `rollTorpedoCount`; for each torpedo, refill `I_TORPEDO` to `(rnd%5)+1` first, then call 006b torpedo-launch helper (FR-012, FR-015).
- [X] T043 [US2] Implement `cyb_annoy` — pick taunt via `pickTaunt(rand)`, emit `cybertron.taunt` event with `{ attackerShipKey, targetShipKey, message, sector, tickAt }`. NO weapon fire, NO shield change, NO heading change (FR-006a, R-10).
- [X] T044 [US2] Implement `cyb_lay_decoys` gated by `cybwhoops`; calls 006b decoy helper (FR-012).
- [X] T045 [US2] Implement breakoff roll inside engagement scan — for non-quad Cybertrons, 1-in-`CYB_BREAKOFF` per visible target → clear `cybmine`, reset `speed2b` to class top, emit `cybertron.broke-off` (FR-007).
- [X] T046 [US2] Implement Zipper branch — class with `hasZipper=true` detecting mines triggers Zipper-launch via 006b primitive then sets `cybmine=255` and pursuit speed away (FR-006 / US2 #3).
- [X] T047 [US2] Wire `GameGateway` to subscribe to `cybertron.taunt` and `cybertron.broke-off`: deliver to target's socket as event-log line; broadcast taunt to target's sector room ("lucky day" message for broke-off) — `backend/src/gateway/game.gateway.ts` (R-10, FR-007).

**Checkpoint**: US2 functional — Cybertrons fight using full toolkit; `cybwhoops` causes misses; `cyb_annoy` produces taunts only; breakoff event reaches target.

---

## Phase 5: User Story 3 — Difficulty escalates with player kill count (P2)

**Goal**: `gebemean` + torpedo-volley sizing already implemented in US2 but explicitly verified against kill-count thresholds.

**Independent Test**: Two simulated runs with identical setup but player kills = 10 vs 100; aggregate `mean-check` pass rate and torpedo volley size — 100-kill case strictly higher.

### Tests for User Story 3 (write first)

- [X] T048 [P] [US3] Statistical test in `backend/test/game/cybertron/difficulty-curve.spec.ts` — over 1000 ticks with seeded PRNG, kills=10 vs kills=100, assert mean-pass rate is statistically lower for kills=10 and `≥` always for kills≥30 (SC-004, FR-014).
- [X] T049 [P] [US3] Statistical test — same setup, average torpedo volley count for kills<60 ≤ 1, for kills≥60 mean ≈ 2.5 (FR-015).

### Implementation for User Story 3

- [X] T050 [US3] Verification only — no new code; confirm `gebemean` and `rollTorpedoCount` paths from US2 honor `CYB_BE_NICE` / `CYB_BE_EASY` exactly. If T048/T049 reveal drift, fix in `cyb-decisions.ts`.

**Checkpoint**: US3 verified — difficulty curve measurable.

---

## Phase 6: User Story 4 — Damaged Cybertrons defend, jammed Cybertrons evade (P2)

**Goal**: `cyb_check_damage` (lay mine, deploy jammer, randomize heading on `damage > CYB_MINDAM`) and jammed branch (skip targeting, lay mine, random heading, hold course).

**Independent Test**: Apply `damage > 75` to a hunting Cybertron; over many ticks observe mine-lay (1-in-10 × 1-in-5) and jammer-deploy (1-in-100) emissions plus heading randomization. Set `jammer != 0` on a Cybertron; observe targeting skipped and mine-lay roll.

### Tests for User Story 4 (write first)

- [X] T051 [P] [US4] Integration test in `cybertron-tick.service.spec.ts` — Cybertron with `cybmine < 255` and `damage = 80`, force seeded PRNG, assert mine-lay 006b helper called, jammer-deploy helper called, `heading2b` and `holdcourse` randomized (FR-009).
- [X] T052 [P] [US4] Integration test — Cybertron with `jammer = 50`, drive a tick, assert NO target acquisition this tick, assert mine-lay rolled (1-in-5), `heading2b`/`holdcourse` randomized (FR-008).

### Implementation for User Story 4

- [X] T053 [US4] Implement `cyb_check_damage` (FR-009): if `cybmine < 255` and `damage > CYB_MINDAM` and 1-in-10 roll passes → mine-lay (1-in-5, gated by `hasMine` + inventory > 0), jammer-deploy (1-in-100, gated by `hasJammer` + inventory > 0), randomize `heading2b` and `holdcourse`.
- [X] T054 [US4] Replace jammed-branch stub in `cybLives` with real implementation (FR-008): skip target scan, mine-lay roll, random new heading, hold course for randomized duration.
- [X] T055 [US4] Add immediate-flush on damage taken and inventory depletion (FR-019).

**Checkpoint**: US4 functional — defensive and evasive behaviors run on the right gates.

---

## Phase 7: User Story 5 — Cybertrons persist across server restarts (P2)

**Goal**: Boot-time hydrate fills only the gap; gold clamps to `CYB_MAXCASH`; immediate-flush on significant events; 30s async flush via existing ShipService.

**Independent Test**: Run the server, populate Cybertrons, kill one (gold transfer), let some accumulate gold past `CYB_MAXCASH`; restart; assert identities/positions/loadouts/gold (post-clamp)/`cybskill` preserved across 10 cycles.

### Tests for User Story 5 (write first)

- [X] T056 [P] [US5] `backend/test/game/cybertron/persistence.spec.ts` — real test DB; seed N Cybertrons of various classes (including class 24/25 Sarterns to confirm shared `Cybrg-` prefix); simulate boot via `CybertronTickService.onApplicationBootstrap`; assert all N rehydrated with identical `Ship`/`User` fields and `status=AUTO` (FR-020, SC-005).
- [X] T057 [P] [US5] Persistence test — seed a Cybertron with `User.cash > CYB_MAXCASH`; on hydrate assert `cash` clamped to `CYB_MAXCASH` (FR-005, FR-020).
- [ ] T058 [P] [US5] Persistence test — seed only 2 of 4 expected Cybertrons for class X; drive enough ticks for spawn cadence (R-2); assert spawn-fill creates exactly 2 more, none duplicated (US5 acceptance #3).
- [X] T059 [P] [US5] `backend/test/game/cybertron/gold-transfer.spec.ts` — emit `combat.ship-destroyed` with victim `userid=Cybrg-7` (and a second case with a class-24 Sartern victim, also `Cybrg-<n>`) and attacker `userid=player1`; assert player1 `User.cash` increased by min(victim.cash, `CYB_MAXCASH`), victim cash zeroed, both flushed immediately (FR-005a, R-4).

### Implementation for User Story 5

- [X] T060 [US5] Complete `CybertronRepository.flushUsersImmediate` and `flushShipsImmediate` (Prisma upserts, BigInt cash arithmetic). **Every write path that touches `User.cash` for a `/^Cybrg-/` user MUST apply the `CYB_MAXCASH` clamp before persisting**: (a) spawn-init insert in `createSpawn`, (b) `flushUsersImmediate` (significant-event path), (c) the existing 30s async `ShipStateService` flush wrapper for Cybertron-owned `User` rows, (d) boot-time `hydrateAll`. Centralize the clamp in a single `clampCybertronCash(amount: bigint): bigint` helper on the repository so all four call sites share one implementation (FR-005, FR-019, FR-020, R-11).
- [X] T060a [P] [US5] Unit test in `backend/test/game/cybertron/persistence.spec.ts` — exercise the clamp at every persistence boundary: (1) `createSpawn` with a synthetic class config whose `cyb_gold > CYB_MAXCASH` → assert persisted `User.cash <= CYB_MAXCASH`; (2) call `flushUsersImmediate` after manually setting in-memory `User.cash = CYB_MAXCASH + 1_000_000n` → assert persisted value clamped; (3) drive a 30s flush cycle with cash above cap → assert clamped; (4) seed a row with cash above cap, call `hydrateAll` → assert in-memory state is clamped. All four scenarios use the shared `clampCybertronCash` helper introduced in T060 (FR-005, FR-020).
- [X] T061 [US5] Implement `combat.ship-destroyed` listener in `CybertronTickService.onShipDestroyed` — match victim `userid` against the single `/^Cybrg-/` regex (covers Sarterns too; see T023 / `GECYBS.C:104-105`); clamp+transfer+zero cash via repository immediate flush (FR-005a, R-4).
- [X] T062 [US5] Wire 30s async flush — confirm `ShipStateService` already flushes Cybertron-owned `Ship` rows on its existing 30s cadence; no new code required, but add a `cybertron.repository` integration test confirming rows written within ~30s of mutation (R-11).
- [X] T063 [US5] Implement `cybupdate` decrement at end of `cybLives` (FR-019): on rollover, randomize speed/heading if not hunting (`cybmine === 255`); reset `cybupdate = 100 + rnd%100`.

**Checkpoint**: US5 functional — restarts preserve state, gold clamps, gap-fill works, gold transfers on kill.

---

## Phase 8: User Story 6 — Sarterns share the Cybertron code path (P3)

**Goal**: Confirm classes 24/25 use the exact same code path with their own class-table stats. No new logic; verify-and-document.

**Independent Test**: With Sartern `tot_to_create > 0`, observe spawn-fill via the same path; observe a Sartern execute `cyb_lives` with its own loadout/ranges.

### Tests for User Story 6 (write first)

- [X] T064 [P] [US6] Integration test — `cybertron-tick.service.spec.ts` — set Sartern class 24 `tot_to_create=2`; drive ticks; assert 2 Sartern Ships spawn with `Cybrg-<n>` userid prefix (same as all other CYBORG-class ships per `GECYBS.C:104-105`) and use class 24 stats for `scanRange`/`maxShields`/etc. (FR-017, US6 acceptance #1).
- [X] T065 [P] [US6] Integration test — spawned Sartern executes `cyb_lives` with its own class row; assert `pickPursuitBand` uses class 24's `hyperdist1`/`hyperdist2` from `cybertron.config.ts`, not class-3 defaults (FR-017, US6 acceptance #2).

### Implementation for User Story 6

- [X] T066 [US6] Verify — `pickSpawnClass` enumerates all `category='CPU_COMBATIVE'` classes (covers 24/25). All such classes share the single `Cybrg-` userid prefix per `GECYBS.C:104-105`; no per-class prefix selector is needed. Confirm no branching on `classNumber` for userid construction in `createSpawn` (FR-017, R-7, R-8).
- [X] T067 [US6] Verify `repository.hydrateAll` filter and gold-transfer regex use the single `Cybrg-` prefix (no separate `Sartn-` filter). Per `GECYBS.C:104-105`, Sarterns share the Cybertron userid prefix — T023 already encodes the correct single-prefix filter.

**Checkpoint**: US6 functional — Sarterns ride the Cybertron code path with their own data.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T068 [P] `backend/test/game/cybertron/balance-regression.spec.ts` — pin every constant in T002 (`CYB_*`, `CYBTICKTIME`, `CYBSLO`, `CYBMAXPERTICK`, `CLASSTYPE_CYBORG`, `CYB_TOUGH_0/1`) with assertions that fail on drift. Also pin SC-001..SC-008 numeric thresholds (FR-014, Constitution Principle II).
- [X] T069 [P] `backend/test/game/cybertron/fault-isolation.spec.ts` — inject a ship that throws inside `cyb_check_lockon`; drive a tick with 5 healthy ships + 1 bad one; assert all 5 healthy ships still ticked and the error was logged (Constitution III isolation pattern).
- [X] T070 [P] `backend/test/game/cybertron/integration/cybertron-end-to-end.spec.ts` — encodes `quickstart.md` recipe as a test: spawn-fill → target acquisition → engagement → mine deploy on damage → kill + gold transfer → restart hydrate.
- [X] T071 Add `GET /debug/cybertron-stats` route (per-class population, total AUTO ships) for quickstart manual verification — `backend/src/game/cybertron/cybertron.debug.controller.ts`. Gate behind `NODE_ENV !== 'production'`.
- [X] T072 [P] Update `docs/ARCHITECTURE.md` — add `CybertronTickService` and module to module map.
- [X] T073 [P] Update `docs/DECISIONS.md` — log decisions R-1 through R-11 (tick ordering, spawn cadence, per-ship tick, gold transfer event, Random port reuse, constants split, identity prefixes, Sartern shared code, hyperwarp shields, taunt event, flush cadence).
- [X] T074 [P] Update `docs/PROGRESS.md` — completed feature 007, what's covered, deferred items (e.g., AI scoring → 009).
- [X] T075 [P] Update `docs/GAME_MECHANICS.md` — describe Cybertron lifecycle with `@see GECYBS.C:` references.
- [X] T076 Performance verification — run end-to-end test at full Cybertron+Sartern population + 100 simulated humans; assert `CybertronTickService.onPhysicsTick` completes in <1 s on dev machine (proxy for SC-008).
- [ ] T077 Run quickstart.md manually end-to-end and check off each step.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no deps — start immediately.
- **Foundational (Phase 2)**: depends on Phase 1.
- **US1 (Phase 3)**: depends on Phase 2. **MVP.**
- **US2 (Phase 4)**: depends on Phase 2; integrates with US1's tick loop (`cybLives` shell from T028).
- **US3 (Phase 5)**: depends on US2 implementation (uses `gebemean`/`rollTorpedoCount`).
- **US4 (Phase 6)**: depends on Phase 2; replaces stubs left by US1 (T028 jammed branch + damage-check stub).
- **US5 (Phase 7)**: depends on Phase 2 + US1 (hydrate path uses `Ship` rows produced by spawn) **AND on T012 passing without follow-up sub-tasks** (gold-transfer wiring requires the four-field `combat.ship-destroyed` payload). If T012 produced T012a/T012b/etc., those must complete before any US5 task starts.
- **US6 (Phase 8)**: depends on US1 + US5 (uses spawn + hydrate paths).
- **Polish (Phase 9)**: depends on all targeted stories.

### Within each phase

- Tests authored before (or alongside) implementation; verify they fail first.
- Pure-function tasks ([P]) parallel-friendly.
- Service-implementation tasks serial within `cybertron-tick.service.ts` (single file).

### Parallel Opportunities

- T002, T003, T004, T005 — Phase 1, all in parallel (different files).
- T013–T020c — US1 tests, all in parallel (different files / different test names in same file are still sequential within that file).
- T033–T039 — US2 tests, parallel.
- T056–T059, T060a — US5 tests, parallel.
- T064/T065 — US6 tests, parallel.
- T068–T075 — Polish tasks, mostly parallel.
- After Phase 2 completes, US1, US4 spawn-independent slices, and US5 persistence tests can be drafted in parallel by separate developers.

---

## Parallel Example: User Story 1

```bash
# Tests in parallel (different files):
Task: "Unit test pickSpawnClass + randomInitLoadout in cyb-decisions.spec.ts"
Task: "Integration test spawn cadence in cybertron-tick.service.spec.ts"
Task: "neutral-zone.spec.ts — NZ exclusion"
Task: "noclaim.spec.ts — pile-on prevention"

# Pure functions in parallel:
Task: "Implement pickSpawnClass + randomInitLoadout in cyb-decisions.ts"
Task: "Implement pickPursuitBand in cyb-decisions.ts"
```

---

## Implementation Strategy

### MVP (US1 only)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1).
2. Validate: spawn-fill, target acquisition, hyperwarp pursuit, NZ exclusion.
3. Demo / merge-able milestone.

### Incremental delivery

US1 (combat-less hunting) → US2 (engagement) → US4 (defensive) → US5 (persistence) → US3 (verified difficulty curve) → US6 (Sarterns) → Polish.

### Notes

- [P] = different file, no incomplete deps.
- Every Cybertron decision flows through the 006b `Random` port for replay-determinism.
- AI service NEVER imports Socket.io — taunts/broke-off events are bridged via `GameGateway`.
- AI service NEVER re-implements combat math — calls 006b weapon helpers.
- No Prisma migration; schema reused.
- Sartern data lives in `prisma/seed/ship-classes.ts` + `cybertron.config.ts`; behavior is the Cybertron code path, untouched.
