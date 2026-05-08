# Phase 0 Research — Source Fidelity Audit

**Method**: For each of the eight named gaps the spec lists, locate the
authoritative C-source citation, name the TS-side site that must change,
and pre-classify a working severity. Severity is finalized during
implement when the actual divergence is measured.

---

## R1. `randamage()` equivalence

- **Decision**: Use a checked-in golden-vector fixture (per Clarification
  Q1) at `backend/tests/fixtures/randamage.golden.json`. Fixture entries
  are `{ rngSeedSequence, dmgMax, ton, expected }` derived directly from
  the C implementation.
- **C source**: `GEFUNCS.C:1956-2050+` — `randamage()` is **not** a simple
  damage roll; it is a system-damage routine called only when
  `ptr->damage > 20.0`, rolling on `rndm((101.0 - damage)/1.5)` then
  selecting one of six subsystems (`gernd()%6`) to damage.
- **TS site**: `backend/src/game/combat/combat-math.ts:92` —
  `randamage(rand, dmgMax, ton)` currently returns
  `floor(rand.next() * dmgMax * tonFact(ton))`, which matches the C
  function name but not the C function semantics.
- **Pre-classification**: HIGH — the TS function is mis-implemented; the
  semantic divergence is total. Fix: rename the existing function to
  `rollHullDamage` (its actual job, called from `combat-tick.service.ts:570`
  during shield-overwhelmed hull hits), and add a faithful `randamage`
  that implements the C system-damage routine, wired into the post-hit
  path that mirrors GEFUNCS.C `randamage` calls (`GEFUNCS.C:1577,1662`).
  Both paths covered by golden vectors.
- **Rationale**: The fixture-based equivalence permits divergent RNG
  internals while pinning observable outputs.
- **Alternatives rejected**: Reproducing the original Borland C `rand()`
  bit-for-bit — unnecessary per Clarification Q1.

## R2. Interceptor preload bonus

- **Decision**: Apply the bonus only to ships of class Interceptor in
  `combat-tick.service.ts` per-tick reload step.
- **C source**: `GEFUNCS.C:1031-1034` — the C source computes
  `preload = phasrtype * PRELOAD;` then has a commented-out
  `if (ptr->shpclass == 2) preload *= 2;`. The comment explicitly says
  *"if interceptor class double phaser recharge speed"* — the doubling
  was disabled in the released C. **The audit must determine whether the
  in-scope behavior is the as-shipped C (no doubling) or the documented
  intent (doubling).** If wiki/spec says veterans expect the bonus,
  re-enable it; otherwise document the gap and downgrade to LOW.
- **TS site**: `backend/src/game/commands/ship-management-tick.service.ts`
  / `combat-tick.service.ts` — phaser reload computation.
- **Pre-classification**: MEDIUM pending wiki confirmation. Test:
  Interceptor-class ship reload is exactly 2× a Frigate's reload at
  identical state.
- **Alternatives rejected**: Applying to all military classes — not
  what the source intends.

## R3. Wormhole `visible` flag

- **Decision**: Surface `visible: boolean` on the wormhole record in
  `galaxy.types.ts` and on the in-memory ship/sector view used by scan
  rendering. Default `true` for backward compat with existing fixtures.
- **C source**: `GEMAIN.H:467-475` — `GALWORM.visible` is a documented
  field on the wormhole struct.
- **TS site**: `backend/src/game/galaxy/galaxy.types.ts` (struct),
  `backend/src/game/commands/handlers/scan.handler.ts` (rendering gate).
- **Pre-classification**: HIGH — visible flag is missing in TS state
  per the spec.

## R4. `scan lo full` ordering

- **Decision**: Snapshot the C-source field order from
  `GECMDS.C:cmd_scan` (line 2138 onward) and align the TS handler.
- **C source**: `GECMDS.C:2138+` — `cmd_scan` for `scan lo full` mode.
- **TS site**: `backend/src/game/commands/handlers/scan.handler.ts`.
- **Pre-classification**: MEDIUM (cosmetic but visible).

## R5. Beacon-on-move event

- **Decision**: Emit a beacon socket event keyed on the same condition
  as `GEFUNCS.C:808-816` (`samesect` + nonempty beacon string +
  `gernd()%10 == 0`). Payload is the contracted shape (Clarification Q2):
  `{ shipId, shipName, fromSector, toSector }`.
- **C source**: `GEFUNCS.C:808-816`.
- **TS site**: `backend/src/gateway/game.gateway.ts` and the move/warp
  path inside the physics tick.
- **Pre-classification**: MEDIUM — observable multiplayer feature.

## R6. `User.options[]` coverage

- **Decision**: Scope is the four C-defined options (Clarification Q3
  limits it to bytes the C source actually reads). From
  `GECMDS.C:5197-5201`:
  1. `scannames` — `GECMDS.C:3064`
  2. `scanhome`  — `GECMDS.C:2512, 2587, 2670`
  3. `scanfull`  — `GECMDS.C:2571`
  4. `filter`    — `GEMAIN.C:2563` (`MSG_FILTER`)
- **TS site**: `backend/src/game/commands/handlers/set.handler.ts` and
  the `User`/`Player` model that stores them.
- **Pre-classification**: MEDIUM — partial coverage to be completed.
- **Alternatives rejected**: Pinning all 30 bytes — out of scope per Q3.

## R7. GEMAIN.H constant pin enumeration

- **Decision**: Add `backend/tests/unit/gemain-pins.spec.ts` that:
  1. parses GEMAIN.H, extracts every `#define <NAME> <int|float>`
     classified as gameplay (filter list documented in the test header),
  2. asserts each appears in a TS-side pin map with the same value,
  3. fails if either set diverges (drift detection in both directions).
- **TS site**: `backend/src/game/constants.ts` is the canonical pin map.
- **Pre-classification**: HIGH — silent-drift prevention is core to
  Principle II.

## R8. Manual smoke tests

- **Decision**: Encode T053, T043, T077 as Jest `*.manual.spec.ts`
  files under `backend/tests/manual/` (Clarification Q5). Add a
  `test:manual` script in `backend/package.json` that runs Jest with a
  separate config that includes `*.manual.spec.ts` and excludes them
  from the default `npm test`.
- **TS site**: `backend/package.json`, `backend/jest.manual.config.js`,
  `backend/tests/manual/`.
- **Pre-classification**: LOW (process hygiene, no gameplay impact) —
  documented and fixed because Clarification Q5 made it cheap.

---

## Open items resolved

All Technical Context fields above are concrete; no `NEEDS CLARIFICATION`
remains. The five spec-level clarifications (Q1–Q5) are encoded into the
research decisions above.
