# Phase 0 Research — Physics Polish

All NEEDS CLARIFICATION items in spec are resolved (clarifications session 2026-05-08).
The remaining unknowns are mechanical-fidelity details for each FR cluster, captured below
with C-source references.

---

## R1 — Boundary wrap (FR-001, FR-002)

**Decision**: After `positionIntegration` in `PhysicsTickService`, run a pure
`wrapCoord(value, max)` on each axis. Wrap is independent per-axis, modular on `MAXX=30`
and `MAXY=15` exactly.

**Rationale**: `GEFUNCS.C:651-705` wraps via `xcoord -= univmax*2` (and the symmetric
negative case) when `univwrap` is true — semantically equivalent to `((x % max) + max) % max`
in our coordinate system where coords are floats in `[0, MAXX)` × `[0, MAXY)`. Wrap is
applied only when `where <= 1` (in normal space — not while in a planet/wormhole transit).
The C source's `telezip` non-wrap fallback is dead code under our config (we set
`univwrap=true`); we intentionally do not port it.

**Alternatives considered**:
- Reflect at the boundary (bounce): rejected — not faithful to source, breaks the torus
  feel that long-range navigation depends on.
- Clamp at `MAXX-ε`: rejected — same reason; also produces "wall" behavior that breaks
  pursuit dynamics for AI.

**Implementation note**: Must run *before* the sector-transition event is emitted, so a
wrap from sector (29.x → 0.x) emits a transition event with the new sector ID, not the
out-of-range pre-wrap one.

---

## R2 — Overspeed engine damage (FR-003, FR-004)

**Decision**: Implement per `GEFUNCS.C:733-792` exactly. Pure decision in
`ship/ship-overspeed.ts`; the ship-update tick consumes it. The "150%" framing in the spec
is approximate — what triggers damage is the source's `gernd()%diff` lottery, escalating
through `warncntr` until threshold-cross at `warncntr > 4` causes the engine break.

**Source formula** (faithful port):

```
intspeed = floor(speed / 1000)
if intspeed > topspeed AND speed <= speed2b:
    diff = ((intspeed - topspeed) * 100) / intspeed
    diff = 60 - diff
    if diff < 0: diff = 5
    if rng.intBelow(diff) == 0:           # gernd() % diff == 0
        if warncntr > 4:
            // engine break
            topspeed = 0
            speed2b = 0
            damage += rng.intBelow(20)    # gernd() % 20
            emit WARPBRK (always-route to player)
        else:
            emit WARPFAST + warncntr      # message id offset by counter
            warncntr += 1
else:
    if warncntr > 0:
        topspeed = floor(topspeed / warncntr)   # recovery
        speed2b = topspeed * 1000
        emit WARPSPD with new topspeed
        warncntr = 0
```

**Rationale**: Bit-for-bit matches the original chance distribution and counter behavior.
Edge cases (Spec ec-3, "damage does not double-apply on the same threshold crossing") are
satisfied by the `warncntr++` step; once threshold crossed and engines broken, `topspeed=0`
prevents further triggering until the player repairs.

**Alternatives considered**:
- Deterministic damage at exact 150% threshold: rejected — the source uses a probabilistic
  ramp; deterministic damage feels punitive and breaks balance regression tests.
- Skip the recovery branch (`warncntr → 0` reset): rejected — without it, transient
  overspeed permanently throttles the ship, which is a regression from source.

**RNG source**: Reuse the existing seeded RNG used elsewhere in the tick (e.g., the same
port already used for combat math). Tests inject a deterministic RNG.

---

## R3 — Auto-repair tick consumer (FR-005, FR-012)

**Decision**: On every ship-update tick, for each active ship with `autoRepair === true`,
re-evaluate the same gates as `cmd_maint` (`GECMDS.C:cmd_maint`) and queue an identical
repair if all pass. Gate logic + cash debit + repair-queue mutation are extracted from
`MaintHandlerService` into a new domain service `backend/src/game/ship/maintenance.service.ts`.
The command handler delegates to it (and keeps message formatting + `CommandResult` shape);
the new ship-update subscriber calls it directly. The tick layer MUST NOT import command
handlers — `MaintenanceService` is the shared seam.

**Source**: `GECMDS.C:cmd_maint` for the gates and cost; `GECMDS.C:5190 cmd_set` for the
flag toggle. Gates are: ship has damage, sufficient cash, not in combat lock (`tagged`),
not in NZ unless piloted by Zygor.

**Rationale**: Sharing one gate function eliminates drift between manual and auto.
`cmd_maint` runs as a side effect of the existing command path, so the auto consumer
calls the same producer (or a refactored pure helper) — never reimplements the logic.

**Alternatives considered**:
- Re-issue the maintenance command synthetically through `CommandService`: rejected —
  injects a fake user input into the dispatch pipeline, complicates logging and
  observability.
- Fire on damage event only: rejected — not faithful; the original game's behavior is
  per-tick polling so a player who just toggled auto-repair on while damaged sees an
  immediate effect.

---

## R4 — Auto-shield tick consumer (FR-006, FR-012)

**Decision**: Port-original feature (no C source). On the ship-update tick, for each
active ship with `autoShield === true` and `shieldsUp === false`, raise shields when
the trigger conditions are met:
- recently exited warp (transient flag set by warp completion), OR
- recently fired a self-torpedo (transient flag set by torpedo launch),
AND
- ship is not in a combat lock (`tagged === 0`).

**Rationale**: Spec US4 explicitly notes this is a project-defined QoL feature, not a
port. The trigger conditions are limited deliberately so auto-shield doesn't fight the
locking mechanic (raising shields breaks lock per source). Transient triggers expire
after one consumer-tick to prevent re-triggering on subsequent ticks.

**Alternatives considered**:
- Always raise when `shieldsUp=false`: rejected — interferes with intentional shield-down
  states (e.g., torpedo lock-on cooldown, mine deployment).
- Hook on the warp/torpedo events themselves rather than tick: rejected — spec phrases
  this as a tick-driven setting consumer, consistent with auto-repair, and per-tick
  evaluation handles "toggled on while shields already down" cleanly.

---

## R5 — AI kill scoring (FR-007, FR-008, FR-008a)

**Decision**:

1. Introduce `score_f2 = 100` (default), loadable from env `SCORE_F2` in range `[0, 32700]`,
   bound at module init in `score.config.ts`. Locked-in regression test asserts default.
2. Update `PlayerScoreRepository.transferKillScore` to compute the deduction as
   `floor((scr / 100) * score_f2)` for PvP and `floor((scr / 100) * score_f2 / 10)` for
   AI-attacker (the C-source 1/10 branch at `GEFUNCS.C:1161`). Floored at zero.
3. `PlayerScoreService.handleShipDestroyed` computes
   `isAiAttacker = isAiUserid(attackerUserid)` and passes it as a new repo parameter.
4. **Mutual-kill snapshot fix**: in `CombatTickService.runKillResolution`, capture
   `attackerUserid` from a snapshot of the attacker ship taken *before* any
   `removeFromGame()` runs on victims earlier in the same tick. This closes the gap
   where an AI ship dies on the same tick it lands the killing blow.
5. Cybertron attacker `kills`: when `isAiAttacker && attackerUserid.startsWith('Cybrg-')`,
   call `cybertronRepository.incrementKills(shipno)` (atomic Prisma update, persisted).
   This feeds the existing `CYB_BE_NICE` / `CYB_BE_EASY` escalation.
6. Droid attacker `kills`: explicit no-op, with comment referencing `GEFUNCS.C:1253`.

**Rationale**: Clarification 2 (2026-05-08) confirmed Cybertron `kills` increment, Droid
no-op. Spec § Plan-Phase Decisions documents that `attackerUserid` already reaches
`PlayerScoreService` correctly on the happy path; only the formula and the mutual-kill
snapshot need work.

**Alternatives considered**:
- Apply 1/10 reduction at the service layer: rejected — repo owns the canonical
  arithmetic, keeping it there means a single source of truth and easier regression
  testing.
- Use a separate AI-only score column: rejected — schema change for no functional gain.
- Attribute mine kills to AI attackers: out of scope (spec § Plan-Phase Decisions —
  C source has the same gap).

---

## R6 — Droid spawn/kill bridge (FR-009, FR-010, FR-011)

**Decision**: Pattern matches existing `droid.annoy` routing exactly:

- `droid.spawned` → emit to the sector room (`sector:<x>:<y>`) at spawn time. Payload
  carries an explicit `ephemeral: true` flag and uses the `@Droid-N` userid prefix.
- `droid.killed` → emit to both the sector room (so visible roster updates) and the
  global `kills` channel (for the kill notification banner).
- Frontend sector roster keeps droid entries in component state only — never touches
  the persisted `User`/`Ship` roster query.

**Rationale**: `droid-events.ts` already declares `SPAWNED` and `KILLED` constants;
emitters and gateway bridges are missing. Reusing the routing pattern from `ANNOY`
keeps gateway code uniform.

**Alternatives considered**:
- Single combined `droid.presence` event with present/absent flag: rejected — different
  rooms (sector vs global) need different payloads on kill; one event would force
  conditional routing in the gateway.
- Persist droids to the database for a unified roster query: rejected — violates the
  spec FR-011 (ephemeral-only) and the original game's design (droids respawn fresh).

---

## Test strategy summary

| Cluster | Unit | Integration | E2E |
|---|---|---|---|
| Wrap | `wrapCoord` pure function (every quadrant + diagonal) | physics-tick wraps a high-warp ship across each boundary, sector-transition event fires once with post-wrap sector | — |
| Overspeed | `decideOverspeed` pure with injected RNG (each branch: lottery miss, escalation, threshold-cross/break, recovery) | ship-update tick applies damage and emits `WARPBRK` once on threshold crossing | — |
| Auto-repair | gate evaluator unit | ship-update tick queues a repair when gates pass; no-op when any gate fails; cash deducted exactly once | — |
| Auto-shield | trigger-flag transition unit | ship-update tick raises shields after warp-exit / self-torp; no-op while in combat lock | — |
| AI scoring | `(scr/100)*score_f2` and AI 1/10 arithmetic with `score_f2=0,1,100,32700` | `PlayerScoreService` end-to-end with synthetic Cybertron and Droid `COMBAT_SHIP_DESTROYED` events; mutual-kill same-tick AI death attributes correctly | — |
| Cyb kills counter | `incrementKills` repo unit | tick produces a persisted increment after Cybertron-attributed kill | — |
| Droid bridge | event payload shape unit | gateway emits `droid.spawned` / `droid.killed` to correct rooms; persistent roster query never returns droids | smoke: connect two clients to same sector, spawn droid, both see it; kill droid, both see it disappear |

All AI-isolation tests (Cybertron / Droid behavior) MUST run without sockets or a live
game world, per Principle II.
