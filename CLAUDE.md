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
- **Scheduling**: raw `setInterval` in `TickService` lifecycle hooks for the two
  game heartbeats; @nestjs/schedule (`@Cron`) for midnight only. See
  `docs/DECISIONS.md` 2026-05-01.
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

`CLAUDE.md` files also sit in `reference/`, `docs/`, `backend/prisma/`,
`backend/src/game/` and `backend/src/public/`. See the table below.

## Architecture Decisions (do not change without discussion)

### State Management

Active ship state is held in a NestJS service singleton (`Map<shipId, ShipState>`).
This in-memory state is the source of truth during gameplay.
Postgres is the durable store — flushed async, not on every tick.
**No Redis. No external cache layer.**

### Directory-scoped instructions

Detail that only matters when you are working in one place lives next to that
place, so this file stays short. Each of these is loaded automatically when you
touch files in its directory:

| File | Covers |
|---|---|
| `reference/CLAUDE.md` | **Read before opening anything under `/reference/`.** Maps every file in the vendored distribution and says which copy of each data file is the real one |
| `backend/src/game/CLAUDE.md` | The two tick timers, `UNIVMAX` vs the scan viewport, the droid combat table, the module map |
| `backend/prisma/CLAUDE.md` | Migration rules, generated seeds, columns that were dropped and why |
| `backend/src/public/CLAUDE.md` | The generated player guide, deviations and corrections, the landing page's accepted limits |
| `docs/CLAUDE.md` | What each living doc is for, its format, and where open work is tracked |

The rules in those files are not optional because they are not in this one.
Three of them exist specifically because the same mistake was made more than
once.

### The parts most often got wrong

**State**: see `### State Management` above. No Redis, no external cache layer.

**Ticks**: two heartbeats. The **1-second** tick moves ships — rotate,
accelerate, move, self-destruct countdown, energy regen, DB flush. The
**6-second** tick runs everything else — shields, cloak, mines, projectile
flight, phaser recharge, damage control. **Movement is on the fast tick and
shields are on the slow one**; this file once had them backwards and every ship
in the game flew at half speed. Before moving anything between the two, find it
in `GEMAIN.C`. Derivation in `backend/src/game/CLAUDE.md`.

**Galaxy**: `MAXX=30` / `MAXY=15` are the character dimensions of the ASCII scan
map. They are **not** the size of the galaxy. The galaxy runs
`-UNIVMAX..+UNIVMAX`; canon defaults to 300 and we deploy at 100, a documented
deviation. Anything measured in sectors is coupled to `UNIVMAX`. This has been
misread three times. Derivation in `backend/src/game/CLAUDE.md`.

**AI ships**: Cybertrons are persistent and escalate with player kill count;
Droids are ephemeral. **The starter PvE target is the Vakory Survey Drone (33)**
— a stock Interceptor cannot beat the Lydorian Scow at any range. The
arithmetic, and the two times this file got it wrong, are in
`backend/src/game/CLAUDE.md`. Recompute it from the code rather than recalling
it.

**Galaxy generation**: procedural on first boot, not converted from the original
Btrieve `.DAT` files. Must include a neutral zone at origin, wormholes, varied
sector types and planet placement. Ships use floating-point x/y (`COORD`).

**WebSocket**: one `GameGateway`. Players join a Socket.io room per sector.
Sector-scoped events go to rooms; kills and major announcements go to all.

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
| `reference/ge-upstream/mbmgemp/GE/DOCS/` | Original manuals and `GEREADME.DOC` changelog |
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
#define MAXX        30      // Scan-map width in CHARACTERS (viewport, not the galaxy)
#define MAXY        15      // Scan-map height in CHARACTERS (viewport, not the galaxy)
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
- **Never `prisma db push`. Never `prisma migrate reset`.** Schema changes go
  through `prisma migrate dev --name <name>`, and migrations are committed, never
  edited. Full rules in `backend/prisma/CLAUDE.md`
- Docker Compose must work for both development and production
- No feature ships without passing CI

## Documentation

`docs/` is living documentation and is updated at the end of every implement
session, in the same commit as the change. `docs/CLAUDE.md` says what each file
is for and gives the format for each.

Two rules worth knowing before you get there:

- **Open work is tracked in three places only** — the newest entries in
  `docs/PROGRESS.md`, the files in `docs/audits/`, and `docs/DECISIONS.md`.
  Anything elsewhere that reads like an open item is stale, and closing it in
  place is part of the job.
- **Keep won't-fix decisions, deliberate deviations, and expensive research**,
  even once the work is done. Rewrite the note to record what was decided and
  why; do not delete it.

A deviation a player would actually notice also belongs in `GUIDE_DEVIATIONS` —
see `backend/src/public/CLAUDE.md`.

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
  (already required by the Documentation section above)

**The numbered feature sequence is finished.** `specs/001-*` through
`specs/022-fidelity-audit-v2` all shipped; see the roadmap section in
`docs/PROGRESS.md`. Work since then is ad-hoc under rules 2 and 3 above, and a
new `specs/NNN-*` folder is warranted only for genuinely new features.

## Versioning — bump `VERSION` with anything that deploys

`VERSION` at the repo root is the release number. It is read once by the build
workflow and baked into BOTH images, so the two can never disagree about what
release they are.

**Bump it in the same commit as any change that will be deployed.** Not in a
follow-up, not at the end of a session — in the commit, because a version that
lags is worse than no version: it says a deploy landed when it did not.

- **patch** — a fix, a canon correction, a copy change
- **minor** — a new command, a new page, a mechanic
- **major** — reserved; the port reaching parity with canon is not a `1.0`
  until a returning player says it is

The UI header shows `v<VERSION> · <short git SHA>`, and `/public/stats`
reports the same pair for the backend. Two values because they fail
differently: `VERSION` is meaningful but hand-maintained, so it goes stale the
moment someone forgets — `backend/package.json` sat at `0.0.1` for fifty
commits, which is exactly the failure this rule exists to prevent. The SHA is
derived from the commit and cannot be forgotten, but says nothing about what
the release IS.

If you add a new deployable image or a second build path, wire `GIT_SHA` and
`APP_VERSION` through it. A version that silently falls back to `dev` in
production is worse than none, because it looks like it is working.

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