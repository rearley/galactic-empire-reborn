# Implementation Plan: Player Onboarding — auth, cmd_new, cmd_rename

**Branch**: `011-onboarding` | **Date**: 2026-05-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-onboarding/spec.md`

## Summary

Replace the hardcoded `LOCAL_USERID = 'DEV'` development handshake with real
identity. Add HTTP-based username/password auth (`POST /auth/register`,
`POST /auth/login`) returning a JWT, presented at Socket.io handshake.
Drive a server-side multi-step prompt flow (`prompt:class-list` →
`prompt:ship-name`) for first-time players (`cmd_new`); allow bound players
to rename via `cmd_rename`. Returning players reconnect directly to their
existing ship. Latest-wins single-session semantics. Ship-name and username
uniqueness are case-insensitive (display casing preserved). All starting
loadout values trace to `ShipClass` rows or `GEMAIN.H` constants.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node 20 LTS
**Primary Dependencies**: NestJS 10 (backend), `@nestjs/jwt`, `@nestjs/passport`
+ `passport-jwt`, `bcrypt`, Prisma ORM, Socket.io (`@nestjs/platform-socket.io`),
React 18 + Vite + Tailwind (frontend), `socket.io-client`
**Storage**: PostgreSQL 16+ via Prisma. New columns on `User` (`username`,
`passwordHash`); new optional auth-only fields. Case-insensitive uniqueness
via unique index on `lower("username")` and `lower("shipname")`.
**Testing**: Jest (backend unit + integration), Vitest + React Testing Library
(frontend), Supertest (HTTP), socket.io-client (gateway integration)
**Target Platform**: Linux Docker container (Hetzner CPX32) for backend;
modern desktop browsers for frontend
**Project Type**: Web application (NestJS backend + React frontend)
**Performance Goals**: Onboarding < 60 s end-to-end (SC-001); rename
broadcast within one physics tick (≤ 6 s, SC-005); auth handshake adds
< 50 ms p95 over current connect path
**Constraints**: JWT secret loaded from env (never hardcoded); passwords
never logged or returned; bcrypt cost factor 12; JWT expiry 30 days; one
bound socket per user (latest-wins); no Redis; in-memory `ShipStateService`
remains source of truth during play.
**Scale/Scope**: Tens of concurrent players in development; single backend
process. Auth endpoints rate-limited at the gateway proxy (out of scope for
this feature, noted for ops follow-up).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Fidelity | PASS | `cmd_new` and `cmd_rename` semantics traced to `GECMDS.C:4534` and `GECMDS.C:5002`. The 1–19 printable-ASCII name rule comes from `cmd_rename`'s `strncpy(..., margv[1], 19)`. Onboarding extends the original semantics (BBS-style login replaces sysop user provisioning); deviation is documented in research.md R1. Spawn at neutral-zone origin matches `neutral(&coord)` semantics. |
| II. Testing First Class | PASS | Unit tests for username/password validators, bcrypt round-trip, JWT issue/verify, name validator, uniqueness collision logic. Integration tests for `POST /auth/register`, `POST /auth/login`, full Socket.io handshake (with and without JWT), `cmd_new` prompt sequence, `cmd_rename` broadcast. E2E covers register → connect → cmd_new → first command. Idempotency test for ship-class seed. |
| III. Architecture | PASS | NestJS modules only (`AuthModule`, `OnboardingModule`); Prisma migration; Socket.io rooms unchanged; no Redis; `ShipStateService` remains in-memory truth. Onboarding state per socket lives in `client.data` (no new singleton). No new scheduling — auth flow is request/response, not tick-driven. |
| IV. Quality | PASS | TS strict, Prisma migration committed, JSDoc references `GECMDS.C:4534` (cmd_new) and `GECMDS.C:5002` (cmd_rename) on the corresponding services. No `prisma db push`. No magic numbers — name length 19 cited from C source; bcrypt cost and JWT expiry from constants module. |

**Gates**: All PASS. No complexity-tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/011-onboarding/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── http-auth.md         # POST /auth/register, /auth/login
│   └── websocket-events.md  # handshake auth, prompt:class-list, prompt:ship-name, ship.renamed
└── tasks.md             # /speckit-tasks output (not produced here)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts        # POST /auth/register, /auth/login
│   │   ├── auth.service.ts           # bcrypt hash/verify, JWT issue
│   │   ├── jwt.strategy.ts           # passport-jwt verify
│   │   ├── ws-auth.guard.ts          # Socket.io handshake guard
│   │   └── dto/
│   │       ├── register.dto.ts
│   │       └── login.dto.ts
│   ├── game/
│   │   ├── onboarding/
│   │   │   ├── onboarding.module.ts
│   │   │   ├── onboarding.service.ts # drives prompt:class-list / prompt:ship-name
│   │   │   ├── name-validator.ts     # 1–19 printable-ASCII; case-insensitive uniqueness
│   │   │   └── rename.service.ts     # cmd_rename handler (or merged into commands/)
│   │   └── commands/                 # extended with `rename` command handler
│   ├── gateway/
│   │   └── game.gateway.ts           # MODIFIED: JWT-based handshake, no-ship branch
│   └── prisma/
│       └── schema.prisma             # MODIFIED: User.username, User.passwordHash
├── prisma/
│   ├── schema.prisma                 # case-insensitive unique indexes
│   ├── migrations/
│   │   └── <timestamp>_011_onboarding_auth/
│   └── seed/
│       └── ship-classes.ts           # idempotent (already exists; verify upsert behavior)
└── test/
    ├── unit/auth/                    # validators, bcrypt, JWT
    ├── integration/auth/             # HTTP contract tests
    ├── integration/onboarding/       # gateway prompt sequence + cmd_rename broadcast
    └── e2e/onboarding.e2e-spec.ts

frontend/
├── src/
│   ├── auth/
│   │   ├── AuthScreen.tsx            # login + register tabs
│   │   ├── authClient.ts             # fetch /auth/{register,login}
│   │   └── tokenStore.ts             # localStorage wrapper for JWT
│   ├── onboarding/
│   │   ├── ClassPickerPrompt.tsx     # renders prompt:class-list payload
│   │   └── ShipNamePrompt.tsx        # renders prompt:ship-name payload
│   ├── socket/
│   │   ├── socketClient.ts           # MODIFIED: JWT auth, no LOCAL_USERID
│   │   └── useSocket.ts              # MODIFIED: uses authenticated identity
│   └── App.tsx                       # MODIFIED: route auth → terminal
└── tests/
    ├── auth/                         # AuthScreen, tokenStore (Vitest)
    └── onboarding/                   # ClassPickerPrompt, ShipNamePrompt
```

**Structure Decision**: Web application (Option 2). New `auth/` module in
backend; new `game/onboarding/` module for the prompt flow; new top-level
`auth/` and `onboarding/` folders in `frontend/src/`. The existing
`gateway/game.gateway.ts` is modified to gate handshake on JWT and to
dispatch the no-ship branch into `OnboardingService`.

## Complexity Tracking

No constitution violations. Section intentionally empty.
