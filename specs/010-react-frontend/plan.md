# Implementation Plan: Terminal UI — Command Input, Event Log, ASCII Sector Map, Player Panel

**Branch**: `010-react-frontend` | **Date**: 2026-05-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-react-frontend/spec.md`

## Summary

Replace the 003-era frontend scaffolding with a shippable terminal UI for v1
playtesting: a fixed command bar with 20-entry history, a scrolling 500-entry
event log, a 30×15 ASCII sector map, a galaxy-wide player-list panel, and a
robust connection-lifecycle banner. The backend `GameGateway` and physics
tick are extended to emit the three events the frontend needs but does not
yet receive: `player.snapshot` (snapshot to joining socket), `player.joined`
/ `player.left` (galaxy-wide), and `physics.sector-transition` (galaxy-wide,
batched per tick, emitted whenever any ship — human or AI — crosses an
integer-cell boundary). The frontend continues to use Vite + React + Tailwind
+ Vitest; the backend continues to use NestJS + Socket.io + Jest. No new
runtime dependencies, no schema changes.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict), Node 20+
**Primary Dependencies**:
- Frontend: React 18, Vite 5, Tailwind 3, socket.io-client 4.8
- Backend: NestJS 10, @nestjs/platform-socket.io, socket.io 4
**Storage**: N/A — feature is presentation + event-emission only; no Prisma changes
**Testing**: Vitest + @testing-library/react (frontend); Jest + Supertest (backend)
**Target Platform**: Modern desktop browsers, viewport ≥1024px
**Project Type**: Web application (existing `frontend/` + `backend/`)
**Performance Goals**:
- Command round-trip < 500 ms p50 on localhost (SC-003)
- Event log responsive at 1000 buffered entries (SC-006)
- Reconnect to working state within 60 s of backend restart (SC-004)
**Constraints**:
- No new external dependencies (no Redux, no react-router, no socket.io v3 polyfills)
- Wire-type contract file `frontend/src/types/contracts.ts` remains the single source of truth — backend imports/duplicates structurally and the existing `contracts-parity.spec.ts` keeps them aligned
- All FR-022 components keep their existing public behaviors so the 003-era
  test suite continues to pass unmodified
- Sub-second / fixed-interval emission stays inside the existing physics-tick
  `setInterval` per Constitution Principle III — no new timer
**Scale/Scope**:
- ~5 new/refactored frontend components, ~2 new gateway lifecycle paths, ~1
  physics-tick subscriber (transition detector)
- Player-list panel sized for tens to low hundreds of concurrent ships (human +
  AI); batched transitions keep wire traffic O(transitions/tick)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Fidelity** | ✅ Pass | Symbol mapping, 30×15 grid, sector-coord convention all derived from `GEMAIN.H` (`MAXX=30`, `MAXY=15`) and the existing `SCAN_GRID_*` constants in `contracts.ts`. Text command input remains the primary interface — no click-to-fire UI. |
| **II. Testing first-class** | ✅ Pass | All new components/hooks ship with Vitest tests (FR-023). Gateway lifecycle hooks and physics-tick transition detection ship with Jest unit tests; idempotency and last-write-wins paths get explicit tests. |
| **III. Architecture** | ✅ Pass | No Redis, no new state layer. Player list lives client-side in React state, hydrated from `player.snapshot`. Backend emission piggy-backs on existing `setInterval`-driven physics tick — no `@Interval` decorators introduced. Calendar scheduling unchanged. |
| **IV. Quality** | ✅ Pass | TypeScript strict mode preserved. New service methods get JSDoc with C-source references where applicable (e.g. cell projection cites `GECMDS.C:2681`). No Prisma changes therefore no migrations. CI must remain green. |

No violations. Complexity Tracking section below remains empty.

## Project Structure

### Documentation (this feature)

```text
specs/010-react-frontend/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (client-side entities + wire payloads)
├── quickstart.md        # Phase 1 output (how to run + verify)
├── contracts/
│   ├── requirements.md  # Pre-existing
│   └── websocket-events.md   # Phase 1 — adds player.snapshot/joined/left + physics.sector-transition
└── tasks.md             # Phase 2 (created by /speckit-tasks)
```

### Source Code (repository root)

```text
backend/
└── src/
    ├── gateway/
    │   ├── game.gateway.ts            ← extend handleConnection / handleDisconnect (FR-024..FR-025a, FR-029)
    │   └── connected-ships.registry.ts (NEW) — in-memory shipId → socketId map (single-socket invariant)
    ├── game/
    │   └── tick/
    │       └── sector-transition.subscriber.ts (NEW) — physics-tick observer that diffs prev→cur integer cells across all ships and emits batched event (FR-026)
    └── test/
        ├── gateway/
        │   ├── player-snapshot.spec.ts (NEW)
        │   ├── player-join-leave.spec.ts (NEW)
        │   └── single-socket-per-ship.spec.ts (NEW)
        └── game/tick/
            └── sector-transition.spec.ts (NEW)

frontend/
├── src/
│   ├── App.tsx                         ← restructure layout regions (FR-002)
│   ├── socket/
│   │   ├── socketClient.ts             ← reconnect backoff already present, extend if needed (FR-019..FR-021)
│   │   └── useSocket.ts                ← new typed event subscriptions
│   ├── components/
│   │   ├── CommandInput.tsx            ← add 20-entry history (FR-004, FR-005)
│   │   ├── EventLog.tsx                ← buffer cap 500, sticky-bottom auto-scroll, unknown-category fallback (FR-008..FR-011)
│   │   ├── ScanMap.tsx                 ← add sector-transition clear (FR-013, FR-015 priority)
│   │   ├── ConnectionBanner.tsx        (NEW, replaces/wraps ConnectionIndicator) — visible only when not connected (FR-019)
│   │   └── PlayerListPanel.tsx         (NEW) — alphabetical, incremental, hydrated from snapshot (FR-016..FR-018, FR-017a)
│   ├── state/
│   │   └── usePlayerList.ts            (NEW) — reducer hook fed by snapshot + joined/left + sector-transition
│   └── types/
│       └── contracts.ts                ← add PlayerSnapshot, PlayerJoined, PlayerLeft, SectorTransition payloads (FR-027)
└── test/
    ├── App.spec.tsx                    ← unchanged FR-022 baseline
    ├── CommandInput.spec.tsx           ← extend with history-recall tests
    ├── EventLog.spec.tsx               ← extend with buffer-cap + sticky-scroll tests
    ├── ScanMap.spec.tsx                ← extend with transition-clear test
    ├── ConnectionIndicator.spec.tsx    ← unchanged (legacy public behavior)
    ├── ConnectionBanner.spec.tsx       (NEW)
    ├── PlayerListPanel.spec.tsx        (NEW)
    ├── usePlayerList.spec.ts           (NEW)
    ├── socketClient.spec.ts            ← extend with backoff cap test
    └── contracts-parity.spec.ts        ← extended automatically when new types added
```

**Structure Decision**: Web-app structure (existing `frontend/` + `backend/`).
The feature touches both packages but introduces no new top-level directories
and no new runtime services beyond a small in-memory `ConnectedShipsRegistry`
on the backend and a small `usePlayerList` reducer on the frontend.

## Complexity Tracking

> No constitutional violations to justify. Section intentionally empty.
