# Feature Specification: Team Management

**Feature Branch**: `018-team-management`  
**Created**: 2026-05-08  
**Status**: Draft  
**Input**: User description: "Complete the team management command set — add `tea create <name> <password>`, `tea list`, password-gated join (`tea <name> <password>`), and team affiliation on the roster."

## Clarifications

### Session 2026-05-08

- Q: How should the parser separate a multi-word team name from the password? → A: Last whitespace-separated token is the password; everything before it is the team name. Passwords therefore may not contain spaces.
- Q: How is the team password stored? → A: Plaintext, faithful to the original. Team passwords are join codes, not account credentials. Plaintext storage keeps a future "show team password to current members" feature simple.
- Q: What constraints apply to the password value itself? → A: Non-blank, max 8 characters, any printable non-space characters, case-sensitive match. Faithful to BBS-era short team codes and reinforces that this is a "team code" rather than a secure credential.
- Q: How should the roster's team column handle long team names? → A: Truncate to 12 characters with a trailing `…` if longer; fixed-width column. Keeps the roster scannable on an 80-column terminal and matches the BBS-era roster aesthetic.
- Q: What tiebreaker applies in `tea list` when two teams have identical scores? → A: Team identifier ascending (oldest team wins the tie). Deterministic, cheap, and rewards longevity.
- Q: Should empty teams (0 members) appear in `tea list`? → A: No — filter out 0-member teams from the listing. Empty teams have no gameplay relevance and only add noise for players scanning for a team to join.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a New Team (Priority: P1)

A player who is not currently on a team wants to start their own team and recruit allies. They type `tea create Galactic Raiders s3cret` and become the first member of the new team, with the password set so they can share it with people they want to invite.

**Why this priority**: This is the missing primitive that blocks the entire team gameplay loop. Today, teams can only be created by manually seeding the database — players cannot self-organise. Without this, all other team commands (already shipped in feature 012) have limited utility because players have no teams to join.

**Independent Test**: Log in as a player with no team, run `tea create Foo s3cret`, verify the team appears in `tea list`, verify the player's `tea` (show current team) now reports membership in "Foo", and verify a second player can join the new team via `tea Foo s3cret` while a wrong password is rejected.

**Acceptance Scenarios**:

1. **Given** a logged-in player not on a team, **When** they type `tea create Galactic Raiders s3cret`, **Then** a new team named "Galactic Raiders" is created with the password set, the player is added as its first member, and the player receives a confirmation message naming their new team.
2. **Given** a player already on a team, **When** they type `tea create Foo s3cret`, **Then** the system rejects the command with an error directing them to `tea leave` first, and no new team is created.
3. **Given** a team named "Galactic Raiders" already exists, **When** another player types `tea create galactic raiders pw`, **Then** the system rejects the command (case-insensitive name conflict) and no duplicate is created.
4. **Given** a player attempts `tea create` with no name argument or no password argument, **When** the command runs, **Then** the system rejects it with a usage hint indicating both name and password are required.
5. **Given** a player attempts `tea create <31-character name> pw`, **When** the command runs, **Then** the system rejects it with a length-limit error.
6. **Given** a player attempts `tea create Foo` (name but no password), **When** the command runs, **Then** the system rejects it with a usage hint — a password is required.

---

### User Story 2 - Join a Team With Password (Priority: P1)

A player who has been invited to an existing team wants to join it. The team creator has shared the team name and the password with them out-of-band. They type `tea Galactic Raiders s3cret` and join the team. Without the correct password, they are denied — preventing strangers from walking into private teams.

**Why this priority**: P1 alongside team creation because creating a password-gated team is meaningless if the join flow does not actually enforce the password. The two ship together as one coherent invite-only mechanism.

**Independent Test**: With an existing password-protected team, attempt to join with no password (rejected), with the wrong password (rejected), and with the correct password (accepted). Verify membership change in all three cases is correct.

**Acceptance Scenarios**:

1. **Given** a team "Galactic Raiders" with password "s3cret" exists, **When** a player not on a team types `tea Galactic Raiders s3cret`, **Then** they are added to the team and receive a confirmation message.
2. **Given** the same team, **When** a player types `tea Galactic Raiders wrongpw`, **Then** the system rejects the join with a wrong-password error and the player remains unaffiliated.
3. **Given** the same team, **When** a player types `tea Galactic Raiders` (no password), **Then** the system rejects the join with a missing-password error.
4. **Given** a player already on a different team, **When** they type `tea Other correctpw`, **Then** the existing already-on-a-team rejection from feature 012 still applies, regardless of password correctness.

---

### User Story 3 - List All Teams (Priority: P2)

A player wants to know which teams exist, how many members each has, and which team is winning. They type `tea list` and see a leaderboard of all teams.

**Why this priority**: Discoverability — without this, new players cannot find existing teams to join, and existing team members cannot see how their team ranks. P2 because it is unblocking but not gating: players can already join a team if someone tells them the name.

**Independent Test**: Seed three teams with different scores and member counts, run `tea list`, verify all three appear sorted by score descending, with correct member counts and scores.

**Acceptance Scenarios**:

1. **Given** three teams exist with scores 50, 200, 100, **When** any player types `tea list`, **Then** the output lists all three teams in score order (200, 100, 50) with rank, name, member count, and score per line.
2. **Given** no teams exist, **When** a player types `tea list`, **Then** the output reports that no teams have been formed.
3. **Given** more than 20 non-empty teams exist, **When** a player types `tea list`, **Then** the output is capped at 20 teams (the top scorers among teams with at least one member) — matching the original game's MAXTEAMS limit.
4. **Given** a team with zero members exists alongside teams with members, **When** a player types `tea list`, **Then** the empty team is omitted from the listing.

---

### User Story 4 - Team Affiliation on Roster (Priority: P3)

A player checking the roster wants to see at a glance which players belong to which teams, so they can identify allies, rivals, and unaffiliated targets.

**Why this priority**: A quality-of-life enhancement on an existing command. The roster works without it; this just adds context. P3 because it does not unblock any new gameplay — it improves an existing read-only display.

**Independent Test**: With a mix of teamed and teamless players in the roster, run `ros`, verify each line shows the correct team name (or `---` for unaffiliated players), and verify the column is consistently formatted.

**Acceptance Scenarios**:

1. **Given** the roster contains 3 players on team "Raiders" and 2 players with no team, **When** any player types `ros`, **Then** each roster line displays the player's team name (or `---` if unaffiliated) in a dedicated column.
2. **Given** a player's team is renamed or they leave their team mid-session, **When** the roster is re-queried, **Then** the displayed team name reflects the latest state.

---

### Edge Cases

- **Concurrent creation**: Two players type `tea create Foo` at nearly the same moment. The system must serialise these so exactly one succeeds and the other receives a name-taken error — no duplicate teams and no orphan rows.
- **Whitespace-only name**: `tea create   ` (only spaces) is treated the same as a blank name and rejected.
- **Leading/trailing whitespace**: `tea create  Raiders  ` is accepted with the name trimmed before storage and uniqueness check.
- **Special characters in name**: Names containing punctuation or unicode are accepted as-is provided they fit within the length limit.
- **Multi-word team name with password**: For both `tea create <args>` and `tea <args>` (join), the parser splits on whitespace and treats the final token as the password and all preceding tokens (joined by single spaces) as the team name. Example: `tea create Galactic Raiders s3cret` → name "Galactic Raiders", password "s3cret".
- **Single-word command with one argument**: `tea Foo` (no password token) is parsed as a single argument and falls through to the existing show-current-team-or-error behaviour rather than being treated as a malformed join. A join attempt requires at least two tokens after `tea`.
- **Spaces inside a password**: Disallowed — passwords cannot contain spaces, since the parser treats only the final whitespace-separated token as the password. Players will need to choose a single-token password.
- **Password longer than 8 characters**: Rejected on creation with a length-limit error.
- **Player creates team, then leaves**: The team row continues to exist with its remaining members (or zero, if the creator was the only one). Empty teams are filtered out of `tea list` but the row persists until a future cleanup feature removes it; the team identifier is not reused.
- **Roster shows team that no longer exists**: If a team is deleted while a player still references it via stale state, the roster shows `---` rather than crashing.

## Requirements *(mandatory)*

### Functional Requirements

#### Team Creation (`tea create <name>`)

- **FR-001**: System MUST allow a logged-in player who is not currently on a team to create a new team by providing a team name and a join password.
- **FR-002**: System MUST reject team creation when the requesting player already belongs to a team, with an error message instructing them to leave their current team first.
- **FR-003**: System MUST reject team creation when either the name or the password is missing or, after trimming whitespace, empty.
- **FR-004**: System MUST reject team creation when the trimmed name exceeds 30 characters.
- **FR-005**: System MUST treat team names as case-insensitive for uniqueness — "Raiders", "raiders", and "RAIDERS" are considered the same name and only the first creation succeeds.
- **FR-006**: System MUST preserve the original casing the player typed when storing and displaying the team name.
- **FR-007**: System MUST automatically assign a new team identifier on creation, without requiring or accepting any identifier input from the player.
- **FR-008**: On successful creation, system MUST add the creator as the first member of the new team — equivalent to the player having joined an existing team via the team-join flow. The creator is NOT required to re-enter the password as part of the create flow.
- **FR-009**: On successful creation, system MUST send a confirmation message to the creator naming their new team.
- **FR-010**: System MUST handle two simultaneous create attempts with the same name such that exactly one succeeds and the other receives a name-taken error.
- **FR-011**: System MUST persist the team's join password on the team record as plaintext so it can be checked on future join attempts and (in a future feature) shown back to current members.
- **FR-011a**: System MUST reject team creation when the trimmed password exceeds 8 characters or contains any whitespace character.
- **FR-011b**: System MUST split `tea create <args>` such that the final whitespace-separated token is the password and all preceding tokens (joined by single spaces) are the team name; if fewer than two tokens are provided after `create`, the command is rejected with a usage hint.

#### Team Join (`tea <name> <password>`)

- **FR-012**: System MUST require any player attempting to join an existing team to provide the team's password as part of the join command.
- **FR-013**: System MUST reject the join with a wrong-password error when the provided password does not match the stored team password.
- **FR-014**: System MUST reject the join with a missing-password error when the player provides only a team name and no password argument.
- **FR-015**: System MUST continue to enforce the existing rule that a player who is already on a team cannot join another team without first leaving — independent of password correctness.
- **FR-016**: Team-name matching for joins MUST remain case-insensitive (consistent with uniqueness rules); password matching MUST be case-sensitive.
- **FR-016a**: System MUST split `tea <args>` (join) such that, when two or more whitespace-separated tokens are provided, the final token is the password and all preceding tokens are the team name. When only one token is provided, the command falls through to the existing show-current-team behaviour from feature 012 — it is NOT treated as a join attempt with a missing password.

#### Team Listing (`tea list`)

- **FR-017**: System MUST allow any logged-in player to list all existing teams.
- **FR-018**: For each listed team, the output MUST include rank position, team name, current member count, and current team score. The team password MUST NOT appear in the listing output.
- **FR-019**: Listed teams MUST be sorted by team score in descending order.
- **FR-020**: When two or more teams have identical scores, the system MUST break the tie by team identifier ascending (oldest team first) so output ordering is stable across calls.
- **FR-021**: Output MUST be capped at the top 20 teams to preserve fidelity with the original game's team-table size limit.
- **FR-022**: When no teams exist, the output MUST clearly indicate that there are no teams rather than returning an empty response.
- **FR-023**: Member count MUST reflect the live count of players whose current team affiliation matches the team — not a stale denormalised counter.
- **FR-023a**: Teams with zero current members MUST be excluded from `tea list` output. The 20-team cap applies after this filter (i.e., up to 20 non-empty teams are listed).

#### Roster Team Column (`ros`)

- **FR-024**: System MUST add a team-affiliation column to the roster output showing each listed player's current team name.
- **FR-025**: When a player is not on any team, the team column MUST display a placeholder (`---`) rather than blank space.
- **FR-026**: The team column MUST reflect the player's current team affiliation at the time of the query — not stale data from a prior tick.
- **FR-027**: The roster team column MUST be a fixed-width 12-character field. Team names longer than 12 characters MUST be truncated to 11 characters followed by a `…` (ellipsis) so the displayed value never exceeds 12 characters.

### Key Entities

- **Team**: Represents a player-formed group. Attributes: unique identifier, display name (preserves original casing), join password (set on creation, checked on join, never displayed), current aggregate score (maintained by existing midnight reconciliation), creation context. Relationships: zero-or-many players belong to a team; a player belongs to at most one team.
- **Player ↔ Team affiliation**: Each player either has a current team or has none. Affiliation changes only via existing team-join, team-leave, and the new team-create flows.

## Success Criteria *(mandatory)*

- **SC-001**: A player can go from "no team" to "leader of a new team" in a single command (`tea create <name>`) with a confirmation message in under one second of round-trip time.
- **SC-002**: 100% of duplicate-name creation attempts (case-insensitive) are rejected with a clear error; zero duplicate teams are ever created.
- **SC-003**: A player can discover all teams in the game with one command (`tea list`) and identify the top-ranked team without scrolling, for any galaxy state with up to 20 teams.
- **SC-004**: Roster output (`ros`) shows accurate, up-to-date team affiliation for every listed player, with the correct placeholder for unaffiliated players, in 100% of queries.
- **SC-005**: Creating a team and immediately listing teams shows the new team in the listing with the creator counted as a member (1) and a score of 0.
- **SC-006**: All new and modified commands behave consistently with the existing team show/join/leave commands shipped in feature 012 — same error tone, same confirmation format, same input parsing conventions.

## Assumptions

- **Auto-assigned team identifiers**: The original game required a player to supply a 5-digit team code on creation. We are modernising to auto-assign, since the web port has no sysop gate and player-supplied numeric codes add friction with no gameplay benefit.
- **Single join password restored; Team.secret column unused**: The original game used a team join password as a BBS-era invite-only mechanism. We are keeping that single password for both creation (set by the creator) and joining (required from joiners). The schema's separate `Team.secret` column is left unused for this feature — there is only one password to remember and share.
- **Empty teams persist but are hidden from listing**: When the last member leaves a team, the team row remains in storage so the team identifier is preserved, but the team is filtered out of `tea list`. Cleanup of empty team rows is deferred to a later feature (or to the existing midnight job, as a future enhancement).
- **Score reconciliation already handled**: Team scores are recomputed by the existing midnight reconciliation job. This feature does not introduce real-time score updates — listing reflects whatever the most recent reconciliation produced, which is acceptable for an informational display.
- **Roster cap unchanged**: The existing roster command's player cap and ordering are preserved. The team column is purely additive.
- **Listing access is open**: Any logged-in player can run `tea list` regardless of their own team affiliation.

## Out of Scope

- `tea members` — listing members of one's own (or any) team.
- `tea kick` — removing a player from a team.
- `tea newpass` / `tea newname` — administrative renaming or password rotation.
- Team-aware combat or planet mechanics — team score remains purely informational and does not affect gameplay outcomes.
- Real-time team score updates — scores still come from the nightly reconciliation job.
- Cleanup or auto-disbanding of empty teams.
