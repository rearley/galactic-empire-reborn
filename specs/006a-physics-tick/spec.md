# Feature Specification: Physics Tick Activation

**Feature Branch**: `006a-physics-tick`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "Activate the 6-second PHYSICS_TICK so ships actually move, rotate, and drain energy. Pure physics prerequisite for 006b-combat."

## Clarifications

### Session 2026-05-02

- Q: How should the physics tick treat ships that are destroyed, in planetary orbit, or docked — what counts as "active"? → A: All non-destroyed ships tick the per-tick countdowns (hyper-phaser cooldown, post-combat exit lockout); only ships that are neither in orbit nor docked run the rotate / accelerate / move / maintenance-debit block. Destroyed/removed ships are skipped entirely.
- Q: Do AI ships (Cybertron, Droid, Murdonian) pay the per-tick movement-maintenance energy debit? → A: No — AI ships skip the maintenance debit entirely, matching the original `moveship()` which only debits `MOVENGUSE` for player ships.
- Q: What payload should the sector-transition and hyperspace-entry/exit signals carry? → A: Typed events with the minimum data the gateway needs. Sector-transition: `{ shipId, fromSector, toSector, x, y, tickAt }`. Hyperspace: `{ shipId, direction: 'enter' | 'exit', speed, tickAt }`. No full ShipState snapshot; no transport/room details.
- Q: How should a per-ship fault during a physics tick be handled so the batch keeps running? → A: Catch the error, log it with `shipId`, `tickAt`, and stack, increment a per-tick fault counter metric, and continue processing the rest of the batch. Do not quarantine the ship.
- Q: In what order should ships be processed within a physics tick? → A: Ascending `shipId` order — stable and deterministic so tests and bug reproductions don't depend on Map insertion order.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Ships move under impulse and warp (Priority: P1)

A pilot stages a speed change with `impulse` or `warp`, and on the next physics tick the ship's coordinates change in the heading direction at the new speed. The world advances continuously every 6 seconds whether the player is watching or not.

**Why this priority**: Movement is the foundational verb of the game. Nothing else — combat, exploration, trade routes, AI pursuit — is meaningful until ships move on the tick. Every prior feature has staged inputs that this story finally consumes.

**Independent Test**: Place a ship at a known coordinate with heading 90°, stage `speed2b = 1` (warp 1), advance one physics tick in a test harness, and assert the ship's x/y coordinates have advanced by the expected vector amount and that `speed` now reflects `speed2b` (subject to the acceleration curve from the original game).

**Acceptance Scenarios**:

1. **Given** a ship at rest with `speed2b` staged to a non-zero value, **When** one physics tick fires, **Then** `speed` advances toward `speed2b` per the acceleration curve and coordinates update by the heading vector.
2. **Given** a ship moving at warp with sufficient energy, **When** a physics tick fires, **Then** the ship's coordinates update and energy decreases by the warp-scaled cost.
3. **Given** a ship moving with insufficient energy to sustain its speed, **When** a physics tick fires, **Then** energy clamps to zero and movement degrades consistently with the original game's behavior.
4. **Given** no players are connected to the affected sector, **When** physics ticks fire, **Then** ship state still advances (the world is persistent).

---

### User Story 2 — Heading chases the staged target each tick (Priority: P1)

A pilot issues `rotate <degrees>`. The rotate command (already implemented in 003) deducts the rotation energy cost up-front and writes a target heading (`head2b`). Each physics tick, the ship's current heading advances toward the target by a per-class step until it matches.

**Why this priority**: Heading determines movement direction and weapon facing. Without rotation actually applying on the tick, every other movement and combat behavior reads stale state.

**Independent Test**: Set a ship's heading to 0° and target heading to 90°, fire physics ticks, assert heading advances by the per-tick rotation step each tick, then snaps to 90° on the tick where the remaining gap is within one step.

**Acceptance Scenarios**:

1. **Given** a ship with a target heading different from its current heading, **When** a physics tick fires, **Then** heading advances toward the target by the per-tick rotation step (derived from the ship's class).
2. **Given** the gap between current and target heading is within one rotation step, **When** a tick fires, **Then** heading snaps to the target.
3. **Given** the ship rotates the short way around the circle (e.g., 350° → 10°), **When** a tick fires, **Then** heading advances in the correct direction and the resulting heading is normalized into the [0, 360) range.
4. **Given** heading already equals target, **When** a tick fires, **Then** rotation does nothing and no event is emitted.

> Energy for rotation is paid by the `rotate` command itself (already implemented), not by the physics tick. If the pilot lacks energy, the command is refused and `head2b` is never updated; the tick has nothing to do.

---

### User Story 3 — Per-tick countdowns advance (Priority: P2)

Cooldowns and timers that the original game decremented on every physics tick are advanced each tick: the hyper-phaser cooldown counts down toward ready, and the post-combat exit lockout counts down toward expiry.

**Why this priority**: These timers gate critical player actions (firing the hyper-phaser, leaving a combat sector). They are simple decrements but unblock downstream work.

**Independent Test**: Set hyper-phaser cooldown to N and battle-lock to M; advance one physics tick; assert each is exactly one less, floor at zero, and never negative.

**Acceptance Scenarios**:

1. **Given** a ship with hyper-phaser cooldown > 0, **When** a physics tick fires, **Then** the cooldown is decremented by 1.
2. **Given** a ship with the post-combat exit lockout > 0, **When** a physics tick fires, **Then** the lockout is decremented by 1.
3. **Given** any of these counters is already 0, **When** a tick fires, **Then** the value remains 0 (no underflow).

---

### User Story 4 — Warp command gates correctly on class and topspeed (Priority: P2)

The `warp` command rejects or warns based on the ship's class and current `topspeed` field, matching the original game's gate sequence. `topspeed` itself is set from class maximum warp on ship creation, restored on full repair, and ratcheted down by the existing overspeed-warning system; this feature does not introduce a skill or damage scalar that did not exist in the original.

**Why this priority**: The two already-stubbed gates (the "this class can't warp" rejection and the "engines blown" rejection) are blocking partial-tactical scan stubs that probe the same fields.

**Independent Test**: For each gate condition, issue a `warp` command and assert the documented refusal/warning is produced and `speed2b` is or isn't updated as appropriate.

**Acceptance Scenarios**:

1. **Given** a ship whose class has maximum warp = 0, **When** the pilot issues `warp N`, **Then** the command is refused (WARP01) and `speed2b` is unchanged.
2. **Given** a ship whose `topspeed` is 0 (engines wrecked), **When** the pilot issues `warp N`, **Then** the command is refused (WARPSPD2) and `speed2b` is unchanged.
3. **Given** an argument N strictly greater than `topspeed + topspeed/2`, **When** the pilot issues `warp N`, **Then** the command is refused (WARP03).
4. **Given** an argument N greater than `topspeed` but ≤ `topspeed + topspeed/2`, **When** the pilot issues `warp N`, **Then** the command proceeds with an overspeed warning (WARP04) and `speed2b` is set; the existing overspeed-penalty path in `moveship` may eventually ratchet `topspeed` down.
5. **Given** an argument N ≤ `topspeed`, **When** the pilot issues `warp N`, **Then** the command proceeds with no warning and `speed2b` is set.
6. **Given** an argument N < 0, **When** the pilot issues `warp N`, **Then** the command is refused (WARP02) and `speed2b` is unchanged.

> Out of scope here: introducing any new pilot-skill or warp-engine-damage scalar on `topspeed`. The original C source does not contain one, and `topspeed` is already being set from class on ship creation. This story is purely about ensuring the warp-command gate logic exists and the `topspeed` field is reliably populated for use by other features (e.g., partial-tactical scan).

---

### Edge Cases

- A physics tick fires while a ship is at exactly speed 0 with no staged change — no coordinate change, no movement-maintenance debit, no errors.
- A ship's energy falls below the movement-maintenance floor mid-tick — `speed2b` is forced to 0 and the ship coasts down via the deceleration step over subsequent ticks (it does not stop instantly). Energy never goes below the gating fudge floor used by the original (energy stays ≥ ~500 from these debits).
- Coordinates cross a sector boundary within a single tick — the ship's sector is derived from coordinates on read (no stored field); the tick MUST emit a sector-transition signal so downstream socket-room routing can react. The coordinate update is the source of truth; nothing else needs to be kept atomically in sync.
- A ship rotates across the 0/360 boundary — the resulting heading is normalized to [0, 360) and the rotation step picks the short direction.
- A ship is destroyed or removed mid-batch — physics for that ship is skipped; remaining ships in the same tick still process correctly.
- A ship is in planetary orbit or docked — its rotate/accelerate/move/maintenance block is skipped, but its per-tick countdowns (hyper-phaser cooldown, post-combat exit lockout) still decrement so timers eventually expire.
- Many ships exist in the same tick — every active ship is processed each tick within the 6-second budget; one ship's failure does not abort the batch.
- A ship crosses the speed=1000 (warp) boundary on this tick — a hyperspace-entry/exit signal is emitted (matching the original's `hyperspace()` call site).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST advance every non-destroyed ship's state once per 6-second physics tick. The rotate-step, accelerate-step, move-step, and maintenance-debit (hereafter "the conditional block") MUST run only for ships that are neither in planetary orbit nor docked, and within that block the order MUST be: rotate-step, accelerate-step, move-step, maintenance-debit (matching `accel()` → `moveship()` ordering in the original). Per-tick countdowns (hyper-phaser cooldown, post-combat exit lockout) MUST run *unconditionally* — for every non-destroyed ship regardless of orbit/dock status — *after* the conditional block (which may have been skipped). Destroyed/removed ships MUST be skipped entirely.
- **FR-002**: On each tick, the heading MUST advance toward the target heading by the per-class rotation step (in the original: `shipclass.max_accel / 10.0`); when the gap is within one step, heading MUST snap to the target. The tick MUST NOT debit rotation energy — that cost is paid by the rotate command.
- **FR-003**: On each tick, current speed MUST advance toward the staged target speed by the per-class acceleration step on the way up, and by twice that step on the way down, snapping to the target when within one step.
- **FR-004**: When the acceleration step would push speed at or above the warp threshold (1000 internal units = warp factor 1), the system MUST debit the original game's acceleration energy constant for that step; below the warp threshold, the acceleration step MUST debit zero. If the debit fails, the system MUST force the target speed to zero so the ship begins to decelerate on the next tick.
- **FR-005**: After speed is updated, position MUST be updated using the original-source vector formula (sin of heading on x, negative cos of heading on y, divided by the original-source coord scale).
- **FR-006**: When `speed > 0` and the ship is a player-controlled ship, the system MUST debit the original game's per-tick movement-maintenance energy constant. AI-controlled ships (Cybertron, Droid, Murdonian) MUST NOT be debited for movement maintenance. When energy then falls below the original game's movement-energy floor, the system MUST force the target speed to zero (not stop the ship instantly).
- **FR-007**: Energy MUST be gated by the original game's safety floor on every debit (the original refuses any debit that would leave less than the per-debit fudge); energy MUST NOT go below that floor as a result of physics-tick activity.
- **FR-008**: System MUST decrement the hyper-phaser cooldown by one per physics tick when greater than zero, flooring at zero.
- **FR-009**: System MUST decrement the post-combat exit lockout by one per physics tick when greater than zero, flooring at zero.
- **FR-010**: The current sector MUST be derived from coordinates on read (no stored field). After a coordinate update, if the derived sector differs from the pre-update derived sector, the system MUST emit a typed sector-transition signal with payload `{ shipId, fromSector, toSector, x, y, tickAt }`. The signal MUST NOT include a full ShipState snapshot or transport-layer details (e.g., Socket.io room names).
- **FR-011**: When the speed update crosses the warp threshold (1000 internal units) in either direction, the system MUST emit a typed hyperspace-entry/exit signal with payload `{ shipId, direction: 'enter' | 'exit', speed, tickAt }`, matching the original's `hyperspace()` call site.
- **FR-012**: The `warp` command MUST enforce, in order: (a) class-has-warp gate (refuse if class max_warp = 0), (b) topspeed-nonzero gate (refuse if topspeed = 0), (c) negative-warp gate, (d) hard-cap gate (refuse if requested factor > topspeed + topspeed/2), (e) overspeed-warning path when requested factor > topspeed but ≤ hard cap (proceeds, sets `speed2b`, emits warning).
- **FR-013**: Topspeed MUST be set from ship-class maximum warp at ship creation and at full-repair completion. This feature MUST NOT introduce a pilot-skill or warp-engine-damage scalar on topspeed beyond what exists in the original source.
- **FR-014**: All physics math (rotation step, acceleration step, position update, energy gates) MUST be expressed as deterministic, side-effect-free functions: identical inputs always produce identical outputs. The tick-driven service MUST be the only consumer that mutates ship state.
- **FR-015**: System MUST process all active ships within a single physics tick; a fault on one ship MUST NOT prevent the rest of the batch from advancing. When a per-ship fault occurs, the system MUST catch the error, log it with `shipId`, `tickAt`, and stack trace, increment a per-tick fault counter metric, and continue processing the remaining ships. The faulted ship MUST NOT be quarantined — it is re-attempted on the next tick.
- **FR-016**: System MUST preserve the existing test suite and MUST add coverage for every behavior in this spec, including a regression test that fails if any of the original game's relevant balance constants used by this feature change (`ACCENGAMT`, `MOVENGUSE`, `MOVENGMIN`, `ROTENGUSE`, `TICKTIME`, the per-class `max_accel` and `max_warp` values referenced).
- **FR-017**: Heading values MUST be normalized to the [0, 360) range after rotation is applied.
- **FR-018**: This feature MUST NOT introduce weapon, damage, mine, decoy, jammer, shield, phaser, torpedo, missile, combat-resolution, or revolt behavior.
- **FR-019**: Ships within a physics tick MUST be processed in ascending `shipId` order so batch behavior is deterministic and reproducible in tests.

### Key Entities *(include if feature involves data)*

- **ShipState (in-memory)**: The active per-ship record advanced each tick. Relevant attributes for this feature: position (x, y), current heading, target heading, current speed, target speed, energy, hyper-phaser cooldown, post-combat exit lockout, topspeed (warp-factor cap), ship-class reference, status (player vs. AI — gates the movement-maintenance debit). Sector is **derived** from position; no stored sector field.
- **ShipClass**: Static catalog entry that supplies the maximum warp rating used to derive top speed.
- **PhysicsTick (event)**: The 6-second heartbeat that triggers a single advancement of all active ships.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A ship that stages a non-zero target speed visibly changes coordinates within one tick interval (≤ 6 seconds) and continues to advance every tick thereafter.
- **SC-002**: A ship that stages a rotation has its heading change within one tick interval, and the staged rotation eventually reaches zero in a number of ticks equal to ⌈staged ÷ per-tick cap⌉.
- **SC-003**: A moving ship's energy strictly decreases each tick by the cost defined by the original game, never goes negative, and behaves the same way regardless of whether any player is connected.
- **SC-004**: An automated CI benchmark advancing 100 ships through a single physics tick completes in under 50 ms on the project's standard CI runner. (No manual soak; no reference-hardware dependency. Budget is the gate.)
- **SC-005**: 100% of the original game's balance constants relevant to this feature (`ACCENGAMT`, `MOVENGUSE`, `MOVENGMIN`, `ROTENGUSE`, `TICKTIME`, the per-class `max_accel` and `max_warp` values used) are covered by tests that fail if the constant changes.
- **SC-006**: The `warp` command correctly routes through all five gate outcomes (no-warp class, engines-blown, negative, hard-cap reject, overspeed warning, normal) in 100% of test cases derived from the original C source.
- **SC-007**: After this feature ships, the previously deferred partial-tactical scan gates and warp-tier distinction are no longer blocked on missing physics state.
- **SC-008**: All previously passing backend tests still pass; new tests covering this feature also pass.

## Assumptions

- The 6-second physics tick and 1-second ship-update tick heartbeats already exist and fire reliably; this feature only consumes the 6-second tick.
- The ship-state service already holds in-memory ship state with asynchronous flush to durable storage; this feature mutates that in-memory state and relies on the existing flush path.
- Commands `rotate`, `impulse`, and `warp` already stage their effects onto target-heading and target-speed fields and pay any command-time energy cost (e.g., rotation cost is paid by `rotate`, not by the tick). This feature consumes those targets.
- The original C source in `reference/ge-source/` is the authoritative reference for every formula and constant; deviations must be justified explicitly. Where the original source has no concept (e.g., a pilot-skill scalar on topspeed), this feature does not invent one.
- The `ROTAMT` constant in `GEMAIN.H` is unused in the original `.C` files; the per-tick rotation step is `shipclass.max_accel / 10.0`. The spec's earlier mention of `ROTAMT=20` was incorrect.
- Sector is derived from coordinates on read; there is no stored sector field. This feature emits a sector-transition signal on coordinate update; sector-room subscription handling lives in the gateway/downstream consumer.
- Physics math lives in a side-effect-free module unit-tested without booting the application; the tick-driven service is integration-tested.
- Combat, weapons, mines, decoys, jammers, shields, and revolt are explicitly out of scope and reserved for feature 006b.
