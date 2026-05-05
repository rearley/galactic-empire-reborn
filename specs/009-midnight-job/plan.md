# Implementation Plan: Midnight Maintenance Job

**Branch**: `009-midnight-job` | **Date**: 2026-05-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-midnight-job/spec.md`

## Summary

A new `game/midnight/` module owns the four-phase nightly maintenance pass
faithfully ported from `gemidnighta()` (`reference/ge-source/GEMAIN.C:1084-1335`).
A single `MidnightService.run()` entry point is invoked by three paths — a
calendar `@Cron('0 0 * * *')` decorator (the project's first use of
`@nestjs/schedule`, mandated by Constitution III for calendar-cadence jobs),
a startup self-heal hook, and a protected `POST /admin/midnight/run` HTTP
endpoint. All three converge on the same code path; concurrency is gated by
a Postgres advisory lock (FR-004a). The full pass executes inside a single
Prisma `$transaction` (FR-004) and writes a `MidnightRun` ledger row keyed
by server-local calendar date (FR-001a) so the next day's invocation is
idempotent and a missed midnight is replayed once on the next boot.

The four phases mirror the C source: (1) zero `planets`/`score`/`plscore`/
`population` for every non-`KEY` user, (2) walk every owned planet of type
`PLTYPE_PLNT`, accumulate per-owner totals, append a `MAILSTAT` production
report row, (3) delete `Mail` rows older than `MAILDAYS` and rows addressed
to `*`-prefixed recipients, (4) zero/recompute team counts and scores,
reset orphan `teamcode`s to 0, mark empty teams removed (sentinel
`teamcode = -1`), set `score = plscore + klscore` for every user, and
assign descending `rospos` ranks skipping `KEY` and `@`-prefixed AI users.

The two deferred per-kill scoring items are **not** wired into the
midnight cron — they live where the kills resolve. The CHGLOSER cash
penalty (FR-022/023/024) is added inside `PlayerScoreService` (the existing
`COMBAT_SHIP_DESTROYED` listener from 006b), gated by both sides being
non-AI. Droid kill scoring (FR-025/026) is enabled by relaxing the
`AI_USERID_RE` skip in the same listener: Droid victims (`Droid-` prefix)
already award score via the existing `transferKillScore` path in 006b; the
existing repository call already tolerates the absent victim row when
`isAiVictim=true` — this feature adds an explicit regression test pinning
the behaviour.

The MidnightRun ledger introduces one new Prisma model and one new
migration. No other schema change is required — `User`, `Planet`, `Team`,
`Mail`, `MailStat`, and `ShipClass` are reused verbatim from feature 001.
A new top-level dependency `@nestjs/schedule` is added (the project's
first scheduling package; consistent with Constitution III's calendar-cadence
rule and CLAUDE.md).

## Technical Context

**Language/Version**: TypeScript 5.x (NestJS 10 / Node 20)
**Primary Dependencies**: `@nestjs/common`, `@nestjs/schedule` (NEW — `@Cron` only, per Constitution III), `@nestjs/event-emitter` (existing — for emitting per-phase counter telemetry events to logs), `PrismaService` (existing), `PlayerScoreService` + `PlayerScoreRepository` (existing — extended to apply CHGLOSER and to award score on Droid kills), `ShipClassCacheService` (existing — read `points` for Droid kill scoring; already used by 006b).
**Storage**: PostgreSQL 16+ via Prisma. **One new model** (`MidnightRun`) and **one new migration**. The pass executes inside a single `prisma.$transaction([...])` (FR-004) with a Postgres advisory lock acquired up front (`pg_try_advisory_lock(<fixed-key>)`, FR-004a). All other tables (`User`, `Planet`, `Team`, `Mail`, `MailStat`) are read/written via existing Prisma models with no schema change.
**Testing**: Jest. Unit tests for `value_pl` net-worth math (pure function), the rospos ordering helper (pure function), and the MAILSTAT-row constructor. Integration tests run the full `MidnightService.run()` against a real Postgres test database seeded with a 100-user / 200-planet fixture, asserting per-phase post-conditions, idempotency on second run (FR-003 / SC-003), advisory-lock behaviour for concurrent invocations (FR-004a), self-heal on startup (FR-001b), error-rollback for unknown errors (FR-012a), and admin-endpoint auth (FR-002). Balance regression test pins `TEAMBONU`, `MAILDAYS`, `PLTVCASH`, `PLTVDIV`, `CHGLOSER`, `MAXTEAMS`, `MAIL_CLASS_PRODRPT`. New tests under `test/game/combat/` cover the CHGLOSER PvP cash penalty (FR-022/023/024) and Droid kill scoring (FR-025/026).
**Target Platform**: Linux container (Hetzner CPX32) — Node 20, single backend process.
**Project Type**: Web service (backend-only feature; no frontend changes).
**Performance Goals**: Full midnight pass completes in under 5 seconds against a 1,000-user / 2,000-planet fixture on the dev Postgres container (SC-005). Single transaction so locking impact is one bounded window per server day.
**Constraints**: No Redis. The only `@nestjs/schedule` usage in the project is the single `@Cron('0 0 * * *')` on `MidnightService.scheduledRun()` — `@Interval` decorators remain forbidden per Constitution III. The midnight pass MUST NOT touch the in-memory `Map<shipKey, ShipState>` from the tick engine; it operates only on persistent rows. All four phases MUST run inside one transaction (FR-004); a `pg_try_advisory_lock` MUST gate entry (FR-004a). No two midnight passes for the same calendar day may produce two ledger rows (the ledger PK is the date itself). The CHGLOSER penalty path MUST short-circuit when either side is AI; the C-source distinction is preserved verbatim. The Droid kill-scoring path MUST tolerate `Droid-` victim userids that have no row in `User` without raising.
**Scale/Scope**: Production target — a few hundred active users, low-thousands of planets, low-tens-of-thousands of mail rows on the largest day. Single-process deployment.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | How this feature complies |
|-----------|---------------------------|
| **I. Fidelity** | Every phase, every constant, every skip carve-out is verified against `reference/ge-source/GEMAIN.C:1084-1335` (`gemidnighta`), `GEMAIN.C:1340-1359` (`calc_networth`/`value_pl`), `GEFUNCS.C:1087-1218` (`killem` including the `chgloser` block), `GEMAIN.H:222` (`MAIL_CLASS_PRODRPT=3`), and `GEMAIN.H:240` (`MAXTEAMS=50`). Defaults pinned verbatim from `GEMAIN.C` initialisers: `TEAMBONU=32000*100`, `MAILDAYS=7`, `PLTVCASH=201228378`, `PLTVDIV=201228378`, `CHGLOSER=100`. The `value_pl` arithmetic is preserved exactly: `(cash+tax)/(1_000_000/PLTVCASH) + Σ(item_value × item_qty / PLTVDIV)`. The KEY skip and `@`-prefix skip rules in phase 4's rospos pass match the C-source predicates (`tmpusr.userid[0] != tmpbuf2[0] && tmpusr.userid[0] != '@'`) verbatim. The empty-team sentinel `teamcode = -1` is preserved. CHGLOSER computation matches `killem`'s loser cash transfer: `transfer = floor(loser.cash * CHGLOSER / 100)`. |
| **II. Testing first class** | Unit tests for `valuePlanet(planet, items, PLTVCASH, PLTVDIV)` — pure, table-driven, including overflow into 64-bit space. Unit tests for `rankRoster(users)` — pure, including KEY skip, `@`-prefix skip, score-zero skip, and stable ordering. Unit tests for `buildProductionMailStat(planet)` — asserts the 14-element item array and exact field mapping. Integration tests run the full `MidnightService.run()` against a real test DB with a deterministic fixture and assert: every user's `score == plscore + klscore`; every `plscore` equals the sum of owned planet net-worths; production-report mail count equals owned-planet count; idempotent on second run (SC-003); orphan teamcodes reset to 0; empty teams marked removed; rospos ordering correct. Integration test for the advisory-lock gate (concurrent invocation returns immediately on cron path; HTTP returns 409). Integration test for self-heal on startup (boot with no ledger row → run executes; boot with existing row → run skipped). Integration test for `FR-012a` rollback (inject a planet error mid-phase 2; assert no rows in `MailStat` for the run, no mutated `User` rows, no `MidnightRun` row). Balance regression test enumerates every constant. Combat-side tests under `test/game/combat/` exercise CHGLOSER for both PvP extremes and confirm AI-side short-circuit, plus Droid kill scoring for all three Droid classes. |
| **III. Architecture** | The single `@Cron` decorator on `MidnightService.scheduledRun()` is the project's first usage of `@nestjs/schedule` and matches the constitution's calendar-cadence rule exactly (`@Cron('0 0 * * *')`). No `@Interval` is added or contemplated. The midnight pass operates only on persistent Postgres rows — it does not enter the `ShipStateService` map. Single-process deployment is preserved; the advisory lock makes the cron+manual+self-heal triad safe today and is forward-compatible with the multi-node note in feature 002. The admin HTTP endpoint is a NestJS controller guarded by an `AdminTokenGuard` (bearer token from env), not a separate service. Per-phase counter telemetry is emitted as a single end-of-pass log line — no metrics endpoint, no new infra. The two per-kill items live inside the existing `PlayerScoreService` listener, not the midnight service. |
| **IV. Quality** | TypeScript strict throughout. All public service methods carry JSDoc with `@see GEMAIN.C:` line references. The new Prisma model `MidnightRun` ships with a normal `prisma migrate dev --name add_midnight_run` migration committed alongside the schema change. No `prisma db push`. Constants live in `backend/src/game/midnight/midnight.constants.ts` and are referenced by name everywhere — the balance-regression test enumerates them. Docker Compose unchanged. The new `@nestjs/schedule` dependency is added to `backend/package.json` and pinned. |

**Gate result: PASS** — no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/009-midnight-job/
├── plan.md                  # This file
├── spec.md                  # Already authored
├── research.md              # Phase 0 output
├── data-model.md            # Phase 1 output — MidnightRun model + read/write
│                            # surface across User/Planet/Team/Mail/MailStat
├── quickstart.md            # Phase 1 output — manual recipe + admin endpoint
├── contracts/
│   └── admin-midnight.md    # POST /admin/midnight/run request/response/auth
└── tasks.md                 # Phase 2 output (created by /speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── app.module.ts                       # MODIFIED — import ScheduleModule.forRoot()
│   │                                        # and MidnightModule
│   ├── game/
│   │   ├── midnight/                       # NEW — feature 009
│   │   │   ├── midnight.module.ts
│   │   │   ├── midnight.constants.ts       # TEAMBONU=3_200_000, MAILDAYS=7,
│   │   │   │                                # PLTVCASH=201_228_378, PLTVDIV=201_228_378,
│   │   │   │                                # CHGLOSER=100, MAXTEAMS=50,
│   │   │   │                                # MAIL_CLASS_PRODRPT=3, MESG20=20,
│   │   │   │                                # ADVISORY_LOCK_KEY (fixed bigint)
│   │   │   ├── midnight.config.ts          # env-driven overrides:
│   │   │   │                                # MAILDAYS (1-30, default 7),
│   │   │   │                                # CHGLOSER (0-100, default 100),
│   │   │   │                                # MIDNIGHT_ADMIN_TOKEN (required)
│   │   │   ├── midnight.service.ts         # @Cron('0 0 * * *') scheduledRun();
│   │   │   │                                # OnApplicationBootstrap selfHeal();
│   │   │   │                                # public run() — advisory-lock-gated,
│   │   │   │                                # transactional, idempotent
│   │   │   ├── value-pl.ts                 # pure: valuePlanet(planet, itemValues,
│   │   │   │                                # PLTVCASH, PLTVDIV) → bigint
│   │   │   ├── rank-roster.ts              # pure: rankRoster(users) → Map<userid,rospos>
│   │   │   ├── mailstat-builder.ts         # pure: buildProductionMailStat(planet)
│   │   │   ├── midnight.repository.ts      # Prisma queries scoped to the
│   │   │   │                                # transaction client; returns per-phase
│   │   │   │                                # counters
│   │   │   ├── midnight-run.ledger.ts      # tiny helper: hasRunForToday(),
│   │   │   │                                # recordRun(date, counters)
│   │   │   ├── admin-token.guard.ts        # NestJS guard reading
│   │   │   │                                # MIDNIGHT_ADMIN_TOKEN from env
│   │   │   └── admin-midnight.controller.ts# POST /admin/midnight/run
│   │   ├── player/
│   │   │   ├── player-score.service.ts     # MODIFIED — apply CHGLOSER on PvP kill
│   │   │   │                                # (FR-022/023/024); allow score award
│   │   │   │                                # on Droid victims (FR-025/026)
│   │   │   └── player-score.repository.ts  # MODIFIED — applyCashPenalty() helper
│   │   └── ...                             # all other modules unchanged
└── prisma/
    ├── schema.prisma                       # MODIFIED — add MidnightRun model
    └── migrations/
        └── 2026MMDDHHMMSS_add_midnight_run/
            └── migration.sql               # NEW — created via prisma migrate dev
└── test/
    └── game/
        ├── midnight/
        │   ├── value-pl.spec.ts                    # pure unit
        │   ├── rank-roster.spec.ts                 # pure unit
        │   ├── mailstat-builder.spec.ts            # pure unit
        │   ├── midnight.service.spec.ts            # full pass against test DB
        │   ├── idempotency.spec.ts                 # SC-003
        │   ├── self-heal.spec.ts                   # FR-001b
        │   ├── advisory-lock.spec.ts               # FR-004a
        │   ├── transaction-rollback.spec.ts        # FR-012a
        │   ├── admin-endpoint.spec.ts              # FR-002 — auth + 409 + 200
        │   ├── balance-regression.spec.ts          # SC-006 constant pins
        │   └── perf-budget.spec.ts                 # SC-005 — 1k users / 2k planets < 5s
        └── combat/
            ├── chgloser-pvp.spec.ts                # FR-022/023/024 + SC-007
            └── droid-kill-scoring.spec.ts          # FR-025/026 + SC-008
```

**Structure Decision**: Backend-only feature in the existing single NestJS project. New `game/midnight/` module is self-contained: one service, one controller, one guard, one repository, one ledger helper, three pure helpers, one constants module, one config loader. The two combat-side modifications are surgical edits to the existing `PlayerScoreService` listener (one new branch each for the CHGLOSER penalty and Droid score award) — they live there because that is where kills resolve, not in the midnight service. One Prisma model, one migration, one new dependency (`@nestjs/schedule`). No frontend changes.

## Phase 0: Research

See [research.md](./research.md). All Technical Context unknowns resolved (no
`NEEDS CLARIFICATION` remain). Highlights:

- **Scheduling mechanism**: `@nestjs/schedule` is added as a top-level dependency for the first time. `ScheduleModule.forRoot()` is registered in `AppModule`. The `@Cron('0 0 * * *')` decorator on `MidnightService.scheduledRun()` is the project's only `@nestjs/schedule` usage; no `@Interval` is introduced (Constitution III).
- **Advisory lock key**: A fixed 64-bit integer chosen to be non-colliding with any future advisory-lock use (proposed value `0x474D6E69_67687400` = ASCII `"GMnight\0"`). Acquired via `SELECT pg_try_advisory_lock(<key>)` at the top of `run()`; released via `pg_advisory_unlock(<key>)` on every exit path including thrown errors.
- **Transactionality**: The whole pass runs inside `prisma.$transaction(async (tx) => { ... })`. The advisory-lock acquisition is the only statement that runs *before* the transaction opens (advisory locks held by a transaction auto-release on rollback, so the lock is acquired at the session level and explicitly released in a `finally`). Per-phase repository methods accept the `tx` client.
- **Self-heal on startup**: `MidnightService` implements `OnApplicationBootstrap`. On boot, it queries `MidnightRun` for today's server-local date; if absent, it calls `run()` once. Older missed days are not replayed (FR-001b explicit non-goal).
- **Server-local date keying**: `MidnightRun.runDate` is a Postgres `date` (no time component), computed from server-local midnight at the start of `run()`. The PK collision on the same date is the idempotency mechanism.
- **Phase 1 reset**: Single Prisma `updateMany` over all users where `userid != KEY`, setting the four counters to 0. `klscore` is **not** touched.
- **Phase 2 owner lookup**: Per the source, every owned planet does `qeqbtv(planet.userid)` — a per-planet user lookup. We mirror this with a streaming pass: select planets with `type = PLTYPE_PLNT AND userid <> ''`, attempt to find the owning user; if not found, skip silently (FR-012). For each owner-resolved planet we emit one `User` increment + one `MailStat` insert. `MAILSTAT.msgno` is allocated via the same `Date.now()` strategy already used by `planet-economy.service.ts:106` — uniqueness within `(userid, class, msgno)` is sufficient because msgnos increment monotonically per call inside the loop (we add a per-iteration counter to break ties).
- **Phase 3 mail purge**: `Mail.stamp` is the existing seconds-epoch field. Threshold = `Math.floor(Date.now() / 1000) - MAILDAYS * 86_400`. Two `deleteMany` calls: one by `stamp < threshold`, one by `userid LIKE '*%'` (Prisma `startsWith: '*'`). The C source iterates one-by-one and deletes inline; in Postgres bulk deletes are equivalent and faster.
- **Phase 4 team & rospos**: Phase 4 is the only phase that requires two passes over `User`. Pass 1 zeros all team rows (`updateMany teamcount=0, teamscore=0`), then walks users with `teamcode > 0` to either reset the orphan teamcode to 0 or increment the team's count. Pass 2 sets `score = plscore + klscore` for every non-KEY user, then folds **both** `TEAMBONU` and `(user.score / max(teamcount, 1))` into the team score **once per member** — i.e. inside the per-user iteration, not as a flat per-team bonus. This matches `GEMAIN.C:1275` (`teamtab[i].teamscore += teambonus` is inside the per-user `do { ... } while (qnxbtv())` loop), so a team with N members ends with `teamscore = N × TEAMBONU + Σ(member.score / teamcount)`. Empty teams are then marked removed (`teamcode = -1`). Finally, the rospos assignment selects all users where `score > 0 AND userid != KEY AND userid NOT LIKE '@%'`, orders by score descending, and writes `rospos = i+1` in a single `UPDATE ... FROM (SELECT userid, ROW_NUMBER() OVER (ORDER BY score DESC) AS r ...)` raw query for performance. Users that don't qualify keep their existing rospos (the C source only assigns to qualifiers); to maintain idempotency we reset `rospos = 0` for non-qualifiers in the same query.
- **CHGLOSER cash penalty**: Implemented inside `PlayerScoreService.handleShipDestroyed`. Conditions: both attacker userid and victim userid resolve to non-AI players (neither matches `^(?:Cybrg-|Droid-)/`). On match, the listener calls a new `playerScoreRepository.applyCashPenalty(attackerUserid, victimUserid, percent)` which executes `cash transfer = floor(loser.cash * CHGLOSER / 100)`, capped at `loser.cash`, atomically (single transaction at the repo level). The percent is read once at module init from `loadMidnightConfig().chgLoserPercent`. AI sides short-circuit before calling.
- **Droid kill scoring**: The 006b `transferKillScore(attacker, victim, score, isAiVictim=true)` already handles the "victim has no row" case (the AI-victim branch updates only the attacker). The remaining work is to ensure `Droid-` victims hit this path with the correct `scoreAwarded` value. `combat-tick.service.ts` already populates `scoreAwarded` from `shipClass.points` on the victim's class — no change needed there. The change is in `PlayerScoreService`: today, victims with userid prefix `Droid-` would still receive the AI-victim score path (they match `AI_USERID_RE`); the test pins this contract so a future refactor cannot regress it. **No production code change** is required for FR-025/026 beyond a regression test — but we add an explicit comment + named constant in `player-score.service.ts` documenting the contract.
- **Admin endpoint auth**: Bearer token compared in constant time against `MIDNIGHT_ADMIN_TOKEN` env var. Missing or empty env → 503 (mis-configured). Wrong/absent header → 401. Correct header but advisory lock unavailable → 409. Correct header + lock acquired → 202 Accepted with the per-phase counters in the response body.
- **Per-phase counters & log line**: The end-of-pass log is one structured JSON line: `{"event":"midnight.complete","date":"2026-05-05","ms":1234,"users":N,"planets":M,"mailReports":M,"mailDeleted":K,"teamsReconciled":T,"teamsRemoved":R}`. Counters are also returned by the admin endpoint. No metrics endpoint (per spec clarification).
- **Idempotency proof**: Phases 1, 2 (mutations to User), 3 (deletes), and 4 are all driven by the *current* state of the world, not the previous run. Running the pass twice resets accumulators and recomputes — the only divergence is duplicate `MailStat` rows from phase 2 (FR-003 explicit accept). The `MidnightRun` PK collision on the date prevents the cron path from running twice; the manual endpoint returns 409 if today's row already exists.

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](./data-model.md). One new model:

```
model MidnightRun {
  /// Server-local calendar date — natural primary key, ensures exactly one row per day
  runDate    DateTime @id @db.Date
  /// Wall-clock completion timestamp for the pass
  completedAt DateTime
  /// Phase counters captured at end-of-pass
  usersUpdated      Int
  planetsProcessed  Int
  mailReportsCreated Int
  mailDeleted       Int
  teamsReconciled   Int
  teamsRemoved      Int
  /// Total wall-clock duration in milliseconds
  durationMs        Int
}
```

Documents:
- the read/write surface against `User` (writes `planets`, `score`, `plscore`,
  `population`, `teamcode`, `rospos`, `cash`; reads `klscore` only),
- the read surface against `Planet` (no writes),
- the write surface against `Team` (`teamcount`, `teamscore`, `teamcode`),
- the write surface against `Mail` (deletes only) and `MailStat` (inserts only),
- the read surface against `ShipClass` (`points` for Droid kill scoring),
- the new `MidnightRun` ledger,
- exactly which fields the CHGLOSER repo helper mutates on `User.cash`.

### Contracts

See [contracts/admin-midnight.md](./contracts/admin-midnight.md). Defines:

- `POST /admin/midnight/run`
  - **Auth**: `Authorization: Bearer <MIDNIGHT_ADMIN_TOKEN>` (required)
  - **Responses**:
    - `202 Accepted` — `{ status: "completed", counters: {...}, durationMs }`
    - `401 Unauthorized` — missing/invalid token
    - `409 Conflict` — advisory lock not acquired (concurrent run in flight)
    - `503 Service Unavailable` — `MIDNIGHT_ADMIN_TOKEN` not configured
  - **Idempotency**: a successful response writes today's `MidnightRun` row;
    subsequent calls on the same day still execute (the operator may want
    to re-run for recovery) but produce duplicate `MailStat` rows per
    FR-022 — the response body's `counters.mailReportsCreated` reflects
    the second batch.
  - **Side effects**: identical to the cron path.

No WebSocket events emitted — this is a backend maintenance concern and
the spec explicitly excludes player-facing surfaces.

### Quickstart

See [quickstart.md](./quickstart.md). Manual verification recipe: seed
the dev DB with a small fixture, set `MIDNIGHT_ADMIN_TOKEN=devtoken`,
boot the backend, `curl -H 'Authorization: Bearer devtoken' -X POST
http://localhost:3000/admin/midnight/run`, observe the JSON response,
verify `User.score`/`plscore`/`rospos` updated, verify one `MailStat` row
per owned planet, verify mail older than 7 days gone, verify `MidnightRun`
table has today's row. Includes env-var documentation per FR-028.

### Constitution Re-check (post-design)

Still PASS. The new `midnight/` module is one NestJS provider, one
controller, one guard, one repository, one ledger helper, three pure
helpers, one constants module, one config loader. Combat-side change is
two surgical edits in `PlayerScoreService` + one new repo helper.
One new Prisma model, one new migration. One new dependency
(`@nestjs/schedule`) — its first project use, scoped to the single
`@Cron` decorator. The advisory lock keeps the cron + manual + self-heal
triad safe under single-process deployment and is forward-compatible
with the multi-node deferral noted in feature 002. No `@Interval`. No
Redis. No frontend change.

### Agent Context Update

The `CLAUDE.md` reference between the `<!-- SPECKIT START -->` and
`<!-- SPECKIT END -->` markers will be updated to point at this plan
(`specs/009-midnight-job/plan.md`) by the post-plan editor step.

## Complexity Tracking

> No violations — table omitted.
