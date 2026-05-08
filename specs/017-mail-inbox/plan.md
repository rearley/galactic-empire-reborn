# Implementation Plan: Mail Inbox

**Branch**: `017-mail-inbox` | **Date**: 2026-05-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/017-mail-inbox/spec.md`

## Summary

Add three player commands — `mai`, `rea <index>`, `del <index>` — that list, read,
and delete rows in the existing `MailStat` table. No schema change. The `mai`
keyword is shared with the maintenance gate (feature 014, FR-210): no-arg routes
to the inbox listing, any arg routes to the existing `MaintHandlerService`. A new
`MailInboxService` reads `MailStat` for the issuing player, sorts by `(stamp DESC,
msgno DESC)` (clarification 2026-05-07), assigns 1-based indices for the current
invocation, and renders class-specific detail views for `rea`. `del` removes the
selected row by composite key `(userid, class, msgno)`. Index resolution for
`rea`/`del` re-queries and re-sorts on each invocation — indices are not
persisted across commands.

## Technical Context

**Language/Version**: TypeScript 5.x (NestJS strict mode)
**Primary Dependencies**: NestJS, Prisma, existing `CommandRouterService`,
`ShipStateService`, `PrismaService`, `MaintHandlerService` (feature 014)
**Storage**: PostgreSQL 16+ via Prisma — read/delete `MailStat` rows; read
`User` and `ShipState` (in-memory) for sender display name resolution
**Testing**: Jest (backend); Vitest is N/A (no frontend changes)
**Target Platform**: Linux server (NestJS backend)
**Project Type**: web-service (backend command handler — terminal command pipeline)
**Performance Goals**: SC-006 — list/read feel instantaneous for ≤50-row inboxes
(< 50 ms server time per command on warm DB).
**Constraints**: No new tables, no `MailStat` schema migration. `mai`/`rea`/`del`
are read-only on `MailStat` except for the single-row delete. No cross-player
access; only the issuing player's `userid` is queried.
**Scale/Scope**: Per-player inboxes typically < 50 rows; midnight 7-day purge
keeps growth bounded. New code lives in one new module
`backend/src/game/mail/` plus three handlers under `backend/src/game/commands/handlers/`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance |
|---|---|
| **I. Fidelity** | The original BBS `mai` was the maintenance command (`GECMDS.C:144`, `cmd_maint`). This feature re-uses the keyword for inbox listing because (a) feature 014 already gates `mai` behind the password mechanic so a no-arg form was free, and (b) the original BBS provided mail listing/read/delete via a separate top-level interface that this single-process port collapses into the in-game command pipeline. Mail class constants (`MAIL_CLASS_DISTRESS=1`, `MAIL_CLASS_PRODRPT=3`) come from `GEMAIN.H:220-224` unchanged. |
| **II. Testing First Class** | Each user story (P1 list, P1 read, P2 delete) has a Jest unit test for the handler and an integration test against the real `MailStat` table. FR-012 (mai dispatch) has both no-arg and with-arg cases. FR-014 confirms read-state is NOT tracked — a regression test asserts no schema drift. Edge cases (out-of-range index, deleted-between-list-and-read race) are explicit Jest cases. |
| **III. Architecture** | Pure command-handler feature; no tick or scheduler involvement. Reads/writes `MailStat` via `PrismaService` (single source of durable truth). Uses `ShipStateService` only for sender display fallback. No Redis. No new schedulers. |
| **IV. Quality** | TypeScript strict mode; new public methods carry JSDoc references to original C source where applicable (`@see GEMAIN.H:511 MAIL`, `@see GEMAIN.H:531 MAILSTAT`). No new Prisma migrations (no schema change). |

**Result**: PASS. No deviations require entry in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/017-mail-inbox/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── commands.md      # `mai`, `rea`, `del` command contracts
└── tasks.md             # Phase 2 output (NOT created here)
```

### Source Code (repository root)

```text
backend/
├── src/
│   └── game/
│       ├── mail/                                  # NEW module
│       │   ├── mail.module.ts
│       │   ├── mail-inbox.service.ts              # list / read / delete logic
│       │   ├── mail-inbox.repository.ts           # Prisma queries on MailStat
│       │   ├── mail-render.ts                     # class-aware list + detail formatters
│       │   └── mail.types.ts                      # MailListEntry, MailListing
│       └── commands/
│           ├── commands.module.ts                 # MODIFIED: register mai/rea/del
│           └── handlers/
│               ├── mai.handler.ts                 # NEW: dispatches no-arg→inbox, with-arg→maint
│               ├── rea.handler.ts                 # NEW
│               ├── del.handler.ts                 # NEW
│               └── maint.handler.ts               # MODIFIED: drop 'mai' alias
└── test/
    └── mail/
        ├── mail-inbox.service.spec.ts             # unit
        ├── mai.handler.spec.ts                    # unit
        ├── rea.handler.spec.ts                    # unit
        ├── del.handler.spec.ts                    # unit
        └── mail-inbox.integration.spec.ts         # against real Postgres
```

**Structure Decision**: Single-purpose feature module `backend/src/game/mail/`
encapsulating inbox logic (sorting, index resolution, formatting), with three
thin command handlers that delegate to it. Keeps command-handler files small
and matches the established pattern (e.g. `planet/`, `combat/`). The existing
`MaintHandlerService` keeps the maintenance gate logic; the new `mai.handler.ts`
is the dispatcher that routes no-arg invocations to the inbox and any-arg
invocations to maintenance — preserving FR-210 behavior from feature 014
unchanged (SC-005).

## Complexity Tracking

> No constitutional violations. Section intentionally empty.
