# Implementation Plan: Ship Commands & Terminal Frontend

**Branch**: `003-ship-commands` | **Date**: 2026-05-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-ship-commands/spec.md`

## Summary

Land the player-facing surface of Galactic Empire Reborn: a `ShipStateService` that holds
the live in-memory `Map<userid:shipno, ShipState>` (the source of truth during gameplay,
hydrated from Postgres at boot, flushed back via a dirty-flag subscriber on the existing
1-second SHIP_UPDATE tick); a `CommandRouter` that tokenises text, resolves aliases, and
dispatches to per-keyword handlers; the five P1 commands (`scan`, `report`, `rotate`,
`impulse`, `warp`) faithful to `GECMDS.C`; and a new Vite + React + Tailwind terminal
frontend wired to `GameGateway` over Socket.io, rendering a scrolling event log, a
character-grid scan map, and a single-line command input. Movement physics, energy cost,
orbit/damage gating, and combat remain deferred to feature 006 — short-circuited gates
carry `TODO(006): see GECMDS.C:NNN` markers per Q2.

The active ship for a connection is resolved on the socket handshake from the
connecting `userid`'s persisted `Ship` rows (FR-030) — there is **no** in-game BOARD /
SELECT command, faithful to the original `GECMDS.C` command table (lines 124-167)
which does not contain one. Active-ship selection in the original happened in the BBS
shell menu before the in-game prompt; here it happens in `handleConnection`. This was
considered explicitly and recorded in `research.md` Decision 8.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20.x (backend); TypeScript 5.x (frontend)
**Primary Dependencies**:
  - Backend (existing): NestJS 10, `@nestjs/platform-socket.io`, Prisma 5, Socket.io 4
  - Frontend (new): React 18, Vite 5, Tailwind CSS 3, `socket.io-client` 4
**Storage**: PostgreSQL 16+ via Prisma (existing `Ship` / `ShipClass` / `Sector` / `Planet` / `Wormhole` tables from feature 001)
**Testing**: Jest (backend, existing config); Vitest + jsdom + `@testing-library/react` (frontend, new)
**Target Platform**: Linux server (backend); modern desktop browser (frontend)
**Project Type**: Web application — `backend/` (NestJS) + `frontend/` (Vite/React)
**Performance Goals**: Round-trip command echo < 100 ms on dev network (SC-005); zero DB writes per heartbeat when no ship is dirty (SC-003); persistence write within ≤ 1 SHIP_UPDATE heartbeat after a state change (SC-002)
**Constraints**:
  - In-memory `Map` is authoritative during gameplay (Constitution III); Postgres is async-flushed
  - No Redis / no external cache layer
  - Tick cadence is fixed: SHIP_UPDATE 1 s, PHYSICS 6 s — already wired by `TickService` (feature 002)
  - Strict TypeScript across the stack — no `any`, no implicit types
  - Game balance constants from `GEMAIN.H` and `ShipClass` rows are canonical; deviations require documented rationale
**Scale/Scope**: Tens of concurrent ships in development; design must hold to the original game's hundreds of concurrent ships. Backend tests +35; frontend tests +6 (SC-007).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Fidelity

- ✅ Active-ship selection is faithful: no BOARD/SELECT command is added because none
  exists in the original `GECMDS.C` command table (lines 124-167). Resolution happens
  on the socket handshake (FR-030, `research.md` Decision 8), mirroring the original
  game's BBS-menu selection that ran before the in-game prompt.
- ✅ Every command's behaviour, error message, and validator traces back to identifiable
  lines in `GECMDS.C` / `GEFUNCS.C` / `GEMAIN.H` (FR-021). Per-command source anchors:
  - `cmd_scan` GECMDS.C:2138 (with `scan_sh` :2190, `scan_pl` :2295)
  - `cmd_report` GECMDS.C:1946
  - `cmd_rotate` GECMDS.C:643
  - `cmd_impulse` GECMDS.C:482
  - `cmd_warp` GECMDS.C:561
  - `valdegree` GEFUNCS.C:1933, `valpcnt` GEFUNCS.C:1906
- ✅ `ROTENGUSE`/`ROTAMT` are deferred (Q1 Option A) — recorded as `TODO(006)` in code.
- ✅ Orbit / damage gates short-circuit with explicit `TODO(006): see GECMDS.C:NNN`
  comments (Q2 Option A, FR-019a).
- ✅ Text command input is the primary interaction (FR-022 / FR-023). No buttons replace it.
- ✅ The 1 s and 6 s ticks are not changed; this feature attaches a SHIP_UPDATE subscriber
  for persistence flush (FR-004) — does not introduce new cadences.
- ⚠ Reference `.MSG` file is not present in `reference/ge-source/`. Message string
  reconstruction strategy: derive from wiki (`reference/wiki/commands.md`) and from
  argument signatures in `prfmsg(...)` calls; record final strings in
  `contracts/messages.md` so any future deviation is auditable. This is the only fidelity
  point that depends on documentation rather than canonical source — flagged in
  `research.md` and tracked.

### II. Testing is First Class

- ✅ Backend tests (Jest): hydration on boot; dirty-flag flush; clean ships not written;
  one ship's flush failure does not block siblings (FR-006); router tokenisation, alias
  resolution, unknown-command path; per-command success and rejection paths for all five
  commands; socket round-trip integration test (`command` → `command:result`).
- ✅ Frontend tests (Vitest + jsdom): event-log append + autoscroll; command input
  submit-and-clear; scan-grid render; connection / reconnect indicator state machine;
  WebSocket bootstrap with hard-coded dev `userid`.
- ✅ Balance regression: each numeric range used (`valdegree` -180..180, `valpcnt` 0..99)
  has a test that fails if the constant changes — pinned in `tests/unit/validators.spec.ts`.
- ✅ Counts meet SC-007 (≥ 35 backend, ≥ 6 frontend).
- ❌ AI isolation / midnight idempotency tests: N/A for this feature (no AI, no midnight).

### III. Architecture

- ✅ NestJS + TypeScript backend; React + Vite + TS frontend (matches stack).
- ✅ `Map<string, ShipState>` keyed by composite `userid:shipno` (matches Ship `@@id`)
  lives in a NestJS singleton (`ShipStateService`) — the single source of in-game truth.
- ✅ Postgres flush via `TickService.subscribe(TickKind.SHIP_UPDATE, …)` — no new tick
  primitive; reuses feature 002's existing dispatcher.
- ✅ No Redis. No external cache.
- ✅ Socket.io: `command` and `command:result` events on the existing `GameGateway`;
  no new gateway, no separate namespace. Sector-room broadcasts are scaffolded but no
  P1 command in scope produces one yet.
- ✅ Scheduling: this feature adds zero scheduled jobs — only attaches to the existing
  `setInterval`-driven tick. No `@nestjs/schedule` use; no `@Interval` decorators.
- ✅ Spec-Driven Development workflow followed.

### IV. Quality

- ✅ Strict TypeScript across new code (matches existing `tsconfig`).
- ✅ Public service methods carry JSDoc anchors to original C source.
- ✅ No Prisma schema edits required — feature 001's `Ship` model is sufficient. No new
  migrations.
- ✅ No `any`, no implicit types.

**Gate result: PASS.** No violations to record in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-ship-commands/
├── plan.md              # This file
├── spec.md              # Already produced
├── research.md          # Phase 0 output — produced by /speckit-plan
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── websocket-events.md
│   ├── messages.md
│   └── shared-types.ts
└── tasks.md             # Phase 2 output (NOT created here — /speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── app.module.ts                       # ← register ShipModule, CommandModule
│   ├── prisma/                             # existing
│   ├── game/
│   │   ├── constants.ts                    # existing (MAXX/MAXY/TICKTIME)
│   │   ├── tick/                           # existing — TickService, TickKind
│   │   ├── ship/                           # NEW
│   │   │   ├── ship.module.ts
│   │   │   ├── ship-state.service.ts       # in-memory Map + dirty flag + flush subscriber
│   │   │   ├── ship-state.types.ts         # ShipState shape (mirrors Ship 1:1 per FR-007)
│   │   │   └── ship-state.mappers.ts       # Prisma Ship ↔ ShipState
│   │   └── commands/                       # NEW
│   │       ├── commands.module.ts
│   │       ├── command-router.service.ts   # tokenise + alias resolve + dispatch
│   │       ├── command.types.ts            # Command, CommandResult, CommandHandler
│   │       ├── messages.ts                 # original-game response strings (per contracts/messages.md)
│   │       └── handlers/
│   │           ├── scan.handler.ts
│   │           ├── report.handler.ts
│   │           ├── rotate.handler.ts
│   │           ├── impulse.handler.ts
│   │           └── warp.handler.ts
│   └── gateway/
│       ├── game.gateway.ts                 # existing — ADD `command` SubscribeMessage
│       └── gateway.module.ts               # existing — import CommandModule
└── test/
    ├── unit/
    │   ├── ship-state.service.spec.ts      # hydration, dirty-flag, flush isolation (FR-006)
    │   ├── command-router.spec.ts          # tokenise, alias, unknown-command
    │   ├── handlers/
    │   │   ├── scan.spec.ts
    │   │   ├── report.spec.ts
    │   │   ├── rotate.spec.ts
    │   │   ├── impulse.spec.ts
    │   │   └── warp.spec.ts
    │   └── validators.spec.ts              # valdegree/valpcnt parity
    └── integration/
        ├── command-roundtrip.spec.ts       # socket → router → state → result event
        └── handshake-resolution.spec.ts    # FR-030: zero→reject+disconnect, one→bind, ≥2→bind lowest shipno + warn-log assertion

frontend/                                   # NEW (entire tree)
├── index.html
├── package.json
├── vite.config.ts                          # proxy /socket.io to backend per FR-028
├── tailwind.config.ts
├── postcss.config.cjs
├── tsconfig.json
├── src/
│   ├── main.tsx
│   ├── App.tsx                             # 3-region layout (FR-022)
│   ├── socket/
│   │   ├── socketClient.ts                 # singleton; auto-reconnect; query userid (FR-029)
│   │   └── useSocket.ts                    # React hook bridge
│   ├── components/
│   │   ├── EventLog.tsx                    # scrolling log + autoscroll (FR-024, FR-025)
│   │   ├── CommandInput.tsx                # Enter→emit, clear (FR-023)
│   │   ├── ScanMap.tsx                     # render scanGrid character grid (FR-026)
│   │   └── ConnectionIndicator.tsx         # FR-027
│   ├── types/
│   │   └── contracts.ts                    # mirrors backend `command:result` payload
│   └── styles.css                          # Tailwind base + monospace
└── test/
    ├── setup.ts                            # Vitest + jsdom
    ├── EventLog.spec.tsx
    ├── CommandInput.spec.tsx
    ├── ScanMap.spec.tsx
    ├── ConnectionIndicator.spec.tsx
    ├── socketClient.spec.ts
    └── App.spec.tsx                        # smoke: layout + hard-coded userid handshake

reference/
└── ge-source/                              # READ-ONLY; consulted, never modified
```

**Structure Decision**: Web-application layout (Option 2) confirmed — `backend/` already
exists (NestJS, Prisma); `frontend/` is created in this feature as a sibling Vite project.
The frontend is an independent Vite app, not a sub-module of the Nest project, so backend
build / test / lint scripts remain untouched. Shared TypeScript contracts are duplicated
into `frontend/src/types/contracts.ts` (kept in lock-step with `contracts/shared-types.ts`)
rather than published as an internal package — there are exactly two consumers and the
shape is small.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  |            |                                     |
