# Implementation Plan: Social and Information Commands

**Branch**: `012-social-commands` | **Date**: 2026-05-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-social-commands/spec.md`

## Summary

Land six commands from `GECMDS.C` that drive situational awareness, scouting, ranking,
real-time chat, and team affiliation: `who`, `dat`, `ros`, `sen`, `fre`, `tea`. All six
plug into the existing `CommandRouterService` pipeline (feature 003) and follow the
established `Command` / handler-service pattern. They are read- or write-light: only
`fre` and `tea` mutate persistent state, and `tea` is the only command that touches a
durable record outside ship state.

The active-ship registry (`ConnectedShipsRegistry`, feature 010) is the source of truth
for `who`, `dat`, and `sen` recipient enumeration. `ros` reads `User` rows directly via
Prisma — sorted by `score` DESC, with `kills` DESC then `userid` ASC as deterministic
tiebreakers, AI userids excluded by name-prefix filter, capped at `ROSTER_MAX` (default
20) or 200 for `ros all`. `sen` emits a new `message.send` Socket.io event scoped per
the sender's per-channel frequency: hail (`outwar FILTER`, excludes cloaked), sector
(`outsect`), or galaxy-wide (`outwar ALWAYS`). `fre` mutates `ShipState.freq[0..2]` and
the dirty flag carries it through the existing flush cycle. `tea` writes `User.teamcode`
via Prisma, mirrors it onto a new `ShipState.teamcode` field, and triggers a
`player.snapshot` rebroadcast.

The original C `cmd_who` and `cmd_data` are reinterpreted: in the BBS source they were
admin/debug echoes (cmd_who prints the userid; cmd_data is gated behind a `qazwsx`
password and dumps a wire-format snapshot to a single client). The spec re-purposes
both as in-world player-facing listings, matching how players discuss them in the
GE wiki and how feature 010 already surfaces ship listings to the React frontend.
This deviation is documented in `research.md` Decision 1.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20.x (backend only — no frontend changes in this feature)
**Primary Dependencies**: NestJS 10, `@nestjs/platform-socket.io`, Prisma 5, Socket.io 4
**Storage**: PostgreSQL 16+ via Prisma — existing `User`, `Team`, `Ship` rows; no schema migrations needed except the optional `ShipState.teamcode` denormalization (in-memory only — `Ship.teamcode` is *not* added to Prisma; the source of durable truth remains `User.teamcode`)
**Testing**: Jest (backend); each handler gets a unit test plus an E2E round-trip through `CommandRouterService`
**Target Platform**: Linux server (backend)
**Project Type**: Web application — backend additions only
**Performance Goals**: Command response within 1 s under normal load (SC-001); `ros` query under 50 ms with 1000 user rows on the existing index plan
**Constraints**:
  - In-memory `Map` is authoritative for active ship state (Constitution III)
  - `ShipState.freq[]` already exists (3-element array) — no schema changes
  - `User.teamcode` already exists as `BigInt?` — no schema changes
  - No Redis; broadcast via Socket.io rooms only
  - Strict TypeScript; no `any`
  - All six commands MUST trace to identifiable lines in `GECMDS.C` (Constitution I)
**Scale/Scope**: Backend tests +30 (handler unit tests + dispatch integration + E2E broadcast); 6 new handler files; 1 new gateway event (`message.send`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Fidelity

- ✅ Each command traces to `GECMDS.C` with line anchors:
  - `who` → `cmd_who` (GECMDS.C:5162 — debug echo) reinterpreted; the per-ship listing
    semantics come from the GE wiki and feature 010's online-ship telemetry.
    Documented as deviation in `research.md` D1.
  - `dat` → `cmd_data` (GECMDS.C:5829 — `qazwsx`-gated) reinterpreted as the public
    scouting verb described in the spec. D1.
  - `ros` → `cmd_geroster` (GECMDS.C:5276+ region; see `cmd_geroster` definition)
  - `sen` → `cmd_send` (GECMDS.C:1825) — original frequency rules preserved verbatim
    (0 = hail / FILTER; 1–19999 = `outsect`; ≥20000 = `outwar ALWAYS`)
  - `fre` → `cmd_freq` (GECMDS.C:1885) — original validation preserved verbatim
    (`hail` token = 0; explicit numeric `0` rejected)
  - `tea` → `cmd_team` (GECMDS.C:5277) reinterpreted: original supports
    `join/start/score/unjoin/members/kick/newpass/newname` with a 5-digit teamcode
    and password; we keep only the player-facing join/leave/show subset since team
    creation is a midnight/admin concern. D2.
- ✅ Channel frequency thresholds (0, 1–19999, ≥20000) preserved exactly per
  `cmd_send` lines 1834-1860.
- ✅ Cloak filtering on hail (`outwar FILTER`) preserved per the original.
- ✅ Text command input is the primary interface — no UI buttons added.
- ✅ Tick cadence untouched (no scheduling changes).

Deviations are explicitly enumerated in `research.md` (D1, D2) per Constitution I's
"silence implies faithful reproduction" rule.

### II. Testing is First Class

- ✅ Unit tests: every handler gets a Jest unit test covering happy path, cloak/AI/
  empty-state edge cases, and validation errors (FR-002, -005, -007, -009, -016a,
  -019, -020, -027).
- ✅ Integration test: dispatch through `CommandRouterService.dispatch()` for each
  keyword exercises the registration wiring and the unknown-keyword/insufficient-args
  branches.
- ✅ E2E broadcast test: `sen` round-trips through the gateway with a fake Socket.io
  setup verifying hail/sector/galaxy scoping and cloaked-recipient handling.
- ✅ Balance regression: no `GEMAIN.H` constants are introduced; the channel-frequency
  thresholds (0, 19999, 20000) are encoded as named constants and asserted in a
  regression test that fails if they change.
- ✅ AI isolation: `ros` AI-exclusion filter is unit-tested with synthetic AI userids
  in isolation from any running game world.

### III. Architecture

- ✅ Backend: NestJS service handlers; no frontend in this feature.
- ✅ In-memory state: `ShipStateService.Map<shipId, ShipState>` is read for `who`/`dat`/
  `sen`; `fre`/`tea` mutate it and rely on the existing dirty-flag flush cycle.
  `tea` additionally issues a Prisma write to `User.teamcode` synchronously inside
  the handler — this is the documented source of durable team-affiliation truth, and
  the in-memory `ShipState.teamcode` is a denormalized cache.
- ✅ No Redis introduced.
- ✅ Real-time: `sen` emits `message.send` via Socket.io rooms (`sector:x:y` for
  sector scope; broadcast to all sockets in the namespace for hail/galaxy). No new
  scheduling primitive — handler runs synchronously inside the dispatch pipeline.
- ✅ Scheduling: no new ticks. No new `@nestjs/schedule` usage.

### IV. Quality

- ✅ TypeScript strict mode; no `any`. Handler signatures use `Command` from
  `command.types.ts` exactly.
- ✅ JSDoc on every handler service references the source line (e.g.
  `@see GECMDS.C:1825 cmd_send`).
- ✅ No new Prisma migration is required (`User.teamcode` and `Team` exist; `Ship.freq`
  exists). If implementation discovers we need to add a `Ship.teamcode` column to
  persist the cache across restarts, that would require a new migration — current
  plan keeps `teamcode` in-memory only and re-derives from `User.teamcode` on hydrate.
- ✅ Docker Compose unaffected.
- ✅ CI gate: tests must pass before merge.

**Result**: Constitution Check PASS for both pre-Phase-0 and post-Phase-1 design.

## Project Structure

### Documentation (this feature)

```text
specs/012-social-commands/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── commands.md      # Per-command keyword + arg grammar + result lines
│   └── websocket-events.md  # message.send event payload
└── tasks.md             # Phase 2 output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/src/game/commands/
├── command-router.service.ts        # existing — no change
├── command.types.ts                 # existing — no change
├── commands.module.ts               # MODIFIED — register 6 new handlers + import deps
├── messages.ts                      # MODIFIED — add MessageId entries (RADSET1/2/3 already
│                                    #   exist as concepts; add WHO_ROW, DAT_*, ROS_*, MSG_*,
│                                    #   TEAM_* per the original prfmsg ids)
├── handlers/
│   ├── who.handler.ts               # NEW — WhoHandlerService
│   ├── dat.handler.ts               # NEW — DatHandlerService
│   ├── ros.handler.ts               # NEW — RosHandlerService (Prisma-backed)
│   ├── sen.handler.ts               # NEW — SenHandlerService (broadcast via CommandResult.broadcasts)
│   ├── fre.handler.ts               # NEW — FreHandlerService (mutates ShipState.freq)
│   └── tea.handler.ts               # NEW — TeaHandlerService (Prisma write + ShipState.teamcode)
└── helpers/
    ├── find-ship.ts                 # existing — reused by who/dat
    └── ai-userid.ts                 # NEW — pattern match for Cybertron / Droid userids

backend/src/game/ship/
└── ship-state.types.ts              # MODIFIED — add `teamcode?: bigint` (in-memory only)

backend/src/gateway/
└── game.gateway.ts                  # MODIFIED — execute CommandResult.broadcasts emitted by sen

backend/test/
├── unit/commands/
│   ├── who.handler.spec.ts          # NEW
│   ├── dat.handler.spec.ts          # NEW
│   ├── ros.handler.spec.ts          # NEW
│   ├── sen.handler.spec.ts          # NEW
│   ├── fre.handler.spec.ts          # NEW
│   └── tea.handler.spec.ts          # NEW
└── e2e/
    └── social-commands.e2e-spec.ts  # NEW — round-trip through gateway
```

**Structure Decision**: Single-project NestJS layout, additions only. No frontend
changes; no schema migration. The six new handler files all follow the
`@Injectable() class XxxHandlerService { command: Command }` pattern established by
`scan.handler.ts` and `report.handler.ts`. Stateless commands (`who`, `dat`, `fre`)
could use the function-export pattern (`rotateCommand`), but using the service form
uniformly simplifies dependency injection for `ros` (needs `PrismaService`), `sen`
(needs `ConnectedShipsRegistry`), and `tea` (needs `PrismaService` + `ShipStateService`).

## Complexity Tracking

> No constitution violations to justify. Section intentionally empty.
