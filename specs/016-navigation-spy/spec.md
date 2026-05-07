# Feature Specification: Navigation Autopilot, Spy, Help, and Clear Screen

**Feature Branch**: `016-navigation-spy`
**Created**: 2026-05-07
**Status**: Draft
**Input**: User description: "Four commands that complete the core player action set before the endgame features (planet attack, mail, teams): nav (autopilot), spy (plant spy on planet), hel/? (in-game help), cls (clear screen)."

## Clarifications

### Session 2026-05-07

- Q: Re-issuing `nav <x> <y>` while autopilot is already active with a different target → A: Replace the target silently; emit the standard NAV01-style acknowledgment.
- Q: Granularity of `hel` topic argument for v1 → A: Topic groups only (navigation, combat, trade, planet, ship). Per-command help is deferred.
- Q: Behavior of `nav` when ship is in orbit of a planet → A: Auto-break orbit, then engage autopilot in a single command. (Note: the original `cmd_navigate` in `GECMDS.C` was a one-shot bearing calculator and did not engage autopilot at all; the autopilot semantics in this spec are a deliberate enhancement.)
- Q: Arrival detection for autopilot → A: Floor-based sector match — arrive when `floor(ship.x) == target.x && floor(ship.y) == target.y`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Autopilot Navigation (Priority: P1)

A pilot wants to travel to a distant sector without manually rotating and applying impulse every tick. They issue `nav 10 -5` and the ship automatically computes the bearing, rotates toward the target, and reports arrival when reached. Issuing `nav` alone reports current autopilot status. Issuing `rot`, `imp`, or `war` cancels the autopilot.

**Why this priority**: Most-used quality-of-life command in the original game. Long-distance travel without autopilot is tedious enough to discourage exploration.

**Independent Test**: Set a ship at a known position with sufficient energy, issue `nav <x> <y>`, advance physics ticks in a test harness, and assert the ship's heading converges on the target bearing and the autopilot disengages on arrival.

**Acceptance Scenarios**:

1. **Given** a ship at sector (0,0), **When** the player issues `nav 5 5`, **Then** the system acknowledges the new course with target coordinates, bearing, and distance, and `holdcourse` becomes active.
2. **Given** an active autopilot, **When** the physics tick runs, **Then** the ship's `head2b` is set to the bearing toward the target each tick.
3. **Given** an active autopilot, **When** the ship arrives at the target sector, **Then** autopilot disengages and the player receives an arrival event.
4. **Given** an active autopilot, **When** the player issues `rot`, `imp`, or `war`, **Then** autopilot disengages silently and the manual command takes effect.
5. **Given** no active autopilot, **When** the player issues `nav` with no arguments, **Then** the system reports "Autopilot inactive."
6. **Given** an active autopilot, **When** the player issues `nav` with no arguments, **Then** the system reports the current target coordinates, remaining distance, and bearing.
7. **Given** any state, **When** the player issues `nav` with target coordinates outside the universe (`±univmax`), **Then** the system rejects the input with the navigation usage message and autopilot is unaffected.

---

### User Story 2 - Plant Spy on Planet (Priority: P2)

A pilot orbiting an enemy-owned planet wants to gather intelligence. They issue `spy`, which consumes one spy item from their cargo and attaches their user ID as the planet's `spyowner`. Subsequent planet scans on that planet reveal richer intelligence (population, items, defenses) to the spy's owner.

**Why this priority**: Required for strategic play before planet-attack mechanics ship in a later feature, but not required for basic navigation/exploration.

**Independent Test**: Create a planet owned by user B, place user A's ship in orbit with one spy item, issue `spy`, and assert the planet's `spyowner` is set to user A's ID, the spy item count decremented by one, and the player receives a confirmation message.

**Acceptance Scenarios**:

1. **Given** a ship in orbit of an enemy-owned planet with at least one spy item, **When** the player issues `spy`, **Then** one spy item is consumed and the planet's `spyowner` becomes the player's user ID.
2. **Given** a ship not in orbit (in open space), **When** the player issues `spy`, **Then** the command is rejected with a "must orbit a planet" message.
3. **Given** a ship orbiting its own planet, **When** the player issues `spy`, **Then** the command is rejected.
4. **Given** a ship orbiting a wormhole, **When** the player issues `spy`, **Then** the command is rejected.
5. **Given** a ship in the neutral zone, **When** the player issues `spy`, **Then** the command is rejected.
6. **Given** a ship in orbit with zero spy items in cargo, **When** the player issues `spy`, **Then** the command is rejected with an "insufficient spy equipment" message and no state changes.
7. **Given** an active spy on a planet, **When** the spy's owner runs `sca` on that planet, **Then** the scan output includes intelligence (population, items, defenses) not normally visible.

---

### User Story 3 - In-Game Help (Priority: P2)

A new player wants to discover available commands. They type `hel` and receive a list of help topics. They type `hel navigation` and receive descriptions of navigation-related commands. The `?` alias works identically.

**Why this priority**: Onboarding-critical. New players cannot reasonably learn the command set without in-game help.

**Independent Test**: Issue `hel` with no arguments and assert the response lists the topic catalog. Issue `hel <known-topic>` and assert the response contains the expected help text. Issue `?` and assert it produces output equivalent to `hel` with the same argument.

**Acceptance Scenarios**:

1. **Given** a logged-in player, **When** they issue `hel`, **Then** the system lists available help topics covering navigation, combat, trade, planet, and ship-management command groups.
2. **Given** a logged-in player, **When** they issue `hel navigation`, **Then** the system returns help text describing navigation commands.
3. **Given** a logged-in player, **When** they issue `?` (with or without an argument), **Then** the response is equivalent to `hel` with the same argument.
4. **Given** a logged-in player, **When** they issue `hel <unknown-topic>`, **Then** the system reports the topic is not recognized and lists valid topics.

---

### User Story 4 - Clear Screen (Priority: P3)

A player whose event log has filled with prior activity wants a fresh view. They issue `cls` and the client clears its event log. Game state is unaffected.

**Why this priority**: Pure presentation convenience; trivial to implement once a frontend-only command pattern exists.

**Independent Test**: With a populated event log, issue `cls` from the command input and assert the event-log component is empty afterward and that no backend state changed.

**Acceptance Scenarios**:

1. **Given** an event log containing prior messages, **When** the player issues `cls`, **Then** the event log is emptied in the player's client.
2. **Given** any game state, **When** the player issues `cls`, **Then** no backend state (ship, planet, sector) changes.
3. **Given** the player issues `cls`, **When** other players are observing the same sector, **Then** their event logs are not affected.

---

### Edge Cases

- Autopilot target equals current sector: command reports "already at target" and does not engage `holdcourse`.
- Autopilot ship runs out of energy mid-course: ship continues drifting on current heading; `holdcourse` remains active until arrival or manual cancellation. Auto-disengage on energy depletion is out of scope.
- Autopilot ship enters combat: autopilot continues; combat interaction with autopilot is explicitly out of scope.
- Spy planted on a planet that already has a `spyowner` from another player: the new spy overwrites the previous owner.
- Multiple spies attempted by same player on same planet: each consumes one spy item; net effect is replacing `spyowner` with the same ID (no compounding intel).
- `hel` with case variations (`HEL`, `Hel`): treated case-insensitively, matching the rest of the command set.
- `cls` when no events are present: no-op; no error message.

## Requirements *(mandatory)*

### Functional Requirements

#### Navigation Autopilot

- **FR-001**: System MUST accept `nav <x> <y>` where x and y are integer sector coordinates within the universe bounds; out-of-bounds input MUST be rejected with a usage message.
- **FR-002**: System MUST persist autopilot state on the ship via the existing `holdcourse` field, set when a valid `nav` target is supplied and cleared on arrival or manual cancellation.
- **FR-003**: While autopilot is active, the per-tick physics step MUST recompute the bearing from current position to target and update the ship's `head2b` (target heading) accordingly so existing rotation logic steers toward the target.
- **FR-004**: System MUST detect arrival using a floor-based sector match — when `floor(ship.x) == targetX && floor(ship.y) == targetY` — and broadcast an arrival event to the owning player, then disengage autopilot.
- **FR-005**: Issuing `rot`, `imp`, or `war` while autopilot is active MUST silently disengage autopilot before applying the manual command.
- **FR-006**: `nav` with no arguments MUST report current autopilot status: target coordinates, remaining distance, and bearing if active; or "inactive" if not.
- **FR-007**: Autopilot acceptance message MUST include the same target/bearing/distance information the original game's NAV01 message produced.
- **FR-021**: Re-issuing `nav <x> <y>` while autopilot is already active MUST silently replace the existing target with the new one and emit the standard NAV01-style acknowledgment (no separate "retargeted" event).
- **FR-022**: Issuing `nav <x> <y>` while the ship is in orbit of a planet MUST automatically break orbit before engaging autopilot, in a single command.

#### Spy

- **FR-008**: `spy` MUST require the ship to be in orbit of a planet (equivalent to original `where >= 10`); ships not in orbit MUST receive a rejection.
- **FR-009**: `spy` MUST reject targeting the player's own planet, wormholes, and any planet while the ship is in the neutral zone.
- **FR-010**: `spy` MUST consume one spy item from the ship's cargo (item slot equivalent to original `I_SPY`); if zero are available, the command MUST be rejected without state change.
- **FR-011**: On success, `spy` MUST set the planet's `spyowner` field to the issuing player's user ID and persist the change.
- **FR-012**: When a planet has a `spyowner` matching the scanning player's user ID, the planet scan output MUST include intelligence fields (population, item inventory, defenses) not shown to non-owners.
- **FR-013**: Spy persistence and removal MUST follow the original game's behavior; explicit removal mechanics beyond what the C source already implements are out of scope.

#### Help

- **FR-014**: System MUST accept `hel` and `?` as equivalent command aliases.
- **FR-015**: With no argument, `hel` MUST list exactly the topic groups: navigation, combat, trade, planet, ship. Topic-group granularity only — per-command help (e.g., `hel pha`) is out of scope for v1 and explicitly deferred.
- **FR-016**: With a known topic argument, `hel` MUST return help text describing the commands in that topic group, faithful to the original game's wording where the original text exists.
- **FR-017**: With an unknown topic argument, `hel` MUST report the topic is unknown and list valid topics.

#### Clear Screen

- **FR-018**: System MUST accept `cls` as a command that clears only the issuing player's client event log.
- **FR-019**: `cls` MUST NOT modify any backend state (ship, planet, sector, mail, etc.).
- **FR-020**: `cls` MUST NOT affect any other player's event log.

### Key Entities *(include if feature involves data)*

- **Ship**: Existing entity. Uses existing `holdcourse` field (already mapped) plus new ship-state fields for autopilot target coordinates (target X, target Y).
- **Planet**: Existing entity. Uses existing `spyowner` field (already mapped) to record the user ID of the player who has an active spy.
- **HelpTopic**: Static reference data. A topic name plus the help text body. Stored in code/config, not the database.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player can travel from one corner of the galaxy to another using a single `nav` command without further input, and the autopilot reliably arrives at the target sector in 100% of test scenarios where the ship has sufficient energy and an unobstructed path.
- **SC-002**: A player orbiting an enemy planet with one spy item can plant a spy in a single command, and the next planet scan reveals intelligence not previously visible.
- **SC-003**: A new player can discover the full set of major command groups within 30 seconds of typing `hel` for the first time.
- **SC-004**: Issuing `cls` clears the visible event log within one frame of the client receiving the command, with zero backend round-trip side effects.
- **SC-005**: All existing manual movement commands (`rot`, `imp`, `war`) continue to work identically when issued without an active autopilot, demonstrating no regression.

## Assumptions

- The `holdcourse` field already exists on the ship persistence layer (verified). Two new fields are required for autopilot target coordinates; these are added during implementation.
- The `spyowner` field already exists on the planet persistence layer (verified). No migration needed for spy ownership.
- Spy intelligence fields (population, items, defenses) are already present on the Planet entity from the planet system feature; the scan-rendering layer only needs to gate visibility on `spyowner == viewer`.
- The original game's `I_SPYEQ` constant referenced in user input maps to the C source's `I_SPY` item slot — both refer to the same in-cargo spy equipment item.
- Autopilot does not handle obstacles (mines, other ships, planets) — the original game does not, and this feature inherits that behavior.
- Help text is authored to faithfully match the original game's tone; verbatim copy from the C source's message files is preferred where available, paraphrased otherwise.
- The frontend already has an event-log component that can be cleared; `cls` is wired through the existing command-dispatch path to that component without round-tripping through the game tick.
- Spy persists indefinitely on the planet record until overwritten by another player's spy or until existing planet-ownership-change logic clears `spyowner`.
