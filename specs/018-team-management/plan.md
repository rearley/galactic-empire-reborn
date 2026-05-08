# Implementation Plan: Team Management

**Branch**: `018-team-management` | **Date**: 2026-05-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-team-management/spec.md`

## Summary

Complete the `tea` command set on top of the show/join/leave already shipped in feature 012.
Three new sub-flows and one roster column:

1. **`tea create <name…> <password>`** — atomically allocates the next free `teamcode`
   and inserts a `Team` row with the creator's `User.teamcode` updated to match. Name
   uniqueness is case-insensitive; password is stored plaintext (≤8 chars, no whitespace).
2. **`tea <name…> <password>`** — extends the existing join handler to require and verify
   the team's plaintext password (case-sensitive password match, case-insensitive name match).
3. **`tea list`** — leaderboard of teams sorted by `teamscore DESC`, then `teamcode ASC`,
   filtered to live `COUNT(User.teamcode) > 0`, capped at 20 rows. Member count is
   computed live from `User` rows in a single `GROUP BY teamcode` query — the
   denormalised `Team.teamcount` column is **not** read by this command (FR-023
   "live count, not a stale denormalised counter").
4. **`ros` team column** — adds a fixed-width 12-char team-affiliation column resolved from
   the player's `User.teamcode` against the `Team` table (single batched lookup per call).

The single existing `Team.password` column is reused for both creation and join — `Team.secret`
stays unused (assumption already documented in spec). No schema migration: all required columns
(`teamcode`, `teamname`, `teamcount`, `teamscore`, `password`, `flag`) already exist.

The `tea` keyword's first-token routing changes: previously `tea <name>` attempted a join.
Now the **last whitespace-separated token** is the password and everything before it is the
name; one-token forms (`tea`, `tea leave`, `tea list`, `tea create`) keep their existing
sub-command semantics. A bare `tea Foo` (single non-keyword token) falls through to the
existing show-current-team behaviour, NOT a join attempt — preserving the FR-016a contract.

## Technical Context

**Language/Version**: TypeScript 5.x (NestJS strict mode)
**Primary Dependencies**: NestJS, Prisma, existing `CommandRouterService`,
`ShipStateService`, `PrismaService`
**Storage**: PostgreSQL 16+ via Prisma — read/write `Team` rows; read/update
`User.teamcode`. Concurrent `tea create` is serialised via a default
READ COMMITTED Prisma transaction that reads the max existing `teamcode` and
inserts the new row in the same tx, with up to 3 retries on `P2002`
unique-name violation; a unique partial index on `LOWER(teamname)` provides
the cross-process guarantee against duplicate names (research D1).
**Testing**: Jest (backend); Vitest is N/A (no frontend changes)
**Target Platform**: Linux server (NestJS backend)
**Project Type**: web-service (backend command handler — terminal command pipeline)
**Performance Goals**: SC-001 — `tea create` round-trips in < 1s. `tea list` and
`ros` complete in < 50 ms server time on warm DB for ≤ 20 teams / ≤ 200 roster rows.
**Constraints**: No new Prisma model, no rename of existing columns. The roster
team-column lookup MUST NOT do N+1 queries — collect distinct `teamcode`s and
batch-fetch in a single `findMany`. `teamcode = 0` is treated as "no team"
(matches midnight reconciliation `gt: 0n` filter, R-3).
**Scale/Scope**: ≤ 50 teams expected (`MAXTEAMS=50` from `GEMAIN.H:240`); spec
caps display at 20 (FR-021). One new module `backend/src/game/team/`, one
existing handler modified (`tea.handler.ts`), one existing handler modified
(`ros.handler.ts`), one new Prisma migration adding the `LOWER(teamname)`
unique partial index.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance |
|---|---|
| **I. Fidelity** | `cmd_team` in `GECMDS.C:5277` is the canonical reference. The original required a player-supplied 5-digit `teamcode` and exposed two passwords (`secret` for founder, `password` for joiners) — we deviate per the spec's explicit assumption that auto-assigned codes and a single plaintext join password are the modern equivalent (rationale in spec, lines 165–170). The MAXTEAMS=50 limit (`GEMAIN.H:240`) is intentionally *not* the display cap; spec FR-021 sets display cap at 20 (a known deviation, see research.md D2). All other constants — name length 30 (`teamname[31]` in `GEMAIN.H:307`), password length 10 in original / **8 per spec FR-011a** — are documented. |
| **II. Testing First Class** | Each user story has Jest unit + integration tests: `tea create` (P1) covers happy path, duplicate-name (case-insensitive), already-on-team rejection, length/whitespace validation, concurrent-create race (two parallel transactions, exactly one succeeds). `tea <name> <pw>` (P1) covers correct/wrong/missing password and case-insensitive name match. `tea list` (P2) covers sort order, tie-break by teamcode, empty-team filtering, no-teams output, 20-cap. Roster column (P3) covers truncation at 12 chars and `---` for unaffiliated. A balance regression test asserts `MAXTEAMS=50` and the spec cap of 20 against documented constants so any drift fails CI. |
| **III. Architecture** | Pure command-handler feature; no tick or scheduler involvement. All durable state in Postgres via `PrismaService`; `ShipState.teamcode` is mirrored as already established by feature 012. No Redis, no new schedulers. Existing midnight reconciliation (`midnight.repository.ts:221+`) recomputes `teamcount`/`teamscore` once per day; this feature's `tea list` reads those values directly without recomputation, consistent with spec assumption "Score reconciliation already handled". |
| **IV. Quality** | TypeScript strict mode; new public methods carry `@see GECMDS.C:5277 cmd_team` JSDoc. New Prisma migration adds the `LOWER(teamname)` unique partial index — created via `prisma migrate dev --name team_name_unique_lower`, never edited after creation. The schema's `Team.secret` column is left in place (no destructive change) per the spec's explicit assumption. |

**Result**: PASS. The auto-assigned `teamcode` and single-password simplifications
are deviations from `GECMDS.C:5277` but are explicitly authorised by the spec's
Assumptions section (spec lines 165–170). MAXTEAMS=50 vs display-cap=20 is logged
in research.md D2 — no constitutional violation since the spec governs.

## Project Structure

### Documentation (this feature)

```text
specs/018-team-management/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── commands.md      # `tea create`, `tea <name> <pw>`, `tea list`, `ros` contracts
└── tasks.md             # Phase 2 output (NOT created here)
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   └── migrations/
│       └── <timestamp>_team_name_unique_lower/      # NEW migration
│           └── migration.sql                         # CREATE UNIQUE INDEX on LOWER(teamname)
├── src/
│   └── game/
│       ├── team/                                    # NEW module
│       │   ├── team.module.ts
│       │   ├── team.service.ts                      # create / join-validate / list
│       │   ├── team.repository.ts                   # Prisma queries on Team
│       │   ├── team-render.ts                       # `tea list` formatting + roster column truncation
│       │   ├── team-name.ts                         # parse, trim, validate (length, whitespace)
│       │   └── team.types.ts                        # TeamListEntry, ParsedTeaArgs
│       └── commands/
│           ├── commands.module.ts                   # MODIFIED: register TeamModule deps
│           └── handlers/
│               ├── tea.handler.ts                   # MODIFIED: add create / list / password-gated join
│               └── ros.handler.ts                   # MODIFIED: add team column
└── test/
    └── team/
        ├── team.service.spec.ts                     # unit
        ├── team-name.spec.ts                        # unit (parser + validation)
        ├── tea.handler.spec.ts                      # unit (router-level)
        ├── ros.handler.spec.ts                      # unit (team column rendering)
        └── team.integration.spec.ts                 # against real Postgres — concurrent create, listing
```

**Structure Decision**: New feature module `backend/src/game/team/` owns all team
business logic; `tea.handler.ts` and `ros.handler.ts` are modified in place to
delegate to it. This matches the established pattern from feature 017
(`game/mail/`) and keeps command handlers thin. The existing `tea` show / leave /
join branches stay in `tea.handler.ts` for continuity with feature 012; only
the join branch is materially modified (it now requires a password and parses
multi-word names).

## Complexity Tracking

> No constitutional violations. Section intentionally empty.
