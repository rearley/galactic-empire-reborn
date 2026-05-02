# Galactic Empire Reborn — Claude Code Instructions

## Project Overview

Faithful web port of the classic MajorBBS game Galactic Empire (1988-1992)
by Mike Murdock. Original source reference is in `/reference/ge-source/`.

The goal is to preserve the authentic feel of the original — text command
input, real-time multiplayer, scrolling event log, ASCII sector map — while
running as a modern 24/7 persistent web game.

## Tech Stack

- **Backend**: NestJS + TypeScript + Prisma ORM
- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Database**: PostgreSQL 16+
- **Real-time**: Socket.io via @nestjs/platform-socket.io
- **Scheduling**: @nestjs/schedule (@Interval for ticks, @Cron for midnight)
- **Testing**: Jest (backend), Vitest (frontend)
- **Deployment**: Docker + Docker Compose (Hetzner CPX32)
- **Dev methodology**: Spec-Driven Development via spec-kit (github/spec-kit)

## Repository Structure

```
galactic-empire-reborn/
  reference/
    ge-source/      ← Original C source. READ ONLY. Never modify.
  backend/          ← NestJS application
  frontend/         ← React/Vite application
  docs/             ← Living architecture documentation (always keep current)
  specs/            ← spec-kit feature specs
  docker-compose.yml
  CLAUDE.md         ← This file
  README.md
```

## Architecture Decisions (do not change without discussion)

### State Management

Active ship state is held in a NestJS service singleton (`Map<shipId, ShipState>`).
This in-memory state is the source of truth during gameplay.
Postgres is the durable store — flushed async, not on every tick.
**No Redis. No external cache layer.**

### Tick Engine

- **Physics tick**: 6 seconds (`@Interval(6000)`) — moves ships, processes
  combat, updates mines, decoys, torpedoes, missiles
- **Ship update tick**: 1 second (`@Interval(1000)`) — energy regen, shield
  updates, repair progress, minor state changes
- **Midnight job**: `@Cron('0 0 * * *')` — recalculate scores, send planet
  production reports to players, purge mail older than 7 days, rebuild team
  scores. Must be idempotent and wrapped in a Postgres transaction.

### Galaxy

- 30x15 sector grid (`MAXX=30`, `MAXY=15` from `GEMAIN.H`)
- Ships use floating-point x/y coordinates within the universe (`COORD` struct)
- Procedurally generated on first boot — not converted from original Btrieve `.DAT` files
- Must include: neutral zone at origin, wormholes, varied sector types, planet placement

### AI Ships

Two types — both driven entirely by the server tick, no client involvement:

- **Cybertrons**: Persistent (saved to DB between sessions). Escalating
  difficulty based on player kill count (`CYB_BE_NICE=30`, `CYB_BE_EASY=60`
  from `GEMAIN.H`). Have skill variance (`cybskill`), accumulate gold, respect
  neutral zone. See `GECYBS.C` for full behavior logic.
- **Droids**: Ephemeral (not persisted, respawn fresh). Simpler behavior.
  Includes the **Murdonian Transport** (class 11) — a heavily armed freighter
  that serves as a PvE target for new players. See `GEDROIDS.C`.

### WebSocket / Real-time

- One `GameGateway` using Socket.io
- Players join a Socket.io room for their current sector on entry
- Players leave sector room and join new one on warp/move
- Physics tick broadcasts sector-scoped events to relevant rooms only
- Global events (kills, major announcements) broadcast to all

### NestJS Module Structure

```
backend/src/
  game/
    tick/           ← TickService — drives the 1s and 6s game loops
    ship/           ← ShipService — in-memory state Map + async DB flush
    planet/         ← PlanetService
    combat/         ← CombatService (phasors, torps, missiles, mines)
    galaxy/         ← GalaxyService + procedural generator
    commands/       ← CommandService — routes player text input to handlers
    ai/
      cybertron/    ← CybertronService
      droid/        ← DroidService
    midnight/       ← MidnightService — nightly maintenance cron
  gateway/          ← GameGateway (WebSocket, Socket.io)
  auth/             ← Player authentication
  prisma/           ← PrismaService
```

## Reference Source

All game logic, constants, and data structures **must be verified against
the original C source** in `/reference/ge-source/` before implementation.

| File | Contents |
|------|----------|
| `GEMAIN.H` | All data structures and game balance constants |
| `GECMDS.C` | Complete command table and all command implementations |
| `GEFUNCS.C` | Physics, combat math, helper functions |
| `GEMAIN.C` | Main loop, tick engine, midnight routine |
| `GECYBS.C` | Cybertron AI behavior |
| `GEDROIDS.C` | Droid AI behavior (incl. Murdonian Transport) |
| `GEPLANET.C` | Planet mechanics |
| `GEGLOBAL.H` | Global variable declarations |
| `reference/wiki/` | Human-readable game mechanics from the GE wiki — use alongside C source |

**Preserve balance constants from `GEMAIN.H` exactly** unless there is a
documented reason to deviate. Key constants include:

```c
#define TICKTIME     6      // Physics tick seconds
#define TICKTIME2    1      // Ship update tick seconds
#define ROTENGUSE   30      // Energy used to rotate
#define ROTAMT      20      // Degrees rotation per tick
#define ACCENGAMT  120      // Acceleration energy usage
#define PRELOAD     10      // Phasor reload rate per tick
#define MAXX        30      // Galaxy width (sectors)
#define MAXY        15      // Galaxy height (sectors)
#define MAXTORPS     3      // Max locked torpedoes
#define MAXMISSL     3      // Max locked missiles
#define CYB_BE_NICE 30      // Kills before Cybertrons get tough
#define CYB_BE_EASY 60      // Kills before Cybertrons get really mean
```

## Testing Standards (first-class requirement)

Testing is not optional. No feature is complete without tests.

- **Write tests before or alongside implementation** — never after
- **Unit tests** for all game logic: physics, combat math, command parsing,
  AI behavior, scoring, midnight job
- **Integration tests** for WebSocket events, tick engine behavior, DB flush
- **E2E tests** for critical player flows: login, command input, combat,
  planet interaction
- **Balance regression tests** — every constant in `GEMAIN.H` that affects
  gameplay must have a test that fails if the constant changes
- **AI behavior tests** must run in isolation without a live game world
- **Midnight job** must be tested for idempotency — running it twice must
  produce identical results
- **Tick engine** must be testable with a fake clock — no real timers in tests

## Code Quality

- TypeScript strict mode — no `any`, no implicit types
- All public service methods must have JSDoc that references the original C
  source function where applicable (e.g. `@see GEFUNCS.C:cdistance`)
- **Prisma migrations are source-controlled artifacts — never add `prisma/migrations/`
  to `.gitignore`.** They must be committed alongside the schema change that produced
  them. `prisma migrate deploy` in CI/production depends on this history existing.
- Prisma migrations are never edited after creation — always add new ones
- **Never use `prisma db push` or apply schema changes directly to the DB without
  creating a migration file first.** Always use `prisma migrate dev --name <name>`
  so the change is captured as a versioned migration.
- Docker Compose must work for both development and production
- No feature ships without passing CI

## Spec-Driven Development

This project uses **spec-kit** for all feature development.

Before implementing any feature in Claude Code:

```
/speckit-constitution   ← run once at project start
/speckit-specify        ← define the feature (what + why)
/speckit-plan           ← technical implementation plan
/speckit-tasks          ← generate actionable tasks
/speckit-implement      ← execute
```

Optional enhancement skills (use where valuable):
```
/speckit-clarify        ← de-risk ambiguous areas before planning
/speckit-analyze        ← cross-artifact consistency check before implement
/speckit-checklist      ← validate requirements completeness after plan
```

Specs live in `/specs/` at the repo root, one folder per feature branch.

**Planned feature sequence:**
1. `001-prisma-schema` — DB schema from GEMAIN.H structs
2. `002-tick-engine` — NestJS game loop + GameGateway skeleton
3. `003-ship-commands` — CommandService + basic commands (scan, report, rotate, impulse, warp)
4. `004-galaxy-generator` — Procedural 30x15 galaxy + sector types
5. `005-planet-system` — Planet mechanics, orbit, buy/sell, colonization
6. `006-combat` — Phasors first, then torpedoes, missiles, mines
7. `007-cybertron-ai` — Persistent Cybertron behavior
8. `008-droid-ai` — Ephemeral Droid + Murdonian Transport
9. `009-midnight-job` — Scoring, production reports, mail purge
10. `010-react-frontend` — Terminal UI, ASCII map, command input, event log

## Living Documentation (always keep current)

These files in `docs/` are the handoff point between Claude Code sessions
and the Claude Project used for planning. **Update them at the end of every
implement session — do not skip this step.**

| File | Purpose | Update when |
|------|---------|-------------|
| `docs/ARCHITECTURE.md` | Module map, responsibilities, data flow | Any structural change |
| `docs/DECISIONS.md` | Why things are the way they are | Any architecture decision |
| `docs/PROGRESS.md` | What's built, what's next, known issues | Every completed feature |
| `docs/DATA_MODEL.md` | Entities, fields, relationships in plain English | Schema changes |
| `docs/GAME_MECHANICS.md` | Implemented mechanics with C source references | Each mechanic lands |

### docs/ARCHITECTURE.md format

Plain text module map. Keep it current — no diagrams needed. Example:

```
GameGateway (gateway/)
  └── receives player commands via Socket.io
  └── routes to CommandService
  └── broadcasts tick events to sector rooms

TickService (game/tick/)
  └── drives 1s ship update tick
  └── drives 6s physics tick
  └── calls ShipService, CombatService, CybertronService, DroidService

ShipService (game/ship/)
  └── owns in-memory Map<shipId, ShipState>
  └── flushes to Postgres async every 30s or on significant state change
  └── source of truth for all active ship state
```

### docs/DECISIONS.md format

```
## [date] — Decision title
**Context:** why this came up
**Decision:** what was decided
**Reason:** why
**Alternatives rejected:** what else was considered and why not
```

### docs/PROGRESS.md format

```
## [date] — feature name
**Completed:** what was built
**Tests:** what is covered and at what level
**Decisions made:** any deviations from plan
**Next:** what comes next
**Known issues:** anything deferred
```

## Fidelity Goals

- Text command input is **primary** — players type `pha 75`, `rot 180`, `warp 9`
- Scrolling real-time event log visible to all players in the same sector
- ASCII/ANSI sector scan map rendered in monospace font
- Ships move continuously — the world does not pause when no one is watching
- Cybertron behavior faithfully escalates with player kill count
- Game balance constants from `GEMAIN.H` preserved exactly

## What This Is Not

- Not a graphical remake — ASCII/text aesthetic is intentional
- Not mobile-first — desktop terminal feel is the target
- Not turn-based — the 6-second physics tick is non-negotiable
- Not single-player — the persistent 24/7 world is core to the experience
- Not a Redis project — in-memory NestJS service is the state layer

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
specs/004-galaxy-generator/plan.md
<!-- SPECKIT END -->