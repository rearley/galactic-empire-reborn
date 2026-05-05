# Feature Specification: 009 — Midnight Maintenance Job

**Feature Branch**: `009-midnight-job`
**Created**: 2026-05-05
**Status**: Draft
**Input**: User description: nightly maintenance routine — score recalculation, planet
production reports, mail purge, plus deferred per-kill scoring items (chgloser cash
penalty, Droid kill scoring) from features 006b/007/008.

## Overview

Once per server day at midnight server-local time, the game performs the housekeeping
pass that keeps the persistent world coherent: every player's score is recomputed from
their planet holdings and recent kills, the day's planet production is summarised and
mailed to each owner, expired in-game mail is purged, team rosters are reconciled, and
the global player roster is re-ranked. Without this pass, leaderboards rot, planet
ownership has no economic feedback, and old mail accumulates indefinitely.

This feature also closes two scoring-related items deferred from earlier features:
the `CHGLOSER` per-kill cash penalty (a percentage of the loser's cash transferred to
the killer when one player kills another) from 006b combat, and Droid kill scoring
from 008. Both attach to existing per-kill mechanics; bundling them here keeps all
"scoring is now real" work in one feature.

Source references:
- `reference/ge-source/GEMAIN.C:1066–1335` — `gemidnighta()`, the four-phase routine
- `reference/ge-source/GEMAIN.C:1338–1359` — `calc_networth()` / `value_pl()`
- `reference/ge-source/GEMAIN.H:222` — `MAIL_CLASS_PRODRPT=3`
- `reference/ge-source/GEMAIN.H:240` — `MAXTEAMS=50`
- `reference/ge-source/GEMAIN.C:478,497,593,596,605` — defaults: `TEAMBONU=32000*100`,
  `MAILDAYS=7`, `PLTVCASH=201228378`, `PLTVDIV=201228378`, `CHGLOSER=100`
- `reference/ge-source/GEFUNCS.C:1087–1218` — `killem()` including `chgloser` block

## Clarifications

### Session 2026-05-05

- Q: If the server is offline at 00:00 and restarts later, how should the missed midnight pass be handled? → A: Self-heal — on startup, check a `MidnightRun` ledger; run once if today's pass has not yet run.
- Q: How is the operator-only manual trigger (FR-002) exposed? → A: Protected NestJS HTTP endpoint (`POST /admin/midnight/run`) guarded by an admin bearer token from env.
- Q: How are concurrent midnight invocations (cron + manual, or cron + self-heal) prevented? → A: Postgres advisory lock at start of pass; second invocation returns immediately (cron logs skip; HTTP returns 409).
- Q: How are unexpected per-planet errors during phase 2 handled (vs. the known-orphan skip carve-outs in FR-011/FR-012)? → A: Abort the whole transaction; let the error surface and rely on idempotent rerun.
- Q: What level of observability does the midnight pass need? → A: Per-phase counters (users updated, planets processed, mail created/deleted, teams reconciled) in the end-of-pass log line; no metrics endpoint.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Daily score recalculation and roster ranking (Priority: P1)

At midnight, every active player has their score recomputed as the sum of (a) the
total net-worth value of every planet they own and (b) their accumulated kill score.
Players are then re-ranked from highest score to lowest and assigned a roster
position number that the rest of the game uses for "rank" displays and bonus
calculations.

**Why this priority**: Without this, planet ownership delivers no scoring reward
and the rank shown on every player profile is stale. This is the single most
visible effect of the midnight job and is the foundation that the other stories
build on (production mail, team scoring, etc. all depend on the score numbers
being correct first).

**Independent Test**: Seed a test database with a handful of users, planets, and
known klscore values; trigger the midnight pass; assert that each user's
`score = plscore + klscore`, that `plscore` equals the sum of their planet
net-worth values, and that `rospos` numbers descend from 1 (top scorer) without
gaps and skip the secret KEY record and `@`-prefixed AI users.

**Acceptance Scenarios**:

1. **Given** a player owns three planets totalling net-worth 50,000 with klscore
   12,000, **When** the midnight job runs, **Then** their `plscore` is 50,000,
   `score` is 62,000, `klscore` is unchanged at 12,000, and `planets` is 3.
2. **Given** five real players have post-recalc scores 100, 80, 60, 40, 20 and
   one AI user (`@Cybrg-1`) has score 200, **When** the roster ranking phase
   runs, **Then** `rospos` is 1,2,3,4,5 for the real players in score order and
   the AI user receives no rospos assignment.
3. **Given** a player has zero score after recalc, **When** the ranking phase
   runs, **Then** they receive no rospos value.
4. **Given** the midnight job has just completed, **When** it is invoked again
   on the same day's data, **Then** the resulting database state is identical to
   the first run (idempotency).

---

### User Story 2 — Planet production report mail (Priority: P2)

For every planet currently owned by a player, the midnight job produces a
mail-style status record summarising the planet's name, sector, cash, debt, tax
rate, and per-item inventory quantities, then delivers it to the owner's in-game
mailbox. When the player next logs in, they see one production report per owned
planet waiting for them.

**Why this priority**: This is the daily feedback loop that makes planet
ownership feel alive — players wake up, log in, and see what their empire
produced overnight. Without it, planet ownership is silent. P2 because the score
numbers (US1) are visible in real time via existing commands, but production
reports are the only way players see their inventory deltas without manually
visiting each planet.

**Independent Test**: Seed a player owning two planets with known inventory;
run the midnight job; query the mail store for that player and assert exactly
two production-report records exist, each carrying the correct planet name,
sector coordinates, cash/debt/tax, and 14-element item-quantity array.

**Acceptance Scenarios**:

1. **Given** a player owns one planet at sector (5,7) with 100,000 cash and
   known item quantities, **When** the midnight job runs, **Then** a single
   production-report mail row is created addressed to that player containing
   that planet's name, sector, cash, debt, tax, and item quantities.
2. **Given** an unowned planet (no userid set), **When** the midnight job runs,
   **Then** no production report is generated for it.
3. **Given** a planet owned by a userid that no longer exists in the user
   table, **When** the midnight job runs, **Then** the planet is skipped
   silently and no mail is generated.
4. **Given** ten players each owning multiple planets, **When** the midnight
   job runs, **Then** each player receives exactly one production report per
   owned planet — no duplicates and no misses.

---

### User Story 3 — Mail purge (Priority: P2)

Mail older than a configured retention window (default seven days) is deleted
from the in-game mail store. Mail addressed to non-live players (recipient
identifier starting with `*`) is also deleted regardless of age. This keeps the
mail store bounded and prevents abandoned-account mail from growing forever.

**Why this priority**: P2 because it is essential for long-term operation but
not user-visible day-to-day. Without it the database grows unbounded; with it,
players see expected behaviour ("old mail goes away after a week").

**Independent Test**: Seed mail rows with varying timestamps spanning two
weeks plus a few rows addressed to `*deletedplayer`; run the midnight job;
assert that mail older than the retention window is gone, mail addressed to
`*` recipients is gone, and recent mail to live recipients remains.

**Acceptance Scenarios**:

1. **Given** a mail row stamped 8 days ago, **When** the midnight job runs,
   **Then** the row is deleted.
2. **Given** a mail row stamped 6 days ago, **When** the midnight job runs,
   **Then** the row remains.
3. **Given** a mail row addressed to `*ghost`, **When** the midnight job runs,
   **Then** the row is deleted regardless of age.
4. **Given** the configured retention window is changed to 14 days, **When**
   the midnight job runs, **Then** mail aged 8–13 days is preserved.

---

### User Story 4 — Team score reconciliation (Priority: P3)

For every team that has at least one member, the midnight job computes a team
score from a fixed bonus plus the average member score, and removes any team
whose membership has dropped to zero. Players whose `teamcode` references a
team that no longer exists have their teamcode cleared.

**Why this priority**: P3 because the team system is a secondary social layer.
Score recalculation (US1) and production mail (US2) are visible to every solo
player; team scoring is visible only to players who joined a team. Including
it here is cheap because the same midnight pass is already walking the user
table.

**Independent Test**: Seed three users on team 5 with known scores, two on
team 9, and one orphaned reference to team 99; run the midnight job; assert
the team-5 score equals `TEAMBONU + (sum_of_member_scores / 3)`, team-9
similarly, no team-99 row exists, and the orphaned member's teamcode is now 0.

**Acceptance Scenarios**:

1. **Given** team 5 has three members with scores 90, 60, 30, **When** the
   midnight job runs, **Then** team 5's `teamscore` is `TEAMBONU + (180 / 3) =
   TEAMBONU + 60` and `teamcount` is 3.
2. **Given** team 12 has one member who left (no users reference teamcode 12),
   **When** the midnight job runs, **Then** team 12 is marked removed.
3. **Given** a user's teamcode references team 99 which has no team-table
   entry, **When** the midnight job runs, **Then** that user's teamcode is
   reset to 0.

---

### User Story 5 — Player-vs-player cash penalty on kill (Priority: P3)

When one human player destroys another human player's ship, the killer
receives a percentage of the loser's cash (`CHGLOSER`, default 100% — i.e. the
loser is bankrupted). The penalty applies only to player-vs-player kills, not
to AI kills (Cybertron, Droid, or Murdonian Transport).

**Why this priority**: P3 because it is a per-kill mechanic deferred from
006b — most kills in early gameplay are PvE so the penalty rarely fires.
Bundling it here keeps all "scoring becomes real" work together.

**Independent Test**: Stage a kill resolution between two human-player ships
where the loser holds 10,000 cash; resolve the kill; assert the loser's cash
is reduced by `CHGLOSER%` and the killer's cash is increased by the same
amount. Repeat with an AI killer or AI victim and assert no transfer occurs.

**Acceptance Scenarios**:

1. **Given** player A kills player B who has 10,000 cash and `CHGLOSER=100`,
   **When** the kill resolves, **Then** player B's cash is 0 and player A's
   cash increased by 10,000.
2. **Given** `CHGLOSER=25` and player B has 10,000 cash, **When** player A
   kills player B, **Then** B loses 2,500 and A gains 2,500.
3. **Given** player A kills a Cybertron, **When** the kill resolves, **Then**
   no cash penalty is applied (gold transfer per 007 still runs).
4. **Given** a Cybertron kills player B, **When** the kill resolves, **Then**
   no cash penalty is applied to player B.

---

### User Story 6 — Droid kill scoring (Priority: P3)

When a player destroys a Droid (any class — Murdonian Transport included), the
player receives the Droid's class-defined point value as score (added to both
`score` and `klscore`), the same way a Cybertron kill awards score. There is
no kill-score deduction from the Droid (Droids are ephemeral and have no
persisted score).

**Why this priority**: P3 because Droid kill scoring was deferred from 008,
and Droids are PvE filler — they exist to give new players something to shoot.
Without scoring, killing them is unrewarded; with it, they become viable
score-grinding targets and the on-ramp for new players works.

**Independent Test**: Stage a kill resolution where a player destroys a Droid
of a known ship class with a known point value; assert the player's `score`
and `klscore` increased by exactly that point value and no deduction was
applied to the Droid (which has no persisted user record).

**Acceptance Scenarios**:

1. **Given** a Murdonian Transport (class 11) is worth 500 points, **When**
   a player destroys it, **Then** that player's `score` and `klscore` each
   increase by 500.
2. **Given** an ephemeral Droid (no persisted user row), **When** it is
   destroyed by a player, **Then** the kill-score path completes without
   error and no row-not-found exception is raised by the user-update step.

---

### Edge Cases

- The midnight job runs while players are actively connected — in-memory
  ship state is not affected by the user-table mutations because the user
  fields touched (`score`, `plscore`, `klscore`, `planets`, `population`,
  `rospos`, `teamcode`) are not held in the ship-state map.
- A planet owner record is missing (planet references a deleted user) —
  planet is skipped silently for both the net-worth and mail steps.
- A planet's net-worth calculation overflows the integer range — values are
  computed in 64-bit space (matches `unsigned long` in source) and clamped
  if necessary for the persisted column.
- The midnight job fails partway through (e.g. database disconnect) — the
  job runs inside a single transaction so partial state is rolled back; the
  next invocation is idempotent so re-running succeeds.
- `MAXTEAMS` is exceeded by the seed data — the count is hard-capped at 50
  per source; teams beyond the cap are not scored.
- Two midnight invocations fire close together (clock anomaly, manual
  re-trigger) — second invocation produces identical end state and produces
  a second batch of production-report mail (FR-003).
- Mail purge runs against a database with no mail — completes silently with
  zero deletions.
- A team has exactly one member whose score is zero — team score = `TEAMBONU
  + 0`, team is preserved (not removed).
- A planet's owner field is set to the secret key sentinel (`KEY`) — skipped
  for ranking the same way the user iteration skips `KEY` and `@`-prefixed
  users.

## Requirements *(mandatory)*

### Functional Requirements

**Scheduling & invocation**

- **FR-001**: System MUST run the full midnight pass exactly once per server
  day at 00:00 server-local time, scheduled via the existing scheduling
  mechanism approved in CLAUDE.md (`@nestjs/schedule @Cron`).
- **FR-001a**: System MUST persist a `MidnightRun` ledger row keyed by
  server-local calendar date for every successful pass, recording at
  minimum the run date and completion timestamp.
- **FR-001b**: On application startup, the system MUST consult the
  `MidnightRun` ledger and, if no row exists for today's server-local
  date, run the midnight pass once immediately (self-heal). Only the
  current day is caught up — older missed days are not replayed.
- **FR-002**: System MUST expose a manual trigger (operator-only) as a
  protected NestJS HTTP endpoint (`POST /admin/midnight/run`) guarded by
  an admin bearer token sourced from environment configuration. The
  endpoint MUST reject requests without a valid token (HTTP 401) and
  MUST be invocable for testing, recovery, or initial rollout. The
  manual trigger MUST also write a ledger row (or refresh today's row)
  on success so subsequent self-heal logic does not re-run.
- **FR-003**: The midnight pass MUST be idempotent — running it twice in
  succession against the same starting state MUST produce equivalent end
  state on the user, planet, mail, and team data (the only legitimate
  difference is duplicate production-report mail rows from the second run).
- **FR-004**: The midnight pass MUST run inside a single database
  transaction so partial failure rolls back cleanly.
- **FR-004a**: The midnight pass MUST acquire a Postgres advisory lock
  (fixed key dedicated to this job) at the start of the pass and release
  it on completion. If the lock cannot be acquired, the cron path MUST
  log a skip and exit cleanly, and the manual HTTP endpoint MUST respond
  HTTP 409 Conflict. This prevents concurrent execution from cron,
  manual trigger, and startup self-heal.
- **FR-005**: The midnight pass MUST log a start marker, one marker per
  phase (matching the four C-source phases), and an end marker. The
  end-of-pass marker MUST include per-phase counters: users updated,
  planets processed, production-report mail rows created, mail rows
  deleted by purge, and teams reconciled (with team-removed count). No
  external metrics endpoint is required for this feature.

**Phase 1 — reset accumulators**

- **FR-006**: For every user (excluding the secret KEY record), the midnight
  pass MUST zero `planets`, `score`, `plscore`, and `population` before
  recomputation.
- **FR-007**: The midnight pass MUST NOT modify `klscore` during phase 1
  (klscore accumulates from kills and is preserved across midnight).

**Phase 2 — planet pass**

- **FR-008**: For every planet of type "planet" (not stars/black holes/etc.)
  that has a non-empty owner userid, the midnight pass MUST locate the
  owning user, increment that user's `planets` counter by 1, and add the
  planet's population (defined as the planet's `MEN` item quantity divided
  by 10,000) to the user's `population`.
- **FR-009**: For every owned planet, the midnight pass MUST compute the
  planet's net-worth value as `(cash + tax) / (1,000,000 / PLTVCASH)` plus
  the sum over all 14 items of `(item_value × item_qty / PLTVDIV)`, and add
  that value to the owner's `plscore`.
- **FR-010**: For every owned planet, the midnight pass MUST create a
  production-report mail-status record addressed to the owner containing:
  planet name, sector x, sector y, cash, debt, tax, and a 14-element
  array of per-item quantities. The class identifier MUST be
  `MAIL_CLASS_PRODRPT` (value 3) and the message-template identifier MUST
  match the source's `MESG20`.
- **FR-011**: Planets with no owner (empty userid) MUST be skipped without
  generating a report.
- **FR-012**: Planets whose owner userid does not match a user-table row
  MUST be skipped without generating a report and without raising an error.
- **FR-012a**: Any per-planet error outside the known-skip carve-outs in
  FR-011/FR-012 (e.g. malformed item array, unexpected null, DB error)
  MUST propagate and abort the surrounding transaction so the entire
  pass rolls back. The next invocation (self-heal on restart, next
  cron, or manual trigger) will retry idempotently.

**Phase 3 — mail purge**

- **FR-013**: Mail rows whose recorded date stamp is older than today minus
  the configured retention window (`MAILDAYS`, default 7) MUST be deleted.
- **FR-014**: Mail rows addressed to recipients whose identifier begins with
  `*` (non-live player marker) MUST be deleted regardless of age.
- **FR-015**: The retention window MUST be configurable via environment
  variable (default 7 days, range 1–30).

**Phase 4 — team & score reconciliation**

- **FR-016**: At the start of phase 4, every team's `teamcount` and
  `teamscore` MUST be zeroed.
- **FR-017**: For every user (excluding KEY) with `teamcode > 0`, the
  midnight pass MUST verify that team exists in the team table; if it
  does, increment the team's `teamcount`; if it does not, reset the user's
  `teamcode` to 0.
- **FR-018**: For every user (excluding KEY), the midnight pass MUST set
  `score = plscore + klscore`.
- **FR-019**: For every user with a valid teamcode, the midnight pass MUST
  add `TEAMBONU` (default 32,000 × 100 = 3,200,000) to their team's
  `teamscore` and then add `(user.score / max(teamcount, 1))` to that
  same team's `teamscore`. Both additions happen **once per member**
  inside the user-iteration loop, so a team with N members accumulates
  `teamscore = N × TEAMBONU + Σ(member.score / teamcount)`. This
  matches `GEMAIN.C:1252-1291` (`teamtab[i].teamscore += teambonus`
  and `teamtab[i].teamscore += scr` are both inside the per-user
  `do { ... } while (qnxbtv())` loop, not after it).
- **FR-020**: Teams with `teamcount == 0` after the count phase MUST be
  marked removed (the source sets `teamcode = -1` as the sentinel).
- **FR-021**: After phase 4, every user (excluding KEY and any user whose
  userid begins with `@`) with `score > 0` MUST be assigned a roster
  position (`rospos`) starting at 1 for the highest score and incrementing
  by 1 down the score-descending list. Users with `score == 0` MUST NOT
  receive a rospos assignment. Non-qualifying users (score == 0, KEY, or
  `@`-prefixed) MUST have rospos reset to 0 to maintain idempotency
  (FR-003).

**Per-kill scoring (deferred from 006b/007/008)**

- **FR-022**: When a player kills another human player and `CHGLOSER > 0`,
  the loser's cash MUST be reduced by `(loser.cash / 100) × CHGLOSER`,
  capped at the loser's available cash, and the same amount MUST be
  credited to the killer's cash.
- **FR-023**: The CHGLOSER cash penalty MUST NOT apply when either side is
  AI (Cybertron, Droid, or Murdonian Transport).
- **FR-024**: `CHGLOSER` MUST be configurable via environment variable
  (default 100, range 0–100).
- **FR-025**: When a player kills a Droid (any class, including Murdonian
  Transport), the player's `score` and `klscore` MUST each increase by the
  Droid ship class's `points` value (resolved via the existing ShipClass
  cache used by 006b's score-transfer path).
- **FR-026**: Droid kill scoring MUST tolerate the absence of a persisted
  user row for the Droid (Droids are ephemeral) without raising an error.

**Configuration**

- **FR-027**: All midnight constants (`TEAMBONU`, `MAILDAYS`, `PLTVCASH`,
  `PLTVDIV`, `CHGLOSER`, `MAXTEAMS`, `MAIL_CLASS_PRODRPT`) MUST be
  preserved verbatim from `GEMAIN.H` source values, with environment
  overrides only where the source itself read from `numopt`/`lngopt`.
- **FR-028**: Operator-facing configuration overrides MUST be documented
  in the feature's quickstart so deployers can tune retention and the
  cash-penalty percentage without code changes.

### Key Entities *(include if feature involves data)*

- **User**: existing entity from feature 001. Midnight job mutates
  `planets`, `score`, `plscore`, `population`, `teamcode`, `rospos`, and
  `cash` fields. Does NOT touch `klscore` (read only).
- **Planet**: existing entity from feature 001/005. Midnight job reads
  `userid`, `cash`, `tax`, `debt`, `xsect`, `ysect`, `name`, and `items[]`
  to compute net-worth and build production reports. Not mutated.
- **Team**: existing entity from feature 001. Midnight job overwrites
  `teamcount` and `teamscore`, marks empty teams removed.
- **MidnightRun**: new ledger entity introduced by this feature. One row
  per successful midnight pass keyed by server-local calendar date, used
  by the startup self-heal check to avoid duplicate runs on the same day.
- **Mail / MailStat**: existing entities from feature 001. Midnight job
  creates one MailStat row per owned planet with `class =
  MAIL_CLASS_PRODRPT`, and deletes mail older than `MAILDAYS` plus mail
  addressed to `*`-prefixed recipients.
- **ShipClass**: existing entity from feature 001. Midnight job reads
  `points` for Droid kill scoring (via the existing cache used by 006b).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a midnight pass against a seeded fixture of 100 users
  and 200 owned planets, every user's `score` equals `plscore + klscore`
  and every `plscore` equals the sum of their planet net-worth values
  computed by the canonical formula — with zero discrepancies.
- **SC-002**: After a midnight pass, the count of production-report mail
  rows created equals the count of owned planets in the fixture, and
  each mail row's `userid` matches the owning user of one distinct planet.
- **SC-003**: Running the midnight pass twice against the same starting
  fixture produces identical end state on user, planet, and team data
  (production-report mail row counts double — that is the only allowed
  difference).
- **SC-004**: After mail purge against a fixture of 1,000 mail rows aged
  uniformly across 14 days, exactly the rows older than `MAILDAYS` are
  deleted and exactly the rows newer remain — zero false positives, zero
  false negatives.
- **SC-005**: A full midnight pass against a fixture of 1,000 users and
  2,000 planets completes in under 5 seconds end-to-end on the developer
  Postgres container.
- **SC-006**: Every game-balance constant consumed by the midnight pass
  (`TEAMBONU`, `MAILDAYS`, `PLTVCASH`, `PLTVDIV`, `CHGLOSER`,
  `MAIL_CLASS_PRODRPT`, `MAXTEAMS`) is pinned by a balance-regression
  test that fails if the value is changed.
- **SC-007**: After a player-vs-player kill with `CHGLOSER=100`, the
  loser's cash is exactly 0 and the killer's cash is exactly the
  pre-kill loser cash plus the killer's pre-kill cash — verified for
  both extremes (loser cash 0 and loser cash at the BigInt-safe upper
  bound used by the schema).
- **SC-008**: After a player kills a Droid of a class with
  `points = N`, the player's `score` increased by exactly N and
  `klscore` increased by exactly N — verified for all three Droid
  classes (Murdonian Transport, Vakory, Scow).
- **SC-009**: The midnight job runs without raising any unhandled
  exception across 7 consecutive simulated days against a fixture that
  includes deleted users, orphan teamcodes, and planets with empty owner
  fields.

## Assumptions

- The scheduling mechanism is `@nestjs/schedule @Cron` as already
  approved in CLAUDE.md — no new scheduling library is introduced.
- "Server-local time" means the server's wall-clock time. No multi-zone
  player scheduling is in scope.
- `klscore` is **not** reset by the midnight pass — it accumulates from
  kills and only decreases via the kill-score-transfer path implemented
  in 006b. This matches the C source (`gemidnighta()` zeros `score`,
  `plscore`, `population`, but not `klscore`); the user prompt's
  shorthand "klscore reset" is interpreted as "score is recomputed from
  klscore + plscore" rather than a literal reset.
- AI users (Cybertron / Droid spawn rows) have userid prefixed with `@`
  as established in 007/008 and are skipped from rospos ranking.
- The CHGLOSER per-kill mechanic is implemented inside the existing
  `runKillResolution` path in 006b's `CombatTickService`, not inside the
  midnight cron — the midnight feature is the natural home only because
  it is a "scoring" item deferred from 006b. The same applies to Droid
  kill scoring (lives in the existing `PlayerScoreService` listener
  added in 006b, extended to recognise Droid victims).
- Mail retention defaults to 7 days per the C source default
  (`MAILDAYS=7`) — overridable via env.
- Production report content matches the C source's MAILSTAT struct
  fields literally: name, sector x/y, cash, debt, tax, item quantities.
  Free-form English message text (the `MESG20` template) is rendered at
  read time, not stored — only the structured data fields are persisted
  by the midnight job, matching the existing MailStat entity from 001.
- The midnight job runs single-process in production today. Even so, a
  Postgres advisory lock is used (FR-004a) to defend against the
  cron/manual/self-heal concurrency window; the same lock is forward-
  compatible with the multi-node deferral noted in feature 002.
- No frontend changes — the existing `report` / mail commands (when
  implemented in feature 011) will surface the new mail rows. This
  feature does not depend on or block any UI work.
- Universe ships and in-memory ship-state are not touched by the
  midnight job — the only fields mutated live in the user, planet,
  team, and mail tables.

## Out of Scope

- Planet attack and revolt mechanics (deferred to feature 013).
- The `cmd_send` player mail command (deferred to feature 011).
- Any new player-facing commands.
- Frontend / UI changes (the eventual mail-display UI is part of the
  frontend feature).
- Multi-node leader election for the cron firing (the single-process Postgres advisory lock from FR-004a is in scope; cross-node leader election is not).
- Scoring constants beyond the verbatim port (no rebalance work).
