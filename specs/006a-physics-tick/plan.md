# Implementation Plan: Physics Tick Activation

**Branch**: `006a-physics-tick` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006a-physics-tick/spec.md`

## Summary

Activate the 6-second `PHYSICS_TICK` so non-destroyed ships are advanced each
heartbeat: rotate toward `head2b`, accelerate toward `speed2b`, integrate
position, debit movement-maintenance energy (player ships only), and decrement
per-tick countdowns (`hypha`, `cantexit`). Add an
ascending-`shipId` ordered batch with per-ship error isolation. Fully populate
the `warp` command gate sequence using the existing `topspeed` field plus a
direct `ShipClass.maxWarp` lookup so the WARP01 / WARPSPD2 distinction is real.
Sector-transition and hyperspace-entry/exit signals are emitted as typed
events for the gateway to consume in a later feature.

Math lives in a side-effect-free `physics-math.ts` module (pure functions,
deterministic, no DI). The orchestrator is `PhysicsTickService`, a NestJS
provider that subscribes to the existing `TickKind.PHYSICS` enum value
(defined in `backend/src/game/tick/tick.types.ts` — do not introduce a new
enum value) and walks
`ShipStateService.findAllShips()` in `shipId` order, mutating in-memory state
through `ShipStateService.mutate()` (which sets `dirty` for the existing
1-second flush path). Feature 006b will plug combat into the same tick.

## Technical Context

**Language/Version**: TypeScript 5.x (NestJS 10 / Node 20)
**Primary Dependencies**: `@nestjs/common`, existing `TickService` (subscribe API), `ShipStateService` (in-memory `Map<shipKey, ShipState>`), `PrismaService` (read-only access to `ShipClass`), `EventEmitter2` (already wired for inter-module events; used for typed sector-transition / hyperspace signals)
**Storage**: PostgreSQL 16+ via Prisma — `Ship` rows mutated through the existing async flush on the 1-second `SHIP_UPDATE` tick; `ShipClass.maxWarp` read on warp command (cached in-memory after first lookup)
**Testing**: Jest with fake timers — pure-function unit tests for `physics-math`, integration tests for `PhysicsTickService` driving real `ShipStateService` against a seeded in-memory map, balance-regression test pinning every `GEMAIN.H` constant this feature consumes
**Target Platform**: Linux container (Hetzner CPX32) — Node 20, single backend process
**Project Type**: Web service (backend-only feature; no frontend changes)
**Performance Goals**: 100 ships advanced through one physics tick in <50 ms on the project's CI runner (SC-004); 6-second tick budget never exceeded
**Constraints**: No new external dependencies. No Redis. No `@Interval` decorator (constitution III). All math deterministic and side-effect-free. AI ships skip movement-maintenance debit (FR-006). Ships in orbit / docked skip the rotate/accel/move/maintenance block but still tick countdowns (FR-001). Per-ship faults must not abort the batch (FR-015).
**Scale/Scope**: 30×15 sector grid, expected ≤200 active ships per tick at steady state. SC-004's 50 ms budget is gated against 100 ships (T036); higher ship counts are not a verified design constraint for this feature.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | How this feature complies |
|-----------|---------------------------|
| **I. Fidelity** | All formulas verified against `GEFUNCS.C:rotship` (heading step `max_accel/10.0`), `GEFUNCS.C:accel` (acceleration / hyperspace boundary / ACCENGAMT debit), `GEFUNCS.C:moveship` (position integration via `sin(deg)/65000`, `MOVENGUSE`/`MOVENGMIN`, GESTAT_USER gate). `GECMDS.C:cmd_warp` mirrors the five-gate sequence. Constants `ACCENGAMT=120`, `MOVENGUSE=10`, `MOVENGMIN=3000`, `ROTENGUSE=30`, `TICKTIME=6` all consumed verbatim from `GEMAIN.H`; per-class `max_accel`/`max_warp` consumed from the existing seed catalog. No invented pilot-skill scalar (FR-013). |
| **II. Testing first class** | Pure-function unit tests for every `physics-math` export. Integration tests for the orchestrator using Jest fake timers. Balance-regression test fails if any of the listed constants change (FR-016). AI-ship maintenance-debit isolation tested without booting the gateway. |
| **III. Architecture** | No `@Interval` decorator: subscribes to the existing raw-`setInterval`-driven `TickService`. State stays in the in-memory `ShipStateService` Map; flush remains on the existing 1-second `SHIP_UPDATE` cadence. No Redis. Sector-transition and hyperspace events emitted via `EventEmitter2` (in-process, decoupled, gateway consumes in a follow-up). |
| **IV. Quality** | TS strict throughout — no `any`. Public service methods carry JSDoc with `@see GEFUNCS.C:...`. No new Prisma migration needed (consumes existing `ShipClass.maxWarp`, `Ship.topspeed`). Docker Compose unchanged. |

**Gate result: PASS** — no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/006a-physics-tick/
├── plan.md              # This file
├── spec.md              # Already authored
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── physics-events.md   # Typed event payloads emitted by the tick
└── tasks.md             # Phase 2 output (created by /speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── game/
│   │   ├── physics/                    # NEW — feature 006a
│   │   │   ├── physics.module.ts
│   │   │   ├── physics-math.ts         # pure functions: rotate, accel, move, energy gates, sector-of, normalize
│   │   │   ├── physics-tick.service.ts # subscribes to TickKind.PHYSICS, drives the per-ship loop
│   │   │   ├── physics-events.ts       # typed event names + payload interfaces
│   │   │   └── ship-class-cache.service.ts # in-memory Map<classNumber, {maxWarp, maxAccel}> hydrated on boot
│   │   ├── tick/                       # unchanged — already firing TickKind.PHYSICS @6s (existing enum, do not redefine)
│   │   ├── ship/                       # unchanged — provides ShipStateService.mutate / findAllShips
│   │   ├── commands/handlers/
│   │   │   └── warp.handler.ts         # MODIFIED — finish gate sequence using ShipClassCacheService
│   │   └── constants.ts                # ADD: ACCENGAMT, MOVENGUSE, MOVENGMIN, COORD_SCALE, WARP_THRESHOLD
│   └── ...
└── test/
    └── game/
        └── physics/
            ├── physics-math.spec.ts            # pure-function unit tests
            ├── physics-tick.service.spec.ts    # integration with fake timers + in-memory ShipStateService
            ├── balance-regression.spec.ts      # constant pinning (FR-016)
            └── warp-gate.spec.ts               # five-outcome warp command gate test (SC-006)

# MODIFIED — existing test file from feature 003 must be revised
backend/test/unit/handlers/warp.spec.ts        # currently passes against the
                                               # placeholder topspeed==0 → WARP01
                                               # proxy; revise to assert the
                                               # completed gate sequence
                                               # (WARP01 from ShipClass.maxWarp,
                                               # WARPSPD2 from topspeed===0,
                                               # WARP02/WARP03/WARP04 unchanged)
```

**Structure Decision**: Backend-only feature in the existing single NestJS project. New `game/physics/` module; no frontend changes; no Prisma schema change; no new third-party dependency.

## Phase 0: Research

See [research.md](./research.md). All five Technical Context unknowns
resolved (no `NEEDS CLARIFICATION` remain). Highlights:

- **Heading step** is `shipclass.max_accel / 10.0` (C source, not the unused `ROTAMT`).
- **Acceleration step** is `max_accel` going up, `max_accel * 2.0` coming down.
- **`ACCENGAMT` debit** applies only when the *step* keeps speed at or above the warp threshold (1000 internal units); below 1000 the debit is zero.
- **`MOVENGUSE` debit** applies only to player ships (`status === GESTAT_USER === 1`); AI ships (Cybertron/Droid/Murdonian) are skipped, matching `moveship`'s `if (... && ptr->status == GESTAT_USER)` gate.
- **Sector** is `Math.floor(coord)` (C source `coord1`); already the convention in `scan.handler.ts`. No stored field; the report handler's `+1` is a display offset, not the sector number.
- **AI-ship classification** uses `ShipState.status`: `1 = GESTAT_USER` is a player; `2 = GESTAT_AUTO` (Cybertron) and any other non-zero are AI. (No Droid/Murdonian rows exist yet — feature 008 will add them under `GESTAT_AUTO` per the original.)
- **Universe wrap / telezip / gravity / overspeed-engine-blow** behaviors are explicitly out-of-scope for 006a (they belong to 006b combat or the dedicated galaxy/safety features). The acceptance criteria here cover only the four-step rotate/accel/move/maintenance loop plus the two countdowns.

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](./data-model.md). No schema change. Documents
which `ShipState` fields are read versus mutated by the tick and which fields
on `ShipClass` are read by the warp command and the cache service.

### Contracts

See [contracts/physics-events.md](./contracts/physics-events.md). Two typed
events emitted via `EventEmitter2`:

- `physics.sector-transition` — `{ shipId, fromSector, toSector, x, y, tickAt }`
- `physics.hyperspace` — `{ shipId, direction: 'enter' | 'exit', speed, tickAt }`

Both payloads are **minimum data** — no `ShipState` snapshot, no socket-room
metadata. Gateway integration is the consumer's job in a follow-up feature.

### Quickstart

See [quickstart.md](./quickstart.md). Manual verification recipe: seed two
ships (one player at warp 1, one Cybertron at impulse), let the tick run for
60 seconds, verify movement, energy decrement (player only), heading
convergence, and a sector-transition event in the logs.

### Constitution Re-check (post-design)

Still PASS. New `physics/` module is a single NestJS provider plus a pure-
math file plus an event-name constants file. No new infra, no decorator-based
scheduling, no Prisma changes, no Redis. All formulas annotated with
`@see GEFUNCS.C:<line>`. The balance-regression test enumerates the exact
constants the feature consumes.

### Agent Context Update

Updated `CLAUDE.md`'s SPECKIT block to point at this plan.

## Complexity Tracking

> No violations — table omitted.
