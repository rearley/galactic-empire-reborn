# Phase 0 Research — 009 Midnight Maintenance Job

All Technical Context unknowns are resolved. The C-source phases in
`reference/ge-source/GEMAIN.C:1084-1335` are detailed enough to drive a
direct port; the only design questions are about how to map them onto
NestJS / Prisma / Postgres patterns already established in the codebase.

## Decisions

### D1 — Scheduling library: `@nestjs/schedule`

**Decision**: Add `@nestjs/schedule` as a top-level dependency and register
`ScheduleModule.forRoot()` in `AppModule`. Use a single `@Cron('0 0 * * *')`
decorator on `MidnightService.scheduledRun()`.

**Rationale**: Constitution III mandates `@nestjs/schedule` with `@Cron` for
calendar-cadence jobs. CLAUDE.md commits to this library. The midnight pass
is the canonical reason it exists in the project. No alternative scheduler
is being considered.

**Alternatives considered**: `node-cron` standalone (no — bypasses NestJS
DI), raw `setTimeout` chained to next-midnight (no — drift, manual
recovery, violates Constitution III), an external cron container (no —
operationally heavier and breaks single-process invariant).

### D2 — Concurrency: Postgres advisory lock

**Decision**: Acquire a session-scoped `pg_try_advisory_lock(<fixed-key>)` at
the top of `MidnightService.run()` before opening the transaction. Release
in a `finally` block on every exit path. Key value: `0x474D6E69_67687400`
(ASCII `"GMnight\0"`) — a fixed bigint chosen to be unlikely to collide
with any future advisory-lock use in this codebase.

**Rationale**: FR-004a mandates an advisory lock so cron + manual endpoint
+ startup self-heal cannot collide. `pg_try_advisory_lock` returns
immediately on contention, which lets the cron path log a skip and the
HTTP path return 409 cleanly. Session-scoped (not transaction-scoped)
because the lock must hold across the lock-then-open-transaction
sequence and survive transaction rollback so we can release it in a
`finally`.

**Alternatives considered**: Application-level mutex (no — not durable
across cron/manual/startup paths in the same way; also doesn't
forward-compatibly extend to multi-node), `SELECT ... FOR UPDATE` on a
sentinel row (no — heavier, requires a row to exist, less idiomatic for
"is anyone running this job right now").

### D3 — Transactionality: single `prisma.$transaction`

**Decision**: All four phases run inside a single `prisma.$transaction(
async (tx) => { ... })`. Per-phase repository methods accept the `tx`
client. Advisory lock is acquired *before* the transaction opens (using
the underlying connection from `prisma.$queryRawUnsafe` outside the tx)
and released after the transaction completes/rolls back.

**Rationale**: FR-004 mandates atomic rollback on partial failure. The
C source has no equivalent because Btrieve has no transactions, so the
spec authoring implicitly relies on Postgres semantics here. A single
transaction is simpler than nested savepoints.

**Alternatives considered**: Per-phase transactions with manual
compensation (no — FR-012a explicitly requires whole-transaction
rollback), no transaction (no — leaves user/planet/team rows in a
partially-updated state on any error).

### D4 — Self-heal mechanism

**Decision**: `MidnightService` implements `OnApplicationBootstrap`. On
boot, queries `MidnightRun` for today's server-local date. If absent,
calls `run()` once. Older missed days are not replayed.

**Rationale**: Spec clarification 2026-05-05 selected this approach.
`OnApplicationBootstrap` runs after all modules are initialised, so the
DB connection is ready. Single-day catch-up matches the spec's explicit
non-goal of replaying multiple missed days.

**Alternatives considered**: Replay all missed days (no — spec rejects),
expose a manual catch-up command instead (no — defeats the unattended
recovery goal).

### D5 — Server-local date computation

**Decision**: Compute the current server-local date at the start of
`run()` using `new Date()` and `toISOString().slice(0, 10)` style with
the server's local timezone offset baked in (`Intl.DateTimeFormat` with
the server's TZ). Store as Postgres `date` (no time component) in
`MidnightRun.runDate`.

**Rationale**: Spec assumption: "Server-local time" means server
wall-clock. A `date`-typed column makes the PK collision the
idempotency mechanism — no need for a unique index on a derived field.

**Alternatives considered**: UTC date (no — spec explicitly says
server-local), per-user timezone (no — spec says no multi-zone in scope).

### D6 — `MAILSTAT.msgno` allocation

**Decision**: Use `BigInt(Date.now()) + i` where `i` is a per-iteration
counter incremented for each MailStat row created during phase 2. This
mirrors the `Date.now()` strategy already used by
`backend/src/game/planet/planet-economy.service.ts:106` and adds a
loop-local counter to break ties when many rows are created in the
same millisecond.

**Rationale**: `(userid, class, msgno)` is the composite PK; the only
requirement is uniqueness within a `(userid, class)` pair, and within
a single midnight run a player owns at most a few hundred planets
(realistic upper bound) so `Date.now() + i` is always monotonic and
collision-free for the run. Two consecutive midnight runs (e.g. cron
then manual recovery) would still see different `Date.now()` bases.

**Alternatives considered**: Postgres sequence (no — adds schema
churn for a single use), monotonic in-memory counter persisted across
runs (no — requires a counter table; not warranted).

### D7 — Phase 4 rospos assignment in a single SQL statement

**Decision**: Issue one raw `UPDATE` using a window function:

```sql
UPDATE "User" u
   SET "rospos" = COALESCE(r.new_rospos, 0)
  FROM (
    SELECT "userid",
           ROW_NUMBER() OVER (ORDER BY "score" DESC) AS new_rospos
      FROM "User"
     WHERE "score" > 0
       AND "userid" != $1                  -- KEY
       AND "userid" NOT LIKE '@%'
  ) r
 WHERE u."userid" = r."userid"
    OR (r."userid" IS NULL AND u."rospos" <> 0);
```

Then a second statement to zero `rospos` for any user that doesn't
qualify (so re-runs converge).

**Rationale**: O(N) single-pass instead of N+1 round-trips. Idempotency
preserved because non-qualifiers' `rospos` is reset to 0 on every run.

**Alternatives considered**: Sort in JS then update in a loop (no —
N round-trips for large fixtures, blows SC-005 budget), Prisma
`$transaction([updateMany...])` per-bucket (no — same N-cost).

### D8 — CHGLOSER home: `PlayerScoreService` listener

**Decision**: The CHGLOSER cash-penalty implementation lives in
`backend/src/game/player/player-score.service.ts`'s existing
`COMBAT_SHIP_DESTROYED` listener. A new branch checks both sides for
non-AI status (neither userid matches `^(?:Cybrg-|Droid-)/`) and calls a
new repository method `applyCashPenalty(attackerUserid, victimUserid,
percent)`.

**Rationale**: Spec assumption explicit. Keeps "kill resolution"
mechanics co-located. The midnight cron is "scoring becomes real",
which is *why* this work is bundled with 009, not *where* it executes.
The combat-tick service is the wrong home because it already does too
much; the score listener is the natural extension point.

**Alternatives considered**: Inline in `combat-tick.service.ts` (no —
already crowded; the score listener is the established pattern for
post-kill scoring side effects from 006b).

### D9 — Droid kill scoring: contract-pin only

**Decision**: No production code change is required for FR-025/026. The
existing `transferKillScore(..., isAiVictim=true)` path already handles
"victim row absent" by updating only the attacker. `Droid-`-prefixed
userids already match `AI_USERID_RE` and reach the AI branch with
the correct `scoreAwarded` value populated upstream by
`combat-tick.service.ts` from `shipClass.points`.

What this feature adds:
1. A regression test under
   `test/game/combat/droid-kill-scoring.spec.ts` that drives the kill of
   each of classes 10, 11, 12 and asserts `score` and `klscore` deltas.
2. An explicit named constant + JSDoc comment in
   `player-score.service.ts` documenting that `Droid-` is part of the
   AI-victim contract, so a future refactor can't accidentally drop it.

**Rationale**: "The simplest thing that could possibly work." The C
source already has this behaviour structurally; 006b already implemented
the AI-victim path generically; the only risk is silent regression.
Pinning it with a test costs nothing and protects forever.

**Alternatives considered**: Carve out a Droid-specific code path (no —
strictly more code, no behavioural difference).

### D10 — Admin endpoint shape

**Decision**: `POST /admin/midnight/run` guarded by `AdminTokenGuard` that
reads `MIDNIGHT_ADMIN_TOKEN` from env. Responses:

- `202 Accepted` on successful run (or 200 — `202` reads better here).
- `401` on missing/invalid token.
- `409` if the advisory lock is held by another runner.
- `503` if `MIDNIGHT_ADMIN_TOKEN` is not configured.

Body (on 202): `{ status: "completed", date, durationMs, counters: {
usersUpdated, planetsProcessed, mailReportsCreated, mailDeleted,
teamsReconciled, teamsRemoved } }`.

**Rationale**: Spec clarification 2026-05-05 selected the bearer-token-
guarded NestJS endpoint. Per-phase counters are already emitted to logs
(FR-005) — exposing them in the response body is a near-zero-cost
operator affordance for "did the manual run actually do anything".

### D11 — `value_pl` in 64-bit space

**Decision**: Compute net-worth in `bigint` end-to-end. `Planet.cash`,
`Planet.tax`, and `Planet.debt` are already `BigInt` per the schema;
`item_value × item_qty` is multiplied as bigint. The result is added to
`User.plscore` (already `BigInt`).

**Rationale**: The C source uses `unsigned long` (32-bit on the original
target), but our schema already widened these to BigInt for safety per
feature 001's FR-036. No clamping needed because the BigInt domain
exceeds any plausible production value by many orders of magnitude.

**Alternatives considered**: Number arithmetic with overflow checks (no
— our schema is BigInt and round-tripping through Number would lose
precision for very rich planets).

### D12 — Item values for `value_pl`

**Decision**: Item base values come from the existing per-item value
table referenced by 005's `planet-economy.service.ts` (item index →
base price). The midnight repository imports the same constants.

**Rationale**: Spec assumption "no rebalance work" — reuse the existing
constants. The C source's `value_pl` reads from a per-item value array
that 005 already mirrored.

**Alternatives considered**: Re-define a parallel constant in
`midnight.constants.ts` (no — duplication risk; one source of truth).

### D13 — Production-report mail content

**Decision**: Persist only the structured fields per the spec assumption:
`MAILSTAT.userid`, `class = MAIL_CLASS_PRODRPT (3)`, `type = MESG20 (20)`,
`stamp = floor(Date.now()/1000)`, `dtime = ISO-formatted server-local
timestamp`, `name1 = planet.name (truncated to 25)`, `int1 = xsect`,
`int2 = ysect`, `cash`, `debt`, `tax`, `itemqty[14]`. The free-form
English message body is rendered at read time by the future mail UI
(feature 011) using `MESG20` as the template id.

**Rationale**: Spec assumption explicit. The MAILSTAT struct in
`GEMAIN.H:531` is already the structural source of truth and matches
the existing Prisma model from feature 001 verbatim.

**Alternatives considered**: Pre-render and store the English message
in `Mail.string1` (no — couples the mail surface to a pre-render step
that the spec defers to feature 011).

### D14 — End-of-pass observability

**Decision**: A single structured log line at end-of-pass with all
per-phase counters (`event=midnight.complete`, plus the seven counter
fields and `durationMs`). No metrics endpoint, no per-phase events.

**Rationale**: Spec clarification 2026-05-05 explicitly selected
"per-phase counters in the end-of-pass log line; no metrics endpoint".
Operators can grep the log line and graph from log-aggregation if
desired.

## Non-Goals (re-confirmation from spec)

- No frontend change.
- No multi-day backfill.
- No multi-node distribution (advisory lock is forward-compatible but
  unused for that purpose today).
- No new player-facing commands.
- No constant rebalance.
