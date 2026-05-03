# Implementation Plan: Cybertron AI

**Branch**: `007-cybertron-ai` | **Date**: 2026-05-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-cybertron-ai/spec.md`

## Summary

Add a server-driven hostile AI layer (`CybertronTickService`) on top of the
existing physics (006a) and combat (006b) ticks. A new module subscribes to
`TickKind.PHYSICS` and runs **after** `CombatTickService`, iterating every
ship whose `status = AUTO`, decrementing its per-ship `tick` counter, and —
on expiry — executing the `cyb_lives` state machine: spawn-fill → gold
allowance → engagement (warp/normal-space scan, fire, decoys, taunt) →
damage check (mines/jammer/heading) → lockon (target acquisition with
pursuit speed bands including hyperwarp) → energy reset & next-tick reschedule.

The same code path drives Sarterns (classes 24, 25). Cybertrons are persisted
as standard `Ship` rows (existing `cybmine`/`cybskill`/`cybupdate`/`tick`/
`holdcourse` fields) plus standard `User` rows identified by `Cybrg-<n>`
userids. Gold transfer on kill is wired via a new `cybertron.killed` event
that the `CybertronTickService` listens for on `EventEmitter2` (combat
already publishes `combat.ship-destroyed`). No Prisma schema change.

Engagement composes 006b primitives (phaser fire, torpedo launch, decoy
deploy, mine lay, jammer deploy, Zipper launch) — the AI service does not
re-implement combat math. All decision randomness flows through the
existing `Random` port from 006b for testability.

## Technical Context

**Language/Version**: TypeScript 5.x (NestJS 10 / Node 20)
**Primary Dependencies**: `@nestjs/common`, `EventEmitter2`, existing `TickService.subscribe` API, `ShipStateService` (in-memory `Map<shipKey, ShipState>`), `CombatTickService`/combat command handlers (006b primitives), `PhysicsTickService` (precedes both on the same tick), `ShipClassCacheService` (006a — supplies per-class fields), `PrismaService` (boot-time hydrate of Cybertron Ship + User rows), `Random` port (006b)
**Storage**: PostgreSQL 16+ via Prisma — reuses `Ship` and `User` tables unchanged. Cybertron ship fields (`cybmine`/`cybskill`/`cybupdate`/`tick`/`holdcourse`/`status`) already exist on the schema. `User.cash` already exists. **No new migration.** New `ShipClass` rows for classes 24 and 25 (Sarterns) ship as a seed update only — schema unchanged.
**Testing**: Jest with fake timers — pure-function unit tests for `cyb-decisions.ts` (skill error roll, `gebemean`, torpedo volley sizing, pursuit-speed-band selection); integration tests for `CybertronTickService` driving real `ShipStateService` against an in-memory map with seeded PRNG; balance-regression test pinning every constant from spec SC-* and `GEMAIN.H`; persistence integration test against a real test DB (boot rehydration + `CYB_MAXCASH` clamp + spawn-fill); per-ship fault-isolation test.
**Target Platform**: Linux container (Hetzner CPX32) — Node 20, single backend process
**Project Type**: Web service (backend-only feature; no frontend changes)
**Performance Goals**: Cybertron tick processes the full configured Cybertron+Sartern population plus 100 humans in <1 s on the production target hardware (SC-008), leaving ample headroom inside the 6-second physics tick (combined with 006a + 006b passes).
**Constraints**: No new external dependencies. No Redis. No `@Interval` decorator (constitution III). No new Prisma migration. All AI decisions deterministic under a seeded `Random` port. Per-ship AI faults must not abort the batch. Cybertron services MUST NOT call Socket.io directly — taunts (`cyb_annoy`) are emitted as a `cybertron.taunt` event on `EventEmitter2`; the gateway translates to room broadcasts. Cybertron services MUST NOT re-implement combat math — they call existing 006b weapon-fire helpers. Class-table fields (`tot_to_create`, `scanRange`, `noClaim`, `tough`, `cybCanAttack`, `cybLowestClassAttacks`) are already on `ShipClass` from 001/004.
**Scale/Scope**: Sum of `tot_to_create` across CYBORG/Sartern classes (~30–60 AI ships at steady state) plus ≤200 active human/CPU ships. The spawn loop processes one slot per service tick (`ticktock` cadence, ~30 ticks per slot — reproduced verbatim).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | How this feature complies |
|-----------|---------------------------|
| **I. Fidelity** | Every spawn rule, decision gate, pursuit threshold, and damage-response branch verified against `reference/ge-source/GECYBS.C` (`cyb_init`, `cyb_lives`, `cyb_check_damage`, `cyb_check_lockon`, `cyb_attack`, `cyb_annoy`, `cyb_lay_decoys`, `gebemean`, `cybwhoops`). Constants pulled verbatim from `GEMAIN.H` (`CYBTICKTIME=6`, `CYB_MINCLASS=3`, `CYBSLO=3`, `CYB_ALLOW=35`, `CYB_MAXCASH=2,000,000`, `CYB_BE_NICE=30`, `CYB_BE_EASY=60`, `CYB_BREAKOFF=500`, `CYB_MINDAM=75`, `CYBMAXPERTICK=2`, `CYB_TOUGH_0/1`, `CLASSTYPE_CYBORG=2`). Per-class numbers (`tot_to_create`, `tooclose`, `hyperdist1`, `hyperdist2`, `cyb_gold`, `scanrange`, `noclaim`, `tough_factor`) sourced verbatim from the C class table for the existing 18 ship classes plus classes 24/25 (Sarterns). Sarterns intentionally share the *exact same* state machine code path — only their class-table row differs. Per spec clarification, Sartern shipped defaults match the C source verbatim and are exposed through a NestJS config module so ops can tune without code changes. |
| **II. Testing first class** | Pure-function unit tests for every `cyb-decisions.ts` export (`cybwhoops`, `gebemean`, `pickPursuitBand`, `rollTorpedoCount`, `pickSpawnClass`, `randomInitLoadout`, `randomCybSkill`). Integration tests for `CybertronTickService` use Jest fake timers and the seeded `Random` port from 006b for deterministic replays. Balance-regression test fails on drift of any spec-listed constant. Persistence test exercises real-DB boot rehydration, `CYB_MAXCASH` clamp, and spawn-fill against a fresh `ge_test`. Per-ship fault-isolation test asserts a thrown handler does not stall the batch. AI behavior tested in isolation — no live game world, no live WebSocket. |
| **III. Architecture** | No `@Interval` decorator: `CybertronTickService` subscribes to the existing raw-`setInterval`-driven `TickService` via the same `TickKind.PHYSICS` enum value 006a/006b use. Subscription order enforced by NestJS module-import order (`CybertronModule` imports `CombatModule` which imports `PhysicsModule`); `onModuleInit` registers strictly after both, so the AI pass runs after physics + combat on the same 6-second cadence. State stays in `ShipStateService` for ship-side AI fields (already on `ShipState`); `User.cash` flushes via Prisma per the existing 30-second async pattern from 006a, with immediate flush on significant events per FR-019 / spec clarification. No Redis. Taunts emitted via `EventEmitter2` (`cybertron.taunt`); `GameGateway` is the sole Socket.io bridge. |
| **IV. Quality** | TS strict throughout — no `any`. Public service methods carry JSDoc with `@see GECYBS.C:` line references. Reuses existing `Ship` and `User` Prisma models — no migration. Sartern class rows added via the existing `prisma/seed/ship-classes.ts` seed (verbatim from C source). Docker Compose unchanged. Constants referenced by name from `constants.ts` (extended with `CYB_*` and `CYBTICKTIME`) so the balance-regression test enumerates them. Per-class tunables (`tot_to_create`, `tooclose`, `hyperdist1`, `hyperdist2`, `cyb_gold`) live in a typed `cybertron.config.ts` consumed via NestJS `ConfigModule` so ops can override via env without code changes (per spec assumption + clarification). |

**Gate result: PASS** — no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/007-cybertron-ai/
├── plan.md                  # This file
├── spec.md                  # Already authored
├── research.md              # Phase 0 output
├── data-model.md            # Phase 1 output
├── quickstart.md            # Phase 1 output
├── contracts/
│   └── cybertron-events.md  # Typed cybertron.* event payloads
└── tasks.md                 # Phase 2 output (created by /speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── game/
│   │   ├── cybertron/                       # NEW — feature 007
│   │   │   ├── cybertron.module.ts
│   │   │   ├── cybertron.config.ts          # typed per-class tunables (tot_to_create,
│   │   │   │                                # tooclose, hyperdist1/2, cyb_gold) sourced
│   │   │   │                                # verbatim from GECYBS.C class table; overridable
│   │   │   │                                # via NestJS ConfigModule
│   │   │   ├── cyb-decisions.ts             # pure: cybwhoops, gebemean, pickPursuitBand,
│   │   │   │                                # rollTorpedoCount, pickSpawnClass,
│   │   │   │                                # randomInitLoadout, randomCybSkill, taunt-pool
│   │   │   ├── cybertron-tick.service.ts    # subscribes to TickKind.PHYSICS (after combat);
│   │   │   │                                # iterates AUTO ships; runs cyb_lives state
│   │   │   │                                # machine; spawn slot; gold allowance;
│   │   │   │                                # listens for combat.ship-destroyed → gold xfer
│   │   │   ├── cybertron.repository.ts      # boot-time hydrate of Cybrg-* User+Ship rows;
│   │   │   │                                # CYB_MAXCASH clamp; spawn-row create; immediate
│   │   │   │                                # flush on significant-event hook
│   │   │   ├── cybertron-events.ts          # typed event names + payload interfaces
│   │   │   │                                # (cybertron.taunt, cybertron.spawned,
│   │   │   │                                # cybertron.target-acquired, cybertron.broke-off)
│   │   │   └── taunt-pool.ts                # small predefined hostile message pool
│   │   ├── combat/                          # unchanged (its primitives are reused)
│   │   ├── physics/                         # unchanged
│   │   ├── tick/                            # unchanged
│   │   ├── ship/                            # unchanged (cybmine/cybskill/cybupdate/tick
│   │   │                                    # /holdcourse/status already on ShipState)
│   │   └── constants.ts                     # ADD CYB_* + CYBTICKTIME (see Phase 0)
│   └── gateway/                             # MODIFIED — bridge cybertron.taunt event
│       └── game.gateway.ts                  # subscribe to cybertron.taunt; emit to target
│                                            # player's socket AND target's sector room
└── prisma/
    └── seed/
        └── ship-classes.ts                  # MODIFIED — add classes 24, 25 (Sarterns)
                                             # with verbatim C-source values
└── test/
    └── game/
        ├── cybertron/
        │   ├── cyb-decisions.spec.ts                # pure-function unit tests
        │   ├── cybertron-tick.service.spec.ts       # integration with fake timers + seeded PRNG
        │   ├── balance-regression.spec.ts           # constant pinning (SC-001..SC-008)
        │   ├── persistence.spec.ts                  # real-DB hydrate + CYB_MAXCASH clamp +
        │   │                                        # spawn-fill (US5, FR-018..FR-020)
        │   ├── gold-transfer.spec.ts                # combat.ship-destroyed → gold xfer
        │   │                                        # (FR-005a, spec clarification)
        │   ├── neutral-zone.spec.ts                 # SC-007 — never engages NZ players
        │   ├── noclaim.spec.ts                      # SC-006 — pile-on prevention
        │   └── fault-isolation.spec.ts              # one bad ship cannot stall AI tick
        └── integration/
            └── cybertron-end-to-end.spec.ts         # quickstart scenario as a test
```

**Structure Decision**: Backend-only feature in the existing single NestJS project. New `game/cybertron/` module; modifies the existing `game.gateway.ts` to bridge taunt events; modifies the `ship-classes.ts` seed to add Sartern rows. No frontend changes; no Prisma schema change; no new third-party dependency. Sarterns are pure data, not new code.

## Phase 0: Research

See [research.md](./research.md). All Technical Context unknowns resolved (no
`NEEDS CLARIFICATION` remain). Highlights:

- **Tick ordering**: `CybertronTickService` subscribes to the same `TickKind.PHYSICS` event 006a/006b use. `CybertronModule` imports `CombatModule` (which imports `PhysicsModule`); NestJS runs `onModuleInit` in import-dependency order, so registration is strictly after both — Cybertron pass observes post-physics, post-combat ship state on every 6-second tick. This is the same pattern 006b uses to land after 006a (006b R-1).
- **Spawn cadence**: One spawn slot per service tick is *too aggressive* — original `ticktock` only attempts a spawn slot every ~30 service ticks (per `GEMAIN.C`'s outer loop). The service maintains a private `spawnTickCounter` modulo 30; on rollover it executes one spawn-slot attempt (per FR-003). This keeps the universe filling gradually rather than instantaneously on a fresh boot.
- **Per-ship `tick` countdown**: Each AUTO ship's `Ship.tick` field decrements every PHYSICS tick. Only ships hitting zero execute `cyb_lives`; on completion the next `tick` is set per FR-011 (long sleep `(CYBTICKTIME + rnd%CYBTICKTIME) * 5` when not pinned, short sleep otherwise). This naturally throttles AI work and matches the C source verbatim.
- **Gold transfer**: `CybertronTickService` registers a listener on `EventEmitter2` for `combat.ship-destroyed` (already published by 006b). When the victim is an AUTO Cybertron/Sartern (recognized by `userid` matching `/^Cybrg-/`), the listener clamps the victim's `User.cash` to `CYB_MAXCASH`, adds it to the attacker's `User.cash`, and zeros the victim's. The flush is immediate (per FR-019). This event-driven approach keeps combat ignorant of AI rules — combat just publishes the kill.
- **Randomness**: Reuses the `Random` port from 006b (DI token). Same Mulberry32 seeded adapter for tests; same `Math.random` adapter in production. All AI rolls (`cybwhoops`, `gebemean` 1-in-3, breakoff 1-in-500, mine-lay 1-in-5, jammer-deploy 1-in-100, damage-respond 1-in-10, init loadout, init `cybskill`) flow through this port.
- **Class config split**: `CYB_*` *behavioral thresholds* (BE_NICE, BE_EASY, BREAKOFF, MINDAM, ALLOW, MAXCASH, MINCLASS, SLO, TICKTIME, MAXPERTICK, TOUGH_0/1) live in `constants.ts` because they're treated as game-balance invariants by Principle I and exercised by the balance-regression test. *Per-class numbers* (`tot_to_create`, `tooclose`, `hyperdist1`, `hyperdist2`, `cyb_gold`) live in `cybertron.config.ts` behind the NestJS `ConfigModule` because they're explicitly designated as ops-tunable in the spec. Default values match C source verbatim.
- **Cybertron user identity**: The C source uses userid `Cybrg-<n>` where `n` is the in-memory ship-table slot index. We reproduce this exactly: a Cybertron's `User.userid` is `Cybrg-<shipno>` and its `Ship.userid` matches. This makes hydrate-on-boot a single `User.findMany({ where: { userid: { startsWith: 'Cybrg-' } } })` plus the related `Ship` rows. The natural-key approach makes spawn-slot reuse explicit (delete-then-insert on a slot turning over).
- **Friendly-fire / NZ exclusion**: Existing `physics-math.ts:neutral(coord)` from 006a is reused for the neutral-zone test on every target candidate (SC-007). No new geometry code.
- **`cyb_annoy` taunt**: Per spec clarification, taunt is a randomly-picked string from `taunt-pool.ts` published as `cybertron.taunt { attackerShipKey, targetShipKey, message, sector }`. Gateway delivers to the target player's socket *and* broadcasts to the target's sector room. No weapon fire, no shield change, no maneuver change.
- **Hyperwarp shield handling**: Per spec clarification, shields are set to 0 when the AI service raises `where = 1` (entering hyperspace) and restored to class max (`ShipClass.maxShields`) on the tick that drops `where = 0`. The transition is detected by comparing pre/post `where` inside the `cyb_check_lockon` branch.
- **Fault isolation**: Each ship's `cyb_lives` invocation is wrapped in `try/catch`; a thrown handler logs and continues to the next ship. This mirrors the 006a/006b per-ship isolation pattern.

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](./data-model.md). No Prisma schema change. Documents:

- the `Ship` and `User` columns the AI service reads/writes (`cybmine`, `cybskill`, `cybupdate`, `tick`, `holdcourse`, `status`, `where`, `shield`, `phasr`, `energy`, `damage`, `items`, `User.cash`, `User.kills`),
- the `ShipClass` columns the AI service consumes (`scanRange`, `noClaim`, `tough`, `cybCanAttack`, `cybLowestClassAttacks`, `maxShields`, `maxPhaser`, `hasTorpedo`, `hasMine`, `hasJammer`, `hasZipper`, `category`),
- per-class tunables held in `cybertron.config.ts` (`tot_to_create`, `tooclose`, `hyperdist1`, `hyperdist2`, `cyb_gold`) — keyed by `classNumber`, defaults sourced verbatim from `GECYBS.C`,
- the new `ShipClass` seed rows for classes 24 and 25 (Sarterns) — values verbatim from the original C source,
- in-memory-only state held inside `CybertronTickService` (`spawnTickCounter`).

### Contracts

See [contracts/cybertron-events.md](./contracts/cybertron-events.md). The
following typed events are emitted via `EventEmitter2`:

- `cybertron.taunt` — `{ attackerShipKey, targetShipKey, message, sector, tickAt }` — gateway delivers to target's socket + sector room broadcast (FR-006a, spec clarification).
- `cybertron.spawned` — `{ shipKey, classNumber, sector, tickAt }` — operational/observability only; gateway does not broadcast to clients.
- `cybertron.target-acquired` — `{ attackerShipKey, targetShipKey, sector, tickAt }` — operational; not broadcast.
- `cybertron.broke-off` — `{ attackerShipKey, targetShipKey, sector, tickAt }` — gateway delivers a "lucky day" message to the former target (FR-007).

The service also *consumes* (not emits) the existing 006b
`combat.ship-destroyed` event to drive the gold-transfer hook (FR-005a).

Payloads carry the **minimum data** the gateway needs — no `ShipState`
snapshots. Sector resolution and room translation are the gateway's job.

### Quickstart

See [quickstart.md](./quickstart.md). Manual verification recipe: boot a
fresh `ge_test`, observe spawn-fill within ~15 minutes (or accelerate via
the seeded PRNG), log a player ship into a sector adjacent to a Cybertron,
confirm target acquisition within one Cybertron tick, walk through a full
engagement (taunt → phaser fire → torpedo volley scaled by lifetime kill
count → mine deploy when damaged → jammer deploy → break-off roll), kill
the Cybertron and confirm gold transfer, then restart the server and
confirm the surviving Cybertrons are rehydrated with their state intact.

### Constitution Re-check (post-design)

Still PASS. New `cybertron/` module is one NestJS provider, one pure-decision
file, one config file, one event-name constants file, one repository, one
taunt-pool constants file. No new infra, no decorator-based scheduling, no
Prisma schema change, no Redis, no new third-party dependency. All branches
annotated with `@see GECYBS.C:` line numbers. The balance-regression test
enumerates the exact constants the feature consumes.

### Agent Context Update

Updated `CLAUDE.md`'s SPECKIT block to point at this plan.

## Complexity Tracking

> No violations — table omitted.
