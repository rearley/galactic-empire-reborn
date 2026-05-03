# Research — 006b Ship-to-Ship Combat

All Technical Context unknowns are resolved here. Each decision cites
the original C source and lists the alternatives considered.

## R-1: Tick subscription model — same `TickKind.PHYSICS` event as 006a, ordered by import

**Decision**: `CombatTickService` subscribes to `TickKind.PHYSICS` via
the existing `TickService.subscribe()` API. CombatModule imports
PhysicsModule, so NestJS instantiates `PhysicsTickService.onModuleInit`
strictly before `CombatTickService.onModuleInit`. Subscribers fire in
registration order, so combat runs after the physics movement pass on
the same 6-second cadence — exactly mirroring `checktm()` in the
original C source.

**Rationale**: `checktm()` in `GEFUNCS.C` runs movement first and then
combat resolution on the same tick. Reusing the existing tick channel
avoids a second timer (constitution III), avoids drift between the two
passes, and preserves the original's same-tick semantics for hit
processing.

**Alternatives rejected**:
- New `TickKind.COMBAT` enum value firing on its own interval — drift between physics
  and combat would invalidate same-tick semantics (e.g., a torpedo could land before
  the target's movement completes), violates Principle I.
- Calling `CombatTickService.run()` directly from `PhysicsTickService` — couples the
  two modules, violates the publish/subscribe pattern already established by 006a's
  `EventEmitter2` usage.

## R-2: Random number injection — `Random` DI port

**Decision**: Introduce a `Random` port (Nest provider token) with a
default adapter that wraps `Math.random()`. Tests bind a deterministic
Mulberry32 adapter with a fixed seed. All combat-math functions that
roll dice (decoy intercept, torpedo hit randomization, `randamage()`
subsystem damage, mine sweep RNG, planet-revolt `gernd()%10`) take a
`Random` argument so they remain pure.

**Rationale**: SC-004 requires deterministic, repeatable test outcomes
for decoy and torpedo paths; SC-007 requires the same for planet
revolt. The original C uses `gernd()` everywhere; we mirror it with an
injected port.

**Alternatives rejected**:
- Module-global `Math.random()` with `jest.spyOn` — works for unit tests but cannot be
  shared across the integration tick test (the spy would have to wrap every callsite),
  and noisy stack traces.
- Mulberry32 hard-coded inside `combat-math` with a settable seed — mixes state into
  pure functions, violates the side-effect-free convention 006a established with
  `physics-math.ts`.

## R-3: Mine sweep cadence and damage application

**Decision**: Every live mine's `timer` decrements on every physics
tick. Damage application iterates only on the sweep tick where
`mptr->timer % 5 === 0` (`GEFUNCS.C:1421`). On a sweep tick the engine
walks every ship: if the ship is in the neutral zone (sector 0,0) it
is skipped (`GEFUNCS.C:1432`); otherwise if `timer === 0` damage is
applied with cubic falloff `(1 − ddist/MINERANGE)^3 × minedammax ×
ton_fact`, the mine's `channel` is written to the victim's `lastfired`
for kill credit, and the mine is destroyed (`channel = 255`); on
`timer > 0` only an `MINE6` proximity warning is emitted (no damage).

The mine sweep does **not** exclude the mine's owner — the original
loop iterates every ship in range with no owner check (per spec
clarification 2026-05-03 and `GEFUNCS.C:1423-1488`). An owner inside
`MINERANGE` at detonation takes damage exactly as any other ship.

**Rationale**: Spec clarification 2026-05-03 fixed this against the
authoritative C source. SC-003 pins the 5-tick cadence.

**Alternatives rejected**:
- Proximity-triggered detonation — does not match original; would let a fast scout
  detonate a fresh mine before its 5-tick fuse expires.
- Owner-skip on the sweep — does not match original; would change the gameplay
  meaningfully (players could sit on their own minefields).

## R-4: Lock lifecycle — lazy clearing on `@` use

**Decision**: `loc B` sets `warsptr->lock = B`. The `@` token in any
weapon command resolves through a `findshp` helper that re-validates
the lock: if the locked target is no longer `ingegame` OR
`cdistance × 10000 > scanrange`, the lock is cleared
(`warsptr->lock = -1`) and a NOLOCK message returned. The check is
**lazy** (only on `@` use), not proactive per-tick. In-flight
torpedoes and missiles already track the target on the **target's**
own lock slot (`ltorps[i].channel` / `lmissl[i].channel`) and
continue independently of the firer's `lock` field
(`GECMDS.C:1441-1471`).

**Rationale**: Spec clarification 2026-05-03. Mirrors the original
exactly. Avoids a per-tick lock-validation pass that would add work
for every player every tick.

**Alternatives rejected**:
- Proactive per-tick lock revalidation — extra tick cost; doesn't match original.
- Sector-boundary lock-clear — wrong trigger; original uses scan-range.

## R-5: Jammer is area-effect, no self-exclusion

**Decision**: `cmd_jammer` (`GECMDS.C:1593-1651`) iterates every ship
within the carrier's `scanrange` and, for each (including the carrier
itself — the loop has no self-exclusion), sets that ship's `jammer`
counter to `jamtime × (1 − distance/scanrange)`. The counter
decrements every physics tick. While a ship's `jammer > 0`, its
`loc`/fire-control attempts are rejected with the JAMMER4 message
(`GECMDS.C:1354-1358`). Existing locks and in-flight projectiles are
unaffected. `sys unjam` clears the counter immediately. All jammer
state is in-memory only.

**Rationale**: Spec clarification 2026-05-03.

**Alternatives rejected**:
- Carrier-exempt jammer — does not match original; the carrier deliberately blinds
  itself when deploying.

## R-6: Friendly fire — no team filter on hit resolution

**Decision**: Phaser, torpedo, missile, and mine hit resolution does
not check team affiliation. A teammate in the firing arc takes damage
and a kill on a teammate credits normally.

**Rationale**: Spec clarification 2026-05-03 — matches original GE.

**Alternatives rejected**: Team-aware filtering — would require a
new design decision and does not match the original.

## R-7: Death broadcast scope — galaxy-wide for ship-destroyed only

**Decision**: `combat.ship-destroyed` is broadcast galaxy-wide (every
connected player). All other combat events
(`combat.phaser-fired`, `combat.hit`, `combat.miss`,
`combat.decoy-intercept`, `combat.mine-detonation`) are sector-scoped
to the sector room derived from the event payload. The `GameGateway`
is the sole bridge between `EventEmitter2` and Socket.io; combat
services MUST NOT call Socket.io directly (FR-031).

**Rationale**: Spec clarification 2026-05-03. Matches original GE
death-announcement behavior.

**Alternatives rejected**:
- All-sector-scoped — players in other sectors would not see notable kills, breaks
  fidelity with the original galaxy-wide death log.
- All-galaxy-wide — phaser-fire and decoy-intercept noise would flood every player.

## R-8: Kill attribution — last-hit-in-tick wins (lastfired overwrite)

**Decision**: Every successful hit overwrites the victim's `lastfired`
field with the attacker's channel (`GEFUNCS.C:1559, 1611, 1742, 1103`).
When the death check fires (`acctm` → `killem`), the kill credits
whichever attacker is currently in `lastfired`. With multiple hits in
the same tick, slot-iteration order determines the winner: torpedo
slots resolve before missile slots, and within each weapon class
low-index slots resolve first. The kill goes to the last-processed
hit. Mines and phasers also overwrite `lastfired` if they hit in the
same tick, with mines processed during the mine-sweep step and phasers
during phaser hit resolution (these are deterministic ordering points
in `checktm()`).

**Rationale**: Spec edge case (lines 213-219). Reproducing the
original's ordering exactly is required for fairness in multi-attacker
fights and for the Cybertron AI escalation in 007.

## R-9: In-flight projectile cleanup on victim death (FR-027)

**Decision**: When a ship is destroyed, the kill resolver walks every
ship's `ltorps[]` and `lmissl[]` arrays and clears any slot where the
target channel matches the destroyed ship's channel. The destroyed
ship's own slots are also cleared. No orphan projectiles remain.

**Rationale**: FR-027. Avoids ghost projectiles closing on a coordinate
where no target exists; avoids divide-by-zero or null-target hazards
on the next tick.

## R-10: Combat constants placement

**Decision**: Extend `backend/src/game/constants.ts` with combat
constants. New entries:

| Constant      | Value | Source                                       |
|---------------|-------|----------------------------------------------|
| `PMINFIRE`    | 60    | `GEMAIN.H:81`                                |
| `PRELOAD`     | 10    | `GEMAIN.H:80`                                |
| `PHABIAS`     | 2     | `GEMAIN.H:84`                                |
| `SHHITENG`    | 1000  | `GEMAIN.H:96`                                |
| `FIRETICKS`   | 10    | `GEMAIN.H:138`                               |
| `DECOYTIME`   | 15    | `GEMAIN.H:132` (× TICKTIME)                  |
| `HPBEAMW`     | 5     | `GEMAIN.H:88`                                |
| `MAXTORPS`    | 3     | `GEMAIN.H:125`                               |
| `MAXMISSL`    | 3     | `GEMAIN.H:126`                               |
| `MINERANGE`   | 10000 | `GEMAIN.H:195`                               |
| `TDAMMAX`     | TBD   | `GEGLOBAL.H:173` (canonical default)         |
| `MDAMMAX`     | TBD   | `GEGLOBAL.H:175` (canonical default)         |
| `MINEDAMMAX`  | TBD   | `GEGLOBAL.H:177` (canonical default)         |
| `DECODDS`     | TBD   | `GEGLOBAL.H:145` (canonical default)         |
| `TORPSPED`    | TBD   | `GEGLOBAL.H:143` (canonical default)         |
| `MISLSPED`    | TBD   | `GEGLOBAL.H:144` (canonical default)         |
| `MISENGFC`    | TBD   | `GEGLOBAL.H:159` (canonical default)         |
| `JAMTIME`     | TBD   | `GEGLOBAL.H:141` (canonical default)         |

The "TBD" entries are tunables the original C source initializes from
`GLOBAL.C` defaults (or operator config); the implementation task will
confirm the exact canonical default from the source and pin it. Each
entry gets a JSDoc citation and an entry in the balance-regression
test (SC-003).

**Rationale**: Mirrors the 006a constants-extension pattern; keeps a
single source of truth that the regression test can enumerate.

**Alternatives rejected**:
- Per-class fields on `ShipClass` — does not match original (these are global tunables,
  not per-class fields). Per-class differentiation that already exists (`maxPhaser`,
  `hasTorpedo`, `scanRange`, etc.) lives on `ShipClass`; the global tunables stay global.

## R-11: Planet revolt placement

**Decision**: Add the revolt branch to the existing
`PlanetEconomyService` (or whichever service owns the
once-per-economy-tick planet update — feature 005 placed it). On each
owned planet, when `(taxrate / 120) × 0.35 × men > troops` AND
`gernd() % 10 === 0`, reduce `troops` to `troops / ((rand % 8) + 2)`,
queue a `MAIL_CLASS_DISTRESS` mail for the owner, and reset
`ownerUserId = null` (the `**Free**` state). Revolt does NOT damage
the orbiting ship and does NOT invoke combat resolution.

**Rationale**: Spec clarification 2026-05-03 and `GEPLANET.C:341-380`.
The revolt path was deferred from 005; it lands here only because the
event/broadcast wiring lives in this feature. The revolt itself is a
planet-state event with no combat side effects.

**Alternatives rejected**:
- Putting revolt inside `CombatTickService` — wrong cadence (economy is not the 6s
  combat tick) and wrong scope (revolt is not combat).
