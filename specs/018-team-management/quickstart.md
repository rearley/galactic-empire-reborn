# Quickstart: Team Management

**Feature**: 018-team-management
**Audience**: Developer running the feature for the first time after `/speckit-implement` lands

## Prereqs

- Galactic Empire Reborn checked out at `018-team-management` branch.
- Postgres running via `docker compose up -d postgres`.
- Backend dev migrations applied (`cd backend && npx prisma migrate dev`) — this
  picks up the new `team_name_unique_lower` migration introduced by this feature.
- Two terminal sessions logged in as different test users (e.g. `alice`, `bob`),
  neither currently on a team.

If you do not have two test users handy, the seed script
`backend/scripts/seed-test-users.ts` (existing) creates `alice` and `bob` with
password `test`.

## Scenario A — create a team and have a friend join

In **alice's** session:

```
> tea
You are not on a team.

> tea create Galactic Raiders s3cret
Team Galactic Raiders created. You are its first member.

> tea
You are on team Galactic Raiders.

> tea list
  Rank  Team                            Members  Score
     1  Galactic Raiders                      1           0
```

In **bob's** session:

```
> tea Galactic Raiders wrongpw
Wrong password.

> tea Galactic Raiders s3cret
You have joined team Galactic Raiders.

> tea list
  Rank  Team                            Members  Score
     1  Galactic Raiders                      2           0
```

## Scenario B — duplicate-name protection

In a **third** session as `carol`:

```
> tea create galactic raiders anything
Team name already taken.
```

Confirms case-insensitive uniqueness (FR-005, D1).

## Scenario C — concurrent create race (manual)

This requires opening two sessions and running `tea create Foo pw1` and
`tea create FOO pw2` as fast as possible. Exactly one MUST succeed; the other
MUST receive `Team name already taken.` with no orphan row.

Verify in psql:

```sql
SELECT teamcode, teamname FROM "Team" WHERE LOWER(teamname) = 'foo';
-- expect exactly one row
```

The integration test `team.integration.spec.ts` automates this race using
`Promise.all` over two `team.service.create()` calls.

## Scenario D — roster team column

After Scenarios A and B:

```
> ros
  Rank  UserID                Team         Score      Kills  Planets  Population
     1  alice                 Galactic R…       0      0        0           0
     2  bob                   Galactic R…       0      0        0           0
     3  carol                 ---               0      0        0           0
```

Confirms truncation at 12 chars with ellipsis (D6) and `---` placeholder for
unaffiliated players (FR-025).

## Scenario E — leaving a team mid-session

In **bob's** session:

```
> tea leave
You have left your team.

> ros
  Rank  UserID                Team         Score      Kills  Planets  Population
     1  alice                 Galactic R…       0      0        0       0
     2  bob                   ---               0      0        0       0
     ...
```

After leaving, the roster MUST reflect the change on the very next `ros`
invocation (FR-026).

## Scenario F — empty team is hidden from listing

If alice is the only member and leaves:

```
alice> tea leave
You have left your team.

alice> tea list
No teams have been formed.
```

(Confirms FR-023a — `teamcount = 0` rows filtered. The Team row still exists
in the DB; `teamcode` is not reused.)

## Validation matrix

| Spec criterion | Scenario | Pass condition |
|----------------|----------|----------------|
| SC-001 — single-command team creation < 1s | A | observe RTT |
| SC-002 — zero duplicate teams | B + C | DB shows exactly one row per case-insensitive name |
| SC-003 — `tea list` shows top team without scrolling | A, F | output ≤ 22 lines for 20 teams |
| SC-004 — roster team column accuracy | D, E | column matches actual team membership |
| SC-005 — create + list shows new team with 1 member, score 0 | A | first row matches |
| SC-006 — error tone consistent with feature 012 | A–F | error strings match conventions in `contracts/commands.md` |

## Rollback

If the new migration causes problems, the safe rollback is:

```sql
DROP INDEX IF EXISTS "Team_teamname_lower_key";
```

Then revert the application code. The `Team` table itself is unchanged across
this feature so no data migration is required.
