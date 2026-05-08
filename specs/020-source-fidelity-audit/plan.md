# Implementation Plan: Source Fidelity Audit

**Branch**: `020-source-fidelity-audit` | **Date**: 2026-05-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-source-fidelity-audit/spec.md`

## Summary

Run a focused audit pass that compares the TypeScript implementation against
the canonical C source in `/reference/ge-source/` for eight known suspect
areas (combat damage roll, Interceptor preload bonus, wormhole visibility
flag, `scan lo full` output ordering, beacon-on-move emission, `set` command
coverage of `User.options[]`, GEMAIN.H balance constant pinning, and runnable
manual smoke tests). Each finding is triaged HIGH/MEDIUM/LOW; HIGH and
MEDIUM findings are fixed in this same feature with paired regression tests,
LOW findings are documented and deferred to a follow-up. The diff is
strictly fidelity fixes, tests, and audit notes — no new commands, mechanics,
or UI.

Approach:
1. Read the relevant C source for each gap, write a one-line finding into
   `docs/020-audit-findings.md` with severity and disposition.
2. For HIGH/MEDIUM findings, write the failing regression test first
   (golden-vector for `randamage`, snapshot for `scan lo full`, integration
   test for beacon socket emission, unit test for Interceptor preload, etc.),
   then make it pass.
3. For the GEMAIN.H pin enumeration, add a single enumeration test that
   asserts the TS-side pinned constant set equals the parsed GEMAIN.H
   gameplay-constant set; missing pins fail the build.
4. Move T053, T043, T077 manual checks into `*.manual.spec.ts` files and
   wire `npm run test:manual` in `backend/package.json`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node 20.x
**Primary Dependencies**: NestJS 10, Socket.io (`@nestjs/platform-socket.io`),
Prisma (no schema changes expected)
**Storage**: PostgreSQL 16 (no migrations expected; if a HIGH finding forces
one, follow Principle IV and ship a new migration)
**Testing**: Jest (backend) — adds a `*.manual.spec.ts` glob excluded from
the default project config; new `npm run test:manual` script. Vitest
(frontend) untouched unless a wormhole-render snapshot is on the frontend.
**Target Platform**: Linux server (Docker) — no platform-specific work
**Project Type**: Web service backend with React/Vite frontend (existing)
**Performance Goals**: No new performance budget; no regression on tick
latency (existing benchmarks remain green)
**Constraints**: No new commands, no new mechanics, no new UI features
(FR-012 / SC-007). Schema changes only if a HIGH finding strictly requires
one. Net new test count tracked in PROGRESS.md.
**Scale/Scope**: Eight named gaps + up to two additional HIGH/MEDIUM gaps
surfaced during audit; all further findings recorded and deferred.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies | Compliance |
|---|---|---|
| I. Fidelity | YES — entire feature | Each fix is paired with a `@see GEFUNCS.C:<fn>` / `@see GEMAIN.H:<const>` reference and a test that pins the behavior to the C source. Constants stay byte-identical to GEMAIN.H. |
| II. Testing First-Class | YES | Every HIGH/MEDIUM fix is preceded by a failing test (golden vector / snapshot / integration). The GEMAIN.H pin enumeration test enforces coverage going forward. |
| III. Architecture | NEUTRAL | No tick-engine, scheduling, Redis, or cache changes. Beacon emission uses the existing `GameGateway` Socket.io rooms — no new infrastructure. |
| IV. Quality | YES | New tests must pass strict TS. Any migration (only if forced) is a new immutable file. CI must be green to merge. |

**Result**: PASS — no violations. Complexity Tracking section left empty.

## Project Structure

### Documentation (this feature)

```text
specs/020-source-fidelity-audit/
├── plan.md              # This file
├── spec.md              # Feature spec (already authored)
├── research.md          # Phase 0 — per-gap C-source findings
├── data-model.md        # Phase 1 — Audit Finding + Balance Constant Pin
├── quickstart.md        # Phase 1 — how to run the audit + test:manual
├── contracts/
│   └── beacon-event.md  # Phase 1 — beacon socket event payload contract
└── tasks.md             # Phase 2 — produced by /speckit-tasks
```

Plus repo-level audit log (created during /speckit-implement):

```text
docs/020-audit-findings.md   # one entry per finding, severity + disposition
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── game/
│   │   ├── combat/
│   │   │   ├── combat-math.ts          # randamage rewrite + golden-vector
│   │   │   └── combat-tick.service.ts  # checkdam preload bonus (Interceptor)
│   │   ├── commands/
│   │   │   └── handlers/
│   │   │       ├── scan.handler.ts     # scan lo full ordering fix
│   │   │       └── set.handler.ts      # complete User.options[] coverage
│   │   ├── galaxy/
│   │   │   └── galaxy.types.ts         # GALWORM.visible surfaced in state
│   │   └── ship/
│   │       └── ship-state.types.ts     # wormhole-visibility-aware scan source
│   └── gateway/
│       └── game.gateway.ts             # beacon socket event on move
└── tests/
    ├── fixtures/
    │   └── randamage.golden.json       # checked-in C-derived expected values
    ├── unit/                           # combat-math, set-options, gemain-pins
    ├── integration/                    # beacon emission, scan ordering
    └── manual/                         # *.manual.spec.ts (T053, T043, T077)

frontend/
└── (no expected changes — wormhole rendering driven by existing scan output)
```

**Structure Decision**: Existing NestJS backend layout (Option 2 — Web
application). All changes localized to existing modules; no new modules.
Audit log lives at `docs/020-audit-findings.md` per FR-009.

## Complexity Tracking

> No constitutional violations. Section intentionally empty.
