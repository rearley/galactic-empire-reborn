<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0 (MINOR — refined scheduling clause in Principle III)

Principles modified:
  - III. Architecture — Scheduling bullet split into two rules:
      • @nestjs/schedule reserved for calendar-cadence jobs (@Cron)
      • Sub-second / fixed-interval game ticks MUST use raw setInterval managed
        in OnModuleInit / OnModuleDestroy
    Rationale: @Interval decorators are not compatible with Jest fake timers,
    blocking Principle II (testable tick cadence); raw setInterval gives explicit
    drift control (each firing on its own schedule, not chained off prior work);
    single-process deployment makes this safe without distributed locking.

Principles unchanged: I, II, IV
Sections unchanged: Technology Stack, Development Workflow, Governance

Bump rationale: MINOR — material refinement of an existing rule with new mandated
mechanism + rationale. Not MAJOR because the spirit of Principle III (mandated
cadence and reliability) is preserved and no prior compliant code is invalidated
(no @Interval-based code exists in the repo). Not PATCH because the mechanism
itself changed, not just wording.

Templates reviewed (no changes required):
  ✅ .specify/templates/plan-template.md — Constitution Check section is generic
  ✅ .specify/templates/spec-template.md — no scheduling references
  ✅ .specify/templates/tasks-template.md — no scheduling references
  ✅ .specify/templates/commands/*.md — no scheduling references
  ✅ CLAUDE.md — already describes raw setInterval; consistent with amendment
  ✅ README.md — n/a (no scheduling-specific content)

Follow-ups for feature 002 (002-tick-engine), to be applied via /speckit-tasks
or manual edits — outside the scope of this constitution change:
  - tasks.md T015: add bogus-DB-URL fail-fast test (closes /speckit-analyze G3)
  - tasks.md T016: add boot-time (<5s) and shutdown-latency (<3s) assertions
    (closes /speckit-analyze G1, G2)
  - tasks.md T024: add slow-handler and async-handler cases (closes G4, A1)

Deferred TODOs: none
-->

# Galactic Empire Reborn Constitution

## Core Principles

### I. Fidelity

All game mechanics, physics, and balance constants MUST be verified against the original C source
in `/reference/ge-source/` before implementation. The files in that directory are read-only
reference material and MUST never be modified.

Constants defined in `GEMAIN.H` are canonical. Any deviation MUST be documented with an explicit
rationale in the relevant spec or PR description — silence implies faithful reproduction.

Text command input is the primary interface. Players type commands (`pha 75`, `rot 180`,
`warp 9`). Buttons and click-driven UI MUST NOT replace the command input paradigm.

The 6-second physics tick (`TICKTIME=6`) and 1-second ship update tick (`TICKTIME2=1`) are
non-negotiable. The world runs continuously — it does not pause when no player is watching.

### II. Testing is First Class

No feature is complete without tests. Tests MUST be written before or alongside implementation —
never after.

- **Unit tests**: All game logic MUST have unit tests — physics, combat math, AI behavior,
  midnight job computations.
- **Integration tests**: WebSocket events and tick engine behavior MUST have integration tests.
- **E2E tests**: Critical player flows MUST have E2E tests — login, command input, combat,
  planet interaction.
- **Balance regression tests**: Every constant from `GEMAIN.H` MUST have a regression test.
  If a constant changes, a test MUST break and the change MUST be deliberate.
- **AI isolation tests**: Cybertron and Droid AI behavior MUST be testable in isolation,
  without a running game world or live WebSocket connection.
- **Idempotency tests**: The midnight job MUST be tested for idempotency — running it twice
  MUST produce the same result as running it once.

Backend tests use Jest. Frontend tests use Vitest.

### III. Architecture

The following architectural decisions are fixed and MUST NOT be changed without explicit
documented discussion:

- **Backend**: NestJS + TypeScript; **Frontend**: React + Vite + TypeScript
- **Database**: PostgreSQL 16+ via Prisma ORM — the single source of durable truth
- **In-memory state**: Active ship state lives in a NestJS singleton `Map<shipId, ShipState>`.
  This Map is the authoritative source during gameplay; Postgres is flushed to asynchronously,
  not on every tick.
- **No Redis**: There is no external cache layer. The NestJS service Map is the state layer.
- **Real-time**: Socket.io via `@nestjs/platform-socket.io`. Players join a Socket.io room
  for their current sector; the physics tick broadcasts sector-scoped events to rooms only;
  global events broadcast to all.
- **Scheduling**: Two distinct mechanisms by cadence kind, both non-negotiable:
  - **Calendar-cadence jobs MUST use `@nestjs/schedule`** with `@Cron`. The
    nightly maintenance routine is `@Cron('0 0 * * *')`. Any future scheduled
    job whose firing time is expressed as a wall-clock cron expression (daily,
    hourly on the hour, weekly, etc.) MUST use `@nestjs/schedule`.
  - **Sub-second and fixed-interval game-loop ticks MUST use raw `setInterval`**
    started in a service's `OnModuleInit` and cleared in `OnModuleDestroy`.
    Specifically, the 6-second physics tick (`TICKTIME=6`) and the 1-second
    ship-update tick (`TICKTIME2=1`) MUST be implemented this way. `@Interval`
    decorators MUST NOT be used for these ticks. Rationale:
    1. `@Interval` decorators are not compatible with Jest fake timers,
       blocking unit testing of tick cadence — that violates Principle II.
    2. `setInterval` schedules each next firing relative to the prior firing's
       start time, not the prior callback's completion. This gives explicit
       no-drift behavior; chained `setTimeout` recursion would drift under load.
    3. Single-process deployment (one container per backend node) makes raw
       `setInterval` safe today without distributed-lock infrastructure. If
       deployment ever moves to multi-node, the tick engine MUST be put behind
       a leader-election mechanism (e.g., Postgres advisory lock) before that
       topology ships — this is a known constraint, recorded in
       `docs/DECISIONS.md`.
- **Spec-Driven Development**: All features MUST follow the spec-kit workflow:
  `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
  Specs live in `/specs/`, one folder per feature branch.

### IV. Quality

- TypeScript strict mode is enforced across the entire codebase. `any` types and implicit
  type annotations are forbidden.
- All public service methods MUST have a JSDoc comment referencing the original C source
  function or constant they implement (e.g., `@see GEFUNCS.C:calcPhaDamage`).
- Prisma migrations are immutable after creation. A migration file MUST never be edited —
  corrections MUST be expressed as new migrations.
- Docker Compose MUST work for both development and production environments without
  manual intervention.
- No feature ships without passing CI. A green build is a hard gate, not a best-effort target.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | NestJS + TypeScript |
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Database | PostgreSQL 16+ |
| ORM | Prisma |
| Real-time | Socket.io (`@nestjs/platform-socket.io`) |
| Calendar scheduling | `@nestjs/schedule` (`@Cron` only — see Principle III) |
| Game-loop ticks | Raw `setInterval` in `OnModuleInit`/`OnModuleDestroy` |
| Backend tests | Jest |
| Frontend tests | Vitest |
| Deployment | Docker + Docker Compose (Hetzner CPX32) |

Galaxy dimensions: 30×15 sector grid (`MAXX=30`, `MAXY=15`). Ships use floating-point x/y
coordinates. The galaxy is procedurally generated on first boot — not converted from original
Btrieve `.DAT` files.

## Development Workflow

Features are developed in the following sequence using spec-kit:

1. `/speckit-specify` — define the feature (what + why)
2. `/speckit-plan` — technical implementation plan with research
3. `/speckit-tasks` — break into dependency-ordered, independently testable tasks
4. `/speckit-implement` — execute with review checkpoints

Planned feature sequence (branch name → scope):

| # | Branch | Scope |
|---|--------|-------|
| 001 | `prisma-schema` | DB schema from GEMAIN.H structs |
| 002 | `tick-engine` | NestJS game loop + GameGateway skeleton |
| 003 | `ship-commands` | CommandService + basic commands |
| 004 | `galaxy-generator` | Procedural 30×15 galaxy + sector types |
| 005 | `planet-system` | Planet mechanics, orbit, buy/sell, colonization |
| 006 | `combat` | Phasors, torpedoes, missiles, mines |
| 007 | `cybertron-ai` | Persistent Cybertron AI behavior |
| 008 | `droid-ai` | Ephemeral Droid + Murdonian Transport |
| 009 | `midnight-job` | Scoring, production reports, mail purge |
| 010 | `react-frontend` | Terminal UI, ASCII map, command input, event log |

All implementation tasks MUST include tests. The task list MUST NOT treat tests as optional.

## Governance

This constitution is the highest-level authority for all development decisions on
Galactic Empire Reborn. It supersedes README instructions, informal conventions, and
AI assistant defaults wherever they conflict.

**Amendment procedure**: Any change to a Core Principle requires:
1. A documented rationale explaining why the current principle is insufficient.
2. An assessment of impact on existing code and specs.
3. A migration plan for any dependent artifacts.
4. A version bump following semantic versioning rules (see below).

**Versioning policy**:
- **MAJOR**: Backward-incompatible principle removal or redefinition.
- **MINOR**: New principle or section added; material expansion of existing guidance.
- **PATCH**: Clarification, wording refinement, typo fix, non-semantic change.

**Compliance review**: Every PR description MUST include a Constitution Check confirming
which principles apply and how the change satisfies them. The plan template Constitution
Check gate enforces this.

**Runtime guidance**: See `CLAUDE.md` at the repository root for agent-specific development
instructions. The constitution governs intent; `CLAUDE.md` governs execution.

---

**Version**: 1.1.0 | **Ratified**: 2026-04-30 | **Last Amended**: 2026-05-01
