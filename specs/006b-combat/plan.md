# Implementation Plan: Ship-to-Ship Combat

**Branch**: `006b-combat` | **Date**: 2026-05-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006b-combat/spec.md`

## Summary

Add the combat half of `checktm()` on top of the 006a physics tick.
A new `CombatTickService` subscribes to the same `TickKind.PHYSICS` event
the physics service consumes and runs **after** the physics movement pass:
phaser reload, in-flight torpedo / missile travel, decoy and jammer expiry,
and the every-5th-tick mine sweep. Ten new command handlers land in
`game/commands/handlers/` (`pha`, `tor`, `mis`, `min`, `zip`, `dec`, `jam`,
`loc`, `shi`, `flux`, plus a `sys unjam` sub-handler). Combat math is a
pure-function module (`combat/combat-math.ts`) mirroring the 006a
`physics-math.ts` pattern — deterministic, side-effect-free,
unit-testable without DI. Hit resolution drives a `combat.*` event
family on `EventEmitter2`; the `GameGateway` is the sole bridge to
Socket.io and broadcasts sector-scoped events to sector rooms, with
the single exception of `combat.ship-destroyed` which is broadcast
galaxy-wide. Mines persist via the existing `Mine` Prisma table from
001 (no schema change). Decoy and jammer state are in-memory only.

This feature also closes the 005 carry-over: planet revolt
(`GEPLANET.C:341–380`) — a planet-state event that fires inside the
existing economy/midnight tick, queues `MAIL_CLASS_DISTRESS`, and
flips the planet to `**Free**`. Revolt is included here only because
the combat-event/broadcast wiring lands here; it does **not** damage
any ship.

## Technical Context

**Language/Version**: TypeScript 5.x (NestJS 10 / Node 20)
**Primary Dependencies**: `@nestjs/common`, existing `TickService` (subscribe API), `ShipStateService` (in-memory `Map<shipKey, ShipState>` from 006a), `PhysicsTickService` (precedes us on the same tick), `PrismaService` (Mine read on boot, Mine write on deploy/detonate), `EventEmitter2` (combat event bus)
**Storage**: PostgreSQL 16+ via Prisma — `Mine` table from 001 used unchanged. `Ship` rows continue to flush async via the 006a 1-second `SHIP_UPDATE` path. No new migration.
**Testing**: Jest with fake timers — pure-function unit tests for `combat-math` (line-of-fire, damage rolls, decoy odds, mine falloff, jammer area effect); seeded PRNG for deterministic random-driven tests; integration tests for `CombatTickService` driving real `ShipStateService` against an in-memory map; balance-regression test pinning every constant from spec SC-003; Mine-persistence integration test against a real test database (FR-012, SC-006).
**Target Platform**: Linux container (Hetzner CPX32) — Node 20, single backend process
**Project Type**: Web service (backend-only feature; no frontend changes)
**Performance Goals**: Combat tick processes 100 ships with active locks, decoys, and jammers in <50 ms on the project's CI runner; combined with the 006a physics pass the full 6-second tick budget is never exceeded.
**Constraints**: No new external dependencies. No Redis. No `@Interval` decorator (constitution III). No new Prisma migration. All combat math deterministic and side-effect-free; randomness injected via a `Random` port so tests can pin the seed (SC-004). Per-ship combat faults must not abort the batch (FR-030). Combat services MUST NOT call Socket.io directly — they emit `combat.*` events on `EventEmitter2`; the gateway translates to room broadcasts (FR-031). Friendly fire is enabled (no team filtering on hit resolution, per spec clarification).
**Scale/Scope**: Same as 006a — ≤200 active ships, ≤100 active mines, ≤MAXTORPS×N + MAXMISSL×N in-flight projectiles per tick at steady state.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | How this feature complies |
|-----------|---------------------------|
| **I. Fidelity** | Every weapon, geometry test, and damage formula verified against original C source: `GECMDS.C:cmd_phasor / cmd_torpedo / cmd_missile / cmd_mine / cmd_zipper / cmd_decoy / cmd_jammer / cmd_lock / cmd_shield / cmd_flux`, `GEFUNCS.C:firephas / firetorp / firemiss / minesweep / killem / acctm / shieldhit / randamage / ton_fact / damstr`, `GEPLANET.C:planet_economy revolt branch`. Constants pulled verbatim from `GEMAIN.H` (`PMINFIRE=60`, `PRELOAD=10`, `PHABIAS=2`, `SHHITENG=1000`, `FIRETICKS=10`, `DECOYTIME=15`, `HPBEAMW=5`, `MAXTORPS=3`, `MAXMISSL=3`, `MINERANGE=10000`) and `GEGLOBAL.H` globals (`tdammax`, `mdammax`, `minedammax`, `decodds`, `torpsped`, `mislsped`, `misengfc`, `jamtime`). Line-by-line citations live in `combat-math.ts` JSDoc. The mine-sweep `% 5` cadence (`GEFUNCS.C:1421`) and the no-owner-exclusion behavior (`GEFUNCS.C:1423–1488`) are reproduced exactly per spec clarifications. |
| **II. Testing first class** | Pure-function unit tests for every `combat-math` export. Integration tests for `CombatTickService` using Jest fake timers and seeded PRNG. Balance-regression test fails on drift of any constant in SC-003 plus the 5-tick mine-sweep cadence. Mine persistence has a real-DB integration test (SC-006). Planet-revolt determinism test (SC-007). Per-ship fault isolation test (SC-005). Deterministic decoy and torpedo-hit tests (SC-004). |
| **III. Architecture** | No `@Interval` decorator: `CombatTickService` subscribes to the existing raw-`setInterval`-driven `TickService` via the same `TickKind.PHYSICS` enum value 006a uses. State stays in `ShipStateService` for ship-side combat fields; mines flush via Prisma; decoys, jammers, and in-flight projectiles are in-memory only and intentionally lost on restart (matches original GE volatility). No Redis. Combat events emitted via `EventEmitter2`; `GameGateway` is the sole Socket.io bridge (FR-031). |
| **IV. Quality** | TS strict throughout — no `any`. Public service methods carry JSDoc with `@see GECMDS.C:`/`GEFUNCS.C:` line references. Reuses the existing `Mine` Prisma model from 001 — no migration. Docker Compose unchanged. Constants referenced by name from `constants.ts` (extended) so the balance-regression test enumerates them. |

**Gate result: PASS** — no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/006b-combat/
├── plan.md              # This file
├── spec.md              # Already authored
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── combat-events.md # Typed combat event payloads emitted by the tick
└── tasks.md             # Phase 2 output (created by /speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── game/
│   │   ├── combat/                     # NEW — feature 006b
│   │   │   ├── combat.module.ts
│   │   │   ├── combat-math.ts          # pure: line-of-fire, phaser hit, torp/missile travel,
│   │   │   │                           # damage roll, ton_fact, shieldhit, randamage,
│   │   │   │                           # mine cubic falloff, decoy odds, jammer area effect, damstr
│   │   │   ├── combat-tick.service.ts  # subscribes to TickKind.PHYSICS (after PhysicsTickService);
│   │   │   │                           # phaser reload, projectile travel, decoy/jammer expiry,
│   │   │   │                           # mine sweep (% 5), kill resolution
│   │   │   ├── combat-events.ts        # typed event names + payload interfaces
│   │   │   ├── mine.repository.ts      # Prisma read/write helpers + boot-time hydrate
│   │   │   └── random.port.ts          # injectable PRNG (default: Math.random; tests seed)
│   │   ├── physics/                    # unchanged from 006a
│   │   ├── tick/                       # unchanged
│   │   ├── ship/                       # unchanged
│   │   ├── planet/
│   │   │   └── planet-economy.service.ts  # MODIFIED — add revolt branch (FR-028)
│   │   ├── commands/handlers/          # NEW handlers below
│   │   │   ├── phaser.handler.ts          # `pha`
│   │   │   ├── torpedo.handler.ts         # `tor`
│   │   │   ├── missile.handler.ts         # `mis`
│   │   │   ├── mine.handler.ts            # `min`
│   │   │   ├── zipper.handler.ts          # `zip`
│   │   │   ├── decoy.handler.ts           # `dec`
│   │   │   ├── jammer.handler.ts          # `jam`
│   │   │   ├── lock.handler.ts            # `loc` (and the `@` resolver helper)
│   │   │   ├── shield.handler.ts          # `shi up | dn`
│   │   │   ├── flux.handler.ts            # `flux`
│   │   │   └── sys.handler.ts             # `sys unjam` (and any other sys subcommands)
│   │   └── constants.ts                 # ADD combat constants (see Phase 0)
│   └── gateway/                         # MODIFIED — bridge `combat.*` events
│       └── game.gateway.ts              # subscribe to combat events; emit to sector rooms
│                                        # (galaxy-wide for combat.ship-destroyed)
└── test/
    └── game/
        ├── combat/
        │   ├── combat-math.spec.ts             # pure-function unit tests
        │   ├── combat-tick.service.spec.ts     # integration with fake timers + seeded PRNG
        │   ├── balance-regression.spec.ts      # constant pinning (SC-003)
        │   ├── mine-persistence.spec.ts        # real-DB hydrate + flush (SC-006)
        │   ├── kill-attribution.spec.ts        # multi-hit lastfired ordering (FR-026)
        │   └── fault-isolation.spec.ts         # one bad ship cannot stall combat tick (SC-005)
        ├── commands/handlers/
        │   ├── phaser.spec.ts
        │   ├── torpedo.spec.ts
        │   ├── missile.spec.ts
        │   ├── mine.spec.ts
        │   ├── zipper.spec.ts
        │   ├── decoy.spec.ts
        │   ├── jammer.spec.ts
        │   ├── lock.spec.ts
        │   ├── shield.spec.ts
        │   ├── flux.spec.ts
        │   └── sys-unjam.spec.ts
        └── planet/
            └── revolt.spec.ts                  # SC-007
```

**Structure Decision**: Backend-only feature in the existing single NestJS project. New `game/combat/` module; modifies the existing planet economy tick for revolt; adds gateway subscriptions for combat events. No frontend changes; no Prisma schema change; no new third-party dependency.

## Phase 0: Research

See [research.md](./research.md). All Technical Context unknowns
resolved (no `NEEDS CLARIFICATION` remain). Highlights:

- **Tick ordering**: `CombatTickService` subscribes to the same `TickKind.PHYSICS` event 006a uses; both services attach via the existing `TickService.subscribe()` listener queue. Subscription order is enforced by module import order (CombatModule imports PhysicsModule), and `CombatTickService.onModuleInit()` registers strictly after `PhysicsTickService.onModuleInit()`, so the combat pass runs after the physics movement pass on the same 6-second cadence (matches `checktm()` in the original).
- **Randomness**: A `Random` port is introduced (DI token) with a default `Math.random()` adapter. Tests inject a seeded Mulberry32 PRNG so SC-004 (deterministic decoy intercept and torpedo hit) and the per-hit `randamage()` distribution can be replayed.
- **Mine-sweep cadence**: every active mine's `timer` decrements every tick; the sweep that *applies damage* fires only when `timer % 5 === 0`. On non-sweep ticks no proximity warning is emitted; on sweep ticks ships within `MINERANGE` get either a damage hit (timer===0 → cubic falloff, then mine destroyed) or an `MINE6` proximity warning (`GEFUNCS.C:1421-1488`).
- **Lock semantics**: lazy clearing on every `@` resolution — not a per-tick proactive sweep. The clearing trigger is `cdistance × 10000 > scanrange` OR target `!ingegame`, not sector boundary (`GECMDS.C:1441-1471`).
- **Jammer**: area-effect on every ship within the carrier's scan range, including the carrier itself; per-ship `jammer` counter set to `jamtime × (1 − distance/scanrange)` and decremented per tick. While `jammer > 0`, that ship's `loc`/fire-control attempts are rejected with JAMMER4. `sys unjam` clears the counter immediately (`GECMDS.C:1593-1651`).
- **Friendly fire**: hit resolution does **not** filter by team — kills on teammates credit normally (matches original GE per spec clarification).
- **Death broadcast**: `combat.ship-destroyed` is the single galaxy-wide event; all other combat events are sector-scoped (per spec clarification).
- **Combat constants**: extend `backend/src/game/constants.ts` with `PMINFIRE`, `PRELOAD`, `PHABIAS`, `SHHITENG`, `FIRETICKS`, `DECOYTIME`, `HPBEAMW`, `MAXTORPS`, `MAXMISSL`, `MINERANGE`, plus the `GEGLOBAL.H` tunables `TDAMMAX`, `MDAMMAX`, `MINEDAMMAX`, `DECODDS`, `TORPSPED`, `MISLSPED`, `MISENGFC`, `JAMTIME`. Each gets a JSDoc citation and an entry in the balance-regression test (SC-003).

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](./data-model.md). No Prisma schema change. Documents:

- the existing `Mine` table fields read/written by combat,
- the `ShipState` fields touched by hit resolution (damage, energy, shield, shieldstat, lastfired, kills, decout, jammer, lock, lmissl*, ltorps*, items),
- in-memory-only state structures for in-flight projectiles, decoys, and jammer counters (no DB persistence).

### Contracts

See [contracts/combat-events.md](./contracts/combat-events.md). The
following typed events are emitted via `EventEmitter2` (all sector-scoped
except where noted):

- `combat.phaser-fired` — `{ shipId, bearing, percent, sector, tickAt }`
- `combat.hit` — `{ attackerId, victimId, weapon: 'phaser'|'torpedo'|'missile'|'mine', damageHull, damageShield, sector, tickAt }`
- `combat.miss` — `{ attackerId, weapon, sector, tickAt }`
- `combat.decoy-intercept` — `{ defenderId, weapon: 'torpedo'|'missile', attackerId, sector, tickAt }`
- `combat.mine-detonation` — `{ mineId, victimId, channel, sector, tickAt }`
- `combat.ship-destroyed` — `{ victimId, attackerId, sector, tickAt }` — **galaxy-wide broadcast** (FR-031, spec clarification)

Payloads carry the **minimum data** the gateway needs to broadcast — no
`ShipState` snapshots, no socket-room metadata. Gateway translation to
sector rooms (and the galaxy-wide exception for ship-destroyed) is
the gateway's job.

### Quickstart

See [quickstart.md](./quickstart.md). Manual verification recipe: seed
two player ships in the same sector, fire phasers, then a torpedo, then
a decoy intercept; deploy a mine, drive a third ship onto it; trigger
a planet-revolt scenario via a fixture and confirm the distress mail
and `**Free**` flip.

### Constitution Re-check (post-design)

Still PASS. New `combat/` module is one NestJS provider, one pure-math
file, one event-name constants file, one Prisma repository, one DI
PRNG port. No new infra, no decorator-based scheduling, no Prisma
schema change, no Redis. All formulas annotated with
`@see GECMDS.C:`/`GEFUNCS.C:`/`GEPLANET.C:` line numbers. The
balance-regression test enumerates the exact constants the feature
consumes.

### Agent Context Update

Updated `CLAUDE.md`'s SPECKIT block to point at this plan.

## Complexity Tracking

> No violations — table omitted.
