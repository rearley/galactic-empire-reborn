# Implementation Plan: Ephemeral Droid AI

**Branch**: `008-droid-ai` | **Date**: 2026-05-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-droid-ai/spec.md`

## Summary

Add a server-driven non-persistent AI layer (`DroidTickService`) that mirrors
007's tick-subscription pattern but never writes to the `Ship` or `User`
tables. A new `game/droid/` module subscribes to `TickKind.PHYSICS` after
`CombatTickService`, maintains a private 30-tick cadence counter, and on each
fire (a) attempts to top up the per-class population (cap = 2 per class for
classes 10/11/12) and (b) drives per-Droid actions through the
`droid_act_class_10/11/12` decision trees from `GEDROIDS.C`.

A new `isEphemeral` boolean is added to `ShipState`. `ShipStateService.flush`
skips ephemeral states (FR-001 / FR-002); `removeFromGame` already leaves no
DB row behind, which is the desired path for ephemeral kills (FR-003).
Droids are loaded directly into the in-memory `ShipStateService` map by a
`DroidSpawner` helper — no repository, no migration, no boot hydrate.

Engagement composes 006b primitives (phaser fire, torpedo launch, mine lay,
jammer deploy, shield up/down) — the AI service does not re-implement combat
math. All decision randomness flows through the existing `Random` port from
006b for testability. Annoy chatter is published as a typed
`droid.annoy` event and bridged to the player's socket by `GameGateway`.

The Cybertron spawn-visibility fix (FR-032 / US4) was landed pre-merge in
`CybertronRepository.createSpawn` (commit e2c8c9a). This plan inherits that
fix and adds a regression test under `test/game/cybertron/` to pin the
behavior so future refactors cannot reintroduce the defect.

## Technical Context

**Language/Version**: TypeScript 5.x (NestJS 10 / Node 20)
**Primary Dependencies**: `@nestjs/common`, `@nestjs/event-emitter`, existing `TickService.subscribe` API and `TickKind.PHYSICS` enum (006a), `ShipStateService` (in-memory `Map<shipKey, ShipState>`), 006b combat primitives via direct service calls (`firep`, `firehp`, `torp`, `laymine`, `jam`, `shieldup`, `shielddn`), `ShipClassCacheService` (006a — supplies per-class fields including `scanRange`, `maxShields`, `maxPhaser`, `topspeed`), `Random` port (006b)
**Storage**: PostgreSQL 16+ via Prisma — **no schema change, no new migration, no read or write of `Ship`/`User` rows for class 10/11/12 ships**. Three new `ShipClass` rows (10 = Lydorian Garbage Scow, 11 = Murdonian Transport, 12 = Vakory Survey Drone) ship as a seed update only — values verbatim from `GEDROIDS.C` and the original C-source class table.
**Testing**: Jest with fake timers — pure-function unit tests for `droid-decisions.ts` (annoy roll, fight-back branch selection, confuse/alter-vector rolls, randomized loadouts, hold-course duration); integration tests for `DroidTickService` driving real `ShipStateService` against an in-memory map with seeded PRNG; per-class behavior matrix; ephemerality regression (zero rows ever written for class 10/11/12); cargo-transfer-on-kill regression for Murdonian; Cybertron spawn-visibility regression; balance regression pinning every spec constant.
**Target Platform**: Linux container (Hetzner CPX32) — Node 20, single backend process.
**Project Type**: Web service (backend-only feature; no frontend changes).
**Performance Goals**: Droid pass processes the full live population (≤ 6 ships) plus per-tick spawn evaluation in well under 10 ms — negligible relative to 006b's combat pass on the same 6-second physics tick.
**Constraints**: No new external dependencies. No Redis. No `@Interval` decorator (constitution III). No new Prisma migration. All AI decisions deterministic under a seeded `Random` port. Per-ship AI faults must not abort the batch. Droid services MUST NOT call Socket.io directly — annoy chatter is emitted as `droid.annoy` events on `EventEmitter2`; the gateway translates to room/socket delivery. Droid services MUST NOT re-implement combat math — they call existing 006b weapon-fire helpers. Ephemeral state MUST NOT touch the DB at any point in its lifetime.
**Scale/Scope**: Hard cap of 6 live Droids (2 × 3 classes). Spawn evaluation runs every 30th physics tick (~3 minutes wall clock at `TICKTIME=6`) and creates at most one Droid per class per rollover (FR-007). A fresh boot with ≥1 player online therefore reaches population cap on the second eligible rollover — ~60 physics ticks, ~6 minutes wall clock — per SC-001.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | How this feature complies |
|-----------|---------------------------|
| **I. Fidelity** | Every spawn rule, decision gate, fight-back branch, shield/speed toggle, and class-specific behavior is verified against `reference/ge-source/GEDROIDS.C` (`droid_init`, `droid_lives`, `droid_annoy`, `droid_act_class_10/11/12`, `droid_won`, `droid_died`, `missl_attached`) and the spawn-loop slice of `GEMAIN.C` (lines 2325-2400). Ship-class numbers 10/11/12 match `GEDROIDS.C` typename matching (`"Lydorian Garbage Scow"`, `"Murdonian Transport"`, `"Vakory Survey Drone"`). The 30-tick spawn / per-Droid action cadence matches `ticktock2 >= 30` from `GEMAIN.C`. Constants pulled verbatim from `GEMAIN.H` (`CYBTICKTIME=6`, `CYB_ALLOW=35`, `CLASSTYPE_DROID=3`). Per-class loadouts (`gernd()%50`, `gernd()%250`, `gernd()%100`, `gernd()%25`, `gernd()%10`) match `droid_init` lines 146-163 verbatim. Random ranges for confuse/alter-vector branches (`rndm(10000.0)`, `rndm(5000.0)`, `rndm(359.9)`, `gernd()%10 + 3`, `gernd()%30 + 20`) match the C source verbatim. The Vakory `lastfired > 0` vs Murdonian `lastfired >= 0` distinction is preserved exactly (edge case in spec). |
| **II. Testing first class** | Pure-function unit tests for every `droid-decisions.ts` export (`rollAnnoy`, `pickFightBackBranch`, `randomLoadout`, `randomMurdonianLoadout`, `randomGarbageScowLoadout`, `randomVakoryLoadout`, `pickHoldCourseDuration`, `rollConfuseHeading`, `rollAlterAttackVector`, `rollVakoryTorpedoVolley`). Integration tests for `DroidTickService` use Jest fake timers and the seeded `Random` port from 006b for deterministic replays. Per-class behavior matrix exercises jammed / not-jammed / under-fire / >75%-damage states for each of classes 10/11/12. Ephemerality regression test runs spawn → kill → restart cycles against a real test DB and asserts zero rows in `Ship` for `shpclass IN (10, 11, 12)` at every checkpoint. Balance regression test pins every spec-listed constant. Per-ship fault-isolation test asserts a thrown handler does not stall the batch. All AI tested in isolation — no live game world, no live WebSocket. |
| **III. Architecture** | No `@Interval` decorator: `DroidTickService` subscribes to the existing raw-`setInterval`-driven `TickService` via the same `TickKind.PHYSICS` enum value 006a/006b/007 use. Subscription order enforced by NestJS module-import order (`DroidModule` imports `CybertronModule`, which imports `CombatModule`, which imports `PhysicsModule`); `onModuleInit` registers strictly after all three, so the Droid pass runs after physics + combat + Cybertron on the same 6-second cadence. State stays in `ShipStateService`'s in-memory `Map`. **No DB writes for class 10/11/12 ships.** No Redis. Annoy chatter emitted via `EventEmitter2` (`droid.annoy`); `GameGateway` is the sole Socket.io bridge. The `isEphemeral` flag added to `ShipState` is in-memory-only; the existing `flush()` loop adds one early-`continue`. |
| **IV. Quality** | TS strict throughout — no `any`. Public service methods carry JSDoc with `@see GEDROIDS.C:` line references. Reuses existing `Ship` and `User` Prisma models — no new model, no new migration. Three new `ShipClass` rows (10/11/12) added via the existing `prisma/seed/ship-classes.ts` seed (verbatim from C source). Docker Compose unchanged. Constants referenced by name from `constants.ts` (`DROID_MAX_PER_CLASS=2`, `DROID_SPAWN_TICK_CADENCE=30`, `DROID_ANNOY_DENOM=4`, `DROID_USERID_PREFIX="@Droid-"`) so the balance-regression test enumerates them. Annoy text strings live in a typed `droid-message-pool.ts` so they are referenced symbolically (matching `DRDMSG1..15`, `DRDHLP1..15`, `DRDMSG6` from the C source). |

**Gate result: PASS** — no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/008-droid-ai/
├── plan.md                  # This file
├── spec.md                  # Already authored
├── research.md              # Phase 0 output
├── data-model.md            # Phase 1 output
├── quickstart.md            # Phase 1 output
├── contracts/
│   └── droid-events.md      # Typed droid.* event payloads
└── tasks.md                 # Phase 2 output (created by /speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── game/
│   │   ├── droid/                          # NEW — feature 008
│   │   │   ├── droid.module.ts
│   │   │   ├── droid.config.ts             # typed per-class tunables
│   │   │   │                                # (scanRange, topspeed, hyperdist, fightbackDist=30000)
│   │   │   │                                # — defaults verbatim from GEDROIDS.C / class table
│   │   │   ├── droid-decisions.ts          # pure: rollAnnoy, randomMurdonianLoadout,
│   │   │   │                                # randomGarbageScowLoadout, randomVakoryLoadout,
│   │   │   │                                # pickHoldCourseDuration, rollConfuseHeading,
│   │   │   │                                # rollAlterAttackVector, rollVakoryTorpedoVolley
│   │   │   ├── droid-tick.service.ts       # subscribes to TickKind.PHYSICS (after combat
│   │   │   │                                # AND cybertron); maintains spawnTickCounter modulo 30;
│   │   │   │                                # iterates ephemeral droid ships; runs droid_lives
│   │   │   │                                # per class; gates on ≥1 player online
│   │   │   ├── droid-spawner.ts             # composes randomized initial state +
│   │   │   │                                # ShipStateService.loadShip with isEphemeral=true;
│   │   │   │                                # never touches Prisma
│   │   │   ├── droid-act-class-10.ts        # Lydorian Garbage Scow — pure decision tree
│   │   │   ├── droid-act-class-11.ts        # Murdonian Transport — pure decision tree
│   │   │   ├── droid-act-class-12.ts        # Vakory Survey Drone — pure decision tree
│   │   │   ├── droid-events.ts              # typed event names + payload interfaces
│   │   │   │                                # (droid.annoy, droid.spawned, droid.killed)
│   │   │   ├── droid-message-pool.ts        # static catalog: GarbageScow/Murdonian/Vakory
│   │   │   │                                # × passive/help variants (DRDMSG*, DRDHLP*)
│   │   │   └── droid.debug.controller.ts    # dev-only: force-spawn for QA
│   │   ├── ship/
│   │   │   ├── ship-state.types.ts          # MODIFIED — add isEphemeral?: boolean
│   │   │   └── ship-state.service.ts        # MODIFIED — flush() skips isEphemeral states
│   │   ├── cybertron/                       # unchanged (its primitives are reused)
│   │   ├── combat/                          # unchanged (its primitives are reused)
│   │   ├── physics/                         # unchanged
│   │   ├── tick/                            # unchanged
│   │   └── constants.ts                     # ADD DROID_* constants (see Phase 0)
│   └── gateway/                             # MODIFIED — bridge droid.annoy event
│       └── game.gateway.ts                  # subscribe to droid.annoy; emit to target
│                                            # player's socket and target's sector room
└── prisma/
    └── seed/
        └── ship-classes.ts                  # MODIFIED — add classes 10, 11, 12 with
                                             # CLASSTYPE_DROID values verbatim from C source
└── test/
    └── game/
        ├── droid/
        │   ├── droid-decisions.spec.ts                # pure-function unit tests
        │   ├── droid-tick.service.spec.ts             # integration with fake timers + PRNG
        │   ├── droid-act-class-10.spec.ts             # jammed/scan-and-annoy/no-fire matrix
        │   ├── droid-act-class-11.spec.ts             # jammed-flee, fight-back, confuse,
        │   │                                          # hyperspace-missile-evade
        │   ├── droid-act-class-12.spec.ts             # jammed-flee, fight-back, torpedo
        │   │                                          # volley, >75% damage flee+mine+jammer,
        │   │                                          # missile-evade speed-up
        │   ├── ephemerality.spec.ts                   # FR-001/002/003/004 — zero rows ever
        │   ├── murdonian-cargo-transfer.spec.ts       # SC-004 — kill Murdonian transfers loot
        │   ├── balance-regression.spec.ts             # SC-001..SC-007 constant pins
        │   ├── spawn-cap.spec.ts                      # FR-006 — cap at 2/class
        │   ├── spawn-cadence.spec.ts                  # FR-005 — 30-tick cadence,
        │   │                                          # gated on ≥1 player online
        │   ├── annoy-pool.spec.ts                     # FR-031 — class/mode message pools
        │   ├── annoy-rate-stat.spec.ts                # SC-002 — ~25% rate over 100 trials
        │   └── fault-isolation.spec.ts                # one bad droid cannot stall AI tick
        └── cybertron/
            └── createSpawn-visibility.spec.ts         # NEW — US4 / FR-032 regression pin:
                                                       # spawn → in-memory map populated this tick
```

**Structure Decision**: Backend-only feature in the existing single NestJS project. New `game/droid/` module adjacent to `game/cybertron/`. The only modifications outside the new module are: (a) one early-`continue` in `ShipStateService.flush()` for ephemeral states, (b) one optional field on the `ShipState` interface, (c) one event subscription in `GameGateway` for `droid.annoy`, and (d) three rows added to the ship-class seed. No frontend changes; no Prisma schema change; no new third-party dependency. The Cybertron spawn-visibility fix (FR-032) is already in code (commit e2c8c9a) — this plan adds only its regression test.

## Phase 0: Research

See [research.md](./research.md). All Technical Context unknowns resolved (no
`NEEDS CLARIFICATION` remain). Highlights:

- **Tick ordering**: `DroidTickService` subscribes to the same `TickKind.PHYSICS` event 006a/006b/007 use. `DroidModule` imports `CybertronModule` (which imports `CombatModule` → `PhysicsModule`); NestJS runs `onModuleInit` in import-dependency order, so registration is strictly after all three — Droid pass observes post-physics, post-combat, post-Cybertron ship state on every 6-second tick. No new infrastructure; same pattern 007 used to land after 006b.
- **Spawn cadence**: One spawn evaluation per service tick is too aggressive — original `ticktock2` only attempts a spawn when the outer counter reaches 30 (per `GEMAIN.C` lines 2325-2400). The service maintains a private `spawnTickCounter` modulo `DROID_SPAWN_TICK_CADENCE=30`; on rollover it executes one spawn-evaluation round (per FR-005) AND iterates per-Droid actions. Per-Droid action evaluation is fused into the same 30-tick rollover per spec clarification — Droids do not act every 6-second tick, only every 30th. This matches `GEDROIDS.C`'s `droid_lives` being called from the same 30-tick outer loop.
- **Player-online gate**: Spawn evaluation skips entirely when `ShipStateService.findAllShips().filter(s => s.status === GESTAT_USER).length === 0`. This matches the Cybertron pattern from 007 and the spec clarification.
- **Ephemerality mechanism**: A new optional `isEphemeral?: boolean` field on `ShipState` (default `undefined` = persistent). `ShipStateService.flush()` adds one early-`continue` when the flag is set. `removeFromGame()` requires no change — it already leaves the DB row alone (intended for persistent ships); for ephemeral ships there is no DB row to leave alone, which is the desired no-op. No upsert path runs for ephemeral state because nothing in the codebase calls Prisma `ship.create` for ad-hoc states (it only happens via `CybertronRepository.createSpawn`, which is not on the Droid path). `DroidSpawner` constructs a `ShipState` object in memory with `isEphemeral: true` and calls `ShipStateService.loadShip(state)`.
- **Userid scheme**: Mirrors `GEDROIDS.C` line 111 (`@Droid-<usrn>`). Userid prefix `@Droid-` is reserved for Droids and is the recognition pattern used by debug tooling and (negatively) by `CybertronRepository.hydrateAll()` (`startsWith: 'Cybrg-'` already excludes Droids). Boot hydrate is a no-op for Droids — they are never queried, never inserted, never present in the DB.
- **Ship slot allocation**: The C source uses `usrn` (a numeric user-ship slot index). In our Postgres-backed model, `ShipState` is keyed by `(userid, shipno=1)`. Droid userids are `@Droid-<n>` where `n` is allocated by `DroidSpawner` from a private monotonic counter scoped to the live population (recycled when a slot frees). `shipno` is always `1` for Droids since each Droid has its own unique userid.
- **Combat reuse**: All weapon-fire calls (`firep`, `firehp`, `torp`, `laymine`, `jam`, `shieldup`, `shielddn`) are imported from existing 006b services. The Droid AI passes its `ShipState` and (for `torp`) the target's `ShipState`. The 006b primitives already handle damage application, kill resolution, and `combat.ship-destroyed` event publication — this feature listens for that event to drive `droid.killed` cleanup (remove from in-memory map, free spawn slot).
- **Cargo transfer on Droid kill**: Already wired via the 006b kill-resolution loot rule (combat already transfers items from victim to attacker on `combat.ship-destroyed`). For Droids the only change is that the ship is removed from the in-memory map without a DB delete (because no row exists) — `ShipStateService.removeFromGame()` is the path. No special-casing required in the combat layer; the ephemeral flag is invisible to it.
- **Annoy event delivery**: `droid-tick.service.ts` publishes `droid.annoy { fromShipKey, toUserid, message, sector, tickAt }` on `EventEmitter2`. `GameGateway` subscribes; on receipt it emits to the target player's socket and to the target's sector room (so other players in the sector see the chatter contextually). No service in `game/droid/` touches `Server` or `Socket` directly — Constitution III remains satisfied.
- **Annoy rate**: `gernd() % 4 == 1` → 25% per evaluation. Acceptance band per SC-002 is 15-35 successes out of 100, generous enough to avoid flakes under the seeded PRNG.
- **Randomness**: Reuses the `Random` port from 006b (DI token). Same Mulberry32 seeded adapter for tests; same `Math.random` adapter in production. All Droid rolls (annoy, confuse-heading, alter-attack-vector, torpedo volley size, hold-course duration, init loadout, init spawn coordinate, init `speed2b`) flow through this port.
- **Random ranges (verbatim from `GEDROIDS.C`)**:
  - Murdonian confuse branch (`gernd()%10 == 0`): `speed2b = rndm(10000.0)`, `head2b = rndm(359.9)`, `holdcourse = gernd()%10 + 3`.
  - Vakory alter-attack-vector (`gernd()%20 == 1`): `speed2b = rndm(5000.0)`, `head2b = rndm(359.9)`, `holdcourse = gernd()%10 + 3`.
  - Vakory >75% damage flee: `speed2b = topspeed * 1000`, `head2b = rndm(359.9)`, `holdcourse = gernd()%30 + 20`.
  - Vakory missile-evade: `speed2b = rndm(5900.0) + 5000.0`, `holdcourse = gernd()%5 + 5`.
  - Garbage Scow jammed: `speed2b = 999.9`, `holdcourse = gernd()%50 + 10`.
  - Murdonian / Vakory jammed flee: `speed2b = topspeed * 1000`, `holdcourse = gernd()%50 + 10`.
  - Murdonian fight-back hyperspace-missile-evade: `speed2b = rndm(999.0)`, `holdcourse = gernd()%15 + 5`.
- **Fight-back trigger**: Both classes 11 and 12 require `cantexit > 0` (set by 006b when a hostile attack lands). Class 11 requires `lastfired >= 0`; class 12 requires `lastfired > 0`. The C source distinction is preserved verbatim — exposed by separate constants in `droid.config.ts` so the difference is auditable.
- **Hyperspace fight-back distance**: `ddist < 30000` for phaser fire when both attacker and Droid are in hyperspace (`where == 1`). For normal-space fight-back (`where == 0`) the only gates are `phasr >= PMINFIRE` (existing constant) and `wptr->cloak != 10`.
- **`droid_won` and `droid_died`**: `droid_won` (post-victory speed change) is wired into the existing `combat.ship-destroyed` listener — when a Droid's victim dies, the Droid sets `speed2b = rndm(5000.0)`. `droid_died` removes the Droid from the in-memory map (`ShipStateService.removeFromGame`) and frees its slot in the in-memory population accounting; no DB delete.
- **Cybertron spawn-visibility (US4 / FR-032)**: The fix already exists at `cybertron.repository.ts:141-151` (commit e2c8c9a) — after `prisma.ship.create`, the row is re-fetched and `ShipStateService.loadShip(state)` is called. This plan adds a regression test under `test/game/cybertron/createSpawn-visibility.spec.ts` that drives `createSpawn` against a real test DB and asserts `shipState.get(userid, shipno)` returns the new ship in the same operation. No production code change is required for US4.
- **Fault isolation**: Each Droid's per-tick action is wrapped in `try/catch`; a thrown handler logs and continues. Mirrors the 006a/006b/007 per-ship isolation pattern.

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](./data-model.md). No Prisma schema change. Documents:

- the `ShipState` columns the Droid AI service reads/writes (`coord`, `heading`, `head2b`, `speed`, `speed2b`, `holdcourse`, `shieldstat`, `shield`, `phasr`, `phasrtype`, `shieldtype`, `damage`, `items`, `jammer`, `cantexit`, `lastfired`, `where`, `topspeed`, `tick`, `cloak`, `lmissl*`),
- the new optional `isEphemeral?: boolean` field added to `ShipState`,
- the `ShipClass` columns the Droid AI consumes (`scanRange`, `maxShields`, `maxPhaser`, `topspeed`, `category`),
- per-class tunables held in `droid.config.ts` (`scanRange`, `topspeed`, `fightbackDist=30000`) — defaults verbatim from `GEDROIDS.C` and the original C-source class table,
- the new `ShipClass` seed rows for classes 10, 11, 12 (Lydorian Garbage Scow, Murdonian Transport, Vakory Survey Drone),
- in-memory-only state held inside `DroidTickService` (`spawnTickCounter`, `livePopulation: Map<classNumber, Set<userid>>`).

### Contracts

See [contracts/droid-events.md](./contracts/droid-events.md). The following
typed events are emitted via `EventEmitter2`:

- `droid.annoy` — `{ fromShipKey, fromShipname, toUserid, toShipno, message, sector, tickAt, classNumber, variant }` — gateway delivers to target player's socket + sector room broadcast (FR-030, FR-031). `classNumber` (10/11/12) and `variant` (`'passive'` | `'help'`) are part of the **published** payload, not test-only assertions; canonical definition in [contracts/droid-events.md](./contracts/droid-events.md).
- `droid.spawned` — `{ shipKey, classNumber, sector, tickAt }` — operational/observability only; gateway does not broadcast to clients.
- `droid.killed` — `{ shipKey, classNumber, attackerShipKey, sector, tickAt }` — operational/observability only; the player-facing kill notification is already produced by 006b's `combat.ship-destroyed` chain.

The service also *consumes* (not emits) the existing 006b
`combat.ship-destroyed` event to drive the `droid_won` (Droid was the
attacker) and `droid_died` (Droid was the victim) hooks.

Payloads carry the **minimum data** the gateway needs — no `ShipState`
snapshots. Sector resolution and room translation are the gateway's job.

### Quickstart

See [quickstart.md](./quickstart.md). Manual verification recipe: boot a
fresh `ge_test`, log a player ship in (the spawn loop is gated on
≥1 player), wait for two spawn cadence rollovers (~6 minutes wall
clock — or accelerate via the seeded PRNG and Jest fake timer harness),
confirm the live Droid map fills to 6 (2 each of classes 10/11/12),
verify zero rows in `Ship` for `shpclass IN (10, 11, 12)`, scan a Droid
and observe annoy chatter on the player socket within ~4 evaluation
rolls, fire on a Murdonian Transport and confirm return phaser fire,
kill it and confirm cargo transfer to the attacker via the existing
006b loot rule, restart the server, and confirm the Droid in-memory
population starts at zero.

### Constitution Re-check (post-design)

Still PASS. New `droid/` module is one NestJS provider, one config
file, one decisions module, three per-class action modules, one
spawner, one event-name constants file, one message pool, and one
dev-only debug controller. No new infra, no decorator-based scheduling,
no Prisma schema change, no Redis, no new third-party dependency. All
branches annotated with `@see GEDROIDS.C:` line numbers. The
balance-regression test enumerates the exact constants the feature
consumes. The single in-place modifications to `ShipState` (one
optional field) and `ShipStateService.flush` (one early-`continue`)
are the minimum viable change for ephemerality and are covered by the
ephemerality regression test.

### Agent Context Update

Updated `CLAUDE.md` reference to point at this plan.

## Complexity Tracking

> No violations — table omitted.
