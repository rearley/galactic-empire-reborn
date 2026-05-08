# Implementation Plan: Physics Polish — Tick & Bridge Consolidation

**Branch**: `019-physics-polish` | **Date**: 2026-05-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-physics-polish/spec.md`

## Summary

Six deferred mechanical gaps from features 006a–013 land together as a tick-and-bridge consolidation:
universe boundary wrap on the physics tick, overspeed engine damage wired to the existing
`warncntr`, auto-repair and auto-shield consumers on the ship-update tick, AI-attacker scoring
through `PlayerScoreService` (with a configurable `score_f2` and the C-source 1/10 reduction),
the mutual-kill `attackerUserid` snapshot fix in `CombatTickService`, attacker-side `kills`
persistence for Cybertrons (no-op for Droids), and droid spawn/kill bridge events through
`GameGateway` mirroring today's `droid.annoy` routing. **Wormhole gravity is out of scope**
(deferred to feature 020). No schema changes, no new commands.

## Technical Context

**Language/Version**: TypeScript 5.x (NestJS 10 backend, React 18 + Vite frontend)
**Primary Dependencies**: `@nestjs/common`, `@nestjs/event-emitter`, `@nestjs/platform-socket.io`,
  `@nestjs/schedule` (cron only), Prisma, Socket.io
**Storage**: PostgreSQL 16 via Prisma — only existing tables touched (`User.score`, `User.klscore`,
  `Cybertron.kills`). No migrations.
**Testing**: Jest with fake timers for tick/scoring/wrap/overspeed; Vitest for any frontend
  assertions on the droid presence list. AI-isolation tests (no live world / sockets).
**Target Platform**: Linux server (single-process Docker container; Hetzner CPX32)
**Project Type**: Web service (NestJS backend) + React frontend
**Performance Goals**: 6s physics tick, 1s ship-update tick — both must remain well under their
  budgets with the new per-ship work; no heap growth from per-tick allocations.
**Constraints**: Strict TypeScript (no `any`); raw `setInterval` for ticks (Principle III);
  in-memory ship state Map authoritative; Postgres flushed async. Boundary wrap MUST NOT
  interact with wormhole transit logic.
**Scale/Scope**: Up to a few hundred active ships (players + Cybertrons + Droids) on a single
  node. Six FR clusters; ~25–35 tasks expected at /speckit-tasks.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Fidelity** — PASS. Wrap matches `GEFUNCS.C:651-705` (modular on `MAXX`/`MAXY` with
  `univwrap` semantics). Overspeed formula matches `GEFUNCS.C:733-792` exactly (incl.
  `gernd()%diff` gate, `damage += gernd()%20`, `topspeed = topspeed/warncntr` recovery).
  AI scoring formula matches `GEFUNCS.C:1157-1185` with the documented 1/10 reduction
  for AI attackers (`GEFUNCS.C:1161` branch). Droid attacker `kills` non-persistence
  matches `GEFUNCS.C:1253`. Auto-shield is the **only** non-source feature; spec already
  flags this with explicit project-design rationale.
- **II. Testing First Class** — PASS. Each FR cluster gets unit tests (math/decisions),
  integration tests against the in-memory tick, and AI-isolation tests for AI-kill
  scoring. Existing `GEMAIN.H` regression tests (`MAXX`, `MAXY`, `TICKTIME`, `TICKTIME2`)
  unchanged. New constant `score_f2` gets a regression test pinned at 100.
- **III. Architecture** — PASS. No new modules, no Redis, no external schedulers. New
  per-tick work attaches to existing services (`PhysicsTickService`,
  `ShipUpdateTickService` if it exists otherwise the 1-second tick host, `CombatTickService`,
  `PlayerScoreService`, `DroidTickService`, `GameGateway`). Calendar/cron scheduling not
  involved. No `@Interval` decorators introduced.
- **IV. Quality** — PASS. Strict TS preserved; every new public method gets a JSDoc with
  `@see GEFUNCS.C:<line>` reference. No Prisma migration files added (no schema change).
  Auto-shield methods carry an explicit "no C-source equivalent — port-original" JSDoc
  note, per the spec's Note in US4.

No violations to justify — Complexity Tracking section is empty.

## Project Structure

### Documentation (this feature)

```text
specs/019-physics-polish/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (no new entities; documents touched fields)
├── quickstart.md        # Phase 1 output (manual smoke test)
├── spec.md              # /speckit-specify output
└── tasks.md             # /speckit-tasks output (NOT created here)
```

No `contracts/` directory — feature ships no new external interfaces. New Socket.io events
(`droid.spawned`, `droid.killed`) are documented in `data-model.md` alongside the existing
`droid.annoy` shape.

### Source Code (repository root)

Web-application layout. Files this feature touches (no new modules):

```text
backend/
├── src/
│   ├── game/
│   │   ├── physics/
│   │   │   ├── physics-math.ts            # add wrapCoord(x, max)
│   │   │   ├── physics-tick.service.ts    # call wrapCoord after position integration
│   │   │   └── physics-events.ts          # add PHYSICS_BOUNDARY_WRAPPED (optional, for tests)
│   │   ├── ship/
│   │   │   ├── ship-overspeed.ts          # NEW — pure overspeed decision per GEFUNCS.C:733-792
│   │   │   ├── maintenance.service.ts     # NEW — domain service: pure gates + cash debit
│   │   │   │                              #       + repair queue. Single source of truth for
│   │   │   │                              #       maint logic; called by both the command
│   │   │   │                              #       handler (manual) and the new tick consumer
│   │   │   │                              #       (auto-repair). NOT a tick handler itself.
│   │   │   ├── ship-tick.service.ts        # NEW — class ShipTickService. Subscribes to
│   │   │   │                              #       TickKind.SHIP_UPDATE in OnModuleInit (via
│   │   │   │                              #       TickService.subscribe), unsubscribes in
│   │   │   │                              #       OnModuleDestroy. Per-ship loop runs
│   │   │   │                              #       overspeed + auto-repair + auto-shield.
│   │   │   │                              #       Pattern parallels PhysicsTickService.
│   │   │   └── ship.module.ts             # wire MaintenanceService + ShipTickService
│   │   ├── combat/
│   │   │   ├── combat-tick.service.ts     # snapshot attackerUserid before removeFromGame()
│   │   │   └── combat-events.ts           # (no shape change — isAiAttacker derived in service)
│   │   ├── player/
│   │   │   ├── player-score.service.ts    # compute isAiAttacker, pass through to repo
│   │   │   ├── player-score.repository.ts # apply (scr/100) * score_f2 and AI 1/10 reduction
│   │   │   └── score.config.ts            # NEW — load score_f2 from env (default 100)
│   │   ├── cybertron/
│   │   │   ├── cybertron.repository.ts    # add incrementKills(shipno)
│   │   │   └── cybertron-tick.service.ts  # (no change — increment driven from PlayerScoreService)
│   │   ├── droid/
│   │   │   ├── droid-events.ts            # already declares SPAWNED/KILLED — wire emitters
│   │   │   ├── droid-spawner.ts           # emit SPAWNED on spawn
│   │   │   └── droid-tick.service.ts      # emit KILLED on droid death
│   │   ├── commands/handlers/
│   │   │   └── maint.handler.ts           # delegate to MaintenanceService; keep message
│   │   │                                  # formatting + CommandResult shape here
│   │   └── tick/
│   │       └── tick.service.ts            # (no change — new subscribers register via subscribe())
│   └── gateway/
│       └── game.gateway.ts                # bridge SPAWNED/KILLED to sector + global rooms
├── tests/                                 # Jest specs paired alongside touched files
└── prisma/                                # NO migrations
frontend/
├── src/
│   ├── features/sector-roster/            # add ephemeral droid entries
│   └── tests/                             # Vitest specs for roster ephemeral flag
```

**Structure Decision**: Web application (`backend/` + `frontend/`). All backend changes localize
inside existing modules — `physics`, `ship`, `combat`, `player`, `cybertron`, `droid`, `gateway`.
The frontend touch is limited to ephemeral droid entries in the sector roster component.

**Tick-host correction**: There is no `ship-update-tick.service.ts` in the codebase. The 1-second
tick is driven by the unified `TickService` (`backend/src/game/tick/tick.service.ts`) which fires
`TickKind.SHIP_UPDATE` and exposes `subscribe(kind, handler)` (see `tick.service.ts:74`). New
per-ship work this feature adds — overspeed evaluation, auto-repair, auto-shield — is hosted by a
new `backend/src/game/ship/ship-tick.service.ts` (class `ShipTickService`). It subscribes to
`TickKind.SHIP_UPDATE` in `OnModuleInit` and unsubscribes in `OnModuleDestroy`, parallel to the
existing `PhysicsTickService` (`physics/physics-tick.service.ts`) which owns the `PHYSICS` tick.
Filename uses the dominant `*-tick.service.ts` convention, not the lone `*.subscriber.ts` form
in `tick/sector-transition.subscriber.ts` (that file is cross-cutting glue and lives in `tick/`
for a reason — domain-specific consumers stay in their own domain folders).

**Maint extraction correction**: The auto-repair tick consumer MUST NOT import `MaintHandlerService`
(command-layer code that returns `CommandResult` and formats player-facing messages). Instead, the
gate logic + cash debit + repair-queue side effect are extracted into a new domain service
`backend/src/game/ship/maintenance.service.ts`. The command handler delegates to it (and keeps
the message-formatting / `CommandResult` shape), and the tick subscriber calls it directly. This
keeps a single source of truth for the gates and respects layering (tick layer never depends on
command layer).

**T024 trigger-flag attachment sites** (located 2026-05-08):

- **Warp exit** → `backend/src/game/physics/physics-tick.service.ts:198-206`. Inside the
  existing `if (speedChanged && accel.hyperspaceEvent !== null)` block, gate on
  `accel.hyperspaceEvent === 'exit'` and add a single `shipState.mutate(...)` call setting
  `s.recentlyWarpedExit = true`. Clean single-line attachment — no new event, no new branch.
- **Self-torpedo launch** → `backend/src/game/commands/handlers/torpedo.handler.ts:132-136`.
  Inside the existing firer-mutate block (the same one that does `s.shieldstat = 0` and
  `s.cantexit = FIRETICKS`), add one line: `s.recentlySelfFiredTorp = true`. Clean
  single-line attachment in the same mutate that drops shields. No new branch.

Both flags require new optional `boolean` fields on `ShipState` — additive only; data-model.md
already lists ShipState fields touched but does not yet enumerate these two transient triggers.
Add them in T023 alongside the `decideAutoShield` decision type definition (no schema impact —
in-memory only).

## Complexity Tracking

> No constitutional violations to justify — section intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| —         | —          | —                                    |
