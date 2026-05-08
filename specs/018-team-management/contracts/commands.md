# Command Contracts: Team Management

**Feature**: 018-team-management
**Date**: 2026-05-08

All commands route through `CommandRouterService` and produce
`CommandResult { lines, broadcasts? }`. Inputs are post-tokenised whitespace
arguments.

## `tea create <name…> <password>`

Sub-command of the `tea` keyword. Recognised when `args[0].toLowerCase() === 'create'`.

**Tokenisation**: `args = [..., last]` where `last` is the password and the
slice `args[1 .. -2]` joined by single spaces (then trimmed) is the team name.

**Inputs**:

| Token              | Required | Constraint                                       |
|--------------------|----------|--------------------------------------------------|
| `args[0]`          | yes      | literal `create` (case-insensitive)              |
| name (`args[1..-2]`) | yes    | non-blank after trim, ≤ 30 chars                 |
| password (`args[-1]`) | yes   | non-blank, ≤ 8 chars, no whitespace              |

**Pre-conditions**: caller's `ship.teamcode` is null or 0 (FR-002).

**Outputs**:

| Outcome              | `lines[0].text`                                  | `lines[0].category` |
|----------------------|--------------------------------------------------|---------------------|
| Success              | `Team Galactic Raiders created. You are its first member.` | `success` |
| Already on a team    | `You are already on a team. Use 'tea leave' first.` | `system`         |
| Missing name/pw      | `Usage: tea create <name> <password>`            | `system`            |
| Name too long        | `Team name must be 30 characters or fewer.`      | `system`            |
| Password too long    | `Team password must be 8 characters or fewer.`   | `system`            |
| Password has space   | `Team password may not contain spaces.`          | `system`            |
| Name taken (race or duplicate, case-insensitive) | `Team name already taken.` | `system` |

**Side-effects on success**:
- New `Team` row inserted with `teamcount = 1`, `teamscore = 0n`,
  `password = <pw>`, `secret = ""`, `flag = 0`.
- Caller's `User.teamcode` updated to the new code.
- Caller's `ShipState.teamcode` mirrored; `dirty = true`.
- Broadcast: `{ room: '__player_snapshot__', event: 'player.snapshot', payload: {} }`
  — same broadcast pattern as the existing `tea` join/leave (feature 012).

## `tea <name…> <password>` (password-gated join)

Recognised when `args.length >= 2` AND `args[0].toLowerCase() !== 'create'`
AND `args[0].toLowerCase() !== 'leave'` AND `args[0].toLowerCase() !== 'list'`.

**Tokenisation**: same as create but without the `create` keyword. Name is
`args[0 .. -2]` joined by single spaces, password is `args[-1]`.

**Inputs**:

| Token              | Required | Constraint                                       |
|--------------------|----------|--------------------------------------------------|
| name (`args[0..-2]`) | yes    | non-blank, case-insensitive match against existing team |
| password (`args[-1]`) | yes   | non-blank, case-sensitive match                  |

**Pre-conditions**: caller's `ship.teamcode` is null or 0 (FR-015).

**Outputs**:

| Outcome              | `lines[0].text`                                   | `category` |
|----------------------|---------------------------------------------------|------------|
| Success              | `You have joined team Galactic Raiders.`          | `success`  |
| Already on team      | `You are already on a team. Use 'tea leave' first.` | `system` |
| No such team         | `No such team: Foo`                                | `system`  |
| Wrong password       | `Wrong password.`                                  | `system`  |

Single-token form (`tea Foo`) routes to existing show-current-team handler
(FR-016a) — NOT a join attempt.

**Side-effects on success**: identical to existing `tea` join from feature 012
(updates `User.teamcode`, mirrors `ShipState`, broadcasts `player.snapshot`).

## `tea list`

Recognised when `args.length === 1 && args[0].toLowerCase() === 'list'`.

**Inputs**: none beyond the keyword.

**Pre-conditions**: caller is logged in (any team affiliation, including none).

**Outputs**:

| Outcome              | Lines                                              | `category` per line |
|----------------------|----------------------------------------------------|---------------------|
| ≥ 1 non-empty team   | header + up to 20 sorted rows                      | `system` / `info`   |
| No non-empty teams   | `No teams have been formed.`                       | `info`              |

**Sort**: `teamscore DESC, teamcode ASC` (D7).
**Member count**: live, computed via `prisma.user.groupBy({ by: ['teamcode'], where: { teamcode: { gt: 0n } }, _count: { _all: true } })` — `Team.teamcount` is NOT read (FR-023).
**Filter**: live count > 0 (applied after the `GROUP BY`).
**Limit**: 20 (FR-021), applied after sort + filter.
**Query budget**: exactly two Prisma queries — one `groupBy` on `User`, one `findMany` on `Team` for the surviving teamcodes. No N+1.

**Header**: `  Rank  Team                            Members  Score`

**Row format**: `  {rank:4}  {teamname:30}  {teamcount:>5}  {teamscore:>10}`

The `teamname` field is **NOT** truncated here (the column is wide enough for
the 30-char max). The 12-char truncation rule (D6) applies only to the roster
team column.

The team password MUST NOT appear (FR-018).

## `ros` — extended team column

Recognised: unchanged (`ros` and `ros all`).

**Existing behaviour preserved**: same player query, same sort, same cap.

**New column**: between `UserID` and `Score`, fixed-width 12 chars.

**Header**:
```
  Rank  UserID                Team         Score      Kills  Planets  Population
```

**Per row**:
- If `user.teamcode` is null, 0, or references a missing team: render `---` left-padded to 12 chars (`---         `).
- Else if `team.teamname.length <= 12`: render padded to 12.
- Else: first 11 chars of `teamname` + `…`, total 12 chars (D6).

**Lookup batching**: collect distinct non-zero `teamcode`s from the page of
users, then run **one** `team.findMany({ where: { teamcode: { in: codes } }, select: { teamcode: true, teamname: true } })`. Render from the resulting Map.

## Error message conventions

All error messages MUST match the established tone from feature 012's `tea`
handler (compare `'You are not on a team.'`, `'You have left your team.'`,
`'No such team: ${rawName}'`). New error strings introduced here MUST be
asserted by unit tests so any future tone-drift is caught at PR review.
