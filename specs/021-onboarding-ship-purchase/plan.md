# Implementation Plan: Faithful Onboarding & Ship Purchase

**Branch**: `021-onboarding-ship-purchase` | **Date**: 2026-05-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/021-onboarding-ship-purchase/spec.md`

## Summary

Restore the original game's onboarding progression: new players always receive a class 1 Interceptor
with 5,000 credits and 3 flux pods — no class picker. Add the `new ship <N>` in-game command that
lets players purchase ship upgrades at Zygor-3 (neutral zone sector 0,0) after earning enough credits.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode)
**Primary Dependencies**: NestJS, Prisma ORM, React + Vite, Socket.io
**Storage**: PostgreSQL 16 via Prisma — `User.cash (BigInt)`, `Ship.items (BigInt[])`. No schema changes needed.
**Testing**: Jest (backend), Vitest (frontend)
**Target Platform**: Linux server (NestJS) + browser (React)
**Project Type**: Web application (backend + frontend)
**Performance Goals**: Command response < 100ms; onboarding round-trip < 200ms
**Constraints**: `User.cash` lives in the DB (not in ShipState); must update via Prisma on purchase.
  Item array is 14 elements (NUMITEMS=14); flux pods are at I_FLUX=4.
**Scale/Scope**: Single-user path (onboarding) + in-game command handler

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Status |
|-----------|----------|--------|
| I — Fidelity | Yes — restores original `initshp` behavior and `cmd_new` | PASS: logic verified against GEFUNCS.C:initshp and GECMDS.C:cmd_new |
| II — Testing is First Class | Yes — onboarding changes and new command require unit + integration tests | PASS: balance regression tests for START_CASH and START_FLUX_PODS mandated |
| III — Architecture | Yes — new handler follows existing NestJS provider pattern; onboarding stays at gateway layer per FR-013 | PASS: no architecture deviations |
| IV — Quality | Yes — strict TypeScript, JSDoc referencing C source | PASS: all new code must cite GEFUNCS.C/GECMDS.C |

## Project Structure

### Documentation (this feature)

```text
specs/021-onboarding-ship-purchase/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── new-ship-command.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── game/
│   │   ├── constants/
│   │   │   └── onboarding.ts            [NEW] START_CASH, START_FLUX_PODS constants
│   │   ├── onboarding/
│   │   │   └── onboarding.service.ts    [MODIFY] remove class picker, add cash+items init, extract createShip()
│   │   └── commands/
│   │       ├── handlers/
│   │       │   └── new-ship.handler.ts  [NEW] `new ship <N>` command handler
│   │       └── commands.module.ts       [MODIFY] register NewShipHandlerService
│   └── gateway/
│       └── game.gateway.ts              [MODIFY] remove AWAITING_CLASS step; go direct to AWAITING_NAME
└── test/
    ├── balance/
    │   └── start-constants.spec.ts      [NEW] regression test for START_CASH + START_FLUX_PODS
    ├── unit/
    │   └── new-ship.handler.spec.ts     [NEW] unit tests for all 6 rejection paths + success
    └── integration/
        └── onboarding-init.spec.ts      [NEW] integration test: finalize() creates class 1 + cash + flux

frontend/
└── src/
    ├── App.tsx                          [MODIFY] remove class-list branch + ClassPickerPrompt render
    ├── onboarding/
    │   └── ClassPickerPrompt.tsx        [DELETE] no longer used
    └── socket/
        └── useSocket.ts                 [MODIFY] remove prompt:class-list listener; narrow OnboardingPrompt type
```

**Structure Decision**: Web application (backend NestJS + frontend React). All changes are
surgical — no new modules, no new Prisma models, no new DB migrations.

## Complexity Tracking

No constitution violations. All changes fit within existing patterns.
