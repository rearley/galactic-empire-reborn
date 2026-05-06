# Feature Specification: Social and Information Commands

**Feature Branch**: `012-social-commands`
**Created**: 2026-05-06
**Status**: Draft
**Input**: User description: Implement six social and information commands from GECMDS.C — `who`, `dat`, `ros`, `sen`, `fre`, `tea` — wired through the existing command dispatch pipeline.

## Clarifications

### Session 2026-05-06

- Q: For `tea <name>`, should team-name matching be exact, prefix, or substring (all case-insensitive)? → A: Exact case-insensitive match (write operation; avoids ambiguous joins).
- Q: What is the maximum length of a `sen` message, and what happens when exceeded? → A: 200 characters; over-length messages are rejected with a usage error (no truncation, no broadcast).
- Q: Does the caller's own ship appear in their own `who` listing? → A: Yes — include self, matching the original C source behavior.
- Q: What ordering should `who` and `ros` use? → A: `who` ordered by shipname ascending (case-insensitive). `ros` ordered by score DESC, then kills DESC, then userid ASC as deterministic tiebreakers.
- Q: Can `dat <fragment>` match the caller's own ship? → A: Yes — no self-exclusion; matches the original walk-the-list semantics.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See Who Else Is In The Galaxy (Priority: P1)

A captain in command of an active ship wants to know which other ships are currently flying so they can decide whom to chase, ally with, or avoid. Typing `who` lists every active (non-cloaked) ship together with a useful identity card — ship name, class, current sector, and kill count.

**Why this priority**: Situational awareness is the foundation of every other social/competitive interaction. Without `who`, players cannot orient themselves relative to other captains, and the rest of the social commands lose context.

**Independent Test**: Connect two players to the live game, have one type `who`, and confirm the response lists the other player's active ship with the expected fields. Cloaking the other ship and re-running confirms it is hidden.

**Acceptance Scenarios**:

1. **Given** two non-cloaked active ships in the galaxy, **When** captain A issues `who`, **Then** the result lists both ships with shipname, class, sector, and kill count.
2. **Given** ship B is cloaked, **When** captain A issues `who`, **Then** ship B is not present in the listing.
3. **Given** no other ships are active, **When** captain A issues `who`, **Then** the listing contains exactly one row — captain A's own ship.

---

### User Story 2 - Inspect A Specific Ship's Stats (Priority: P1)

A captain has spotted a target on the scan and wants more detail before engaging. Typing `dat <name>` returns full public stats on the named ship — class, sector, speed, heading, energy, damage, per-item cargo quantities (all 14 item slots), kills, score, and team.

**Why this priority**: This is the primary scouting verb in the original game and complements `who`. Combat decisions in PvP and PvE both depend on having accurate read-outs.

**Independent Test**: With two ships active, captain A types `dat <partial-of-B-name>` and receives B's full stat block. Cloak B and re-run; the response is "ship not found".

**Acceptance Scenarios**:

1. **Given** a ship named `Falcon-7` is active and not cloaked, **When** any captain types `dat falc`, **Then** they receive Falcon-7's stat block (case-insensitive, partial match), including per-item cargo quantities for all 14 item slots rather than an aggregate total.
2. **Given** the named ship is cloaked, **When** a captain queries it via `dat`, **Then** the response is a "ship not found" error (cloaked ships are indistinguishable from absent ships).
3. **Given** no ship matches the supplied name fragment, **When** the command runs, **Then** the response is a "ship not found" error.

---

### User Story 3 - View The Top Scoring Captains (Priority: P2)

A captain wants to see the leaderboard. Typing `ros` returns the top-scoring human players. Typing `ros all` returns up to 200. AI ships (Cybertrons, Droids) are excluded so the roster reflects only human competition.

**Why this priority**: Score visibility drives the competitive loop, but it is not required to take any in-world action — slightly lower priority than situational awareness and ship inspection.

**Independent Test**: Seed several human users with varied scores plus a Cybertron and a Droid, run `ros`, and confirm the results are ordered by score descending, capped at the configured default, and contain no AI userids.

**Acceptance Scenarios**:

1. **Given** at least 25 human players in the database, **When** any captain types `ros`, **Then** they receive a roster of the top N entries (default cap 20) ordered by score DESC with userid, score, kills, planet count, and population.
2. **Given** any number of AI ships exist (Cybertron / Droid userids), **When** the roster is requested, **Then** none of those AI userids appear in the result.
3. **Given** more than 200 human players exist, **When** a captain types `ros all`, **Then** at most 200 rows are returned.

---

### User Story 4 - Send An In-Game Message (Priority: P2)

A captain wants to talk to other players in real time. After setting a frequency on channel A, B, or C, typing `sen <channel> <message>` broadcasts the message according to the channel's frequency mode: hail (everyone online), sector-scoped (1–19999), or galaxy-wide (≥20000).

**Why this priority**: Communication is essential for team play and trash-talking, but is not required to complete any single-player action. It depends on `fre` being functional, so it is bundled with it.

**Independent Test**: With the sender's channel A frequency set to a sector-scoped value, place captain B in the same sector and captain C in another sector. Issue `sen a <text>` from captain A. Captain B receives the message; captain C does not.

**Acceptance Scenarios**:

1. **Given** captain A's channel A frequency is `0` (hail), **When** A issues `sen a Hello`, **Then** every online non-cloaked ship receives the message.
2. **Given** captain A's channel B frequency is `5000` (sector-scoped) and only captain B is in A's sector, **When** A issues `sen b Hi`, **Then** only captain B receives the message.
3. **Given** captain A's channel C frequency is `25000` (galaxy-wide), **When** A issues `sen c Hi`, **Then** every online ship in the galaxy receives the message.
4. **Given** the system has just delivered a message, **When** any caller queries Mail later, **Then** the message is not present (real-time only, never persisted).
5. **Given** the requested channel has no frequency set, **When** the captain types `sen a Hi`, **Then** the channel is treated as hail (frequency 0) consistent with the original C source default.

---

### User Story 5 - Tune A Communication Frequency (Priority: P2)

A captain configures one of their three channels (A/B/C) to a specific broadcast scope. Typing `fre <A|B|C> <number|hail>` sets the frequency. `hail` resolves to 0 (broadcast to all). 1–19999 is a sector-scoped channel. ≥20000 is a galaxy-wide channel. The frequency persists on the captain's ship and is confirmed back to them.

**Why this priority**: `sen` cannot be exercised meaningfully without `fre`. They ship together.

**Independent Test**: Issue `fre b 5000`, observe a confirmation message. Then issue `sen b Hi` and confirm only ships in the captain's current sector receive it.

**Acceptance Scenarios**:

1. **Given** an active ship, **When** the captain types `fre a hail`, **Then** channel A's frequency becomes 0 and a confirmation describes the channel as a hail.
2. **Given** an active ship, **When** the captain types `fre b 5000`, **Then** channel B's frequency becomes 5000 and the confirmation describes the channel as sector-scoped.
3. **Given** an active ship, **When** the captain types `fre c 25000`, **Then** channel C's frequency becomes 25000 and the confirmation describes the channel as galaxy-wide.
4. **Given** an active ship, **When** the captain types `fre a 0`, **Then** the system rejects the value as invalid (only `hail` may set frequency to 0).
5. **Given** a successful frequency change, **When** the ship state is later flushed to the durable store, **Then** the new frequency value is persisted.

---

### User Story 6 - Join, Leave, Or View Team Affiliation (Priority: P3)

A captain wants to align with a team. Typing `tea` with no arguments shows the captain's current team. Typing `tea <name>` joins the named team (case-insensitive match against existing teams). Typing `tea leave` clears the affiliation.

**Why this priority**: Team affiliation is a meaningful identity layer but does not block other gameplay. It is the lowest priority of the six commands.

**Independent Test**: Seed two teams. Issue `tea` and confirm "no team". Issue `tea Pirates` and confirm a join. Issue `tea` again and confirm membership shows. Issue `tea leave` and confirm it clears.

**Acceptance Scenarios**:

1. **Given** the captain has no team, **When** they type `tea`, **Then** the response indicates they are not on a team.
2. **Given** a team named `Pirates` exists, **When** the captain types `tea pirates`, **Then** their User and ShipState team affiliation are updated and a `player.snapshot` event is broadcast for them.
3. **Given** the captain types `tea leave`, **When** the command processes, **Then** their team affiliation is cleared on both User and ShipState and a `player.snapshot` is broadcast.
4. **Given** the captain types `tea NonExistentTeam`, **When** the command processes, **Then** the response is an error indicating no such team and no state changes are made.

---

### Edge Cases

- A captain issues `dat` with no name argument — the response is a usage/error message, not a crash.
- A captain issues `sen` without enough arguments — the response is a usage/error message and no broadcast happens.
- A captain issues `sen a <text>` where `<text>` is longer than 200 characters — the response is a usage error and no broadcast happens.
- A captain issues `fre` with a malformed channel letter (e.g., `fre Z 100`) — the response is a usage/error message.
- A captain issues `fre a -5` or a non-integer — the response is an error.
- A captain issues `ros all` when fewer than 200 human players exist — only the available rows are returned.
- A captain disconnects between typing `sen` and the broadcast — the message is best-effort and not retried.
- A team is renamed in the database while a captain is mid-session — pending writes use the team id, not the name string.
- A target captain in `sen`'s sector is cloaked — they still receive sector-scoped or galaxy-wide messages (cloak filters visibility, not connectivity), consistent with `outsect`/`outwar` behavior in the original. Hail (`outwar FILTER`) excludes cloaked ships per the original spec.

## Requirements *(mandatory)*

### Functional Requirements

#### `who`
- **FR-001**: System MUST list every currently active (in-memory) ship in response to the `who` command, including the caller's own ship.
- **FR-002**: System MUST exclude cloaked ships from the `who` listing. Exception: the caller's own ship always appears in their own `who` listing regardless of their cloak state.
- **FR-003**: Each `who` row MUST include shipname, ship class type name, current sector coordinates, and kill count.
- **FR-003a**: `who` rows MUST be sorted by shipname ascending, case-insensitive.

#### `dat`
- **FR-004**: System MUST accept a single ship-name argument and resolve it via case-insensitive partial match against active ships, including the caller's own ship.
- **FR-005**: System MUST treat cloaked ships as not found for the purpose of `dat`.
- **FR-006**: System MUST return ship class, sector, speed, heading, energy, damage, per-item cargo quantities (all 14 item slots: men, missiles, torpedos, ion cannons, flux pods, food cases, fighters, decoys, troops, zippers, jammers, mines, gold, spy), kills, score, and team for the matched ship.
- **FR-007**: System MUST return a "ship not found" message when no active non-cloaked ship matches the provided name fragment.

#### `ros`
- **FR-008**: System MUST return human players ranked by score DESC in response to `ros`. Ties MUST be broken by kills DESC, then by userid ASC, to produce a stable deterministic ordering.
- **FR-009**: System MUST exclude AI userids (Cybertron and Droid naming conventions) from the roster.
- **FR-010**: System MUST default the result cap to a configurable value (default 20) and accept an `all` argument that raises the cap to a hard ceiling of 200.
- **FR-011**: Each roster row MUST include userid, score, kills, planet count, and population.

#### `sen`
- **FR-012**: System MUST accept the form `sen <channel> <message>` where channel is A, B, or C.
- **FR-013**: System MUST route the message according to the captain's frequency for that channel: 0 = hail (all online non-cloaked ships), 1–19999 = sector-scoped (only ships currently in the same sector as the sender), ≥20000 = galaxy-wide (all online ships).
- **FR-014**: System MUST emit `message.send` events with payload `{ from: shipname, channel: 'A'|'B'|'C', text: string }` to the appropriate recipients.
- **FR-015**: System MUST NOT persist sent messages to durable mail storage.
- **FR-016**: System MUST treat an unset channel frequency as hail (0).
- **FR-016a**: System MUST reject `sen` messages whose text exceeds 200 characters with a usage error and MUST NOT broadcast or truncate them.

#### `fre`
- **FR-017**: System MUST accept `fre <A|B|C> <number|hail>` and update the corresponding channel frequency on the caller's ship.
- **FR-018**: System MUST treat the literal `hail` token as setting frequency to 0.
- **FR-019**: System MUST reject the explicit numeric value `0` as invalid; only `hail` may set the channel to 0.
- **FR-020**: System MUST reject negative numbers and non-integer values.
- **FR-021**: System MUST persist the updated channel frequency through the existing ship-state flush cycle.
- **FR-022**: System MUST confirm the change to the caller, including which channel was set and which broadcast scope (hail/sector/galaxy) the new frequency implies.

#### `tea`
- **FR-023**: System MUST display the caller's current team affiliation when `tea` is invoked with no arguments.
- **FR-024**: System MUST update both the persistent User record and the in-memory ShipState when the caller joins a team via `tea <name>` using an exact case-insensitive match against an existing team's name. Prefix or substring matches MUST NOT join a team. The team name argument is trimmed of leading and trailing whitespace before matching.
- **FR-025**: System MUST clear the caller's team on both User and ShipState in response to `tea leave`.
- **FR-026**: System MUST broadcast a `player.snapshot` refresh after any successful team join or leave.
- **FR-027**: System MUST return an error and make no state changes when the named team does not exist.
- **FR-028**: System MUST NOT enforce a team size cap.

#### Cross-cutting
- **FR-029**: All six commands MUST be reachable through the existing command dispatch pipeline by their documented prefixes.
- **FR-030**: All six commands MUST deliver their per-caller output via the established command-result channel used by other commands in the system.

### Key Entities *(include if feature involves data)*

- **Active Ship (in-memory)**: The currently flying ship for a connected captain. Source of truth for `who`, `dat`, `fre`, and the sender side of `sen`. Holds the three channel frequencies.
- **Connected Ships Registry**: The set of ships currently online. Used by `sen` to find recipients across hail/sector/galaxy scopes.
- **User (persistent)**: The durable player record. Source for `ros` (score/kills/planets/population) and the persistent home for team affiliation updated by `tea`.
- **Team (persistent)**: A named group a User may belong to. Read by `tea` for name lookup; referenced by id from User and ShipState.
- **Sector Room**: The real-time broadcast channel scoped to a single sector. Reused by `sen` for sector-scoped frequencies.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A connected captain receives the result of any of the six commands within 1 second of issuing the command under normal load.
- **SC-002**: Every one of the six commands is exercised by at least one automated handler-level test and at least one end-to-end integration test that round-trips through the dispatch pipeline.
- **SC-003**: Cloaked ships never appear in the output of `who` or as a successful target of `dat` across 100% of test scenarios.
- **SC-004**: AI userids appear in 0% of `ros` results across the test suite.
- **SC-005**: A `sen` broadcast on a sector-scoped frequency reaches 100% of ships currently in the sender's sector and 0% of ships outside it.
- **SC-006**: A team join or leave is reflected in both the durable user record and the in-memory ship state within the same command turn, and a snapshot refresh is observable to the affected client.
- **SC-007**: All existing commands continue to function unchanged after these six are added (no regressions in the existing command test suite).

## Assumptions

- The `ShipState` representation already includes a three-element frequency array for channels A/B/C (the brief states this; implementation will confirm during planning).
- The existing `User` and `Team` Prisma models from feature 001 are sufficient for `ros` and `tea` queries without schema changes.
- AI userid naming conventions are sufficiently distinctive (e.g., `Cybrg-*`, `@Droid-*`) for `ros` to filter them via simple pattern matching, matching how prior features identify AI ships.
- The existing `command:result` socket event and `player.snapshot` broadcast mechanism are stable contracts and do not need redesign.
- Real-time-only delivery for `sen` is acceptable to players; offline recipients will simply miss the message, matching the original game's behavior.
- The `ROSTER_MAX` configuration value is read from environment and defaults to 20 when unset; the 200 hard ceiling on `ros all` is fixed and not configurable.
