# Subsystem Damage + Midnight Staleness Implementation Plan (Plan 4 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps. TDD is RED-first and MANDATORY: write the failing test, RUN it, capture the failing output BEFORE writing production code.

**Goal:** Wire up subsystem (random) damage so combat hits can knock out shields/phasers/fire-control/cloak/tactical/helm (C-010 — `randamage` is implemented but never called), give the damaged subsystems their gameplay effects + repair-over-time, and fix midnight team-code staleness in active sessions (P-016).

**Architecture:** (1) a pure `rollRandamage` decides which subsystem is hit + the magnitude; a small applier mutates the victim and emits an event; both are wired into every hit-resolution path. (2) Damaged-subsystem effects: most reuse existing gates (negative `phasr`<PMINFIRE → can't fire; `firecntl>0` → lockon FCBROKE; negative `cloak` → can't cloak); the two missing gates (tactical→scan, helm→heading) are added; a tick step repairs the negative fields toward 0 and counts `firecntl` down. (3) midnight emits a completion event; active ships' `teamcode` is refreshed from the DB.

**Tech Stack:** NestJS + TypeScript (strict), Jest, Prisma. No schema migration.

## Global Constants / Facts (verbatim — C `randamage`, GEFUNCS.C:1956-2052)
- Only runs when `shieldtype != 20` and `victim.damage > 20`. Roll `a = rndm((101 - damage)/1.5)`; if `a == 0`, pick `gernd()%6`:
  - 0 **shields** (needs class `max_shlds>0`): `shield = -rndm(damage+10)`; `shieldstat = SHIELDDM`.
  - 1 **phasers** (needs `max_phasr>0`): `phasr = -rndm(damage+10)`.
  - 2 **fire control** (needs torps OR missiles): `firecntl = gernd()%20`.
  - 3 **cloak** (needs `max_cloak>0`): `cloak = -rndm(damage+10)`.
  - 4 **tactical**: `tactical = -rndm(damage+10)`.
  - 5 **helm (navigation)**: `helm = -rndm(damage+10)`.
  - If the class lacks the capability for case 0/1/2/3, C prints RNDXX* and damages NOTHING.
- Existing effect-gates already in code: phaser handler refuses when `phasr < PMINFIRE` (negative phasr → can't fire ✓); `lockon` refuses when `firecntl > 0` (FCBROKE ✓); cloak handler refuses on damaged cloak (verify). MISSING: scan when `tactical != 0` (TABROKE) / `jammer > 0` (JAMMER4) — TODOs at scan.handler.ts:134-135 (S-007); heading-change when `helm != 0`.
- `ShipState` already has `tactical`, `helm`, `firecntl`, `shield`, `shieldstat`, `phasr`, `cloak`. `SHIELDDM` shieldstat value — look it up in constants (SHIELDUP=1/SHIELDDN=0/SHIELDDM=2 — verify).
- `randamage` has ZERO callers today (combat-math.ts) — C-010.
- P-016: `midnight.repository.ts:235 countTeamMembersAndResetOrphans` can reset `User.teamcode`→0; in-memory `ShipState.teamcode` is hydrated at boot and never refreshed; midnight emits nothing.

---

## File Structure
- `backend/src/game/combat/combat-math.ts` — replace the unused `randamage` with `rollRandamage(rand, damagePct, caps)` (pure: returns `{ subsystem, magnitude }`).
- `backend/src/game/combat/randamage.apply.ts` — **new**: `applyRandamage(rand, victim, caps, emit?)` — rolls + mutates the victim + returns a `RandamageResult`; used by all hit paths. (Keeps the mutation in one place.)
- `backend/src/game/combat/combat-events.ts` — add `COMBAT_SUBSYSTEM_DAMAGED` event + payload.
- `backend/src/game/physics/ship-class-cache.service.ts` — ensure capability getters exist (`getMaxShields`, `getMaxPhaser`, `getHasTorpedo`, `getHasMissile`, `getHasCloak`).
- `backend/src/game/combat/combat-tick.service.ts` — call `applyRandamage` after projectile + mine hull hits.
- `backend/src/game/commands/handlers/phaser.handler.ts` — call after normal + hyper hits.
- `backend/src/game/cybertron/cybertron-tick.service.ts`, `droid/droid-tick.service.ts` — call after AI hits.
- `backend/src/game/commands/handlers/scan.handler.ts` — add tactical (TABROKE) + jammer (JAMMER4) gates (S-007).
- heading-change handler (rotate/`rot` — find it) — add helm gate.
- `backend/src/game/ship/ship-tick.service.ts` — repair: heal negative `tactical`/`helm`/`cloak` toward 0; count `firecntl` down; confirm negative `phasr`/`shield` recover.
- `backend/src/game/midnight/midnight.service.ts` — emit `midnight.completed`; a handler refreshes active ships' `teamcode`.
- `backend/src/game/ship/ship-state.service.ts` — `refreshTeamcodes()` (re-read User.teamcode for in-memory ships).
- `backend/src/game/commands/messages.ts` — TABROKE, JAMMER4 (may exist), HELM_BROKE, subsystem-damage notices.

---

### Task 1: `rollRandamage` (pure) + `applyRandamage` (mutator) + event

**Files:** combat-math.ts, new randamage.apply.ts, combat-events.ts, cache getters; tests `test/game/combat/randamage.spec.ts` (new).

**Interfaces:**
- `rollRandamage(rand: Random, damagePct: number, caps: { hasShields: boolean; hasPhasers: boolean; hasTorpOrMissile: boolean; hasCloak: boolean }): { subsystem: 'shield'|'phasor'|'firecntl'|'cloak'|'tactical'|'helm'|'none'; magnitude: number }`. Returns `none` when `damagePct <= 20` OR the roll `rndm((101-damagePct)/1.5) !== 0`, OR the rolled case lacks capability. `magnitude` = the field value to set: shield/phasor/cloak/tactical/helm = `-floor(rand.next()*(damagePct+10))`; firecntl = `floor(rand.next()*65536)%20`.
- `applyRandamage(rand, victim: ShipState, caps, shieldtype): RandamageResult` — if `shieldtype === 20` → `{subsystem:'skipped'}`; else calls `rollRandamage`, mutates the victim field (and `shieldstat = SHIELDDM` for the shield case), returns `{ subsystem, magnitude }`.
- `COMBAT_SUBSYSTEM_DAMAGED` payload: `{ victimId, subsystem, sector, tickAt }`.

- [ ] **Step 1 (RED):** `test/game/combat/randamage.spec.ts`:
```ts
// damagePct <= 20 → 'none' regardless of roll
// shieldtype 20 → applyRandamage returns 'skipped', no mutation
// with a seeded rand forcing roll==0 and case 0, caps.hasShields true → subsystem 'shield', magnitude < 0; applyRandamage sets victim.shield = magnitude AND victim.shieldstat = SHIELDDM
// case 2 (firecntl) → magnitude in [0,19]; victim.firecntl set positive
// rolled case without capability (e.g. case 0 but hasShields false) → 'none', no mutation
// deterministic: same seed → same subsystem+magnitude
```
- [ ] **Step 2 (RED run):** `npx jest test/game/combat/randamage.spec.ts` → FAIL. Capture.
- [ ] **Step 3:** Implement `rollRandamage` (replace the old `randamage` in combat-math.ts) + `randamage.apply.ts` + the event. Look up `SHIELDDM` in constants (verify value). Confirm cache capability getters exist (add any missing). Use the existing `Random` port (`rand.next()`); mirror the C `gernd()%N` via `Math.floor(rand.next()*65536)%N` (match the existing pattern used elsewhere in combat-math, e.g. the old randamage's `Math.floor(rand.next()*65536)%6`).
- [ ] **Step 4 (GREEN):** tests pass; `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit** — `fix(combat): rollRandamage + applyRandamage subsystem-damage mutator + event (Plan 4 T1, C-010)`

---

### Task 2: wire `applyRandamage` into every hit-resolution path

**Files:** combat-tick.service.ts (projectile + mine), phaser.handler.ts (normal + hyper), cybertron-tick.service.ts, droid-tick.service.ts; tests extend each suite.

**Interfaces:** consumes `applyRandamage` + `COMBAT_SUBSYSTEM_DAMAGED` (T1). caps built from `shipClassCache` (getMaxShields>0, getMaxPhaser>0, getHasTorpedo||getHasMissile, getHasCloak) for the VICTIM's class.

- [ ] **Step 1 (RED):** In one representative suite (e.g. combat-tick.service.spec.ts projectile hit), add a test: after a hull hit that pushes the victim's `damage > 20`, with a seeded rand forcing a subsystem hit, the victim's chosen subsystem field is mutated AND `COMBAT_SUBSYSTEM_DAMAGED` is emitted. (Mirror for phaser handler.) RED first.
- [ ] **Step 2 (RED run):** capture.
- [ ] **Step 3:** After each site applies hull damage to a victim (NOT the shield-absorbed branch where hull is untouched — match C: `randamage` is called after the hit resolves, GECMDS.C:999/1082/1577/1662/1999, i.e. on every hit), call `applyRandamage(this.random, victim, caps, victim.shieldtype)` and emit `COMBAT_SUBSYSTEM_DAMAGED` when the result subsystem is a real one. Apply at: projectile hit (combat-tick `resolveProjectileHit`), mine sweep (`processMineSweep`), normal phaser hit + hyper hit (phaser.handler), cybertron hit (`cybFirePhaser`), droid hit(s). Note: C calls `randamage` after BOTH the shielded and unshielded branches (it's outside the shield if/else), so call it on every hit regardless of shield absorption — using the victim's CURRENT `damage` percent.
- [ ] **Step 4 (GREEN):** the new tests + all affected combat/AI suites pass; `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit** — `fix(combat): invoke subsystem damage on every weapon hit (Plan 4 T2, C-010)`

---

### Task 3: subsystem effects + repair-over-time

**Files:** scan.handler.ts (S-007), the heading-change handler, ship-tick.service.ts; messages.ts; tests.

- [ ] **Step 1 (RED):** Tests:
  - scan with `ship.tactical != 0` → TABROKE (no scan); scan with `ship.jammer > 0` → JAMMER4 (no scan). (S-007)
  - heading-change command (`rot`/equivalent) with `ship.helm != 0` → HELM_BROKE (heading unchanged).
  - ship-tick: a ship with `tactical = -5, helm = -3, cloak = -4, firecntl = 7` → after one update tick, each negative moves toward 0 (e.g. +1) and firecntl decrements toward 0. (Match the existing repair cadence — find how `repair`/regen increments work and mirror.)
  RED first; capture.
- [ ] **Step 2 (RED run):** capture.
- [ ] **Step 3:** Implement the two scan gates at scan.handler.ts:134-135 (replace the TODOs): early-return TABROKE if `ship.tactical != 0`, JAMMER4 if `ship.jammer > 0` (reuse existing message IDs if present; verify wording). Add the helm gate in the heading-change handler (find `rot`/`cmd_helm`): if `ship.helm != 0` → HELM_BROKE, don't change heading. In ship-tick.service.ts add a subsystem-repair step that moves negative `tactical`/`helm`/`cloak` toward 0 by the per-tick repair amount and decrements `firecntl` toward 0; confirm negative `phasr`/`shield` already recover via existing regen (if `phasr` regen does not lift negatives, ensure phaserReloadAmount accumulation does). Keep repair cadence consistent with the existing `repair`/regen logic.
- [ ] **Step 4 (GREEN):** tests pass; `npx tsc --noEmit` → 0. Update any scan test that assumed scan always succeeds.
- [ ] **Step 5: Commit** — `fix(combat): subsystem-damage effects (scan/helm gates) + repair-over-time (Plan 4 T3, C-010/S-007)`

---

### Task 4: P-016 — midnight team-code staleness

**Files:** midnight.service.ts, ship-state.service.ts; tests.

**Interfaces:** `ShipStateService.refreshTeamcodes(): Promise<void>` — re-read `User.teamcode` for every in-memory ship and update its `teamcode` (active-session refresh). midnight emits `MIDNIGHT_COMPLETED` after the transaction commits; a handler calls `refreshTeamcodes`.

- [ ] **Step 1 (RED):** Test: an in-memory ship with `teamcode = 5`; the User row's teamcode is changed to 0 (orphan reset); after `refreshTeamcodes()` the in-memory ship's `teamcode === 0`. And: midnight run emits `MIDNIGHT_COMPLETED`. RED first.
- [ ] **Step 2 (RED run):** capture.
- [ ] **Step 3:** Add `refreshTeamcodes` to ShipStateService (loop in-memory ships; `prisma.user.findMany({ where: { userid in [...] }, select: { userid, teamcode } })`; mutate each ship's teamcode). In midnight.service.ts, after `recordRun`/transaction commit (line ~141), emit `MIDNIGHT_COMPLETED` (define the event). Wire a handler (in ShipStateService or a small listener) `@OnEvent(MIDNIGHT_COMPLETED)` → `refreshTeamcodes()`. (Refresh only `teamcode`; document that other midnight-mutated User fields the ship caches, if any, are out of scope.)
- [ ] **Step 4 (GREEN):** tests pass; `npx tsc --noEmit` → 0. Note: midnight DB tests are part of the pre-existing 66-fail baseline (DB-dependent) — do NOT try to fix those; only your new unit-level teamcode-refresh test must pass.
- [ ] **Step 5: Commit** — `fix(persistence): refresh in-memory teamcode after midnight (Plan 4 T4, P-016)`

---

### Task 5: full regression + docs

- [ ] **Step 1:** `npx tsc --noEmit` (0) + full `npx jest`. Failing count ≤ the 66 baseline; NO combat/AI/scan(non-baseline)/ship suite newly failing. Fix regressions (adapt tests to correct new behavior; don't weaken). Note: scan now gates on tactical/jammer — recompute any scan test that fired without those clear; subsystem damage now mutates victims on hits — recompute any combat test asserting victim fields stay pristine after a hit (seed rand so randamage rolls 'none' where the test isn't about subsystems).
- [ ] **Step 2:** Update `docs/PROGRESS.md` (new entry for `026-subsystem-damage`: C-010 wired, S-007 scan gates, helm gate, repair, P-016; tests; decisions; Next = playtest/tuning + the deferred cleanup tracks; Known issues: 66 baseline + Docker). Update `docs/GAME_MECHANICS.md` (subsystem damage table + effects + repair; midnight teamcode refresh). Flip C-010, S-007, P-016 to `fixed` in `specs/022-fidelity-audit-v2/findings.md` with testRefs.
- [ ] **Step 3: Commit** — `docs: Plan 4 complete — subsystem damage, scan/helm gates, midnight teamcode refresh (Plan 4 T5)`

---

## Self-Review
**Spec coverage:** C-010 randamage roll+apply → T1; wired into all hits → T2; effects (scan/helm gates) + repair → T3; S-007 scan gates → T3; P-016 → T4; verify+docs → T5.
**Type consistency:** `rollRandamage`/`applyRandamage`/`RandamageResult`/`COMBAT_SUBSYSTEM_DAMAGED` (T1) consumed by T2's hit sites. `refreshTeamcodes`/`MIDNIGHT_COMPLETED` (T4).
**Flagged checks:**
- T1: verify `SHIELDDM` constant value; verify the cache capability getters exist (add missing); keep `rollRandamage` pure (no ship mutation — that's `applyRandamage`).
- T2: call randamage on EVERY hit (outside the shield if/else), using the victim's current `damage` %; don't double-apply.
- T3: find the real heading-change handler (`rot`/helm); confirm the repair cadence matches existing regen; ensure negative phasr/shield recover (don't leave a permanently-disabled subsystem).
- T4: refresh only `teamcode`; ensure the `@OnEvent` handler is registered; don't break midnight idempotency.
- This is the last fidelity plan; after it, the remaining open items are the pre-existing 66-test cleanup track and the Docker setup — both non-combat.
