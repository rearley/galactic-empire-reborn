# Research: Team Management

**Feature**: 018-team-management
**Date**: 2026-05-08

All NEEDS CLARIFICATION items from the plan's Technical Context were resolved
either by the spec's clarifications session (2026-05-08) or by the decisions
recorded below.

## D1 — `teamcode` allocation under concurrency

**Decision**: Allocate the next `teamcode` inside a Prisma transaction at the
default isolation level (`READ COMMITTED`), using `MAX(teamcode) + 1` as the
seed and relying on a **`UNIQUE` index on `LOWER(teamname)`** (new migration)
plus the existing primary key on `teamcode` to detect collisions. On unique-
constraint violation, the transaction re-runs (bounded retry, max 3 attempts).
Start `teamcode` at `1` so the existing midnight-reconciliation filter
`teamcode > 0n` (`midnight.repository.ts:239`) treats `0` as "no team"
unchanged.

**Rationale**: A single Postgres unique index is the cheapest cross-process
guarantee against duplicate names — the spec's edge case (FR-010, "concurrent
creation") collapses to "the loser of the unique-violation race retries with a
freshly-fetched MAX". No advisory lock or `SERIALIZABLE` isolation needed: the
team-creation path is rare (single-digit per-day) and a retry loop is simpler
than tuning isolation.

**Alternatives considered**:
- *Postgres advisory lock*: works but introduces a lock-name convention to
  maintain across services for one cold-path command — overkill.
- *`SERIALIZABLE` transaction*: would force every concurrent create to retry on
  any team-row read elsewhere; broad blast radius for a narrow problem.
- *Stored sequence (`Team.teamcode` from a Postgres sequence)*: would require
  a schema change replacing the existing `BigInt @id` with a generated default,
  invalidating already-seeded teams. Rejected for migration cost.

## D2 — `tea list` cap: 20 vs `MAXTEAMS=50`

**Decision**: Display cap = 20 per spec FR-021. The original game's
`MAXTEAMS=50` (`GEMAIN.H:240`) is the *storage* cap on the `teamtab[]` array.
The spec's "preserve fidelity with the original game's team-table size limit"
phrasing in FR-021 is loose — the original `cmd_team list` in `GECMDS.C:5395+`
walks all 50 entries and prints those with `teamscore >= highscore` until it
runs out. We are choosing 20 as the *display* cap, which is what the spec
clarification produced.

**Rationale**: 20 fits a single 24-row terminal screen with a header and
footer. Storage limit is irrelevant to a Postgres-backed implementation — there
is no fixed-size array, but capping output keeps the leaderboard scannable.

**Alternatives considered**:
- *Show all teams (no cap)*: rejected because the original game UI assumed a
  scrollable terminal; a single screen is the design target (spec SC-003).
- *Cap at MAXTEAMS=50*: rejected — the spec clarification produced 20.

## D3 — Plaintext password storage

**Decision**: Store `Team.password` as plaintext (clarification 2026-05-08, Q2).
Existing column `Team.password` is already typed as `String`; no migration.

**Rationale**: Team passwords are *join codes*, not account credentials. Spec
clarification documents the trade-off explicitly. Hashing would block the
documented future feature "show team password to current members" without
delivering meaningful security against a database-read attacker — the BBS-era
threat model is "stop strangers from walking in", not "resist offline cracking".

**Alternatives considered**:
- *bcrypt*: meaningful only if the password also gates account access; for a
  shared join code shared verbally over chat, hashing is theatre.

## D4 — Multi-word name parser

**Decision**: For both `tea create <args>` and `tea <args>` (join), tokenise on
whitespace, take the **last token** as the password, and join all preceding
tokens with single spaces as the team name. Trim leading/trailing whitespace
on the resulting name before validation. For join, when only one token follows
`tea`, route to the existing show-current-team handler — NOT a join attempt.

**Rationale**: Clarification 2026-05-08, Q1 + spec FR-011b / FR-016a. Only the
final token is the password, so passwords cannot contain spaces (intentional
trade-off). A single-token form has no password and is therefore not a join.

**Alternatives considered**:
- *Quoted-string name*: `tea create "Galactic Raiders" s3cret` — rejected for
  added input ceremony in a terminal-game context.
- *Hyphen-only names*: rejected — players historically use multi-word team
  names ("The Federation"), and hyphenation forces an unfamiliar convention.

## D5 — Roster team-column lookup batching

**Decision**: After `findMany` on `User`, collect distinct non-zero `teamcode`s
and run **one** `team.findMany({ where: { teamcode: { in: codes } } })` to
build a `Map<teamcode, teamname>`. Render each row from this map; rows with
`teamcode = 0`, `null`, or a code missing from the map render `---`.

**Rationale**: Avoids N+1 queries on a hot read command. The fallback to `---`
when a teamcode references a deleted team (edge case in spec line 100) keeps
roster rendering crash-free without a JOIN.

**Alternatives considered**:
- *Prisma `include`/`select` of relation*: there is no FK relation between
  `User.teamcode` and `Team.teamcode` (intentionally — see schema comment R-3),
  so Prisma's relational include is not available.
- *SQL JOIN via `$queryRaw`*: works but bypasses Prisma type safety for a hot
  path that already works fine with two queries.

## D6 — Roster column truncation rule

**Decision**: Fixed-width 12 chars. If the team name's display length is ≤ 12,
right-pad with spaces. If > 12, take the first 11 chars and append U+2026 (`…`).
Use string `.length` (UTF-16 code units) for the cutoff — sufficient for the
ASCII / BMP names the player base produces; explicit grapheme-cluster splitting
is over-engineering for this aesthetic concern.

**Rationale**: Spec clarification 2026-05-08, Q4. Single-codepoint ellipsis (`…`)
keeps the column to 12 visible chars in monospace fonts. Three-dot `...` would
push truncated names to 14 visible chars, breaking column alignment.

**Alternatives considered**:
- *Truncate hard at 12 (no ellipsis)*: rejected — players cannot tell whether
  a name was truncated, hurting team identification.
- *Variable-width column*: rejected — breaks roster alignment for trailing
  columns.

## D7 — Tie-break ordering and live member count in `tea list`

**Decision**: Sort by `teamscore DESC, teamcode ASC`. Compute the per-team
member count **live** from `User` rows via a single `GROUP BY` query, then
filter `count > 0` and `LIMIT 20`. Do NOT read `Team.teamcount`.

**Implementation shape**: two queries (no N+1):

```ts
// 1. live counts grouped by teamcode (excludes null/0 teamcodes)
const counts = await prisma.user.groupBy({
  by: ['teamcode'],
  where: { teamcode: { gt: 0n } },
  _count: { _all: true },
});

// 2. team rows for the codes that have members
const codes = counts.map((c) => c.teamcode!);
const teams = await prisma.team.findMany({
  where: { teamcode: { in: codes } },
  select: { teamcode: true, teamname: true, teamscore: true },
});
```

Then in application code: zip the two by `teamcode`, sort by
`teamscore DESC, teamcode ASC`, slice to 20.

**Rationale**: FR-023 explicitly says member count "MUST reflect the live
count of players whose current team affiliation matches the team — not a
stale denormalised counter." `Team.teamcount` is recomputed only by the
midnight job (`midnight.repository.ts:221+`), so it is stale until the next
midnight. A live `GROUP BY` is cheap (≤ 50 teams, ≤ a few hundred users) and
correct. Tie-break by `teamcode ASC` (clarification Q5) rewards longevity.

**Alternatives considered**:
- *Read `Team.teamcount` directly*: rejected — violates FR-023; produces
  stale counts up to 24 hours old in the worst case.
- *Per-team `count()` in a loop*: rejected — N+1 query against the team
  table; spec plan constraint disallows N+1.
- *SQL JOIN via `$queryRaw`*: works and would collapse to one query, but
  bypasses Prisma type safety on a non-hot path. The two-query approach
  keeps types and is well within the < 50 ms perf budget.
- *Tie-break by teamname alphabetic*: rejected by clarification — adds work
  with no gameplay justification.
