# Implementation Plan: Tick Engine & Real-time Foundation

**Branch**: `002-tick-engine` | **Date**: 2026-05-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-tick-engine/spec.md`

## Summary

Stand up the NestJS application shell that all subsequent gameplay features will plug into:
a bootable HTTP+Socket.io server, a `PrismaService` lifecycle owner, a `TickService` that
fires 1 s and 6 s heartbeats via raw `setInterval` (managed in `onModuleInit` /
`onModuleDestroy`) with a pluggable subscriber registry,
and a `GameGateway` that lets clients join/leave per-sector Socket.io rooms (with bounds
validation and disconnect cleanup). Tick subscribers are the extension point feature 003+ will
use; they MUST be testable with Jest fake timers and isolated from wall-clock time.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict mode), Node.js 20+
**Primary Dependencies**: NestJS 10 (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-socket.io`, `@nestjs/websockets`), Socket.io 4, Prisma 5.22 (already installed). **`@nestjs/schedule` is intentionally NOT added** — it is reserved for the midnight `@Cron` job in a later feature. Heartbeats use raw `setInterval` in `TickService`.
**Storage**: PostgreSQL 16 via Prisma — no schema changes; lifecycle wiring only
**Testing**: Jest 29 + ts-jest (already configured); `socket.io-client` for gateway integration tests; Jest fake timers for tick cadence
**Target Platform**: Linux server (Docker), single-process deployment
**Project Type**: Web application — `backend/` (NestJS) + `frontend/` (later feature)
**Performance Goals**: Heartbeats fire on schedule with no chained drift; boot to "ready" < 5s (SC-001); 1s tick within ±5% over 10-min soak (SC-002 manual)
**Constraints**: Single-process only — raw `setInterval` is intentionally non-distributed (see research.md). Sector bounds fixed at X∈[1,30], Y∈[1,15] from `MAXX`/`MAXY`.
**Scale/Scope**: Single Node process, dozens of concurrent Socket.io clients in this feature; designed to grow to hundreds without changes to this layer.

### Planner notes (from /speckit-plan input)

1. **SC-002 (10-minute soak) is manual smoke only** — not an automated CI gate. Jest tests
   validate tick ratio using `jest.useFakeTimers()` over a short synthetic interval (e.g.,
   advance 60s of fake time and assert ~60 invocations of the 1s tick and ~10 of the 6s tick).
   The wall-clock soak is documented in `quickstart.md` as an operator smoke test.
2. **FR-009 client-facing contract**: when a `sector:join` request carries out-of-bounds
   coordinates, the gateway emits an `error` event back to the requesting socket with shape
   `{ event: "sector:join", code: "OUT_OF_BOUNDS", message: "Sector (X,Y) is outside galaxy bounds [1..30, 1..15]" }`. The client is NOT joined to any room. See `contracts/websocket-events.md`.
3. **`setInterval` rationale (single-process)**: `TickService` uses raw `setInterval` started
   in `onModuleInit` and cleared in `onModuleDestroy`. `setInterval` only fires inside one
   Node process. This is acceptable today because deployment is single-process (Hetzner
   CPX32, one container). If the project ever moves to multi-node, the tick engine becomes
   a correctness hazard — two nodes would each run the heartbeats, double-firing every
   subscriber. The mitigation at that time is a distributed lock (Postgres advisory lock or
   equivalent) so that exactly one node runs the tick loop. This is captured in
   `research.md` and `docs/DECISIONS.md` so the trade-off is traceable.

4. **`@nestjs/schedule` is reserved for feature 009 (midnight job)**, not added here. The
   constitution's reference to `@Interval(1000)`/`@Interval(6000)` is satisfied in spirit by
   raw `setInterval` at the same cadences — the constraint that matters is the cadence and
   the no-drift behavior (FR-012), not the specific decorator. This is a per-feature
   deviation from the literal wording of Principle III; the constitution will be amended in
   a separate PR if the team wants the wording to match practice.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this feature satisfies it |
|-----------|--------------------------------|
| **I. Fidelity** | Tick cadences match `TICKTIME=6` and `TICKTIME2=1` from `GEMAIN.H` exactly. No gameplay yet, so no balance constants are introduced beyond the tick periods themselves and `MAXX=30`/`MAXY=15` bounds. Reference verified in `/reference/ge-source/GEMAIN.H` and `/reference/ge-source/GEMAIN.C` (main loop). |
| **II. Testing is First Class** | Tests are written alongside implementation. Categories required by this plan: (a) unit — `TickService` subscriber registry and error isolation with fake timers; (b) integration — `GameGateway` join/leave/disconnect lifecycle with `socket.io-client`; (c) integration — `PrismaService` `onModuleInit`/`onModuleDestroy` hooks; (d) e2e — boot the Nest app and verify the heartbeat+gateway respond to a real client. SC-006 (100% of these pass) is the gate. |
| **III. Architecture** | Uses the mandated stack — NestJS, `@nestjs/platform-socket.io`. No Redis. PrismaService is the durable-store entry point. Socket.io rooms keyed by sector — exactly as the constitution prescribes. Module layout in `backend/src/` matches `CLAUDE.md`'s NestJS structure. **Deviation**: heartbeats use raw `setInterval` in `TickService` (managed via `onModuleInit`/`onModuleDestroy`) instead of `@nestjs/schedule` `@Interval` decorators. Cadences (1 s / 6 s) match `TICKTIME2`/`TICKTIME` exactly; `@nestjs/schedule` is held back for feature 009's midnight `@Cron`. See planner note 4 and `research.md` Decision 1. |
| **IV. Quality** | TypeScript strict mode (already on in `backend/tsconfig.json`). Public service methods get JSDoc with `@see` references to original C source where relevant (e.g., `TickService` references `GEMAIN.C` main loop). No new Prisma migrations. Docker Compose unchanged. CI must be green to merge. |

**Result**: PASS — no violations, Complexity Tracking section omitted.

## Project Structure

### Documentation (this feature)

```text
specs/002-tick-engine/
├── plan.md                       # This file
├── spec.md                       # Feature spec
├── research.md                   # Phase 0 — decisions + rationale
├── data-model.md                 # Phase 1 — in-memory entities (no DB schema changes)
├── quickstart.md                 # Phase 1 — boot + manual soak instructions
├── contracts/
│   └── websocket-events.md       # Phase 1 — Socket.io event contracts
└── tasks.md                      # Phase 2 — generated by /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── main.ts                   # Nest bootstrap (HTTP + Socket.io adapter)
│   ├── app.module.ts             # Root module wiring
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts     # PrismaClient + onModuleInit/onModuleDestroy
│   ├── game/
│   │   └── tick/
│   │       ├── tick.module.ts
│   │       ├── tick.service.ts   # raw setInterval(1000) + setInterval(6000) in onModuleInit; clearInterval in onModuleDestroy; subscriber registry
│   │       └── tick.types.ts     # TickHandler, TickKind types
│   └── gateway/
│       ├── gateway.module.ts
│       └── game.gateway.ts       # Socket.io gateway: connection, sector:join, sector:leave
├── test/
│   ├── prisma-schema/            # Existing 250 tests — untouched
│   ├── unit/
│   │   └── tick.service.spec.ts          # fake-timer cadence + subscriber isolation
│   ├── integration/
│   │   ├── prisma-lifecycle.spec.ts      # onModuleInit connects, onModuleDestroy closes
│   │   └── game-gateway.spec.ts          # join/leave/disconnect with socket.io-client
│   └── e2e/
│       └── boot.e2e.spec.ts              # full Nest app boots, client connects, tick observed
├── prisma/                        # Existing — untouched
├── jest.config.ts                 # Updated to include unit/integration/e2e roots
├── package.json                   # Adds @nestjs/core, @nestjs/common, @nestjs/platform-socket.io, @nestjs/websockets, socket.io, rxjs, reflect-metadata + socket.io-client (dev). Does NOT add @nestjs/schedule (reserved for feature 009).
└── tsconfig.json                  # Existing strict config
```

**Structure Decision**: Web-application layout. The `backend/` directory already exists with
Prisma in place. This feature introduces `backend/src/` (Nest application) and expands
`backend/test/` with `unit/`, `integration/`, and `e2e/` subtrees alongside the existing
`prisma-schema/` tests. The frontend tree is not touched in this feature.

## Complexity Tracking

> Not applicable — Constitution Check passed without violations.
