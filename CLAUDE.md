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

- **`MAXX=30` / `MAXY=15` are NOT the size of the galaxy.** They are the
  character dimensions of the ASCII scan map — `map[MAXY][MAXX]`, centred with
  `map[MAXY/2][MAXX/2] = '*'` (`GECMDS.C:2569`), with the scan's range divided
  across them as `xfactor = range/(MAXX-1.0)` (`GECMDS.C:2526-2527`). They are a
  viewport, and they never move.
- The galaxy is a square running `-UNIVMAX..+UNIVMAX` on both axes
  (`univmax = numopt(UNIVMAX,10,32767)`, `GEMAIN.C:474`). Canon's default is
  **300**; we deploy at **100** — a deliberate, documented deviation, see
  `docs/DECISIONS.md`.
- Anything expressed in sectors that must stay proportional to the world —
  scan projection above all — is therefore **coupled to `UNIVMAX`** and has to
  move with it. Reading `MAXX`/`MAXY` as the galaxy is a mistake this project
  has now made three times: it once capped every weapon gate at 7.5 sectors,
  and in round 6 it produced three false defect reports in a single session.
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
  Classes 31 (Lydorian Garbage Scow), 32 (Murdonian Transport) and 33 (Vakory
  Survey Drone). See `GEDROIDS.C`.

  **The starter target is the VAKORY DRONE (33) — not the Scow, and certainly
  not the Murdonian.** This file has now been wrong about this twice. It first
  called the Murdonian "a heavily armed freighter that serves as a PvE target
  for new players"; it was then corrected to the Scow, on arithmetic computed
  with `PFIRDST` 7 — a value taken from the stale `GE/MSG/` copy of the option
  database. The shipped value is 5, and the answer moves again.

  Phaser damage is divided by `1.0 + max_tons/TONFACT`, `TONFACT 15000`
  (GECMDS.C:962-969, GEMAIN.H:102), and shields absorb it whole
  (GECMDS.C:986-997 never touches `wptr->damage` in the SHIELDUP branch). What
  decides a fight is therefore whether one shot strips more shield than the
  target regenerates before your bank is hot again — `shieldchg` puts back
  `shieldtype*3` per tick (GEFUNCS.C:2510) while `preload` is
  `phasrtype * PRELOAD` (GEFUNCS.C:1031), so a Mark-1 fires every 36s and a
  Mark-2 every 18s.

  At point-blank range, focus 1, against a Mark-1 shield:

  | target | tons | stock Mark-1 | with a Mark-2 |
  |---|---|---|---|
  | Vakory Survey Drone (33) | 100 | strips 22 vs 18 regen — **wins** | — |
  | Lydorian Scow (31) | 10,000 | 12 vs 18 — **can never get through** | 19 vs 9 — wins |
  | Murdonian Transport (32) | 30,000 | 6 vs 18 — hopeless | wins on shields, still out-gunned 5:1 |

  So a *stock* Interceptor cannot beat a Scow at any range or cadence, and the
  Vakory is the only thing it can actually kill. One phaser upgrade (list
  10,000, ~6,666 after trade-in) opens the Scow up. `hel combat` says all of
  this in-world, without the table.

  Recompute this section from the code if `PFIRDST`, `PRELOAD`, `TONFACT` or the
  shield constants ever move — it has been wrong every time someone reasoned
  about it from memory.

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

### The classic game is the source of truth

**The original 1988-1992 distribution is authoritative for every value and
behaviour.** Where our port and the classic game disagree, the classic game is
right and our port is wrong — including when our port's version is better
balanced, better documented, or pinned by a passing test. Deviations are allowed
only when they are deliberate, written down in `docs/DECISIONS.md`, and
justified by something other than "we could not find the canonical value".

The full original distribution is vendored, READ ONLY, at `/reference/`.

> **Before reading anything under `/reference/`, read `reference/CLAUDE.md`.**
> It maps every file in that tree and says which copy of each data file is the
> real one. This is not bureaucracy: the distribution contains several
> generations and several variants of the same configuration, they look
> identical, and picking the wrong one has already put wrong numbers into this
> codebase twice.

The short version:

1. **The C source** — `reference/ge-source/` (identical to `ge-upstream/mbmgemp/*.C`)
2. **The `.MSG` data files** — `ge-upstream/mbmgemp/GE/REL/`, above all
   `MBMGESHP.MSG` (the ship class table loaded at boot) and `MBMGEMSG.MSG`
   (sysop options, items, neutral-zone planets).
   **Never `GE/MSG/`** — a pre-3.2d snapshot that disagrees on `PFIRDST`,
   `HPFIRDST` and gold's weight. **Never `GE/REL2/`** — a second,
   differently-tuned instance where 33 of 60 shared options differ.
   `backend/test/balance/msg-provenance.balance.spec.ts` enforces both.
3. **`reference/wiki/`** — a community transcription. Useful, and has been
   caught being wrong. Never cite it against 1 or 2.

The vendored release is **3.2e (1994-08-06)**, the last one; `GE/DOCS/GEREADME.DOC`
is the changelog and is often the fastest answer to "why is this value what it is".

**In-game help text (`MBMGEHLP.MSG`) sits outside this ranking.** It states
design *intent*, and the shipped configuration frequently does not implement it.
It is never authoritative for a number. Worked example: the help says twice that
Cybertrons will not attack an Interceptor or Freighter unless provoked, but
`S21LATK {0}` means the Cybertron Scout pursues every class.

**Do not hand-transcribe canon into the codebase.** Generate it, and pin it with
a test that re-reads the original file. `backend/prisma/seed/ship-classes.ts` is
generated by `node tools/extract-ship-classes.mjs --ts` and verified field by
field against `MBMGESHP.MSG` by `test/balance/ship-class-canon.balance.spec.ts`.
Hand-transcription is what produced the scanRange drift: the seed said 15_000
while `projectRangeCell` was written for 100_000, so the starter ship projected
a 1.5-sector scan through code expecting 10.

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
| `reference/ge-upstream/mbmgemp/GE/REL/MBMGESHP.MSG` | **Authoritative ship class table** — 34 slots x 28 options, read by `GEMAIN.C:835-875` in ORDER |
| `reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG` | Sysop option defaults and clamp bounds, item and shipyard price tables, `S00P*` neutral-zone planets. **Not the `GE/MSG/` copy** — see the precedence note above |
| `reference/ge-upstream/GE/DOCS/` | Original manuals and `GEREADME.DOC` changelog |
| `reference/ge-upstream/PROVENANCE.md` | Where all of the above came from, and the precedence rules |

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

## Workflow: spec-kit + superpowers

spec-kit owns the **feature spine** (durable artifacts in `/specs/`).
superpowers owns the **how** (TDD discipline, debugging, verification,
parallel agents). They are complementary, not competing.

### Default rules

1. **New feature (something that warrants a `specs/NNN-*` folder):**
   - If the idea is fuzzy, start with `superpowers:brainstorming` — its
     job is to produce the crisp one-paragraph prompt you pass to
     `/speckit-specify`. Without it, specify either makes assumptions
     or fills spec.md with `[NEEDS CLARIFICATION]` markers
   - If the idea is already clear, skip brainstorming. Run
     `/speckit-specify` directly; optionally follow with
     `/speckit-clarify` (narrower, up to 5 targeted questions against
     the written spec) for a sanity check
   - Then `/speckit-plan` → `/speckit-tasks`
   - During `/speckit-implement`, follow `superpowers:test-driven-development`
     (write the failing test first, then the code) and use
     `superpowers:subagent-driven-development` when tasks.md has
     independent parallelizable items
   - Before claiming the feature done, run
     `superpowers:verification-before-completion`

   Rule of thumb:
   - Fuzzy idea → brainstorm → specify
   - Clear idea, want a sanity check → specify → clarify
   - Crystal clear → specify directly

2. **Bug / regression:**
   - Use `superpowers:systematic-debugging` — do NOT create a
     `specs/NNN-*` folder for a bug
   - Fix + test + verify; commit directly

3. **Ad-hoc work (refactor, chore, small change not worth a spec folder):**
   - Use `superpowers:writing-plans` for the plan, skip speckit
   - Still apply TDD and verification skills

4. **Architecture / cross-cutting decision:**
   - Brainstorm first, then write the decision into `docs/DECISIONS.md`
   - No speckit folder needed

### Overlap — pick one, not both

| Tool A | Tool B | Prefer |
|--------|--------|--------|
| `/speckit-plan` | `superpowers:writing-plans` | speckit for features; superpowers for everything else |
| `/speckit-tasks` + `/speckit-implement` | `superpowers:subagent-driven-development` | use them together — speckit produces tasks.md, subagent-driven executes parallelizable ones |
| `/speckit-analyze` | manual review | speckit before `/speckit-implement` on non-trivial features |

### Non-negotiables (apply regardless of which workflow)

- TDD: failing test before implementation (the project's existing
  "Testing Standards" section already requires this — superpowers'
  TDD skill is the *how*)
- Verification before completion: run the actual commands, don't
  claim success from a clean diff
- Update `docs/PROGRESS.md` etc. at end of every implement session
  (already required below)

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
specs/021-onboarding-ship-purchase/plan.md
<!-- SPECKIT END -->