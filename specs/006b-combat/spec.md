# Feature Specification: Ship-to-Ship Combat

**Feature Branch**: `006b-combat`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "Implement ship-to-ship combat: phasers, hyper-phasers, torpedoes, missiles, mines, decoys, jammers, zippers, and the lock command. Direct continuation of 006a-physics-tick."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Phaser Combat (Priority: P1)

A player encounters a hostile ship in their sector and uses phasers — the
fastest, most-used weapon in the game — to damage and destroy it. Phasers fire
instantly along a bearing within an arc; if the target is in line of fire and
range, it takes damage. Energy is drained from the firing ship and (on hit)
from the victim's shields.

**Why this priority**: Phasers are the primary weapon — they fire every tick,
require no ammunition, and define the rhythm of combat. Without them there is
no combat loop. They also unlock the rest of the system because hit
resolution, shield drain, damage display, and kill accounting all flow through
phaser code paths first.

**Independent Test**: Two players spawn in the same sector. Player A types
`pha 90 50` aimed at Player B; if bearing and range gates pass, Player B's
shields drain and a hit message appears in both players' event logs. Player
A's phaser charge drops and reloads over the next several ticks.

**Acceptance Scenarios**:

1. **Given** Ship A has full phasers and Ship B is within range and within the
   phaser firing arc, **When** Ship A fires phasers at the bearing toward
   Ship B, **Then** Ship B takes shield/hull damage, Ship A loses phaser
   charge proportional to percent fired, and both players see hit messages.
2. **Given** Ship A's phaser charge is below the minimum firing threshold,
   **When** Ship A attempts to fire phasers, **Then** the command is rejected
   with a "phasors not charged" message and no energy is consumed.
3. **Given** Ship A is at warp speed and its class supports hyper-phasers,
   **When** Ship A fires phasers, **Then** the hyper-phaser code path is used
   with its narrower beam width and warp-appropriate range.
4. **Given** Ship A's phaser charge is below the per-tick maximum, **When** a
   physics tick occurs, **Then** the charge increments by the reload rate, up
   to the ship class maximum.

---

### User Story 2 - Torpedoes and Missiles (Priority: P1)

A player launches a guided torpedo or missile at a named target. The
projectile flies for several ticks, closing distance each tick. The target
can attempt to deploy decoys to spoof it. On final approach the projectile
either hits, is decoyed, or expires.

**Why this priority**: Torpedoes and missiles are the heavy weapons — they
deal far more damage than phasers and are how players actually destroy each
other. They also introduce the projectile-in-flight mechanic that decoys,
jammers, and the future Cybertron AI all interact with.

**Independent Test**: Player A locks Player B and types `tor B`. A torpedo
"in flight" message appears, Player B sees an inbound torpedo warning, and
several ticks later the torpedo either hits (B takes damage) or is decoyed.

**Acceptance Scenarios**:

1. **Given** Ship A has torpedoes in cargo, is not at warp, and is not
   cloaked, **When** Ship A fires a torpedo at Ship B, **Then** one torpedo
   is consumed from cargo, Ship A's shields drop automatically, and a locked
   torpedo with closing distance is registered against Ship B.
2. **Given** an inbound torpedo is closing on Ship B, **When** each physics
   tick fires, **Then** the torpedo's distance decrements by the per-tick
   torpedo speed.
3. **Given** an inbound torpedo is within decoy intercept range and Ship B
   has an active decoy, **When** the per-tick decoy chance roll succeeds,
   **Then** the torpedo is destroyed without dealing damage and both ships
   see a decoy-intercept message.
4. **Given** an inbound torpedo reaches its target, **When** the hit is
   resolved, **Then** Ship B takes randomized damage scaled by tonnage, may
   suffer a randomized system damage event, and the firer's lock slot is
   cleared.
5. **Given** Ship A targets a ship moving at warp, **When** Ship A fires a
   missile (charged from a flux pod), **Then** the missile can pursue and
   hit a warp-speed target, while a torpedo cannot.
6. **Given** Ship A has the maximum number of locked torpedoes/missiles
   already in flight, **When** Ship A attempts to fire another of the same
   type, **Then** the command is rejected.

---

### User Story 3 - Mines, Zippers, Decoys, Jammers (Priority: P2)

A player deploys mines to threaten a sector, decoys to deflect incoming
projectiles, jammers to obscure their position, and uses the zipper to clear
nearby mines.

**Why this priority**: These are the area-denial and defensive tools that
make combat tactical rather than purely offensive. They are independently
testable and not on the critical path for the basic combat loop, but they
are required for parity with the original game and for the Cybertron AI in
007 to behave correctly.

**Independent Test**: Player A drops a mine; Player B enters the sector and
the mine proximity sweep registers a hit on B. Separately, Player A deploys a
decoy and confirms it appears in their decoy slots and decrements each tick
until expiry.

**Acceptance Scenarios**:

1. **Given** Ship A is stationary in a sector, **When** Ship A deploys a
   mine, **Then** a persistent mine entity is created at Ship A's
   coordinates and will survive game restarts.
2. **Given** an active mine exists at coordinates X, **When** any ship
   passes within the mine's proximity radius during the per-tick mine sweep,
   **Then** the ship takes mine damage and the mine is destroyed.
3. **Given** Ship A is near one or more mines, **When** Ship A uses the
   zipper, **Then** mines within zipper range are detonated harmlessly.
4. **Given** Ship A deploys a decoy, **When** subsequent physics ticks fire,
   **Then** the decoy's lifetime decrements each tick and expires when it
   reaches zero, with no database persistence.
5. **Given** Ship A deploys a jammer, **When** subsequent physics ticks
   fire, **Then** the jammer's lifetime decrements and expires; while
   active, the jammer affects targeting against Ship A consistent with the
   original game behavior.

---

### User Story 4 - Lock, Shields, Flux (Priority: P2)

A player uses supporting commands during combat: locking a primary target so
they can fire with `@` shorthand, raising/lowering shields manually, and
burning a flux pod to instantly refill energy mid-fight.

**Why this priority**: These commands make combat playable. Without lock, the
player must retype target names every shot. Without manual shield control,
players cannot recover after firing torpedoes (which auto-lower shields).
Without flux, a long fight is unwinnable. Each is small and independently
testable.

**Independent Test**: Player types `loc B`; subsequent weapon commands using
`@` resolve to Ship B. Player types `shi up` and shield status changes.
Player types `flux` with a flux pod in cargo and energy returns to maximum.

**Acceptance Scenarios**:

1. **Given** Ship A is in the same sector as Ship B, **When** Ship A types
   `loc B`, **Then** Ship A's primary lock is set to Ship B and weapon
   commands using the `@` token resolve to Ship B.
2. **Given** Ship A has shields lowered, **When** Ship A types `shi up`,
   **Then** shields are raised and the shield-status field reflects the
   change.
3. **Given** Ship A just fired a torpedo (which auto-lowered shields),
   **When** the next physics tick fires, **Then** shields remain lowered
   (no auto-raise) until Ship A explicitly raises them.
4. **Given** Ship A has at least one flux pod in cargo, **When** Ship A
   types `flux`, **Then** one flux pod is consumed and Ship A's energy is
   restored to the ship class maximum.

---

### User Story 5 - Kills, Death Broadcast, and Planet Revolt (Priority: P3)

When a ship is destroyed, the kill is credited to the channel currently
in `lastfired`, the victim's score is updated, and a death event is
broadcast. Separately, an occupied planet may now revolt against its
owner — the revolt path was deferred from 005 and lands here only because
the event-broadcast wiring (death/distress mail) lives in this feature;
revolt itself is purely a planet-state event and does **not** damage any
ship.

**Why this priority**: Kill accounting closes the combat loop and is
required for Cybertron escalation in 007. Planet revolt is a small
finishing hook for 005. Both are P3 because the rest of combat works
without them.

**Independent Test**: A test reduces Ship B's hull to ≥100 damage via
combat math; the channel in `lastfired` gets a kill increment and a
death event is broadcast. Separately, a test sets a planet's revolt
conditions and ticks economy; troops are slashed, the distress mail is
queued, and the planet flips to `**Free**`.

**Acceptance Scenarios**:

1. **Given** Ship B's hull damage reaches `>= 100` from a weapon fired
   by Ship A, **When** the death check fires, **Then** Ship A's kill
   counter increments, Ship B's score is updated per the original
   accounting rules, and a death event is broadcast.
2. **Given** Ship B is hit by both a torpedo from Ship A and a missile
   from Ship C in the same physics tick, and either hit alone would
   kill, **When** the death check fires, **Then** the kill is credited
   to whichever attacker's hit was processed last in `checktm` order
   (torps before missiles, low-index before high-index).
3. **Given** an owned planet whose `(taxrate/120) * 0.35 * men > troops`
   and the `gernd()%10` roll succeeds, **When** the economy tick fires,
   **Then** troops are reduced to `troops/((rand%8)+2)`, a distress
   mail is queued for the owner, and ownership resets to `**Free**`.

---

### Edge Cases

- A player fires phasers at a bearing with no ship in the arc — phasers
  fire, energy is consumed, no damage occurs.
- A torpedo is in flight when its target leaves the sector or the universe
  (e.g., self-destruct, disconnect) — the torpedo is cleared without a hit.
- A decoy is deployed while no projectile is inbound — decoy lifetime ticks
  down normally and expires with no effect.
- A ship attempts to fire a weapon its class does not support (e.g., torps
  on a class without launchers) — command is rejected.
- A mine is dropped at a coordinate that already has a mine — both mines
  coexist (per original behavior).
- A player fires at themselves via `loc` shorthand — command is rejected.
- A flux command runs while energy is already at maximum — the pod is
  consumed unconditionally and energy is set to `ENGYMAX`; the original
  source has no current-energy check (`GECMDS.C:735–752`).
- Multiple weapons hit the same ship in the same physics tick — every hit
  overwrites the victim's `lastfired` field. Torpedo lock slots resolve in
  index order, then missile lock slots in index order; the kill is
  credited to the **last** attacker whose hit was processed when the
  damage check fires (`GEFUNCS.C:1559, 1611, 1742, 1103`). This is by
  design and tests must reproduce it deterministically.
- A ship destroyed while having locked torpedoes in flight — in-flight
  projectiles are cleared and do not orphan.

## Clarifications

### Session 2026-05-03

- Q: Should friendly fire (same-team damage) be allowed? → A: Yes — weapons resolve on any ship regardless of team; kills credit normally (matches original GE).
- Q: What is the broadcast scope for `combat.ship-destroyed` vs other combat events? → A: `combat.ship-destroyed` is broadcast globally (galaxy-wide); all other combat events are sector-scoped.
- Q: What is the exact jammer effect? → A: Area-effect on all ships within the carrier's scan range (including the carrier itself, per `GECMDS.C:1633–1647` which has no self-exclusion). Each affected ship's `jammer` counter is set to `jamtime × (1 − distance/scanrange)`. While `jammer > 0`, that ship's lock / fire-control attempts are rejected with JAMMER4 (`GECMDS.C:1354–1358`). The counter decays per tick; `sys unjam` clears it. Existing locks and in-flight projectiles are unaffected.
- Q: How does lock behave when the target moves away or leaves the sector? → A: Lazy clearing on `@` resolution per `GECMDS.C:1441–1471`. On every `@` use, `findshp` re-validates the lock: if the target is not `ingegame` OR `cdistance × 10000 > scanrange`, the lock is cleared (`warsptr->lock = -1`) and NOLOCK is returned. The trigger is **scan-range distance**, not sector boundary; the check is **lazy** (per `@` use), not proactive per-tick. In-flight torpedoes and missiles are tracked on the target's own lock slot and continue independently of the firer's `lock` field.
- Q: Does the mine's owner trigger / take damage from their own mine, and is the detonation proximity-triggered or timer-based? → A: Per `GEFUNCS.C:1416–1493`: (1) **No owner exclusion** — the sweep iterates every ship in range with only `ingegame` and the neutral-zone check; the owner takes damage if within MINERANGE at detonation. The mine's `channel` (owner) is written to the victim's `lastfired` for kill credit, including against the owner themselves. (2) **Detonation is timer-based, not proximity-triggered.** Damage applies only on the 5-tick sweep where `mptr->timer == 0`; on earlier in-range sweeps the ship receives only an MINE6 proximity warning. After detonation the mine is destroyed (`channel = 255`).

## Requirements *(mandatory)*

### Functional Requirements

#### Phasers and Hyper-Phasers

- **FR-001**: System MUST provide a `pha` command accepting a bearing in
  degrees and a percent-of-charge to fire.
- **FR-002**: System MUST reject phaser fire when the ship class does not
  mount phasers, when current phaser charge is below the minimum firing
  threshold (`PMINFIRE`), or when the bearing/percent arguments are out of
  valid range.
- **FR-003**: System MUST route phaser fire through the impulse-phaser path
  when the ship is below warp and through the hyper-phaser path when at
  warp, applying the corresponding beam width and bias rules from the
  original source.
- **FR-004**: System MUST increment each ship's phaser charge by the
  per-tick reload amount (`PRELOAD`) up to the ship class maximum on every
  physics tick.
- **FR-005**: System MUST resolve phaser hits using the original
  line-of-fire geometry, applying tonnage-adjusted damage and shield
  drain (`SHHITENG`) to victims in the firing arc. Arc width MUST
  include the `PHABIAS` bias term: a target counts as in-arc when
  `smallest(bearing, targetHeading) < percent + PHABIAS`
  (`GECMDS.C:954`); `PHABIAS` widens the effective spread so player
  aim does not have to be pixel-perfect. Hit resolution MUST NOT
  filter by team affiliation — friendly fire is enabled and a
  teammate in the arc takes damage exactly as a hostile would (per
  original GE).

#### Torpedoes and Missiles

- **FR-006**: System MUST provide a `tor` command that consumes one
  torpedo from the **firer's** cargo, auto-lowers the **firer's**
  shields, and registers a locked torpedo on the **target's own
  `ltorps[]` slot** (`wptr->ltorps[i]`, where `wptr = warshpoff(target)`
  per `GECMDS.C:1191–1202`). The slot stores `.channel = firer.channel`
  and `.distance = cdistance(firer, target) * 10000 + 20`. The same
  target-side slot model and `+20` fuse buffer applies to missiles
  (`GECMDS.C:1315–1316`). Per-ship slot caps `MAXTORPS` / `MAXMISSL`
  therefore bound the number of **incoming** projectiles a single ship
  can be tracking, not the firer's outbound count.
- **FR-007**: System MUST reject torpedo fire when the firer's ship class
  does not mount torpedo launchers (`shipclass[shpclass].max_torps == 0`,
  per `GECMDS.C:cmd_torp` class-mount gate), when the ship is at warp, is
  cloaked, has no torpedoes in cargo, the target's `ltorps[]` slots are
  all occupied (`MAXTORPS` incoming limit on the target), or the target
  is invalid.
- **FR-008**: System MUST provide a `mis` command that fires a missile
  with a player-supplied charge in energy units (valid range `1..50000`,
  per `GECMDS.C:1267–1278`); the energy cost from the firer's flux pile
  is `charge / misengfc`. The missile is registered on the **target's
  own `lmissl[]` slot** (same target-side model as torpedoes —
  `MAXMISSL` bounds incoming missiles per target, not outbound per
  firer). System MUST reject missile fire when the firer's ship class
  does not mount missile launchers (`shipclass[shpclass].max_missl == 0`,
  per `GECMDS.C:cmd_missl` class-mount gate). Missiles can pursue
  targets at warp speed and are subject to missile-specific cargo
  rules. The full charge is stored on the locked missile and becomes
  the damage source at hit time (`GECMDS.C:1318`, `GEFUNCS.C:1619`).
- **FR-009**: System MUST decrement each in-flight torpedo's distance by
  the per-tick torpedo speed (`torpsped`) on every physics tick, and apply
  the equivalent rule to missiles.
- **FR-010**: System MUST resolve a torpedo or missile hit when distance
  reaches zero or less, applying randomized damage scaled by `tdammax` and
  tonnage, and triggering a randomized system-damage roll.
- **FR-011**: System MUST give an active decoy an opportunity to intercept
  an incoming torpedo or missile at the correct close-in range (e.g.,
  <5000 for torpedoes, <3000 for missiles in the original) using the
  decoy-odds (`decodds`) probability roll; an intercepted projectile is
  destroyed without dealing damage.

#### Mines, Zippers, Decoys, Jammers

- **FR-012**: System MUST provide a `min` command that places a persistent
  mine at the firing ship's current coordinates; mine state MUST survive
  process restarts.
- **FR-013**: System MUST sweep all active mines on every 5th physics
  tick (`mptr->timer % 5 == 0`, per `GEFUNCS.C:1421`). Each live mine
  decrements its `timer` every tick; on a sweep tick the system MUST
  iterate every ship and, for each ship within `MINERANGE` (10 000)
  whose sector is not the neutral zone (sector 0,0 excluded,
  `GEFUNCS.C:1432`):
  - If `mptr->timer == 0`, apply damage with cubic falloff
    `(1 - ddist/MINERANGE)^3 × minedammax` adjusted by `ton_fact`
    (`GEFUNCS.C:1437–1457`), set `wptr->lastfired = mptr->channel`
    (so the mine's owner — including the owner themselves —
    receives kill credit), then destroy the mine (`channel = 255`).
  - Otherwise, emit only an `MINE6` proximity warning; no damage.
  The mine sweep MUST NOT exclude the mine's owner — per
  `GEFUNCS.C:1423–1488` there is no owner-skip; an owner within
  MINERANGE at detonation takes damage exactly as any other ship.
  Mine detonation is **timer-based**, not proximity-triggered:
  walking into range early only produces warnings, not an explosion.
- **FR-014**: System MUST provide a `zip` command that detonates mines
  within zipper range of the firing ship without damaging the firer.
- **FR-015**: System MUST provide a `dec` command that adds a decoy to the
  firing ship's decoy slots with a lifetime of `DECOYTIME` physics ticks;
  decoy state is in-memory only and is not persisted.
- **FR-016**: System MUST decrement each decoy's lifetime on every physics
  tick and remove decoys whose lifetime reaches zero.
- **FR-017**: System MUST provide a `jam` command that applies an
  **area-effect** jammer (`GECMDS.C:1593–1651`). The carrier iterates
  every ship within its scan range (including itself — the original
  loop has no self-exclusion) and sets each affected ship's `jammer`
  counter to `jamtime × (1 − distance/scanrange)`. While a ship's
  `jammer > 0`, that ship's `loc` / fire-control attempts MUST be
  rejected with the JAMMER4 message (`GECMDS.C:1354–1358`); existing
  locks and in-flight projectiles are not cleared. The jammer counter
  MUST decrement on each physics tick. A `sys unjam` command MUST
  clear the counter immediately. All jammer state is in-memory only
  and is not persisted.

#### Targeting and Support

- **FR-018**: System MUST provide a `loc` command that sets the firing
  ship's primary lock to a named ship and enables the `@` shorthand in
  subsequent weapon commands; locking on self MUST be rejected. The
  `@` shorthand MUST re-validate the lock on every use (per
  `GECMDS.C:1441–1471`): if the locked target is no longer in the
  game OR `cdistance × 10000 > scanrange`, the lock MUST be cleared
  and a NOLOCK response returned. Lock clearing is **lazy** (on `@`
  use), not proactive per-tick. In-flight torpedoes and missiles are
  tracked on the target's own lock slot and MUST continue
  independently of the firer's `lock` field.
- **FR-019**: System MUST provide a `shi` command accepting `up` or `dn`
  that raises or lowers the firing ship's shields and reflects the change
  in the ship's shield-status field.
- **FR-020**: System MUST NOT auto-raise shields on the tick following a
  torpedo fire; shields stay where the player or weapon left them.
- **FR-021**: System MUST provide a `flux` command that consumes one flux
  pod from cargo and restores the firing ship's energy to `ENGYMAX`.

#### Damage, Kills, and Revolt

- **FR-022**: System MUST expose a damage-display string derived from a
  ship's current damage percentage (equivalent to `damstr()`).
- **FR-023**: System MUST apply randomized system damage on hit
  (equivalent to `randamage()`) such that engines, weapons, shields, or
  other subsystems can be individually damaged with the original
  probability distribution.
- **FR-024**: System MUST apply shield damage on hit using the original
  formula (equivalent to `shieldhit()`), including correct handling of
  shields-up vs shields-down.
- **FR-025**: System MUST scale incoming damage by tonnage factor
  (equivalent to `ton_fact()`) so that larger ships absorb proportionally
  more damage.
- **FR-026**: System MUST credit a kill on destruction by reading the
  victim's `lastfired` channel — which is overwritten by every hit in
  arrival order — and incrementing that attacker's kill count
  (`GEFUNCS.C:1103, 1118`). Equivalent to `killem()` driven by `acctm()`.
  When multiple weapons hit in the same tick, credit goes to the LAST
  hit processed (torpedo slot order, then missile slot order). The
  feature MUST also broadcast a death event to the victim's sector.
- **FR-027**: System MUST clear in-flight torpedo / missile slots in
  three cases:
  1. **Firer dies** — every other ship's `ltorps[]` and `lmissl[]`
     slots whose `.channel == firer.channel` are cleared
     (`channel = 255`), per `GEFUNCS.C:1755–1778`. This is the
     "no orphan projectiles" rule.
  2. **Target dies** — the dying ship's own `ltorps[]` / `lmissl[]`
     slots are intrinsically discarded with the ship; no further
     action required because incoming projectiles were tracked on
     the (now-removed) target.
  3. **Target leaves the game mid-flight** (self-destruct, disconnect,
     or otherwise ceases to be `ingegame`) — the projectiles tracked
     on that ship's slots are cleared without applying damage and
     without crediting a kill. Implementations MUST treat
     `!ingegame(target)` during projectile travel the same as a
     destroyed target for slot-cleanup purposes.
- **FR-028**: System MUST evaluate planet revolt during the existing
  economy/midnight tick (deferred from 005), per `GEPLANET.C:341–380`:
  when an owned planet's `(taxrate/120) * 0.35 * men > troops` and a
  `gernd()%10 == 0` roll succeeds, troops are reduced to
  `troops / ((rand%8)+2)`, a `MAIL_CLASS_DISTRESS` mail is queued for
  the owner, and ownership resets to `**Free**`. Revolt does **not**
  damage the orbiting ship and does **not** invoke combat resolution —
  it is purely a planet-state event included here only because the
  event/broadcast wiring lands in this feature.

#### Battle Lock

- **FR-028a**: System MUST set `cantexit = FIRETICKS` (10 ticks) on
  both the firer and any victim each time a weapon-fire or hit event
  occurs (phaser fire, phaser hit, torpedo fire/hit, missile
  fire/hit, mine detonation hit), per `GECMDS.C:945, 978–979,
  1041, 1080–1081, 1405–1406, 1419–1420, 1650, 1715, 1809`. The
  per-tick combat pass MUST decrement `cantexit` for every ship
  while it is `> 0` (`GEFUNCS.C:1180–1181`). While `cantexit > 0`,
  the ship is "battle-locked" and commands that would let the
  player escape combat (e.g., quit, hyperspace exit, sector jump)
  MUST be rejected by their respective handlers; this feature
  populates the counter and decrements it, leaving enforcement
  in the relevant exit-path handlers (which already exist or will
  honor the field when added).

#### Tick Integration

- **FR-029**: System MUST process the combat half of `checktm()` on every
  physics tick — projectile travel, decoy/jammer expiry, mine sweep,
  phaser reload — in a deterministic order, after the physics movement
  pass.
- **FR-030**: System MUST isolate per-ship combat processing failures the
  same way physics does (try/catch around each ship's combat work) so a
  single corrupted ship cannot halt the combat tick for the universe.
- **FR-031**: System MUST emit typed `EventEmitter2` events for combat
  outcomes (e.g. `combat.phaser-fired`, `combat.hit`, `combat.miss`,
  `combat.decoy-intercept`, `combat.mine-detonation`,
  `combat.ship-destroyed`), following the
  `backend/src/game/physics/physics-events.ts` pattern from 006a. The
  `GameGateway` is the sole bridge to Socket.io and translates these
  events into sector-scoped room broadcasts; combat services MUST NOT
  call Socket.io directly. Exception: `combat.ship-destroyed` MUST be
  broadcast galaxy-wide (to all connected players), matching the
  original GE death-announcement behavior. All other combat events
  remain sector-scoped.

### Key Entities

- **In-flight Torpedo / Missile**: A locked projectile attached to a firing
  ship's lock slot; has a target ship, remaining distance, and (for
  missiles) a charge percent. Ephemeral in-memory; cleared on hit, decoy,
  or target loss.
- **Mine**: A persistent entity at galactic coordinates with an owner and
  damage value; survives restarts; removed on detonation or zipper.
- **Decoy**: An ephemeral in-memory entry on a ship's decoy slots with a
  remaining lifetime; expires deterministically on tick countdown.
- **Jammer**: An ephemeral in-memory targeting modifier on a ship with a
  remaining lifetime.
- **Combat Event**: A broadcast describing a weapon-fire or hit outcome,
  scoped to a sector room and surfaced in the player event log.
- **Kill Record**: An update to the firer's kill count and victim's score
  on destruction; feeds Cybertron escalation in 007.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 754 currently-passing backend tests still pass after this
  feature merges, plus new combat tests covering every command and every
  tick path added.
- **SC-002**: A two-player phaser exchange — fire, hit, shield drain,
  reload — completes correctly within a single 6-second physics tick of the
  triggering command, and both players see the result in their event log.
- **SC-003**: Every balance constant referenced from `GEMAIN.H`
  (`PMINFIRE`, `PRELOAD`, `PHABIAS`, `SHHITENG`, `FIRETICKS`, `DECOYTIME`,
  `HPBEAMW`, `ENGYMAX`, `MAXTORPS`, `MAXMISSL`, `MINERANGE`, `tdammax`,
  `mdammax`, `minedammax`, `decodds`, `torpsped`, `mislsped`, `misengfc`)
  has a regression test that fails if the value drifts. The 5-tick
  mine-sweep cadence (`mptr->timer % 5`) is also covered.
- **SC-004**: A torpedo intercepted by a decoy and a torpedo that lands a
  hit each produce deterministic, repeatable test outcomes when the random
  seed is fixed, demonstrating reproducible combat math.
- **SC-005**: A single ship throwing combat exceptions does not stall the
  physics tick for any other ship in the universe, verified by an
  integration test that injects a faulty ship.
- **SC-006**: A persisted mine survives a backend restart and is correctly
  loaded back into the active mine sweep, verified by an integration test.
- **SC-007**: Planet revolt fires deterministically when the troop/men
  ratio and `gernd()%10` conditions are met, reducing troops, queuing
  the distress mail, and resetting the owner to `**Free**`, closing the
  deferred 005 work. (Revolt does not damage any ship per
  `GEPLANET.C:341–380`.)

## Assumptions

- All physics prerequisites from 006a (movement, rotation, energy drain,
  hyperspace, sector transitions, EventEmitter2 wiring) are available and
  correct; this feature builds on top of them without altering them.
- Combat math is implemented as pure functions in
  `backend/src/game/combat/combat-math.ts`, mirroring the
  `physics-math.ts` pattern from 006a, and is unit-testable without a live
  game world.
- A new `CombatTickService` subscribes to the existing physics tick event
  alongside `PhysicsTickService`; combat runs after the physics movement
  pass on the same 6-second cadence, not on a separate timer.
- Mine state uses the `Mine` table already added to the schema in 001; no
  new Prisma migrations are required for mines.
- Decoy and jammer state are in-memory only and intentionally lost on
  process restart, matching the original game's volatility.
- Cloaking is deferred and is therefore not a precondition for any combat
  rule in this feature; gates that say "not cloaked" can read the field
  but the cloak command itself is not implemented here.
- Cybertron AI (007), Droid AI (008), midnight scoring/mail (009), and the
  React frontend (010) are out of scope. AI and scoring will consume the
  combat APIs delivered here.
- Damage formulas, decoy probabilities, and projectile speeds match the
  values and rules in the original C source; any deviation requires a
  documented decision in `docs/DECISIONS.md`.
