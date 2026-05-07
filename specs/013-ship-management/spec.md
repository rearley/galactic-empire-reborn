# Feature Specification: Ship Management Commands

**Feature Branch**: `013-ship-management`
**Created**: 2026-05-06
**Status**: Draft
**Input**: User description: Ship management command suite — cloak, maint, transfer, jettison, set, destruct, abort, abandon

## Clarifications

### Session 2026-05-06

- Q: What can be transferred between ships via the `transfer` command? → A: Gold and cargo items (by item type and quantity) — canonical GE behavior
- Q: Does cloak drain energy only once at activation, or continuously while active? → A: One-time activation cost + per-tick drain while cloaked (canonical GE)
- Q: Which configurable options must `set` support in v1? → A: auto-shield and auto-repair only; defer additional flags until a consuming code path needs them
- Q: After `abandon` succeeds, what state is the captain in? → A: Captain remains logged in but shipless; must re-enter the feature-011 onboarding flow to acquire a new ship
- Q: How often is the destruct countdown broadcast as a warning event to the sector? → A: On initiation, every physics tick (6s) while active, and on destruction

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cloak the ship to evade detection (Priority: P1)

A captain in a hostile sector activates their cloaking device. While cloaked,
they no longer appear on other captains' reports and cannot be acquired as a
torpedo target. They can deactivate cloak when ready to fight or trade.

**Why this priority**: Cloak is referenced by four live code paths
(torpedo targeting, ship reports, Cybertron AI threat assessment) that already
check `ship.cloak === 10`. Without a `cmd_cloak` to set this state, those
paths can never trigger and the cloaking subsystem is effectively dead code.
This must ship before any other command in the suite to close that gap.

**Independent Test**: Captain types `cloak`. Verify ship's cloak state flips
to active, energy is deducted, an event is emitted, and a second captain in
the same sector running `report` no longer sees the cloaked ship. Typing
`cloak` again deactivates and restores visibility.

**Acceptance Scenarios**:

1. **Given** an uncloaked ship with sufficient energy, **When** the captain
   issues the cloak command, **Then** the ship enters cloaked state, energy
   is deducted, and a "cloak engaged" event is logged.
2. **Given** an already cloaked ship, **When** the captain issues the cloak
   command, **Then** the ship decloaks and a "cloak disengaged" event is
   logged.
3. **Given** an uncloaked ship below the cloak energy threshold, **When** the
   captain issues the cloak command, **Then** the command is rejected with
   an "insufficient energy" message and cloak state is unchanged.
4. **Given** a cloaked ship, **When** another captain in the same sector
   runs report, **Then** the cloaked ship is omitted from the listing.
5. **Given** a cloaked ship, **When** an enemy attempts to lock torpedoes
   on it, **Then** target acquisition fails.

---

### User Story 2 - Pay maintenance to repair damage (Priority: P1)

A damaged captain spends cash to repair their hull. Repair cost scales with
damage level using the formula from `GEFUNCS.C`. After payment, damage is
reduced and the captain's cash balance drops accordingly.

**Why this priority**: Damage accrues during routine combat and there is
currently no player-driven way to repair it outside of auto-repair on a
planet. Maintenance is the canonical mid-flight repair mechanism in the
original game.

**Independent Test**: Place a damaged ship in orbit at an inhabited friendly
planet, set User.cash to a known value, run the maint command, verify damage
drops and cash decreases by the expected formula amount. Then verify each
rejection path independently with a ship in the corresponding state.

**Acceptance Scenarios**:

1. **Given** a damaged ship orbiting an inhabited friendly planet and a
   captain with sufficient cash, **When** the captain issues the maint
   command, **Then** a repair of (damage/3)+1 is queued on the ship,
   reducing damage over subsequent ticks. Cost is fixed at 200 cr (normal
   planet) or 2500 cr (Zygor neutral-zone planet) — not scaled by damage
   level. A "maintenance complete" event is logged.
2. **Given** a captain with insufficient cash for full repair, **When** the
   captain issues the maint command, **Then** the command is rejected with
   a clear "insufficient funds" message and ship state is unchanged.
3. **Given** an undamaged ship, **When** the captain issues the maint
   command, **Then** they are told no maintenance is needed and no cash is
   debited.
4. **Given** a ship NOT in orbit (in deep space), **When** the captain
   issues the maint command, **Then** the command is rejected with "You
   must be orbiting a planet to perform maintenance." and no state changes.
5. **Given** a ship in orbit at an uninhabited planet (no owner) or an
   underpopulated planet (men < 25 000), **When** the captain issues the
   maint command, **Then** the command is rejected with "This planet cannot
   service your ship." and no state changes.
6. **Given** a ship currently combat-locked (`cantexit > 0`), **When** the
   captain issues the maint command, **Then** the command is rejected with
   "You cannot perform maintenance while in combat." and no state changes.
7. **Given** a ship in orbit at a neutral-zone planet that is NOT Zygor
   (planet index neither 1 nor 2), **When** the captain issues the maint
   command, **Then** the command is rejected with "Only Zygor stations
   service ships in the neutral zone." and no state changes.

---

### User Story 3 - Transfer items and gold between ships (Priority: P2)

Two captains in the same sector cooperate by transferring cargo or gold
between their ships. Both ships must be present and online; transfers are
atomic — either the whole amount moves or nothing does.

**Why this priority**: Enables team play and resource sharing between
allies. Less critical than cloak/maint because workarounds exist (sell on a
planet, partner buys), but it is part of the canonical command set.

**Independent Test**: Place two test ships in the same sector with known
item counts and gold balances. Issue transfer from ship A to ship B for a
specific item and quantity. Verify ship A's inventory decreases and ship
B's increases by the exact amount, and both captains receive event log
entries.

**Acceptance Scenarios**:

1. **Given** two online ships in the same sector with sufficient inventory,
   **When** captain A transfers items or gold to captain B, **Then** ship
   A's count decreases, ship B's count increases by the same amount, and
   both captains see a transfer event.
2. **Given** the target ship is in a different sector, **When** the
   transfer command is issued, **Then** it is rejected with a "target not
   in this sector" message.
3. **Given** the target ship is offline, **When** the transfer command is
   issued, **Then** it is rejected with a "target not online" message.
4. **Given** the source ship lacks the requested quantity, **When** the
   transfer command is issued, **Then** it is rejected with an
   "insufficient cargo" message and no state changes.

---

### User Story 4 - Jettison cargo to free up space (Priority: P2)

A captain dumps unwanted items into space to lighten their load. Items are
removed from the ship's inventory and lost permanently — there is no
collection mechanic in v1.

**Why this priority**: Lower priority than transfer because outcomes are
destructive and use cases are narrower (e.g., dumping low-value items to
make room for high-value cargo before a planet visit).

**Independent Test**: Set a ship's item count to a known value, issue
jettison for a specific item and quantity, verify the count decreases and
the items do not reappear anywhere else in the world.

**Acceptance Scenarios**:

1. **Given** a ship carrying items, **When** the captain jettisons a valid
   quantity, **Then** the inventory decreases by that quantity and a
   "cargo jettisoned" event is logged.
2. **Given** a captain attempts to jettison more than they carry, **When**
   the command is issued, **Then** it is rejected with an "insufficient
   cargo" message and inventory is unchanged.
3. **Given** any ship state, **When** items are jettisoned, **Then** they
   are not added to any planet, sector, or other ship — they are gone.

---

### User Story 5 - Configure ship automation options (Priority: P3)

A captain toggles ship preferences such as auto-shield (shields raise
automatically when threatened) and auto-repair (damage repairs continuously
while in orbit at a friendly planet). Settings persist across sessions.

**Why this priority**: Quality-of-life feature; gameplay works without it,
but it reduces tedious manual toggling.

**Independent Test**: Issue the set command for each option, verify the
flag is updated on the ship, log out and back in, verify the flag persists.

**Acceptance Scenarios**:

1. **Given** any ship state, **When** the captain sets the auto-shield
   flag on, **Then** the flag is updated and persists across sessions.
2. **Given** any ship state, **When** the captain sets the auto-repair
   flag, **Then** the flag is updated and persists across sessions.
3. **Given** an unknown option name, **When** the set command is issued,
   **Then** it is rejected with a "unknown option" message.

---

### User Story 6 - Self-destruct and abort (Priority: P3)

A captain initiates a self-destruct countdown. The ship is destroyed when
the timer expires unless the captain aborts first. Self-destruct deducts
score as a penalty.

**Why this priority**: Edge-case command — used to escape unwinnable
situations or as a last-ditch tactic. Not core gameplay but part of the
canonical command set.

**Independent Test**: Issue destruct, verify a countdown is recorded on the
ship and survives subsequent ticks. Wait until expiration, verify the ship
is destroyed and the captain's score is penalized. In a separate scenario,
issue destruct then abort before expiration, verify the countdown clears
and no destruction occurs.

**Acceptance Scenarios**:

1. **Given** a ship not currently self-destructing, **When** the captain
   issues destruct, **Then** a countdown is started, all captains in the
   sector see a warning event, and the countdown is preserved across tick
   cycles.
2. **Given** an active destruct countdown, **When** ticks elapse to the
   countdown expiration, **Then** the ship is destroyed, the captain's
   score is reduced, and a destruction event is broadcast.
3. **Given** an active destruct countdown, **When** the captain issues
   abort, **Then** the countdown clears, the ship survives, and an "abort"
   event is logged.
4. **Given** no active countdown, **When** the captain issues abort,
   **Then** the command is rejected with a "no active self-destruct"
   message.

---

### User Story 7 - Abandon ship (Priority: P3)

A captain renounces their current ship, leaving it behind. The captain is
released from the ship and the ship enters an abandoned state.

**Why this priority**: Edge case used when a captain wants a fresh start
without dying. Lowest priority since it is rarely used and has overlap with
self-destruct as an exit path.

**Independent Test**: Issue abandon, verify the ship's status is set to
abandoned and the captain is no longer associated with that ship for
gameplay purposes.

**Acceptance Scenarios**:

1. **Given** a captain currently piloting a ship, **When** they issue the
   abandon command, **Then** the ship's status becomes abandoned, the
   captain is detached, and an event is broadcast to the sector.
2. **Given** an abandoned ship, **When** any captain runs report or scan,
   **Then** the ship is shown as abandoned (not as an active enemy or
   ally).

---

### Edge Cases

- Captain attempts to cloak while a self-destruct countdown is active — the
  cloak proceeds normally; cloak and destruct are independent.
- Captain attempts to transfer to themselves — rejected as invalid target.
- Captain issues destruct twice in a row — second is rejected as a
  countdown is already active.
- Captain issues abandon during an active destruct countdown — abandon
  takes precedence and clears the countdown.
- Captain issues maint while in combat (taking damage on the same tick) —
  the repair completes; any incoming damage on the next tick re-damages the
  ship as normal.
- Two captains attempt simultaneous transfers in opposite directions — both
  succeed if both have sufficient inventory; transfers are evaluated in
  command-arrival order.
- Captain logs off while cloaked — ship persists in cloaked state until they
  return; cloak energy drain (if any) continues per existing tick rules.
- Captain attempts to cloak with cloak energy cost exactly equal to current
  energy — succeeds, leaves ship at zero energy.

## Requirements *(mandatory)*

### Functional Requirements

#### Cloak (FR-100 series)

- **FR-101**: System MUST provide a cloak command that toggles the ship's
  cloak state between active and inactive.
- **FR-102**: System MUST set the ship's cloak indicator to the active
  marker value (10) when cloaking and to zero when decloaking, matching the
  values already checked by torpedo targeting, report, and Cybertron AI.
  Cloak activation follows the canonical ramp 1 → 2 → 10 over two
  consecutive physics ticks per `GEFUNCS.C:cloakstat` (line 1366).
- **FR-103**: System MUST reject the cloak activation when the ship lacks
  the required energy and leave cloak state unchanged.
- **FR-104**: System MUST deduct the cloak activation energy cost on
  successful activation, and MUST also deduct a per-tick cloak maintenance
  energy cost on every physics tick the ship remains cloaked. If energy is
  insufficient to pay the per-tick cost, the ship automatically decloaks
  and a "cloak collapsed" event is logged.
- **FR-105**: System MUST emit a cloak engagement and disengagement event
  to the captain on each successful toggle.

#### Maintenance (FR-200 series)

- **FR-201**: System MUST provide a maint command that repairs ship damage
  in exchange for cash from the captain's account.
- **FR-202**: System MUST calculate maintenance cost as a fixed cost of
  200 cr at a normal inhabited planet or 2500 cr at a Zygor neutral-zone
  planet (`GECMDS.C:4452`); repair queued is (damage/3)+1 per `GEFUNCS.C`.
- **FR-203**: System MUST reject the maint command when the captain has
  insufficient cash and leave damage and cash unchanged.
- **FR-204**: System MUST inform the captain that no maintenance is needed
  when the ship has zero damage.
- **FR-205**: System MUST debit the captain's cash and reduce ship damage
  in a single atomic update on success.
- **FR-206**: System MUST reject the maint command when the ship is not in
  orbit at a planet (`ShipState.where < 10`) with the message "You must be
  orbiting a planet to perform maintenance." and leave all state unchanged.
  Maintenance is NOT available in deep space. *(Source: `GECMDS.C:4452`
  cmd_maint orbit gate.)*
- **FR-207**: System MUST reject the maint command when the orbited planet
  is uninhabited (no owner) OR underpopulated (men < 25 000) with the
  message "This planet cannot service your ship." and leave all state
  unchanged. *(Source: `GECMDS.C:4452` MAINT8 gate.)*
- **FR-208**: System MUST reject the maint command when the ship is
  combat-locked (`ShipState.cantexit > 0`) with the message "You cannot
  perform maintenance while in combat." and leave all state unchanged.
  *(Source: `GECMDS.C:4452` MAINT9 gate.)*
- **FR-209**: System MUST reject the maint command when the ship is
  orbiting a planet in the neutral zone whose planet index is neither 1
  nor 2 (i.e., not Zygor) with the message "Only Zygor stations service
  ships in the neutral zone." and leave all state unchanged. *(Source:
  `GECMDS.C:4452` MAINT4 gate; canonical Zygor exception.)*
- **FR-210**: Planet password gates (canonical `cmd_maint` MAINT2/MAINT3)
  are explicitly deferred from v1. All owned, sufficiently populated
  planets are treated as accessible regardless of password. *(See
  research.md D3 deviation note.)*

#### Transfer (FR-300 series)

- **FR-301**: System MUST provide a transfer command that moves either gold
  or a specified cargo item type and quantity from the issuing captain's
  ship to a target ship. Energy, shields, and non-cargo ship attributes
  are NOT transferable in v1.
- **FR-302**: System MUST reject transfers when the target ship is not in
  the same sector as the source ship.
- **FR-303**: System MUST reject transfers when the target ship is offline.
- **FR-304**: System MUST reject transfers when the source ship's inventory
  or gold is below the requested quantity.
- **FR-305**: System MUST apply transfers atomically — either both ships'
  states update or neither does.
- **FR-306**: System MUST emit transfer events to both source and target
  captains.

#### Jettison (FR-400 series)

- **FR-401**: System MUST provide a jettison command that removes a
  specified item type and quantity from the issuing ship's inventory.
- **FR-402**: System MUST reject jettison commands when the requested
  quantity exceeds the ship's current inventory.
- **FR-403**: Jettisoned cargo MUST NOT be recoverable in v1 — no planet,
  sector, or other ship gains the items.
- **FR-404**: System MUST emit a jettison event to the captain.

#### Set (FR-500 series)

- **FR-501**: System MUST provide a set command that toggles or assigns
  the ship configuration flags auto-shield and auto-repair. These are the
  only options recognized in v1; additional canonical GE flags are
  deferred until a consuming code path requires them.
- **FR-502**: System MUST persist set option values across sessions on the
  ship's stored state.
- **FR-503**: System MUST reject unknown option names with an informative
  error.

#### Self-destruct and abort (FR-600 series)

- **FR-601**: System MUST provide a destruct command that starts a
  self-destruct countdown on the ship.
- **FR-602**: System MUST persist the active countdown on in-memory ship
  state such that it continues to advance across physics tick cycles.
- **FR-603**: System MUST destroy the ship when the countdown reaches zero
  and apply a score penalty to the captain.
- **FR-604**: System MUST broadcast a destruct warning event to the sector
  on initiation, on every physics tick (6s) while the countdown is active
  (showing remaining ticks), and a destruction event on expiration.
- **FR-605**: System MUST provide an abort command that clears an active
  destruct countdown.
- **FR-606**: System MUST reject the abort command when no countdown is
  active.
- **FR-607**: System MUST reject a second destruct command while a
  countdown is already active.

#### Abandon (FR-700 series)

- **FR-701**: System MUST provide an abandon command that detaches the
  captain from their current ship and marks the ship as abandoned.
- **FR-702**: An abandoned ship MUST NOT be treated as the captain's
  active ship for subsequent commands.
- **FR-703**: System MUST broadcast an abandon event to the sector.
- **FR-704**: After abandon, the captain MUST remain authenticated but
  shipless, and MUST be routed back through the feature-011 new-player
  onboarding flow to acquire a new ship before any further gameplay
  command is accepted.

#### Cross-cutting (FR-800 series)

- **FR-801**: All eight commands MUST be wired into the existing command
  router dispatch table.
- **FR-802**: All eight commands MUST emit appropriate game events for
  consumption by the event log.
- **FR-803**: All commands MUST validate that the issuing captain has an
  active, non-abandoned ship before executing.

### Key Entities

- **Ship state**: in-memory record holding cloak indicator, damage level,
  shield level, item inventory, gold, auto-shield flag, auto-repair flag,
  and active self-destruct countdown.
- **Captain account**: persistent record holding cash balance and score,
  modified by maint (cash) and destruct (score).
- **Self-destruct countdown**: per-ship value that decrements with physics
  ticks; reaching zero triggers destruction.
- **Game event**: emitted record describing a player-visible action (cloak
  engaged, maintenance complete, transfer received, destruct warning, etc.)
  for the event log.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All four pre-existing code paths that check the cloaked
  indicator (torpedo targeting, ship report visibility, three Cybertron AI
  decisions) are reachable and exercised by the new cloak command, verified
  by tests that drive each path through the command.
- **SC-002**: The maint command at a friendly inhabited planet debits the
  canonical cost (200 or 2500 cr) and queues (damage/3)+1 repair on the
  ship, completing within 2 s of command-to-confirmation latency.
- **SC-003**: Inter-ship transfers preserve total item and gold counts
  across the two ships (zero net loss or duplication) in 100% of test runs.
- **SC-004**: Self-destruct countdowns advance correctly across at least
  three consecutive physics ticks and trigger destruction within one tick
  of expiration in 100% of test runs.
- **SC-005**: Aborted self-destruct countdowns prevent ship destruction in
  100% of test runs.
- **SC-006**: Set options persist across captain logout and login in 100%
  of test runs.
- **SC-007**: Each of the eight commands logs a player-visible event on
  every successful invocation, verified by event log assertions in tests.
- **SC-008**: Balance regression tests cover the cloak energy cost, the
  maintenance cost formula, the destruct score penalty, and the destruct
  countdown duration so changes to these constants fail CI.

## Assumptions

- The cloak indicator value (10) matches the original C source. CLENGUSE
  is a sysop-tunable runtime option declared in `GEGLOBAL.H:150` and
  loaded in `GEMAIN.C:519`. For v1 it is injected via env var
  `CLOAK_ENERGY_USE` (default 50, clamped 1..32000), modeled on the
  `CHGLOSER_PERCENT` pattern from feature 009.
- The maintenance cost formula in `GEFUNCS.C` uses damage level as its
  primary input; precise coefficients are confirmed at planning time.
- Self-destruct countdown duration is COUNTDOWN = 20 physics ticks,
  verified against `GEMAIN.H`.
- Score penalty for self-destruct is fixed (not scaled to ship value);
  exact value is confirmed at planning time.
- Transfers between ships in the same sector require both ships to be
  online — offline ships are not valid transfer targets in v1.
- Jettisoned cargo is permanently lost; a future feature may add
  collectability but is explicitly out of scope here.
- Cloaking visual hiding on the frontend scan map is out of scope; the
  existing report-level hiding is sufficient for v1.
- Auto-shield and auto-repair behavioral logic (when the flags actually
  trigger) already exists or will be implemented as part of the broader
  tick engine — this feature only supplies the toggle command.
- Existing `CommandRouterService` dispatch table and `ShipStateService`
  same-sector lookup primitives are reused; no new infrastructure modules
  are introduced.
