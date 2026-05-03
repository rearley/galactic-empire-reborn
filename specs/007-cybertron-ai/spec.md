# Feature Specification: Cybertron AI

**Feature Branch**: `007-cybertron-ai`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "Spec out feature 007-cybertron-ai covering CybertronTickService, spawn phase, cyb_lives() state machine, cybskill error probability, difficulty tiers, gold allowance, hyperwarp pursuit, Sarterns, persistence."

## Context

Cybertrons are the persistent server-driven hostile AI ships from the original
Galactic Empire (`reference/ge-source/GECYBS.C`). They populate the universe
with an always-on threat, escalate in difficulty as players rack up kills, and
give solo players something to fight when no humans are online.

This feature implements the Cybertron lifecycle (spawn → hunt → engage →
break off / die) end-to-end on the existing tick engine, layered onto the
combat primitives delivered by feature 006b. Sarterns (classes 24/25) share
the same code path with different ship-class stats.

## Clarifications

### Session 2026-05-03

- Q: When a Cybertron is destroyed, what happens to its accumulated gold? → A: Killer receives the Cybertron's full current cash (clamped to `CYB_MAXCASH`); Cybertron user record cash zeroed.
- Q: What triggers DB write-back for Cybertron state? → A: Reuse ShipService 30s async flush plus immediate flush on significant events (target acquired/lost, damage taken, kill scored, weapon depletion). Worst-case crash loss bounded to ~30s of position drift.
- Q: What does "drop shields" mean during hyperwarp pursuit? → A: Shields set to 0 while `where = 1` (hyperspace); restored to class max on drop-out to normal space.
- Q: What does `cyb_annoy` (taunt-only) actually do? → A: Send a taunt text message (from a small message pool) to the targeted player's event log AND broadcast it to the sector room so other players see it; no weapons fire, no maneuver change.
- Q: What `tot_to_create` and class stats should Sarterns (classes 24/25) ship with? → A: Use the original C-source values verbatim as shipped defaults; expose via NestJS config module for ops tuning.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Cybertrons populate the universe and hunt players (Priority: P1)

When the server boots, the universe is seeded with Cybertron ships up to the
per-class population cap (`tot_to_create`). When a player joins the game and
warps into a sector containing a Cybertron, or when a Cybertron's hunt loop
locates the player as the closest valid target, the Cybertron pursues and
attacks until either ship dies or the Cybertron breaks off.

**Why this priority**: Without spawning + targeting + pursuit, there is no AI
in the game. This is the foundational slice — every other story builds on a
populated universe with hunting Cybertrons.

**Independent Test**: Boot a fresh server with no humans logged in. Within a
few minutes the universe should reach the configured Cybertron population.
Log in a player ship of class ≥ `CYB_MINCLASS` (3) outside the neutral zone.
Within roughly one Cybertron tick (6 s) of becoming visible, the nearest
Cybertron acquires the player as its target (`cybmine` set) and begins moving
toward them.

**Acceptance Scenarios**:

1. **Given** the server boots with zero Cybertrons in the database for class
   X and `tot_to_create=4` for that class, **When** the spawn phase has run
   long enough to fill the class, **Then** exactly 4 Cybertrons of class X
   exist with randomized starting coordinates, weapons loadout, and skill.
2. **Given** a Cybertron with no current target and a player ship of class
   ≥ `CYB_MINCLASS` is in the game outside the neutral zone, **When** the
   Cybertron's lockon scan runs, **Then** the Cybertron sets `cybmine` to
   that player's ship ID provided the player is not already claimed by more
   Cybertrons than the class's `noclaim` limit allows.
3. **Given** a Cybertron has a target more than 25 sectors away
   (`hyperdist1`), **When** the Cybertron's tick runs, **Then** its desired
   speed jumps to hyperwarp (~20× normal top speed) and shields drop while
   it heads for the target.
4. **Given** a Cybertron is hyperwarping toward a target and closes to under
   10 sectors (`hyperdist2`), **When** its tick runs, **Then** it brakes to
   normal top speed and continues to close.
5. **Given** a player is inside the neutral zone, **When** any Cybertron's
   targeting/engagement runs, **Then** that player is not engaged regardless
   of distance.

---

### User Story 2 — Cybertrons engage with the full combat toolkit (Priority: P1)

Once in range, a Cybertron uses the weapon loadout appropriate to its class
to fight: phasers when charged, torpedoes (count scaled by player kill
count), decoys, jammers, and Zippers (against mines), with mid-fight course
changes to confuse the player. Cyberquads are always aggressive; lesser
Cybertrons probabilistically decide whether to fight hard ("be mean") on a
given tick.

**Why this priority**: Hunting without engagement is harmless. This story
delivers actual combat pressure on players, which is the point of the
feature.

**Independent Test**: Place a player ship adjacent to a Cybertron of a class
with phasers and torpedoes. Within a small number of physics ticks, the
Cybertron fires phasers at the player and emits at least one torpedo (with
torpedo count scaled by the player's lifetime kill count).

**Acceptance Scenarios**:

1. **Given** a Cybertron's target is within phaser range, the Cybertron's
   phaser charge ≥ minimum, and the "be mean" check passes for this tick,
   **When** the Cybertron's engagement runs, **Then** it computes a bearing
   to the target and fires phasers (subject to the `cybskill` error roll).
2. **Given** the same setup as above with the player having < `CYB_BE_EASY`
   (60) lifetime kills, **When** the Cybertron decides torpedoes this tick,
   **Then** it fires 0–1 torpedoes; **but Given** the player has ≥
   `CYB_BE_EASY` kills, **Then** it may fire 0–5 torpedoes.
3. **Given** a Cybertron of a class with `has_zip=true` detects nearby
   mines, **When** its engagement runs, **Then** it has a chance to launch
   a Zipper to clear them and then break off and circle back.
4. **Given** an ordinary (non-quad) Cybertron is engaged, **When** its
   engagement runs, **Then** it has a 1-in-`CYB_BREAKOFF` (500) chance per
   tick to disengage, reset speed to top, and stop seeking that target.

---

### User Story 3 — Difficulty escalates with player kill count (Priority: P2)

Cybertron behavior gets more punishing as the targeted player's lifetime
kill count grows. Below `CYB_BE_NICE` (30) kills, ordinary Cybertrons are
often "not mean" on a given tick (they skip the aggressive action paths).
Below `CYB_BE_EASY` (60) kills, ordinary Cybertrons fire reduced torpedo
volleys. At and above these thresholds, the gloves come off.

**Why this priority**: This shapes the long-term player experience. The game
is approachable for new players and intensifies for veterans. It is layered
on top of the combat in Story 2.

**Independent Test**: Run two simulated engagements with identical setups
but different player kill counts (say 10 and 100). Over a fixed number of
Cybertron ticks, aggregate the action mix (mean checks passing, torpedo
volleys fired). The 100-kill case must show a measurably higher rate of
both.

**Acceptance Scenarios**:

1. **Given** a player with `kills < CYB_BE_NICE` (30) being engaged by an
   ordinary Cybertron, **When** the "be mean" check runs each tick, **Then**
   it succeeds only 1-in-`CYBSLO` (3) of the time (cyberquads always pass).
2. **Given** a player with `kills ≥ CYB_BE_NICE`, **When** the "be mean"
   check runs, **Then** it always succeeds.
3. **Given** an ordinary Cybertron firing torpedoes and the player has
   `kills < CYB_BE_EASY` (60), **When** the torpedo volley size is rolled,
   **Then** it is `random(0..1)`. **Given** `kills ≥ CYB_BE_EASY`, **Then**
   it is `random(0..5)`.

---

### User Story 4 — Damaged Cybertrons defend, jammed Cybertrons evade (Priority: P2)

A Cybertron that takes serious damage while hunting (above `CYB_MINDAM` =
75% damage) probabilistically lays mines, deploys a jammer, and changes
course. A Cybertron that is itself being jammed cannot scan for targets, so
it lays mines in its current area, picks a random new heading, and runs.

**Why this priority**: Defensive behavior makes encounters feel intelligent
and gives players cause-and-effect feedback for their own jamming and
damage. It is layered on Stories 1–2.

**Acceptance Scenarios**:

1. **Given** a hunting Cybertron with `damage > CYB_MINDAM` (75) of a class
   with mines and remaining mine inventory, **When** its damage check runs,
   **Then** it has a chance to lay a mine, deploy a jammer (if its class has
   one and inventory remains), and randomize its heading and hold-course
   timer.
2. **Given** a Cybertron whose `jammer` counter is non-zero (it is being
   jammed) of a class with mines and remaining inventory, **When** its tick
   runs, **Then** it skips target acquisition, has a chance to lay a mine,
   sets a random new heading, and holds course for a randomized duration.

---

### User Story 5 — Cybertrons persist across server restarts (Priority: P2)

Cybertrons are durable. Their identity, position, weapons inventory, gold,
skill, and currently claimed target survive a server restart. On boot, the
spawn phase fills only what is missing.

**Why this priority**: Persistence is a project tenet (CLAUDE.md: "the
world does not pause when no one is watching"). Without it, restarts wipe
the universe and break the persistent-world feel.

**Acceptance Scenarios**:

1. **Given** a running server with N Cybertrons of various classes and
   states, **When** the server is restarted, **Then** the same N Cybertrons
   exist after boot with the same coordinates, weapons inventory, gold (up
   to `CYB_MAXCASH`), skill, and class.
2. **Given** a restart in which a previously persisted Cybertron's gold is
   above `CYB_MAXCASH` (2,000,000), **When** rehydration occurs, **Then**
   that Cybertron's gold is clamped to `CYB_MAXCASH`.
3. **Given** a restart where the persisted population for class X is below
   `tot_to_create` for class X, **When** the spawn phase runs after boot,
   **Then** missing Cybertrons of class X are created until the cap is met.

---

### User Story 6 — Sarterns share the Cybertron code path (Priority: P3)

Ship classes 24 and 25 (Sarterns) are AI-controlled hostile ships using the
same lifecycle, targeting, engagement, and persistence rules as Cybertrons.
They differ only in ship-class stats (loadout, scan range, durability,
`tot_to_create`, etc.), not in code path.

**Why this priority**: Sarterns are a content variation. They land for free
once Stories 1–5 are working — this story is here to make that explicit and
to gate it as a checklist item, not as separate logic.

**Acceptance Scenarios**:

1. **Given** ship classes 24 and 25 are configured with `tot_to_create > 0`,
   **When** the spawn phase runs, **Then** they populate via the same
   spawn path as Cybertrons.
2. **Given** a spawned Sartern, **When** it ticks, **Then** it executes the
   same `cyb_lives` state machine and uses its own ship-class stats for
   loadout, ranges, and durability.

---

### Edge Cases

- A Cybertron's target logs out mid-pursuit → on the next lockon check the
  Cybertron clears `cybmine`, slows to a cruise, and re-acquires.
- A Cybertron's target cloaks (`cloak == 10`) → the Cybertron may give up
  with a small probability on each tick and otherwise idles a few ticks
  before re-evaluating.
- All players are inside the neutral zone → no Cybertron targets anyone;
  Cybertrons cruise on randomized headings.
- A target is already claimed by `noclaim` Cybertrons of the candidate's
  class → the candidate looks elsewhere, preventing pile-on.
- The spawn cap for a class is already met → no new Cybertron is created
  for that class on this spawn slot; another class may be picked.
- A Cybertron is itself in hyperspace and detects an inbound missile → it
  drops out of hyperspace at a randomized speed and holds course briefly.
- A Cybertron at edge of universe / teleport boundary — handled by the
  underlying physics tick (006a), not this feature.

## Requirements *(mandatory)*

### Functional Requirements

#### Tick integration

- **FR-001**: The system MUST register a `CybertronTickService` that
  subscribes to `TickKind.PHYSICS` and runs **after** `CombatTickService`,
  using the same module-import ordering pattern documented in 006b R-1.
- **FR-002**: On each PHYSICS tick the service MUST iterate Cybertron and
  Sartern ships (status = AUTO) and decrement their per-ship `tick`
  counter; only ships whose counter reaches zero execute `cyb_lives` this
  tick. Default re-arm value is `CYBTICKTIME` (6) with random jitter, per
  GECYBS.C.

#### Spawn phase

- **FR-003**: On each PHYSICS tick the service MUST run a single spawn slot
  per the original `ticktock` cadence (one slot every ~30 service ticks):
  pick the next AVAIL ship slot above `nterms`; for each AI class
  (CYBORG/CYBORG-Sartern), count current AUTO ships of that class; if any
  class is below `tot_to_create`, create one of that class (1% random
  chance to instead pick a random AI class).
- **FR-004**: When creating a Cybertron the system MUST initialize, per
  GECYBS.C `cyb_init`:
  - random universe coordinates,
  - phaser charge = 100, mine target byte = 255 (none claimed),
  - `phasrtype` and `shieldtype` from class max,
  - random initial loadout: `I_FLUXPOD = rnd%5`, `I_DECOYS = rnd%25`,
    `I_TORPEDO = rnd%25`, `I_MINE = rnd%100`, `I_JAMMERS = rnd%100`,
    `I_GOLD = rnd%cyb_gold`,
  - `cybskill = (rnd%15)+3` (3..17, lower = more errors),
  - status = AUTO, `tick = CYBTICKTIME + rnd%CYBTICKTIME`,
  - persisted ship name `Cybrg-<usrn>` and a generated display name.

#### `cyb_lives` state machine

- **FR-005**: The service MUST credit each ticking Cybertron `CYB_ALLOW`
  (35) gold per tick into its user-cash field, with no upper cap during
  accumulation; the `CYB_MAXCASH` (2,000,000) cap MUST be enforced at load
  time and on persistence write-back, per GECYBS.C `cyb_init`.
- **FR-005a**: When a Cybertron (or Sartern) is destroyed by a human player,
  the system MUST transfer the Cybertron's current cash balance (clamped to
  `CYB_MAXCASH`) to the killing player's cash and zero the Cybertron user
  record's cash. The transfer MUST occur as part of the kill-resolution
  path so that it is observable in the same tick the Cybertron dies.
- **FR-006**: If `jammer == 0` (not being jammed), the service MUST scan all
  human ships, and for each one in the GE game, with substate ≥ FIGHTSUB
  and not fully cloaked (`cloak != 10`):
  - skip if the Cybertron is in the neutral zone OR the ship is outside the
    Cybertron's class `scanrange`,
  - if both ships are in warp (`where == 1`) and `gebemean` returns true and
    the target is within `tooclose + rnd(tooclose)` OR the target's class
    has `cybs_can_att` OR either ship has `cantexit > 0`, AND distance ×
    10000 < 30000, fire phasers at the bearing,
  - if the Cybertron is in normal space (`where == 0`) and the target is
    not in warp, set bearing toward the target, set acceleration desire to
    2, and either invoke `cyb_attack` (full engagement) or `cyb_annoy`
    (taunt only) per the same range/`cybs_can_att`/`cantexit` test,
  - on engagement also call `cyb_lay_decoys`.
- **FR-006a**: `cyb_annoy` (taunt-only branch) MUST send a hostile
  in-character text message, selected at random from a small predefined
  message pool, to the targeted player's event log AND broadcast the same
  message to the target's current sector room so other players in the
  sector see the taunt. `cyb_annoy` MUST NOT fire weapons, change shields,
  or alter heading/speed.
- **FR-007**: For ordinary (non-quad) Cybertrons during scan, the service
  MUST roll a 1-in-`CYB_BREAKOFF` (500) chance per visible target to break
  off (clear `cybmine`, reset speed to top, emit a "lucky day" message to
  the target).
- **FR-008**: If `jammer != 0`, the service MUST skip target acquisition
  and instead, if the class has mines and inventory remains, roll a 1-in-5
  chance to lay a mine, then set a random new heading and hold course for a
  randomized duration.
- **FR-009**: After the engagement/jam branch the service MUST run
  `cyb_check_damage`: if the Cybertron is currently hunting (`cybmine <
  255`) and `damage > CYB_MINDAM` (75) and a 1-in-10 roll passes, lay a
  mine (chance gated by inventory and 1-in-5 roll), deploy a jammer
  (chance gated by class+inventory and 1-in-100 roll), and randomize
  heading and hold-course timer.
- **FR-010**: After the damage check the service MUST run
  `cyb_check_lockon`:
  - if `holdcourse > 0`, decrement and return,
  - if the current target is invalid (logged out, cloaked, out of player
    range), clear `cybmine`,
  - otherwise scan all in-game uncloaked human ships of class ≥ the
    Cybertron's class `lowest_to_attk` that are NOT already claimed by
    `noclaim` other Cybertrons, pick the closest, set `cybmine`,
  - apply pursuit speed bands:
    - distance ≥ `hyperdist1` (~25 sectors) → set desired speed to ~20×
      top (`distance × 2000`), set shields to 0, set `where = 1`
      (hyperspace); shields MUST be restored to class max when the
      Cybertron drops back to normal space (`where = 0`),
    - distance ≥ `hyperdist2` (~10 sectors) → brake speed to top, head
      toward target,
    - distance > 3.0 → close at top speed, raise shields if in normal
      space,
    - distance ≤ 3.0 → match the target's effective speed (or low random
      speed if target is in normal space), raise shields.
- **FR-011**: After lockon, the service MUST reset the Cybertron's energy
  to 50,000 (Cybertrons do not run out of energy) and recalculate the next
  `tick` value: long sleep (`(CYBTICKTIME + rnd%CYBTICKTIME) * 5`) when not
  pinned in combat (`cantexit == 0`), short sleep otherwise.

#### `cybskill` and decision errors

- **FR-012**: The system MUST implement `cybwhoops` as a 1-in-`cybskill`
  roll that gates the following Cybertron actions; on "error" the action is
  skipped silently for this tick:
  - phaser fire inside `cyb_attack` (the actual `firep` call),
  - decoy launch inside `cyb_lay_decoys` (the entire decoy refresh).
- **FR-013**: `cybskill` is per-Cybertron (set at init, range 3..17) and
  MUST persist with the rest of the Cybertron's state. Lower values =
  higher error rate.

#### `gebemean` aggression gate

- **FR-014**: The system MUST implement `gebemean(cyb, target)` returning
  true when any of the following holds:
  - the Cybertron is a cyberquad (`tough_factor == CYB_TOUGH_1`),
  - the **target player's** lifetime `kills > CYB_BE_NICE` (30),
  - a 1-in-`CYBSLO` (3) random roll succeeds.
  This gate is checked on phaser fire (both warp and normal space), torpedo
  volley sizing, and to short-circuit `cyb_attack` to taunt-only.

#### Torpedo volley sizing

- **FR-015**: Inside `cyb_attack` the torpedo count `j` per tick MUST be:
  - `rnd%6` (0..5) for cyberquads or for ordinary Cybertrons where the
    target has `kills ≥ CYB_BE_EASY` (60),
  - `rnd%2` (0..1) for ordinary Cybertrons where target `kills <
    CYB_BE_EASY`,
  - `0` if `gebemean` is false or if the class has `max_torps == 0`.
  Each launched torpedo refills `I_TORPEDO` to `(rnd%5)+1` first (per
  GECYBS.C — Cybertrons are not limited by torpedo inventory the way
  players are).

#### Hyperwarp pursuit

- **FR-016**: Pursuit speed transitions defined in FR-010 MUST occur in
  exactly this order on a single tick: hyperwarp → mid-brake → close → in
  combat. The transition thresholds are `hyperdist1` (long-range) and
  `hyperdist2` (mid-range), configured to ~25 and ~10 sectors per the
  feature description.

#### Sarterns

- **FR-017**: Ship classes 24 and 25 (Sarterns) MUST use the identical
  spawn, `cyb_lives`, lockon, attack, damage, persistence, and `cybskill`
  code paths as Cybertrons. They differ only in their entries in the ship
  class table (loadout caps, ranges, `tot_to_create`, durability,
  `tough_factor`).

#### Persistence

- **FR-018**: Every Cybertron MUST be persisted as both a user record
  (cash, kills, etc.) and a ship record (coordinates, loadout, weapons,
  shields, `cybskill`, `cybmine`, `tick`, `cybupdate`, etc.) using the
  same DB-backed schema as human player ships, identified by user-ID
  pattern `Cybrg-<n>` where `n` is the Cybertron's slot index.
  **All `CLASSTYPE_CYBORG` ships share this prefix — including Sarterns
  (classes 24, 25). There is no separate `Sartn-` userid prefix.**
  Verified against `reference/ge-source/GECYBS.C:104-105` (`cyb_init`):
  `strncpy(cybname,"@Cybrg-",UIDSIZ); sprintf(&cybname[7],"%d",usrn);` is
  the only userid construction path for any CYBORG-category ship. Hydrate
  and gold-transfer logic match a single regex `/^Cybrg-/`.
- **FR-019**: The `cyb_lives` cycle MUST decrement a `cybupdate` counter
  each tick; on counter expiry, randomize speed/heading (if not currently
  hunting) and reset the counter to `100 + rnd%100`. Database write-back
  MUST reuse the existing ShipService async-flush pattern (periodic flush
  every 30 seconds) AND MUST also flush immediately on significant events:
  target acquired, target lost/cleared, damage taken, kill scored, or
  weapon/decoy/mine inventory depletion. Worst-case crash loss is bounded
  to ~30 seconds of position/heading drift, which is acceptable since
  Cybertrons resume hunting on the next tick after rehydration.
- **FR-020**: On server boot, before the first tick fires, the system MUST
  load all persisted Cybertron user+ship records, clamp cash to
  `CYB_MAXCASH` (2,000,000), and bring them into the in-memory ship state
  Map with status = AUTO. The spawn phase then fills only the gap up to
  each class's `tot_to_create`.

### Key Entities

- **Cybertron / Sartern ship state**: All fields already on the ship
  record (coordinates, heading, speed, shields, phaser charge, items
  inventory, energy, damage, etc.), plus the AI-specific fields:
  `cybmine` (currently claimed target ship index, 255 = none),
  `cybskill` (3..17 error gate), `cybupdate` (DB-write countdown),
  `tick` (per-ship tick countdown), `holdcourse` (ticks to hold current
  heading), `status = AUTO`.
- **Cybertron user record**: cash (gold), kills, plus standard player-user
  fields. Identified by user ID `Cybrg-<n>`.
- **Ship class table entry** (existing): supplies `max_*` weapon caps,
  `scanrange`, `cybs_can_att`, `lowest_to_attk`, `noclaim`,
  `tot_to_create`, `tough_factor`, `has_mine`, `has_jam`, `has_zip`,
  `damfact`, `max_type` (CYBORG vs USER), used to drive Cybertron and
  Sartern behavior.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a fresh boot with no humans logged in, the universe
  reaches the configured Cybertron+Sartern population (sum of
  `tot_to_create` across AI classes) within 15 minutes of in-game time.
- **SC-002**: A player ship of class ≥ `CYB_MINCLASS` outside the neutral
  zone is acquired as a target by at least one Cybertron within one
  Cybertron tick (≤ 6 s) of being in scan range of that Cybertron, in 95%
  of trials over 100 simulated encounters.
- **SC-003**: When a Cybertron has a target ≥ 25 sectors away, it reaches
  the target's sector in fewer than half the ticks it would take at normal
  top speed (verifying hyperwarp engagement).
- **SC-004**: A new player (lifetime kills = 0) survives an average
  Cybertron encounter at least 2× longer than a veteran (lifetime kills ≥
  60) under identical starting conditions, measured over 50 simulated
  matched runs.
- **SC-005**: Restarting the server preserves 100% of Cybertron identities,
  positions, loadouts, gold (post-clamp), and `cybskill` values across
  10 consecutive restart cycles with no Cybertron lost or duplicated.
- **SC-006**: No human player can be claimed by more Cybertrons than the
  candidate Cybertron's class `noclaim` value at any tick (zero violations
  over a 1-hour simulation with 20 humans and full Cybertron population).
- **SC-007**: Cybertron behavior never targets, fires on, or pursues a
  player whose ship is inside the neutral zone (zero violations across the
  same simulation).
- **SC-008**: The CybertronTickService completes its full pass over all
  AUTO ships within 1 second on the production target hardware (Hetzner
  CPX32) at full Cybertron+Sartern population plus 100 humans, leaving
  ample headroom inside the 6-second physics tick.

## Assumptions

- Feature 006b (combat) is merged and provides callable primitives for
  phaser fire, torpedo launch, jammer, mine lay, decoy, and Zipper from a
  ship's perspective. CybertronTickService composes these — it does not
  re-implement them.
- Feature 006a (physics) handles ship motion, neutral zone detection
  (`neutral(coord)`), distance / bearing math (`cdistance`, `cbearing`,
  `vector`), teleport, and the `where` (warp vs normal-space) field.
  CybertronTickService relies on these.
- Procedural galaxy (004) and planet system (005) are in place; Cybertrons
  do not need any planet-aware behavior in this feature beyond the gold
  allowance — buying/landing is out of scope.
- The ship class table includes class-24 and class-25 entries for Sarterns
  with `max_type = CLASSTYPE_CYBORG`. Shipped defaults for `tot_to_create`,
  loadout caps, ranges, durability, and `tough_factor` MUST be sourced
  verbatim from the original C source (`reference/ge-source/`) for classes
  24 and 25, and MUST be overridable via the NestJS config module so ops
  can tune population/balance without code changes.
- `tot_to_create`, `cyb_gold`, `tooclose`, `hyperdist1`, `hyperdist2`, and
  `CYBTICKTIME` are sourced from `GEMAIN.H` constants and the original
  `numopt`-style configuration; we make them configurable via a NestJS
  config module but ship with the originals as defaults.
- AI scoring + nightly maintenance for Cybertrons (e.g. Cybertron leader
  board, kill credit) lives in feature 009 (midnight job), not here.
- Murdonian Transport (class 11) and other droid behavior live in feature
  008 (droid AI), not here, even though the spawn slot logic covers
  CYBORG and DROID class types in the original.
- One physics tick equals 6 seconds (`TICKTIME = 6`); `CYBTICKTIME` (also
  6) means the average Cybertron acts roughly once per physics tick, with
  per-ship random jitter to spread the work.
