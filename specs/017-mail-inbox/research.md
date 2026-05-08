# Phase 0 Research — Mail Inbox

All Technical Context unknowns resolved. No NEEDS CLARIFICATION remain.

---

## R1 — `MAIL_CLASS_DISTRESS` numeric value

**Decision**: `MAIL_CLASS_DISTRESS = 1`.

**Rationale**: Confirmed against `reference/ge-source/GEMAIN.H:220`:
```c
#define MAIL_CLASS_DISTRESS  1
#define MAIL_CLASS_MAXOUT    2
#define MAIL_CLASS_PRODRPT   3
#define MAIL_CLASS_GAMESTATS 4
#define MAIL_CLASS_PLSTATS   5
```
The constant is already mirrored in `backend/src/game/constants.ts:147`. The
inbox feature renders class-aware labels for at minimum classes 1 and 3 (FR-005);
classes 2/4/5 are unused by current writers but the formatter must not crash
if encountered — fall back to a generic "Message" label.

**Alternatives considered**: Reading from a runtime config — rejected because
these are compile-time game constants per Constitution Principle I.

---

## R2 — `mai` keyword dispatch (no-arg vs. with-arg)

**Decision**: Introduce a new `MaiHandlerService` registered under keyword `mai`
with no aliases. The handler inspects `args.length`:
- `0` → delegate to `MailInboxService.list(ship.userid)`
- `≥1` → delegate to existing `MaintHandlerService.handle(ship, args)`.

Remove the `'mai'` alias from `maint.handler.ts` so the router can register the
new dedicated `mai` handler without conflict. The `maint` keyword keeps working
unchanged.

**Rationale**:
- FR-012 requires no-arg → inbox, with-arg → maintenance, and SC-005 forbids
  regression in feature 014's password gate. A single dispatcher handler that
  composes both services is the smallest change consistent with both.
- The dispatcher keeps the maintenance flow exactly as `MaintHandlerService`
  implements it today — no logic duplicated, no test surface lost.
- The current `'mai'` alias on `MaintHandlerService` is the only conflict;
  dropping it is a one-line edit.

**Alternatives considered**:
1. Thread an inbox path inside `MaintHandlerService` itself — rejected: bloats
   maintenance handler with unrelated concerns, breaks single-responsibility.
2. Register `mai` as a router-level alias to two handlers — rejected: the
   command router does not support multi-handler aliases by design; would
   require core router refactor for a single-feature need.

---

## R3 — Sender display name resolution

**Decision**: Two-tier fallback in this order:
1. Active `ShipStateService` lookup by `userid` → `ShipState.shipname`
2. Raw `MailStat.dtime` userid string (the stored sender)

If `dtime` is empty, render literal `"(system)"` — distress signals from a
planet without an attacker shipname (rare edge) and any future system-generated
mail stay readable.

**Rationale**: Spec assumption "prefers active `ShipState` ship name, falling
back to a persistent user/ship record, and finally to the raw `dtime`." A
verification pass against `backend/prisma/schema.prisma` (2026-05-07) showed
that `shipname` is a column on the `Ship` model (composite key `userid+shipno`),
not on `User`; players can own multiple ships, so a simple `User`-row lookup
cannot return a single canonical name without picking one. The persistent-record
tier is therefore dropped to avoid arbitrary selection. The active-ship lookup
in `ShipStateService` already covers the common case (the sender is logged in
or recently logged in), and the raw `dtime` userid is a faithful fallback for
offline senders. `MailStat.dtime` is `String @default("")` so the empty-string
case is reachable and renders as `(system)` rather than a blank column.

**Alternatives considered**: Resolving sender at write time (denormalize) —
rejected: `MailStat.dtime` is already populated by feature 009/014 writers and
changing those writers is out of scope for this feature.

---

## R4 — Sort order ("newest first")

**Decision**: Order rows by `stamp DESC, msgno DESC, class DESC` and assign
1-based indices in that order on each invocation.

**Rationale**: Clarification (Session 2026-05-07): sort by stamp desc with
`msgno` desc as tiebreaker. `class` is added as a final tiebreaker for
deterministic ordering when stamp and msgno collide across classes (rare but
possible since `msgno` is per-(userid, class)). FR-002 explicitly notes msgno
alone is not a reliable cross-class ordering.

**Alternatives considered**:
- Index by `class, msgno` (per-class sort) — rejected: clarification chose
  unified cross-class ordering.
- Stable sort by insertion order — `MailStat` has no insertion-order column;
  `stamp` (Unix timestamp seconds, `Int`) is the only available time signal.

---

## R5 — Index stability across commands

**Decision**: Indices are valid only within the current command invocation. Each
of `rea` and `del` re-queries `MailStat`, re-sorts, and re-derives indices.

**Rationale**: FR-003 ("stable within a single command invocation") and the
edge case "midnight purge between `mai` listing and `rea`/`del`" both require
re-resolution. No session-level state is added — keeps NestJS service
stateless for inbox concerns and matches the original BBS pattern.

**Alternatives considered**: Caching the listing in `ShipState` for the player's
session — rejected: introduces cache invalidation complexity and contradicts
the architectural decision that `ShipState` holds active gameplay state, not
UI session state.

---

## R6 — Test infrastructure for `MailStat` integration

**Decision**: Add an integration test that uses the same Postgres test setup
already used by feature 009 (midnight job). Seed `MailStat` rows directly via
Prisma, run handlers through the real `CommandRouterService`, assert returned
`CommandResult.lines` and post-state via Prisma queries.

**Rationale**: Feature 009 established the pattern; reusing it avoids a parallel
test harness. Unit tests use a mocked `PrismaService` and a fake
`ShipStateService`.

**Alternatives considered**: Pure unit-only coverage — rejected: integration
testing the actual Prisma `delete` on a composite key catches a class of bugs
unit mocks miss (e.g. coercion of `BigInt` `msgno`).

---

## R7 — Soft delete vs. hard delete

**Decision**: Hard delete via `prisma.mailStat.delete({ where: { userid_class_msgno: ... } })`.

**Rationale**: SC-003 requires "no soft-delete state remains visible". FR-014
confirms no read-state column is added. The 7-day midnight purge already does
hard deletes (feature 009), so hard-delete here is consistent.

**Alternatives considered**: Mark with a `deletedAt` column — rejected: requires
schema migration, contradicts FR-014.
