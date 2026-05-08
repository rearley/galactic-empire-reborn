# Feature Specification: Physics Polish — Tick & Bridge Consolidation

**Feature Branch**: `019-physics-polish`
**Created**: 2026-05-08
**Status**: Draft
**Input**: User description: "Consolidation sprint closing six deferred mechanical gaps from features 006a–013 (boundary wrap, overspeed damage, auto-repair tick consumer, auto-shield tick consumer, AI kill scoring, droid spawn/kill frontend bridge). Wormhole gravity is out of scope (deferred to 020)."

## Clarifications

### Session 2026-05-08

- Q: What should the default value of `score_f2` (MajorBBS `SCRFACT` option) be in this port? → A: `score_f2 = 100` (configurable via env var; preserves current PvP behavior, AI deduction = `scr/10`)
- Q: For AI kills, should the attacker-side `kills` counter be incremented in this feature? → A: Yes for Cybertrons (persisted, feeds `CYB_BE_NICE`/`CYB_BE_EASY` escalation); no-op for Droids (matches C source `GEFUNCS.C:1253`)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Universe Boundary Wrap (Priority: P1)

A pilot at high warp drives off the edge of the galaxy and re-emerges on the
opposite side, exactly as in the original Galactic Empire. The universe is a
torus — there are no "edges" players can fall off.

**Why this priority**: Without wrap, sustained travel produces invalid coordinates
that break scan, warp, and combat lookups. This is a correctness bug, not a polish
item, and must land first.

**Independent Test**: A ship moving past the configured galaxy width or height
appears in the corresponding sector on the opposite edge on the next physics tick,
with all other state preserved (heading, speed, cargo, locks).

**Acceptance Scenarios**:

1. **Given** a ship at sector (29.8, 7.0) heading east at warp 9, **When** the
   physics tick advances it past x=30, **Then** the ship's new x coordinate equals
   `(prev_x - 30)` and players in the new sector see the arrival event.
2. **Given** a ship crossing y=0 moving south, **When** the tick fires, **Then**
   the ship wraps to y near 15 with no negative coordinate persisted.
3. **Given** a ship crossing both x and y boundaries on the same tick (diagonal
   travel at high speed), **When** the tick fires, **Then** both axes wrap
   independently and the ship lands in the correct sector.

---

### User Story 2 - Overspeed Engine Damage (Priority: P1)

A pilot pushing engines beyond 150% of their rated warp accumulates engine warnings
and eventually takes hull damage, just as in the original game. Pushing the engines
has a real cost, not just a cosmetic warning.

**Why this priority**: Without damage application, a key risk/reward mechanic is
inert. Players currently exploit overspeed without consequence, which distorts
combat economy and warp choice.

**Independent Test**: A ship sustained above `topspeed * 1.5` long enough for the
warning counter to cross threshold receives hull damage on the next physics tick
and a warning event on its socket.

**Acceptance Scenarios**:

1. **Given** a ship with rated topspeed 8 traveling at warp 13 (>150%), **When**
   the warning counter crosses the threshold from the original C source, **Then**
   the ship's hull damage value increases per the source formula and a warning
   event is emitted to that ship's socket.
2. **Given** a ship that drops below the 150% overspeed threshold before the
   warning counter triggers damage, **When** subsequent ticks fire, **Then** no
   hull damage is applied.
3. **Given** repeated overspeed cycles, **When** damage is applied, **Then** the
   counter resets per source behavior so damage does not double-apply on the
   same threshold crossing.

---

### User Story 3 - Auto-Repair Honors Player Setting (Priority: P2)

A player who runs `set auto-repair on` and then takes hull damage sees their ship
repair itself automatically, spending cash on the player's behalf, without any
further commands.

**Why this priority**: The flag persists today (shipped in 013) but does nothing.
Players have an expectation set by the documented command that the system silently
violates. High-perceived-value, low-risk fix.

**Independent Test**: With `autoRepair=true`, damage on the ship, sufficient cash,
and conditions matching cmd_maint gates, the next ship-update tick queues a repair
identical to the manual command.

**Acceptance Scenarios**:

1. **Given** a damaged ship with `autoRepair` on, sufficient cash, not in combat
   lock, and not in a neutral zone (or piloted by Zygor), **When** the ship-update
   tick fires, **Then** the ship's repair queue is set as if the player had typed
   the maintenance command and the appropriate cost is deducted.
2. **Given** a damaged ship with `autoRepair` on but insufficient cash, **When**
   the tick fires, **Then** no repair is queued and no cash is deducted.
3. **Given** a damaged ship with `autoRepair` on while in combat lock, **When**
   the tick fires, **Then** no repair is queued (gate honored) and the player is
   not silently re-charged.
4. **Given** an undamaged ship with `autoRepair` on, **When** the tick fires,
   **Then** no action is taken (no charge).

---

### User Story 4 - Auto-Shield Honors Player Setting (Priority: P2)

A player who runs `set auto-shield on` sees shields automatically raise after
warp exit or after their own torpedo fire, without manually issuing a shield
command.

**Why this priority**: Same shape as auto-repair — flag persists, has zero effect.
Quality-of-life feature with a documented command that silently fails today.

> **Note — port-original feature, not a C-source port.** The original game has
> no `auto-shield`. `GEFUNCS.C:shieldstat` is a per-tick energy/regen/repair
> maintenance routine for shields *already up or damaged*; it does not
> auto-raise downed shields and has no neutral-zone or combat-lock gates. The
> trigger conditions below ("after warp exit / after self-fired torpedo /
> not in combat lock") are project-defined design choices for this port,
> introduced alongside the persisted `autoShield` flag in feature 013.

**Independent Test**: With `autoShield=true`, shields down, and not in combat
lock, the next ship-update tick raises shields per the project-defined trigger
conditions below.

**Acceptance Scenarios**:

1. **Given** a ship with `autoShield` on whose shields are down after a warp exit,
   **When** the next ship-update tick fires, **Then** shields are raised.
2. **Given** a ship with `autoShield` on that has just fired a torpedo (which
   drops shields), **When** the next ship-update tick fires and the ship is not
   in a combat lock, **Then** shields are raised.
3. **Given** a ship with `autoShield` on that is in a combat lock, **When** the
   tick fires, **Then** shields remain down (the lock condition prevents the
   auto-raise from interfering with the locking mechanic).

---

### User Story 5 - AI Kills Affect Player Score (Priority: P2)

When a Cybertron or a Droid kills a player, the player's kill-score record
updates to reflect the AI kill — matching the way the original game tracks
deaths to non-player attackers.

**Why this priority**: Score correctness is foundational to nightly leaderboards
and the midnight job (feature 009). Silent gaps here distort long-term player
standings without anyone noticing immediately.

**Independent Test**: An AI-attributed `COMBAT_SHIP_DESTROYED` event applied to
a player ship results in a measurable change to that player's klscore matching
the C source rule for AI-caused death.

**Acceptance Scenarios**:

1. **Given** a Cybertron destroys a player ship, **When** the destruction event
   is processed, **Then** the victim's klscore is *decremented* by
   `floor(((max_points + bonus) / 100) * score_f2 / 10)` (one-tenth of the
   PvP deduction; the C-source rule for AI killers per `GEFUNCS.C:1161`),
   floored at zero.
2. **Given** a Droid (including the Murdonian Transport) destroys a player ship,
   **When** the destruction event is processed, **Then** the victim's klscore
   is decremented per the same one-tenth formula.
3. **Given** a player-vs-player kill, **When** processed, **Then** existing PvP
   scoring behavior remains unchanged (no regression).
4. **Given** an AI kill, **When** processed, **Then** no death-count field on
   the victim is incremented (the C source has no such counter).
5. **Given** a Cybertron kill, **When** processed, **Then** the attacking
   Cybertron's `kills` counter is incremented and persisted (so escalation
   thresholds `CYB_BE_NICE` / `CYB_BE_EASY` continue to advance correctly).
6. **Given** a Droid kill, **When** processed, **Then** the attacker-side
   `kills` counter is NOT persisted (matches `GEFUNCS.C:1253`).

---

### User Story 6 - Droid Presence Visible to Players (Priority: P3)

When a droid spawns into a sector, players in that sector see it appear in the
player list. When a droid is destroyed, it disappears from everyone's player
list and a kill notification is broadcast game-wide, matching how `droid.annoy`
already flows today.

**Why this priority**: Pure visibility / feel improvement. Game logic is correct
without it; this closes the perception gap so players understand what just
attacked them or who they share a sector with.

**Independent Test**: When a droid spawns, sockets in the matching sector room
receive a spawn event and the frontend list shows the droid. When the droid is
killed, sector and global rooms receive a kill event and the droid disappears
from all lists.

**Acceptance Scenarios**:

1. **Given** a player connected to sector S, **When** a droid spawns in S,
   **Then** that player's UI lists the droid as present.
2. **Given** a player anywhere, **When** any droid is killed, **Then** that
   player sees the global kill notification; players in the droid's sector see
   the droid removed from their sector list.
3. **Given** the player list, **When** droids exist, **Then** they appear as
   ephemeral entries and are never persisted to the database-backed roster.

---

### Edge Cases

- A ship crossing two axes simultaneously must wrap on both axes correctly in a
  single tick (no "lost" diagonal motion).
- Boundary wrap must not lose torpedo locks, missile locks, or sector-room
  membership of attached entities.
- Overspeed damage must not stack to instant destruction within a single tick:
  damage applies once per threshold crossing of the warning counter.
- Auto-repair and auto-shield must each respect the same gates as their manual
  command equivalents — they are convenience automations, not privilege
  escalations.
- AI kill scoring must not double-count if the same destruction event is
  observed by both attacker-side and victim-side handlers.
- Droid bridge events must not leak persistent IDs in a way that lets the
  frontend confuse a droid with a real player; ephemeral marking is required.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The physics tick MUST wrap any ship whose coordinates cross the
  configured galaxy width or height to the corresponding position on the
  opposite edge, on the same tick the boundary is crossed.
- **FR-002**: Boundary wrap MUST preserve heading, speed, cargo, locks,
  shields, and all other ship state. Only sector position changes.
- **FR-003**: When a ship's speed exceeds 150% of its rated topspeed for long
  enough that the existing warning counter crosses its threshold, the system
  MUST apply hull damage matching the original source formula.
- **FR-004**: Each overspeed damage application MUST emit a warning event to
  the affected player's socket so the player can react before further damage.
- **FR-005**: On every ship-update tick, the system MUST inspect each active
  ship's `autoRepair` flag. When set, and the ship is damaged, has sufficient
  cash, and meets the same gates as the manual maintenance command, the system
  MUST queue a repair on the player's behalf.
- **FR-006**: On every ship-update tick, the system MUST inspect each active
  ship's `autoShield` flag. When set, and shields are down, and the ship is
  not in a combat lock, the system MUST raise shields. Trigger conditions
  ("after warp exit, after self-fired torpedo, combat-lock gate") are
  project-defined for this port — there is no equivalent automation in the
  original C source.
- **FR-007**: When a Cybertron or Droid kills a player ship, the system MUST
  decrement the victim's `klscore` by `floor(((max_points + bonus) / 100) *
  score_f2 / 10)`, floored at zero, per `GEFUNCS.C:1157` and the AI-attacker
  branch at `GEFUNCS.C:1161`. No victim death counter is incremented (the C
  source has none).
- **FR-008**: AI-caused score changes MUST NOT regress or alter existing
  player-vs-player score handling.
- **FR-008a**: When a Cybertron kills a player ship, the system MUST increment
  the attacker Cybertron's `kills` counter and persist it, so cumulative kill
  counts continue to feed the `CYB_BE_NICE` / `CYB_BE_EASY` escalation
  thresholds. When a Droid (including the Murdonian Transport) kills a player
  ship, the attacker-side `kills` counter MUST NOT be persisted (matches
  `GEFUNCS.C:1253`).
- **FR-009**: When a droid spawns, the system MUST emit a spawn event to all
  sockets joined to that droid's sector room, with enough information for the
  frontend to display the droid in the player list.
- **FR-010**: When a droid is killed, the system MUST emit a kill event to the
  droid's sector room and to a global broadcast channel, mirroring the routing
  used today for `droid.annoy`.
- **FR-011**: Droid presence delivered to the frontend MUST be ephemeral and
  MUST NOT appear in any persistent database-backed roster query.
- **FR-012**: All wired-in tick automations (auto-repair, auto-shield) MUST be
  individually disable-able via the same player setting that enables them, and
  toggling MUST take effect on the very next applicable tick.

### Key Entities *(include if feature involves data)*

No new entities are introduced. Existing entities used:

- **Ship state (in-memory)**: Authoritative for `autoRepair`, `autoShield`,
  `warncntr`, position, speed, shields, hull damage. No schema changes.
- **Player score record**: Receives an additional update path from AI kill
  events. No schema changes.
- **Droid (ephemeral)**: Already exists; spawn and kill events gain frontend
  routing. No persistence changes — droids remain off the database roster.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero ships hold out-of-bounds coordinates after one full physics
  tick, regardless of speed or heading. Verified by an integration test that
  drives ships across each boundary and asserts in-range coordinates after the
  tick.
- **SC-002**: Sustained overspeed (>150% of rated warp) results in measurable
  hull damage to the offending ship within the time the original source's
  warning counter takes to cross threshold; players receive the corresponding
  warning event on the same tick damage is applied.
- **SC-003**: With `auto-repair on`, a damaged solvent ship outside combat lock
  and the neutral zone has its repair queued by the next ship-update tick after
  damage is sustained; manual `set auto-repair off` halts further automatic
  charges.
- **SC-004**: With `auto-shield on`, shields are restored on the next
  ship-update tick following a warp exit or self-fired torpedo, provided no
  combat lock is active.
- **SC-005**: 100% of AI-caused player deaths recorded by the combat system
  produce the matching change to the victim's klscore, observable in the next
  midnight job's leaderboard.
- **SC-006**: A new player connecting to a sector with a droid present sees
  that droid in their player list within one event tick of joining the sector
  room; on droid kill, the entry disappears from the list and the global kill
  notice reaches all connected sockets.
- **SC-007**: No droid ever appears in a database-backed roster query
  (verifiable by direct query of the persistent player table after droid
  spawn/kill cycles).

## Assumptions

- Galaxy dimensions remain `MAXX=30` and `MAXY=15` per `GEMAIN.H`. Wrap is
  modular on these values exactly.
- Wormhole gravity (`GEFUNCS.C:836`) is intentionally out of scope and deferred
  to feature 020. Boundary wrap must not interact with wormhole transit logic.
- The existing `warncntr` counter implementation in `ShipState` is the
  authoritative trigger surface — this feature wires damage to it rather than
  re-deriving the threshold.
- The auto-repair gates ("not in combat", "not in NZ unless Zygor", cost
  identical to `cmd_maint`) are taken verbatim from `GECMDS.C:cmd_set` and
  associated maintenance code in `GEFUNCS.C`. No new gates are invented.
- Auto-shield is a **port-original QoL feature**, not a port from the C
  source. `GEFUNCS.C:shieldstat` only handles energy starvation, regen, and
  damage repair for shields already up — it does not auto-raise downed
  shields. The chosen trigger conditions ("after warp exit, after self-fired
  torpedo, not in combat lock") are project design decisions, paired with
  the `autoShield` flag added in feature 013.
- `PlayerScoreService` from feature 009 already handles the PvP **attacker
  award** path correctly. Two gaps remain for the AI-attacker case:
  (a) the AI-attacker path may not currently emit `COMBAT_SHIP_DESTROYED`
  with an attacker that resolves through the service; and
  (b) the deduction formula in `PlayerScoreRepository.transferKillScore`
  currently subtracts the raw `scr` (max_points + bonus) rather than
  `(scr/100) * score_f2`, and does not apply the 1/10 reduction for AI
  attackers. Both must be addressed in the plan phase.
- **`score_f2` dependency**: the C source reads `score_f2` at boot via
  `numopt(SCRFACT, 0, 32700)` (`GEMAIN.C:603`) — a MajorBBS option from 0 to
  32700. It is **not** currently present anywhere in `backend/src/`. The plan
  phase MUST introduce it as a configurable constant (env var, range 0–32700)
  with default **`score_f2 = 100`** (clarified 2026-05-08), which makes the
  PvP deduction equal to `scr` and matches today's behavior; AI deduction
  becomes `scr/10`.
- `droid.annoy` event routing in `GameGateway` is the working reference
  pattern; spawn and kill bridges follow that exact shape.
- No schema changes are required. No new commands are added. No persisted
  fields are added or removed.

## Plan-Phase Decisions

- **Update (a) above**: prerequisite verified — `attackerUserid` is already
  populated correctly for AI kills on the happy path. CombatTickService is
  the sole emitter of `COMBAT_SHIP_DESTROYED`; AI weapon paths set
  `victim.lastfired = ai.shipno` (`cybertron-tick.service.ts:375`,
  `droid-tick.service.ts:362,412`); attacker resolution finds AI ships in
  the in-memory map and their userids (`Cybrg-N` / `@Droid-N`) flow into
  `event.attackerUserid` verbatim (`combat-tick.service.ts:213`). T034
  reduces to: in `PlayerScoreService.handleShipDestroyed`, compute
  `isAiAttacker = isAiUserid(attackerUserid)` and pass it through to
  `transferKillScore` so the repo can apply the 1/10 reduction.
- **Mutual-kill edge case (Item 5, in scope — fix in this feature)**: in
  `CombatTickService.runKillResolution`, capture `attackerUserid` from the
  pre-removal ship snapshot *before* any `removeFromGame()` calls run on
  earlier victims in the same tick. This closes a silent scoring gap where
  an AI ship that dies on the same tick it lands the killing blow currently
  resolves to `attacker = undefined` → `attackerUserid = null` → AI kill
  goes unscored. One-line fix; belongs in Item 5's task list, not deferred.
- **Mine kills (out of scope)**: mines own a channel but aren't ships, so
  `findActiveAttackerByChannel` returns `undefined` and `attackerUserid` is
  `null` for mine deaths regardless of who laid the mine. The C source has
  the same behavior (`who` lookup against `lastfired` channel). Do not try
  to attribute mine kills to AI in this feature.
