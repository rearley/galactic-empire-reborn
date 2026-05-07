# Implementation Plan: Scan Modes & Display Options

**Branch**: `015-scan-modes` | **Date**: 2026-05-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-scan-modes/spec.md`

## Summary

Extend the existing `ScanHandlerService` (delivered in 003/004) with three new scan modes — `sca ra <1-9>` (range / zoomable tactical), `sca se` (sector close-up with planet plotting), and `sca lo full` (long-range plot plus side-panel ship table) — and add two persisted per-player display options (`SCANNAMES`, `SCANHOME`) toggled via the existing `set` command. All scan output flows through a new `scan:render` socket event whose `mode: "overwrite" | "append"` field carries the SCANHOME preference forward to the React frontend; the existing `+`/`=` plot in `sca lo` is migrated to the shared scantab letters used by the new modes (deliberate deviation from the C source — see clarifications). A shared per-player scantab keeps letter assignments stable across consecutive scans within a session and is initialised lazily on first scan in flight, cleared on disconnect, death, or dock.

## Technical Context

**Language/Version**: TypeScript 5.x (Node 20+, NestJS 10), React 18 + Vite frontend
**Primary Dependencies**: NestJS, Prisma, Socket.io, Jest (backend), Vitest (frontend)
**Storage**: PostgreSQL 16 via Prisma — `User.options Int[]` (existing array field) holds the new flags
**Testing**: Jest unit + integration tests for backend; Vitest component tests for the React scan panel
**Target Platform**: Linux server (Docker, Hetzner CPX32) + modern desktop browser
**Project Type**: web — `backend/` (NestJS) + `frontend/` (React/Vite)
**Performance Goals**: Scan command response well under one physics tick (6s); a single `sca ra`/`sca se` invocation must compute the grid + scantab in <10 ms with 50 active ships
**Constraints**: Must reuse existing `ScanCell` payload shape and `ScanHandlerService` injection; must not break previously-passing 003/004 scan tests for `sca sh` and `sca pl`; `sca lo` plot characters change deliberately and existing fixtures will be updated alongside this feature

**ShipState option fields (resolved)**: `ShipState.scanNames: boolean` and `ShipState.scanHome: boolean` are **non-optional** in-memory cache fields, defaulting to `false` on hydration. They mirror — exactly — the canonical `User.options Int[]` storage:

| ShipState field | Mirrors `User.options` index | C constant | `GEMAIN.H` line |
|-----------------|------------------------------|------------|------------------|
| `scanNames`     | `User.options[0]`            | `SCANNAMES`| `GEMAIN.H:233`   |
| `scanHome`      | `User.options[1]`            | `SCANHOME` | `GEMAIN.H:234`   |

The cache is populated on login (`ShipStateService.hydrate()`), refreshed on every successful `set scannames|scanhome on|off`, and invalidated on disconnect alongside the rest of the in-memory `ShipState`. The DB-side `User.options[]` array remains the source of truth; the cached booleans exist only to keep the scan-handler hot path off the database.

**Event routing (resolved)**: A successful scan command emits **both** `command:result` and `scan:render` to the issuing socket. The two events carry strictly disjoint content:

| Event              | Carries                                                                                                                            |
|--------------------|------------------------------------------------------------------------------------------------------------------------------------|
| `command:result`   | One `info`-category line — the header text only (e.g. `"Range: 4500 — Sector 12,7"`). Goes to the EventLog so the player has a transcript. **No grid, no side panel, no cells.** |
| `scan:render`      | The full structured payload — `kind`, `mode`, `cells[]`, `header`, optional `sidePanel[]`. Goes to the dedicated `ScanPanel`.       |

On failure (not in flight, dead, etc.), only `command:result` is emitted, carrying a single `system`-category error line. `scan:render` is suppressed entirely. Frontend MUST treat absence of `scan:render` as "no update" — never as "clear panel". This routing is documented in `contracts/scan-render.md` and is non-negotiable.
**Scale/Scope**: 30×15 grid (`MAXX`/`MAXY`), up to 26 lettered ships per scantab (alphabet bound; original NOSCANTAB=15 — we extend to 26 to use the full alphabet, see research Decision 3), up to 9 zoom levels, 4 colour categories on `sca se`, 3 colour categories on `sca ra`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Fidelity** — ✅ The scan range formula (`scanrange / (10-x)^2`), grid dimensions (`MAXX=30`, `MAXY=15`), scantab letter-stickiness logic, and the 4/3 colour categories on `sca se`/`sca ra` are all driven by the C source (`GECMDS.C:2484-2726`, `GEMAIN.H:233-235`). Deliberate deviations are documented in research.md (D1: `sca lo` plot characters; D2: NOSCANTAB widened from 15→26; D3: `scan:render` socket event replaces ANSI HOMEY). Text-command paradigm is preserved (`sca ra 1`, `sca se`, `sca lo full`, `set scanhome on`). No tick-engine impact.
- **II. Testing is First Class** — ✅ Each new scan mode gets unit tests (projection, scantab, side panel formatting), integration tests (round-trip socket payloads via `command:result` / `scan:render`), and frontend Vitest tests (overwrite vs. append rendering). Persistence of `set scanhome on` across logout/login is an integration test (SC-005).
- **III. Architecture** — ✅ No new module — extends existing `ScanHandlerService` and `SetHandlerService` in `backend/src/game/commands/handlers/`. Player options reuse the existing `User.options Int[]` array (no schema change). No Redis. No new tick. Sector room broadcast model unchanged. Scheduling not touched.
- **IV. Quality** — ✅ TypeScript strict mode preserved. JSDoc on every public method references the C source line (`@see GECMDS.C:2484 scan_ra`, etc.). No new Prisma migration required (`User.options` already exists; index 0 = SCANNAMES, 1 = SCANHOME per `GEMAIN.H:233-234`).

**Result**: PASS. No violations to track.

## Project Structure

### Documentation (this feature)

```text
specs/015-scan-modes/
├── plan.md              # This file
├── research.md          # Phase 0 — design decisions
├── data-model.md        # Phase 1 — entities (scantab, options, render payload)
├── quickstart.md        # Phase 1 — manual smoke test recipe
├── contracts/
│   └── scan-render.md   # Phase 1 — `scan:render` socket event contract + scantab API
└── tasks.md             # Phase 2 (created by /speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── game/
│   │   ├── commands/
│   │   │   └── handlers/
│   │   │       ├── scan.handler.ts       ← extended: ra/se modes + lo letter migration + lo full side panel
│   │   │       ├── set.handler.ts        ← extended: scannames/scanhome options + `set ?` listing
│   │   │       └── helpers/
│   │   │           └── scantab.ts        ← NEW: per-player scantab — buildScantab(), letter sticky logic, lifecycle
│   │   ├── ship/
│   │   │   └── ship-state.types.ts       ← may add scanNames/scanHome cached flags (or read live from User.options)
│   │   └── commands/
│   │       └── command.types.ts          ← extended: ScanCell.colour ('self'|'human'|'ai'|'planet'), scanGrid → { cells, mode, header }
│   ├── gateway/
│   │   └── game.gateway.ts               ← emit `scan:render` event when CommandResult.scanGrid is present
│   └── prisma/
│       └── schema.prisma                 ← UNCHANGED — User.options already exists
└── tests/
    ├── unit/
    │   ├── scan-ra.spec.ts               ← projection at zoom 1..9, header range, colour channel
    │   ├── scan-se.spec.ts               ← sector bound, colour categories, planet plotting
    │   ├── scan-lo-full.spec.ts          ← side-panel rows, SCANNAMES on/off
    │   ├── scantab.spec.ts               ← letter stickiness, A..Z order by distance, lazy init, clear-on-disconnect
    │   └── set-scan-options.spec.ts      ← scannames/scanhome toggle, `set ?` listing, persistence
    └── integration/
        └── scan-render-event.spec.ts     ← gateway emits scan:render with mode field

frontend/
├── src/
│   ├── components/
│   │   └── ScanPanel.tsx                 ← NEW: dedicated scan panel listening on scan:render
│   └── hooks/
│       └── useScanRender.ts              ← NEW: subscribes to scan:render, applies overwrite/append mode
└── tests/
    └── ScanPanel.spec.tsx                ← Vitest: overwrite replaces content; append adds card
```

**Structure Decision**: Web project structure (`backend/` + `frontend/`) — already established by the repository. Feature 015 extends the existing scan-handler module, adds one helper file (`scantab.ts`), and introduces one new frontend component + hook for the dedicated scan panel. No new NestJS module, no schema migration.

## Phase 0 — Research

See `research.md` for the full set of design decisions resolved before Phase 1. Summary of decisions:

1. **D1 — `sca lo` plot characters change to scantab letters** (deviation from `+`/`=`, ratified in spec clarifications). Existing 003/004 `sca lo` fixtures must be updated in lock-step.
2. **D2 — NOSCANTAB widened from 15 → 26** to match the alphabet. The original cap was a 1980s memory constraint; widening it lets all 26 letters be used and matches the user-visible promise of "letters A..Z".
3. **D3 — SCANHOME implementation** uses a typed socket event (`scan:render` with `mode: "overwrite" | "append"`) rather than raw ANSI cursor-home bytes. The browser can't act on `ESC[H`, and shipping ANSI through a JSON channel is brittle.
4. **D4 — Player options storage** reuses the existing `User.options Int[]` array. Index 0 = SCANNAMES, 1 = SCANHOME (per `GEMAIN.H:233-234`). No schema change. Cached on `ShipState` for hot-path read in scan rendering; the cache is refreshed on `set` and on login.
5. **D5 — Scantab lifecycle** — initialise lazily on first scan in flight; clear on disconnect, ship destruction, dock-back-to-base. Clear by `userid+shipno`, not by raw `shipId` slot, to prevent letter-leak across ships.
6. **D6 — Colour-channel encoding** uses an enum string (`'self' | 'human' | 'ai' | 'planet'`) on each `ScanCell`, not the original `'1'|'2'` mapc digits. The frontend already drives colour from semantic types.
7. **D7 — `sca lo full` side-panel formatting** matches the original `scan_sh` layout (integer parsec distance, integer 0–359 bearing/heading, `showarp()` speed) — reuse the formatter shipped in 003 to keep fixtures stable.

## Phase 1 — Design & Contracts

**Outputs:**
- `data-model.md` — Scantab in-memory entity, `User.options` index map, `ScanRenderEvent` payload shape.
- `contracts/scan-render.md` — Socket event contract for `scan:render` and an internal API contract for `buildScantab(ship, allShips)`.
- `quickstart.md` — Manual smoke-test recipe to drive the three new modes end-to-end.
- Agent context update — CLAUDE.md plan reference updated to point at `specs/015-scan-modes/plan.md`.

### Constitution re-check (post-design)

- **I. Fidelity** — ✅ All deviations are explicit and tied to clarifications.
- **II. Testing** — ✅ Test files enumerated in Source-Code structure; each FR maps to at least one test.
- **III. Architecture** — ✅ No new modules, no Redis, no schema change, no tick.
- **IV. Quality** — ✅ JSDoc + `@see` on every public method; strict TS; no migration needed.

**Result**: PASS post-design.

## Complexity Tracking

> No constitution violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
