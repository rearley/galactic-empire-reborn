# Phase 1 Data Model — 009 Midnight Maintenance Job

## New Prisma Model

```prisma
// ─── MidnightRun ─────────────────────────────────────────────────────────────
// Ledger of completed midnight passes. One row per server-local calendar date.
// PK on date guarantees idempotency: a second pass on the same day either
// reuses the row (manual recovery — overwrite counters/completedAt) or is
// short-circuited by the cron path's "today already ran" check.
//
// @see specs/009-midnight-job/research.md D5 (date keying)
// @see specs/009-midnight-job/research.md D4 (self-heal)

model MidnightRun {
  /// Server-local calendar date — natural primary key
  runDate            DateTime @id @db.Date
  /// Wall-clock completion timestamp
  completedAt        DateTime
  /// Total wall-clock duration in milliseconds
  durationMs         Int
  /// Phase counters captured at end-of-pass
  usersUpdated       Int
  planetsProcessed   Int
  mailReportsCreated Int
  mailDeleted        Int
  teamsReconciled    Int
  teamsRemoved       Int
}
```

Migration name: `add_midnight_run` (created via `prisma migrate dev
--name add_midnight_run`, committed alongside the schema change per
CLAUDE.md / Constitution IV).

## Read/Write Surface — Existing Models

The midnight pass touches the following existing models. **No schema
changes** to any of them.

### `User` (feature 001)

| Field | Phase 1 | Phase 2 | Phase 4 | CHGLOSER (combat) |
|-------|---------|---------|---------|-------------------|
| `userid` | read | read | read | read |
| `planets` | **write 0** | **+= 1 per owned planet** | — | — |
| `score` | **write 0** | — | **write `plscore + klscore`** | — |
| `plscore` | **write 0** | **+= valuePlanet(p)** | — | — |
| `klscore` | — | — | read | — |
| `population` | **write 0** | **+= men/10000** | — | — |
| `teamcode` | — | — | **reset to 0 if orphan** | — |
| `rospos` | — | — | **write rank or 0** | — |
| `cash` | — | — | — | **transfer between players** |

KEY-record skip: every phase that walks users excludes `userid = KEY`.
`@`-prefix skip: rospos pass excludes any user whose userid starts
with `@`.

### `Planet` (feature 001 / 005)

Read-only during phase 2:

- `userid` — owner; empty string ⇒ skip; userid not in `User` ⇒ skip silently
- `type` — must equal `PLTYPE_PLNT` to be considered
- `name`, `xsect`, `ysect` — copied to `MailStat`
- `cash`, `tax`, `debt` — used by `valuePlanet` and copied to `MailStat`
- `items[14]` — value contributions to `valuePlanet`; quantities copied
  to `MailStat.itemqty`
- `items[I_MEN].qty` — divided by 10,000 and added to owner's `population`

### `Team` (feature 001)

Phase 4 mutations:

| Field | Action |
|-------|--------|
| `teamcount` | reset to 0 at start; incremented per non-orphan member |
| `teamscore` | reset to 0 at start; for each member adds **both** `TEAMBONU` **and** `(user.score / max(teamcount, 1))`. Final value for a team with N members: `N × TEAMBONU + Σ(member.score / teamcount)`. Per `GEMAIN.C:1275` — both additions are inside the per-user loop. |
| `teamcode` | **set to -1** (sentinel for removed) when `teamcount` is 0 after the count phase |

### `Mail` (feature 001)

Phase 3 deletes only:

- DELETE WHERE `stamp < floor(Date.now()/1000) - MAILDAYS * 86400`
- DELETE WHERE `userid LIKE '*%'` (Prisma `startsWith: '*'`)

No reads, no inserts.

### `MailStat` (feature 001)

Phase 2 inserts only — one row per owned planet:

| Field | Source |
|-------|--------|
| `userid` | planet's owner |
| `class` | `MAIL_CLASS_PRODRPT` (3) |
| `msgno` | `BigInt(Date.now()) + i` (i = per-iteration counter) |
| `type` | `MESG20` (20) |
| `stamp` | `floor(Date.now()/1000)` |
| `dtime` | server-local ISO timestamp |
| `topic` | `""` (the C source doesn't set it on this path) |
| `name1` | planet name truncated to 25 chars |
| `int1` | planet `xsect` |
| `int2` | planet `ysect` |
| `cash` | planet `cash` |
| `debt` | planet `debt` |
| `tax` | planet `tax` |
| `itemqty[14]` | bigint array copied from `planet.items[*].qty` |

No reads, no deletes, no updates.

### `ShipClass` (feature 001)

Read-only during the CHGLOSER / Droid-kill paths in `PlayerScoreService`:

- `points` — looked up by victim's `shpclass` to populate
  `CombatShipDestroyedEvent.scoreAwarded` (already done by 006b's
  `combat-tick.service.ts`).

The midnight pass itself does not read `ShipClass`.

## In-Memory State

`MidnightService` holds no per-pass state outside the running call.
Per-iteration counters are local variables. The `MidnightRun` ledger
is the only durable cross-pass state.

## Concurrency Markers

- `pg_try_advisory_lock(<key>)` — session-level; key = `0x474D6E69_67687400`
  ("GMnight\0"). Released in `finally`.
- `prisma.$transaction(...)` — wraps phases 1-4. Per FR-012a, any
  unexpected error inside the transaction (outside the FR-011/FR-012
  carve-outs) propagates and rolls the whole pass back.
- `MidnightRun` insert is the **last** statement in the transaction so
  rollback also discards the ledger row, leaving the day "not yet run"
  for the next invocation to retry idempotently.

## Constants

All constants live in `backend/src/game/midnight/midnight.constants.ts`
and are referenced by name everywhere. The balance-regression test
imports each constant and asserts its exact value.

| Constant | Value | C-source citation |
|----------|-------|-------------------|
| `TEAMBONU` | `3_200_000n` (32000 × 100) | `GEMAIN.C:478` |
| `MAILDAYS` | `7` (env-overridable 1-30) | `GEMAIN.C:497` |
| `PLTVCASH` | `201_228_378` | `GEMAIN.C:593` |
| `PLTVDIV` | `201_228_378` | `GEMAIN.C:596` |
| `CHGLOSER` | `100` (env-overridable 0-100) | `GEMAIN.C:605` |
| `MAXTEAMS` | `50` | `GEMAIN.H:240` |
| `MAIL_CLASS_PRODRPT` | `3` | `GEMAIN.H:222` |
| `MESG20` | `20` | (mail message template id) |
| `ADVISORY_LOCK_KEY` | `0x474D6E6967687400n` | research.md D2 |
