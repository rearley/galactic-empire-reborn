# Feature Specification: Ephemeral Droid AI

**Feature Branch**: `008-droid-ai`
**Created**: 2026-05-05
**Status**: Draft
**Input**: User description: "Feature 008-droid-ai: ephemeral Droid AI — three ship classes (Lydorian Garbage Scow 10, Murdonian Transport 11, Vakory Survey Drone 12) from GEDROIDS.C"

## Clarifications

### Session 2026-05-05

- Q: Droid class numbers — use 31/32/33 (user input) or 10/11/12 (GEDROIDS.C source and CLAUDE.md)? → A: Use 10, 11, 12 to match the original C source and existing project documentation.
- Q: Annoy-message anti-spam — evaluate every physics tick or on the 30-tick spawn cadence? → A: Tie per-Droid action evaluation (including annoy rolls) to the 30-physics-tick cadence, faithful to GEDROIDS.C.
- Q: Should spawn evaluation run when no human players are online? → A: No — gate on ≥1 player online, matching the Cybertron pattern from 007.
- Q: What heading/speed range does the Murdonian "confuse" branch (1-in-10) and the Vakory "alter attack vector" branch (~1-in-20) use? → A: Uniformly random heading [0, 359]°, uniformly random sub-warp speed within class maxima — faithful to GEDROIDS.C `random()` ranges.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - PvE target appears in the wild for new players (Priority: P1)

A new player exploring the galaxy encounters Droid ships scattered across sectors —
visible to scans, broadcasting periodic in-character chatter, and behaving as
non-player ships that the player can engage for loot and score. The Murdonian
Transport in particular is a heavily loaded freighter that serves as the primary
PvE objective: pursue, pressure, and destroy it to claim its cargo.

**Why this priority**: Droids are the bridge between solo exploration and full
PvP combat. Without them, a new player has no AI opponent appropriate for their
skill level — Cybertrons (007) are too aggressive and the world feels empty
between human encounters. The Murdonian Transport is the canonical "first kill"
that introduces players to combat mechanics already shipped in 006b.

**Independent Test**: Boot the server with no human players. Within a few
minutes of physics ticks, three classes of Droid ships (Garbage Scow,
Murdonian Transport, Vakory Survey Drone) populate the universe up to the
per-class cap. A connected player scans nearby sectors and sees Droid ships;
firing on a Murdonian Transport produces return fire and, on kill, transfers
its cargo to the attacker via the existing combat kill resolution.

**Acceptance Scenarios**:

1. **Given** a freshly booted server with no Droids in memory, **When** the
   physics tick counter advances through enough cycles, **Then** the system
   spawns up to two ships of each Droid class (max 6 Droids total) at random
   coordinates in the playable galaxy.
2. **Given** a Murdonian Transport spawned with a full random loadout,
   **When** a player ship enters scan range and the Droid is not jammed,
   **Then** the Droid emits an in-character "annoy" message to that player
   (probabilistically, ~25% per evaluation) and toggles its shields based on
   its current speed.
3. **Given** a player has fired on a Murdonian Transport and brought it into
   fight-back mode, **When** the Droid is in the same warp/hyperspace zone
   and within combat range, **Then** the Droid returns phaser fire and may
   alter its course to confuse the attacker.
4. **Given** a player destroys a Droid, **When** the kill is resolved,
   **Then** loot transfers to the attacker per the existing 006b cargo
   transfer rule, the Droid is removed from the live world, no row is
   written to the persistent ships table for this Droid, and a fresh Droid
   of that class is eligible to spawn on the next spawn evaluation.

---

### User Story 2 - Distinct behavior per Droid class (Priority: P2)

Each of the three Droid classes behaves differently so the world feels
populated rather than monotonous: a slow, harmless Garbage Scow that just
clutters scans; a tough Murdonian freighter that flees when free but fights
hard when cornered; and an aggressive Vakory Survey Drone that uses
torpedoes, mines, and jammers when threatened.

**Why this priority**: Faithful per-class behavior is what makes the
original game feel alive. Without this, all Droids would feel like the
same generic mob. This depends on US1 (the spawn/lifecycle plumbing must
exist first) but delivers the bulk of the gameplay value.

**Independent Test**: With each Droid class isolated in turn, run a
scripted scenario (jammed / not jammed / under fire / heavily damaged) and
observe that the per-class action selection matches the original
`droid_act_class_10/11/12` decision tree from `GEDROIDS.C`.

**Acceptance Scenarios**:

1. **Given** a Lydorian Garbage Scow that is jammed, **When** its tick
   fires, **Then** it picks a random hold-course duration and proceeds at
   sub-warp speed; it never returns fire even if a player attacks it.
2. **Given** a Murdonian Transport that is jammed, **When** its tick
   fires, **Then** it sets its target speed to its top warp speed and
   flees on a random heading.
3. **Given** a Vakory Survey Drone in fight-back mode at >75% damage,
   **When** its tick fires, **Then** if it has mines or jammers it deploys
   them, then sets a top-speed flee course on a random heading.
4. **Given** a Vakory Survey Drone in fight-back mode against a
   non-cloaked attacker in the same zone, **When** its tick fires,
   **Then** it fires phasers and may launch a small torpedo volley
   (0–1 torpedoes per tick).
5. **Given** a Murdonian Transport scanning a player at impulse speed,
   **When** evaluation runs, **Then** shields raise; at warp speed,
   shields drop. (Shields-up-at-impulse rule from `GEDROIDS.C`.)

---

### User Story 3 - Ephemerality (no persistence, no DB clutter) (Priority: P2)

Droids are designed as throwaway encounters. They never write to the
persistent ships table, never appear in the daily score recalculation, and
do not survive a server restart. Killing one removes it cleanly from the
live world without leaving rows behind.

**Why this priority**: This is a foundational invariant — if Droids
accidentally persist, daily score reports, mail purges, and the dirty-flush
loop will all see ghost rows. It must be in place before US2 ships, but
its user-visible value is indirect (it's "the absence of bugs").

**Independent Test**: Spawn Droids, kill some, restart the server, and
verify (a) the persistent ships table contains zero Droid rows at any
point in the session, (b) the dirty-flush loop never attempts to upsert a
Droid, (c) after restart the Droid in-memory population starts empty and
re-fills via the spawn cadence.

**Acceptance Scenarios**:

1. **Given** a Droid has been spawned into the live world, **When** the
   periodic flush cycle runs, **Then** no insert or update is issued for
   that Droid against the persistent ships table.
2. **Given** a Droid is killed in combat, **When** kill resolution runs,
   **Then** the Droid is removed from in-memory state and no DB delete is
   attempted (because no row exists).
3. **Given** the server restarts, **When** boot hydration completes,
   **Then** zero Droids are loaded into in-memory state and the spawn
   loop will re-fill the population over subsequent ticks.

---

### User Story 4 - Cybertron spawn-visibility patch (Priority: P3)

A pre-existing defect in the Cybertron spawn path persists newly created
Cybertron ships to the database but does not load them into in-memory
state until a server restart. As part of mirroring the spawn flow for
Droids, the Cybertron path is corrected so newly spawned Cybertrons are
immediately visible to scans, combat, and the tick engine.

**Why this priority**: Lower priority because Cybertrons today still
function (they become visible after the next restart), but the bug was
identified during 008 design and the fix is small and adjacent. Bundling
it here avoids a separate one-line patch feature.

**Independent Test**: With no server restart, trigger a Cybertron spawn,
then in the same session query the in-memory ship registry and confirm
the new Cybertron is present and addressable.

**Acceptance Scenarios**:

1. **Given** the Cybertron spawn cadence fires and creates a new ship
   row, **When** the spawn transaction commits, **Then** the new ship is
   loaded into in-memory state in the same operation, before the next
   physics tick runs.

---

### Edge Cases

- **Spawn cap exhaustion**: If the per-class cap (2) is already reached
  for a class, the spawn evaluation must skip that class without error.
- **Random coordinates land in the neutral zone**: Droids may spawn on
  coordinates that fall inside the neutral zone; this is acceptable and
  faithful to the original (they will simply behave according to their
  class rules from there).
- **Murdonian fight-back when attacker is in a different where-zone**:
  Phaser fire is conditional on attacker and Droid sharing the
  same hyperspace/normal-space zone. Cross-zone fight-back simply does
  not fire weapons that tick.
- **Vakory torpedo volley size of 0**: The roll is `random(0..1)`, so a
  fight-back tick may fire zero torpedoes. This is the intended faithful
  behavior — not every tick fires.
- **Droid receiving a missile while in hyperspace**: A Murdonian in
  hyperspace under missile lock alters course and slows; a Vakory
  speeds up to outrun missiles.
- **Annoy message suppression for jammed Droids**: A jammed Droid scans
  no players and emits no annoy chatter that tick — its action collapses
  to a course-change/flee branch.
- **Two Droid kills resolving in the same tick**: Each death is removed
  independently from in-memory state; loot transfers per existing 006b
  rules; no DB row clean-up is needed for either.
- **`lastfired` value of zero (Vakory only)**: Faithful to source, the
  Vakory fight-back trigger requires `lastfired > 0` strictly, while
  Murdonian uses `>= 0`. The single attacker at index 0 cannot trigger
  Vakory fight-back; this exact-port behavior is preserved.

## Requirements *(mandatory)*

### Functional Requirements

#### Droid lifecycle and ephemerality

- **FR-001**: System MUST treat Droid ships as ephemeral — never written
  to or read from the persistent ships table during their lifetime.
- **FR-002**: The dirty-flush loop MUST skip ships flagged as ephemeral.
- **FR-003**: The remove-from-game path MUST skip the persistent-table
  delete for ephemeral ships, removing them from in-memory state only.
- **FR-004**: On server boot, the in-memory Droid population MUST start
  at zero; Droids MUST NOT be hydrated from any persistent source.

#### Spawn cadence and placement

- **FR-005**: System MUST evaluate Droid spawning AND per-Droid action
  selection (including annoy-message rolls, fight-back action selection,
  and shield/speed toggles) on the same recurring cadence — every 30th
  physics tick — faithful to the outer loop in `GEDROIDS.C`. Per-Droid
  actions MUST NOT be re-evaluated on every physics tick. Evaluation
  MUST be gated on at least one human player being online; when no
  players are online the evaluator skips the cycle entirely (matches
  the Cybertron pattern from 007).
- **FR-006**: For each Droid class (10, 11, 12), system MUST cap the
  live population at two ships per class.
- **FR-007**: When a class is below its cap on a spawn evaluation,
  system MUST create **at most one** new Droid of that class per
  rollover, with random coordinates uniformly distributed in the
  playable galaxy ([-19.8, 19.8] on each axis when the universe is
  at full size). The spawn evaluator MUST NOT fill multiple slots of
  the same class in a single rollover — cap-of-2 per class is
  therefore reached on the second eligible rollover, faithful to the
  one-spawn-per-cycle pattern in `GEDROIDS.C` / `GEMAIN.C`.
- **FR-008**: Murdonian Transport spawn MUST receive a randomized full
  loadout: flux pods (0–49), decoys (0–249), torpedoes (0–249), mines
  (0–99), jammers (0–99), missiles (0–99), ion cannons (0–24), gold
  (0–249).
- **FR-009**: Lydorian Garbage Scow and Vakory Survey Drone spawns MUST
  receive a sparse loadout: flux pods (0–49), decoys (0–24), mines
  (0–9), jammers (0–9). No torpedoes, missiles, ion cannons, or gold.
- **FR-010**: Each spawned Droid MUST be initialized with shield type
  and phaser type set to its class maxima, an initial random target
  speed, and a randomized first-action delay so the population does not
  all act on the same tick.

#### Per-class behavior — Lydorian Garbage Scow (class 10)

- **FR-011**: When not jammed, Garbage Scow MUST scan all live human
  players in scan range and probabilistically emit an in-character
  annoy message to each scanned player (~25% chance per scan).
- **FR-012**: When jammed, Garbage Scow MUST set a random hold-course
  duration and proceed at sub-warp speed (it has no warp capability).
- **FR-013**: Garbage Scow MUST keep shields up while at impulse speed
  and drop shields while at warp speed.
- **FR-014**: Garbage Scow MUST NOT return fire under any circumstance.

#### Per-class behavior — Murdonian Transport (class 11)

- **FR-015**: When not jammed and a player is in scan range, Murdonian
  MUST optionally pick a new random sub-warp speed (only if not already
  on a held course), toggle shields by speed (up at impulse, down at
  warp), and probabilistically emit an in-character annoy message.
- **FR-016**: When jammed, Murdonian MUST flee at top warp speed on a
  random hold-course heading.
- **FR-017**: When attacked (fight-back triggered by `cantexit > 0` and
  a recorded last attacker), Murdonian MUST emit an in-character call
  for help directed at the attacker.
- **FR-018**: In fight-back mode and same-zone with the attacker at
  hyperspace range under 30,000 distance units, Murdonian MUST fire
  phasers at the attacker.
- **FR-019**: In fight-back mode and same-zone in normal space (or with
  a planet-bound attacker), Murdonian MUST fire phasers if the
  attacker is not cloaked, and on a 1-in-10 chance also alter heading
  to a uniformly random bearing in `[0, 359]` degrees and target speed
  to a uniformly random sub-warp speed within the Murdonian's class
  speed maxima (faithful to the `random()` ranges in `GEDROIDS.C`).
- **FR-020**: In fight-back mode while in hyperspace under missile
  lock, Murdonian MUST exit hyperspace by setting sub-warp speed and a
  short hold-course evasion.

#### Per-class behavior — Vakory Survey Drone (class 12)

- **FR-021**: When not jammed and a player is in scan range, Vakory
  MUST toggle shields by speed and probabilistically emit an
  in-character annoy message.
- **FR-022**: When jammed, Vakory MUST flee at top warp speed on a
  random hold-course heading.
- **FR-023**: In fight-back mode and same-zone with the attacker at
  hyperspace range under 30,000, Vakory MUST fire phasers.
- **FR-024**: In fight-back mode in normal space against a non-cloaked
  attacker, Vakory MUST fire phasers and roll a 0-or-1 torpedo volley
  at the attacker.
- **FR-025**: In fight-back mode at >75% damage, Vakory MUST lay a
  mine if it has any, raise a jammer if it has any, then flee at top
  warp on a long random hold-course.
- **FR-026**: When under missile lock in fight-back mode, Vakory MUST
  set a high evasion speed (5,000–10,900) and a short hold-course
  evasion.
- **FR-027**: With a small probability per fight-back evaluation (~1
  in 20), Vakory MAY alter attack vector to a uniformly random heading
  in `[0, 359]` degrees and a uniformly random target speed within the
  Vakory's class sub-warp speed maxima (faithful to the `random()`
  ranges in `GEDROIDS.C`).

#### Death and respawn

- **FR-028**: When a Droid is destroyed, kill resolution MUST mark it
  available, remove it from the live world without a DB delete, and
  transfer its cargo to the attacker per the existing combat
  kill-resolution loot rule.
- **FR-029**: A killed Droid's class slot MUST become eligible for
  re-spawn on the next spawn evaluation.

#### Communication / events

- **FR-030**: Annoy chatter MUST be emitted as a typed event scoped to
  the receiving player's sector context (not broadcast galaxy-wide).
- **FR-031**: Each class MUST draw its annoy text from a class-specific
  message pool (passive scan flavor for non-fight-back; fight-back
  call-for-help flavor when applicable).

#### Cybertron spawn visibility (corrective)

- **FR-032**: After a successful Cybertron spawn-row insert, the new
  ship MUST be loaded into in-memory state in the same logical
  operation so it is immediately visible to scans, combat, and the
  tick engine without a server restart.

### Key Entities *(include if feature involves data)*

- **Droid (live)**: An ephemeral AI ship of class 10, 11, or 12. Carries
  the full state of any other ship (position, heading, speed, shields,
  phasers, items, damage, last attacker, jammer status, etc.) but is
  flagged as ephemeral so it never persists. Distinguished from
  Cybertrons and Sarterns by class number and by the absence of a DB row.
- **Droid annoy message pool**: A static catalog of in-character text
  strings, partitioned by class and by mode (passive scan flavor vs.
  fight-back call-for-help flavor). Source of truth for the strings is
  the original message catalog referenced from `GEDROIDS.C`.
- **Droid spawn budget**: An in-memory accounting of live Droid count
  per class, used by the spawn evaluator to enforce the per-class cap.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a cold boot of an empty server with at least one
  human player online, the live Droid population reaches the cap of
  six (two per class) within two spawn-cadence rollovers — roughly
  60 physics ticks (~6 minutes wall clock at `TICKTIME=6`). One Droid
  per class is created per rollover (FR-007), so cap-of-2 per class is
  reached on the second eligible rollover.
- **SC-002**: Across a hundred annoy-evaluation opportunities for an
  in-range Droid against an in-range player, the realized rate of
  annoy events lies within an acceptable statistical band of the
  intended ~25% rate (e.g., 15–35 successes out of 100).
- **SC-003**: Over the course of a multi-hour soak, zero rows ever
  appear in the persistent ships table for any class 10, 11, or 12
  ship; zero flush attempts target an ephemeral ship.
- **SC-004**: Killing a Murdonian Transport carrying loot transfers
  cargo to the attacker per the existing 006b transfer rule with no
  regression in transfer behavior.
- **SC-005**: A Cybertron spawned mid-session is observable
  (addressable by name and reachable by combat) within the same tick
  cycle in which it was created — no server restart required.
- **SC-006**: A jammed Droid never emits an annoy event and never
  fires a weapon; the only state changes that tick are speed and
  hold-course assignment.
- **SC-007**: A Vakory at >75% damage that has at least one mine and
  at least one jammer in inventory deploys both on its next fight-back
  tick before fleeing.

## Assumptions

- The 006b combat system (phasers, torpedoes, missiles, mines, decoys,
  jammers, kill resolution, cargo transfer) is in place and is the
  authoritative way Droids interact with players. This feature does not
  re-implement combat; it composes existing combat services.
- The 007 Cybertron module structure (module + tick service + repository
  + decisions + events) is the template for the Droid module; mirroring
  it preserves architectural consistency.
- The annoy text strings can be ported from the original
  `message.c` / `messages` catalog referenced by `GEDROIDS.C`. Exact
  wording is faithful where possible; the message pool is a fixed
  static asset, not a player-configurable list.
- Random number generation uses the project's existing seeded `Random`
  port (introduced in 006b) for testability — not raw `Math.random()`.
- The `lastfired` field is already populated by existing combat paths
  (006b) when a player fires on the Droid; this feature consumes that
  field and does not modify how it is set.
- The dirty-flush loop is the only writer to the persistent ships table
  for active ships; bypassing it for ephemeral ships is sufficient to
  guarantee no Droid rows ever land in storage.
- Universe scale is at the standard configured size (>= 20), so the
  `[-19.8, 19.8]` spawn coordinate band is the operative branch from
  `droid_init`. The smaller-universe branch is out of scope.
- The Cybertron spawn-visibility correction is in scope for this
  feature because it touches the same spawn-then-load pattern that
  Droids will adopt; it is not deferred to a later feature.
- AI scoring impact (Droid kills boosting player rank) remains
  deferred to feature 009 (midnight job), consistent with the same
  deferral noted for Cybertrons in the 007 progress notes.
