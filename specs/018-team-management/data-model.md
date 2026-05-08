# Data Model: Team Management

**Feature**: 018-team-management
**Date**: 2026-05-08

This feature does not introduce new tables. It adds **one Postgres index** and
clarifies how existing columns are used.

## Existing entities used

### `Team` (`backend/prisma/schema.prisma`)

| Column      | Type          | Used as                                                                  |
|-------------|---------------|--------------------------------------------------------------------------|
| `teamcode`  | `BigInt @id`  | Surrogate key, allocated as `MAX(teamcode)+1` starting at 1 (D1)         |
| `teamname`  | `String`      | Display name, original casing preserved; max 30 chars (FR-004)           |
| `teamcount` | `Int`         | Maintained by midnight job; **NOT read** by `tea list` (FR-023 requires live count via `GROUP BY` on `User.teamcode`) |
| `teamscore` | `BigInt`      | Aggregate score; **read** here, **maintained** by midnight job           |
| `password`  | `String`      | Plaintext join password, ≤ 8 chars, no whitespace (FR-011a)              |
| `secret`    | `String`      | **Unused** by this feature (spec assumption, lines 165–170)              |
| `flag`      | `Int`         | **Unused** by this feature; midnight job uses `flag = 1` for "removed"   |

### `User`

| Column     | Type             | Used as                                                                 |
|------------|------------------|-------------------------------------------------------------------------|
| `userid`   | `String @id`     | Player identity                                                          |
| `teamcode` | `BigInt?`        | Current team affiliation; `null` or `0` ⇒ no team                       |
| `username` | `String`         | Roster display                                                          |
| `score`, `kills`, `planets`, `population` | (existing) | Roster columns (unchanged)                              |

### `ShipState` (in-memory, `backend/src/game/ship/ship-state.types.ts`)

| Field      | Source                                                                       |
|------------|------------------------------------------------------------------------------|
| `teamcode` | Mirrored from `User.teamcode`; updated by `tea create`, `tea <name> <pw>`, and `tea leave` (existing pattern from feature 012) |

## New schema artifact

### Migration: `team_name_unique_lower`

```sql
-- Created via: prisma migrate dev --name team_name_unique_lower
CREATE UNIQUE INDEX "Team_teamname_lower_key"
  ON "Team" (LOWER("teamname"))
  WHERE "teamcount" >= 0;
```

The `WHERE` clause is intentionally permissive (always true on
non-negative counts, which is enforced by the `Int @default(0)` column type)
so the index covers all rows. Predicate present so Prisma's introspection
reports it as a partial index, allowing later refinement (e.g. exclude
soft-deleted teams via `flag != 1`) without renaming.

## State transitions

```text
                    User.teamcode = 0
                       │
       ┌───────────────┼───────────────┐
       │               │               │
   tea create        tea <name>     (no command)
   <name> <pw>       <pw>
       │               │
       ▼               ▼
   New team row      Existing team row
   inserted;         (case-insensitive
   User.teamcode     match);
   set to new        password verified;
   teamcode          User.teamcode = team.teamcode

                    User.teamcode > 0
                       │
                   tea leave
                       │
                       ▼
                  User.teamcode = null

   teamcount and teamscore are recomputed by the midnight job —
   not by this feature's command path.
```

## Validation rules summary

| Rule            | Source       | Where enforced                              |
|-----------------|--------------|---------------------------------------------|
| Name non-blank after trim         | FR-003 | `team-name.ts` validator                |
| Name ≤ 30 chars after trim        | FR-004 | `team-name.ts` validator                |
| Name uniqueness, case-insensitive | FR-005 | DB unique index on `LOWER(teamname)`    |
| Password non-blank, ≤ 8, no spaces| FR-011a| `team-name.ts` validator                |
| Password match on join, case-sens | FR-016 | `team.service.ts` join check            |
| Player not already on team        | FR-002, FR-015 | `tea.handler.ts` pre-check       |
| At least 2 tokens for join        | FR-016a | `tea.handler.ts` arg parser            |
| Member count is live, not stale   | FR-023  | `User` `GROUP BY teamcode` in `team.repository.ts` |
| Empty teams excluded from listing | FR-023a | Filter on live count > 0 (post-`GROUP BY`)         |

## Render formats

### `tea list` row

```text
  Rank  Team                            Members  Score
     1  Galactic Raiders                      4  12450
     2  The Federation                        2   1100
```

Fixed-width: rank (4), team name (30, padded), member count (5), score (10).

### Roster team column

Inserted after `UserID`, before `Score`:

```text
  Rank  UserID                Team         Score      Kills  Planets  Population
     1  Mongo                 Raiders      12450        15        2     150,000
     2  Foo                   Galactic R…   1100         3        0           0
     3  Bar                   ---            450         1        0           0
```

Team column is fixed-width 12 chars (D6).
