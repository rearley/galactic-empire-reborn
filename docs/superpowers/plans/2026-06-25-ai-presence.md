# AI Presence + Damage Correctness Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make Cybertron AI an actual threat in a fresh world and make weapon damage scale correctly per ship class — closing the playtest finding that "the AI isn't really a factor."

**Architecture:** Three independent fixes against the original C source: (1) `C-005` — replace the wrong tonnage-based `tonFact` with the authentic per-class `damageFactor` scalar (the field already exists on `ShipClass`, seeded with wiki values); (2) `A-003` — add the missing `gebemean` gate to Cybertron phaser fire; (3) boot-seed the Cybertron population so the galaxy isn't empty for ~70 minutes after a fresh start.

**Tech Stack:** NestJS + TypeScript (strict), Jest, Prisma. No schema migration needed — `ShipClass.damageFactor` and `ShipClass.make` already exist and are seeded.

## Global Constants / Facts (verbatim, do not change)

- C `ton_fact(victim, dmg)` = `dmg / (shipclass[victim].damfact / 100.0)` → the multiplier applied to rolled damage is **`100 / victim.damageFactor`**. @see GEFUNCS.C:2661
- `damageFactor` is the victim's per-class resistance: 90 → takes ~1.11×, 100 → 1.0× (neutral), 200 → 0.5×, 2000 (Base Star) → 0.05×, 30 (Sarten Attack Drone) → 3.33×. Seeded in `backend/prisma/seed/ship-classes.ts`.
- C `cyb_attack` phaser gate: `if (phasr >= PMINFIRE && gebemean(ptr,target) && !cybwhoops(ptr,target)) firep(...)`. @see GECYBS.C:514-519
- Cybertron steady-state population per class = `CybertronClassConfig.tot_to_create` (21:10, 22:5, 23:1, 24:6, 25:2 → 24 total). @see cybertron.config.ts
- Constants already present: `CYB_BE_NICE`, `CYBSLO`, `CYB_BE_EASY`, `PMINFIRE`. `gebemean(tough, kills, CYB_BE_NICE, CYBSLO, random)` and `cybwhoops(cybskill, random)` exist in `cyb-decisions.ts`.

---

## File Structure
- `backend/src/game/combat/combat-math.ts` — replace `tonFact(ton)` with `damageScale(damageFactor)`; update `rollHullDamage` and `mineFalloff` signatures to take `damageFactor` instead of `ton`.
- `backend/src/game/physics/ship-class-cache.service.ts` — add `getDamageFactor(classNumber)`.
- `backend/src/game/combat/combat-tick.service.ts` — thread the VICTIM's `damageFactor` into the mine-sweep (line ~382) and projectile-hit (line ~631) damage calls.
- `backend/src/game/cybertron/cybertron-tick.service.ts` — add `gebemean` gate to `cybFirePhaser` invocation in `cybAttack`; add boot-seed loop in `onModuleInit` after `hydrateAll()`; extract a reusable `spawnOne(classNumber)` from `runSpawnSlot`.
- `backend/src/game/cybertron/cybertron.config.ts` — add a `CYBERTRON_BOOT_SEED` env flag (default true).
- Tests under `backend/test/game/combat/`, `backend/test/unit/`, `backend/test/game/cybertron/`.

### C-source references
- `GEFUNCS.C:2661 ton_fact`; `GEFUNCS.C:1546+ rollHullDamage callers`; `GEFUNCS.C:minesweep`.
- `GECYBS.C:514-519 cyb_attack` (phaser gebemean gate); `GECYBS.C:432-453 gebemean`.
- `GECYBS.C` cyb birth / `tot_to_create` population.

---

### Task 1: C-005 — per-class `damageFactor` damage scaling

**Files:**
- Modify: `backend/src/game/combat/combat-math.ts` (`tonFact`→`damageScale`; `rollHullDamage`, `mineFalloff`)
- Modify: `backend/src/game/physics/ship-class-cache.service.ts` (add `getDamageFactor`)
- Modify: `backend/src/game/combat/combat-tick.service.ts` (2 call sites)
- Test: `backend/test/game/combat/damage-scale.spec.ts` (new); update `combat-math.spec.ts`

**Interfaces:**
- Produces: `damageScale(damageFactor: number): number` → `damageFactor <= 0 ? 1 : 100 / damageFactor`.
- Changes: `rollHullDamage(rand, dmgMax, damageFactor)` and `mineFalloff(distance, damageFactor)` — 3rd/2nd param is now the victim's `damageFactor`, not tonnage.
- `ShipClassCacheService.getDamageFactor(classNumber: number): number`.

- [ ] **Step 1: Write the failing test**

`backend/test/game/combat/damage-scale.spec.ts`:

```ts
import { damageScale } from '../../../src/game/combat/combat-math';

describe('damageScale — C ton_fact (GEFUNCS.C:2661): multiplier = 100 / victim.damageFactor', () => {
  it('damageFactor 100 = neutral (1.0×)', () => {
    expect(damageScale(100)).toBeCloseTo(1.0, 10);
  });
  it('damageFactor 200 (tough) halves incoming damage', () => {
    expect(damageScale(200)).toBeCloseTo(0.5, 10);
  });
  it('damageFactor 90 (fragile) takes ~1.11×', () => {
    expect(damageScale(90)).toBeCloseTo(100 / 90, 10);
  });
  it('damageFactor 2000 (Base Star) takes 0.05×', () => {
    expect(damageScale(2000)).toBeCloseTo(0.05, 10);
  });
  it('guards non-positive damageFactor → 1.0 (no scaling)', () => {
    expect(damageScale(0)).toBe(1);
    expect(damageScale(-5)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/game/combat/damage-scale.spec.ts`
Expected: FAIL — `damageScale` not exported.

- [ ] **Step 3: Implement**

In `combat-math.ts`, replace `tonFact` (lines ~85-92) with:

```ts
/**
 * Per-class damage scaling: the multiplier applied to a rolled hit, equal to
 * `100 / victim.damageFactor`. This is the C `ton_fact(victim, dmg)` =
 * `dmg / (shipclass[victim].damfact / 100)` rearranged to a multiplier.
 * Higher damageFactor = tougher (takes less). Non-positive guards to 1.0.
 *
 * @see GEFUNCS.C:2661 ton_fact
 */
export function damageScale(damageFactor: number): number {
  if (damageFactor <= 0) return 1;
  return 100 / damageFactor;
}
```

Update `rollHullDamage` (the projectile-hit roll) to take the victim's damageFactor:

```ts
/**
 * Hull damage roll for projectile hits, scaled by the victim's per-class
 * damageFactor: `floor(rand * dmgMax * damageScale(victimDamageFactor))`.
 *
 * @see GEFUNCS.C:1546 incoming-weapon hit resolution + ton_fact
 */
export function rollHullDamage(rand: Random, dmgMax: number, victimDamageFactor: number): number {
  return Math.floor(rand.next() * dmgMax * damageScale(victimDamageFactor));
}
```

Update `mineFalloff` to take the victim's damageFactor instead of tonnage:

```ts
/**
 * Cubic distance falloff for mine damage, scaled by the victim's per-class
 * damageFactor: `MINEDAMMAX * (1 - d/MINERANGE)^3 * damageScale(victimDamageFactor)`.
 *
 * @see GEFUNCS.C:minesweep + ton_fact
 */
export function mineFalloff(distance: number, victimDamageFactor: number): number {
  if (distance >= MINERANGE) return 0;
  const factor = 1 - distance / MINERANGE;
  return Math.floor(MINEDAMMAX * factor * factor * factor * damageScale(victimDamageFactor));
}
```

In `ship-class-cache.service.ts`, add a getter mirroring `getMaxTons`:

```ts
getDamageFactor(classNumber: number): number {
  return this.getEntry(classNumber).damageFactor;
}
```

(Use whatever the existing accessor pattern is — `getMaxTons` is the template. If `ShipClassEntry` doesn't carry `damageFactor`, add it to the cache load from `ShipClass.damageFactor`.)

In `combat-tick.service.ts`:
- Mine sweep (~line 378-382): replace `ton = getMaxTons(ship.shpclass)` / `mineFalloff(dist, ton)` with `damageFactor = getDamageFactor(ship.shpclass)` (fallback 100) / `mineFalloff(dist, damageFactor)`. `ship` is the victim.
- Projectile hit (~line 627-631): replace `ton = getMaxTons(carrier.shpclass)` / `rollHullDamage(this.random, dmgMax, ton)` with `damageFactor = getDamageFactor(carrier.shpclass)` (fallback 100) / `rollHullDamage(this.random, dmgMax, damageFactor)`. `carrier` is the victim.
- Keep the line-236 `maxTons` (cargo loot) UNCHANGED — it is not damage scaling.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/game/combat/damage-scale.spec.ts test/game/combat/combat-math.spec.ts test/game/combat/combat-tick.service.spec.ts`
Expected: PASS. Update any `rollHullDamage`/`mineFalloff`/`tonFact` cases in `combat-math.spec.ts` and `combat-tick.service.spec.ts` to the new signature + expected values (compute from `damageScale`). Run `npx tsc --noEmit` → 0 errors (this changes signatures with callers — fix all).

- [ ] **Step 5: Commit**

```bash
git add backend/src/game/combat/combat-math.ts backend/src/game/physics/ship-class-cache.service.ts backend/src/game/combat/combat-tick.service.ts backend/test/game/combat/damage-scale.spec.ts backend/test/game/combat/combat-math.spec.ts backend/test/game/combat/combat-tick.service.spec.ts
git commit -m "fix(combat): per-class damageFactor damage scaling, replacing wrong tonnage tonFact (Plan 2 T1, C-005)"
```

---

### Task 2: A-003 — `gebemean` gate on Cybertron phaser fire

**Files:**
- Modify: `backend/src/game/cybertron/cybertron-tick.service.ts` (`cybAttack`)
- Test: `backend/test/game/cybertron/cyb-attack-gebemean.spec.ts` (new) or add to an existing cybertron suite

**Interfaces:** Consumes existing `gebemean(tough, target.kills, CYB_BE_NICE, CYBSLO, random)` and `cybwhoops(ship.cybskill, random)`.

- [ ] **Step 1: Write the failing test**

The C gate fires phasers only when `gebemean` is true AND `!cybwhoops`. The current TS gates only on `!cybwhoops`. Write a test that, with a deterministic PRNG forcing `gebemean=false` and `cybwhoops=false`, asserts NO phaser fire (`COMBAT_PHASER_FIRED` not emitted / `phasr` unchanged), and with `gebemean=true` + `cybwhoops=false` asserts fire occurs. Use the cybertron test harness pattern from `backend/test/game/cybertron/*.spec.ts` (deterministic `random` injection). Sketch:

```ts
it('does NOT fire phasers when gebemean is false (GECYBS.C:514)', () => {
  // PRNG seeded so gebemean(tough=0, kills<CYB_BE_NICE, ...) rolls false and cybwhoops false.
  // Call cybAttack via the public engagement path; assert no COMBAT_PHASER_FIRED and ship.phasr unchanged.
});
it('fires phasers when gebemean is true and cybwhoops false', () => {
  // PRNG seeded so gebemean true, cybwhoops false; assert COMBAT_PHASER_FIRED emitted.
});
```

(If `cybAttack` is private, drive it through the existing public engagement entry the other cybertron tests use; match their harness exactly.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/game/cybertron/cyb-attack-gebemean.spec.ts`
Expected: FAIL — current code fires whenever `!cybwhoops`, ignoring `gebemean`.

- [ ] **Step 3: Implement**

In `cybAttack` (cybertron-tick.service.ts ~454), gate the phaser fire on `gebemean` AND `phasr >= PMINFIRE` AND `!cybwhoops`, matching `GECYBS.C:514`:

```ts
const mean = gebemean(tough, target.kills, CYB_BE_NICE, CYBSLO, this.random);
if (ship.phasr >= PMINFIRE && mean && !cybwhoops(ship.cybskill, this.random)) {
  this.cybFirePhaser(ship, target, ctx);
}
```

Reuse the same `mean` value for the torpedo-count roll below (the existing `rollTorpedoCount(...)` call already passes a `gebemean(...)` — pass the `mean` computed here instead of rolling it a second time, to avoid double-consuming the PRNG; verify the original C uses one `gebemean` evaluation per `cyb_attack`). Keep `PMINFIRE`, `gebemean`, `cybwhoops` imports (already present).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/game/cybertron/cyb-attack-gebemean.spec.ts test/game/cybertron` and `npx jest test/integration/range-and-ai.spec.ts`
Expected: PASS. Adapt any existing cybertron test whose PRNG seeding now produces a different fire/no-fire outcome (the gate is stricter). `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/game/cybertron/cybertron-tick.service.ts backend/test/game/cybertron/cyb-attack-gebemean.spec.ts
git commit -m "fix(ai): gate Cybertron phaser fire on gebemean (Plan 2 T2, A-003)"
```

---

### Task 3: Boot-seed the Cybertron population

**Files:**
- Modify: `backend/src/game/cybertron/cybertron-tick.service.ts` (`onModuleInit`, extract `spawnOne`)
- Modify: `backend/src/game/cybertron/cybertron.config.ts` (`CYBERTRON_BOOT_SEED` flag)
- Test: `backend/test/game/cybertron/boot-seed.spec.ts` (new)

**Interfaces:**
- Produces: `private async spawnOne(classNumber: number, ctx?: TickContext): Promise<boolean>` extracted from `runSpawnSlot` — creates one AI ship of the class if below `tot_to_create`, returns whether it spawned. `runSpawnSlot` calls it.
- `bootSeedEnabled(): boolean` from config (env `CYBERTRON_BOOT_SEED`, default true).

- [ ] **Step 1: Write the failing test**

`backend/test/game/cybertron/boot-seed.spec.ts`:

```ts
// After onModuleInit with an empty DB (hydrateAll loads nothing), the service should
// create up to tot_to_create ships per class (21:10, 22:5, 23:1, 24:6, 25:2 = 24 total),
// not just one. Use the cybertron test harness; spy on the repository createSpawn.
it('boot-seeds each class up to tot_to_create when the galaxy is empty', async () => {
  // arrange: empty hydrateAll, createSpawn spy
  await service.onModuleInit();
  // assert: createSpawn called 24 times total, with the right per-class counts
  expect(spawnCountForClass(21)).toBe(10);
  expect(spawnCountForClass(23)).toBe(1);
  expect(totalSpawns()).toBe(24);
});
it('tops up only the deficit when some Cybertrons already exist', async () => {
  // arrange: hydrateAll yields 3 class-21 ships already present
  await service.onModuleInit();
  expect(spawnCountForClass(21)).toBe(7); // 10 - 3
});
it('does nothing when CYBERTRON_BOOT_SEED is disabled', async () => {
  // arrange: bootSeedEnabled() false
  await service.onModuleInit();
  expect(totalSpawns()).toBe(0);
});
```

(Match the existing cybertron harness — how `repository.createSpawn`/`hydrateAll` are faked in `test/game/cybertron/*.spec.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/game/cybertron/boot-seed.spec.ts`
Expected: FAIL — `onModuleInit` only hydrates; no boot seeding.

- [ ] **Step 3: Implement**

1. Extract the per-ship spawn body of `runSpawnSlot` (from "let shipno = 200" through `createSpawn(...)`) into:

```ts
/** Create one AI ship of `classNumber` if below tot_to_create. Returns true if spawned. @see GECYBS.C cyb birth */
private async spawnOne(classNumber: number): Promise<boolean> {
  const config = this.classConfigs[classNumber];
  if (!config) return false;
  const aiShips = this.shipState.findAllShips().filter((s) => s.status === 2);
  const currentCount = aiShips.filter((s) => s.shpclass === classNumber).length;
  if (currentCount >= config.tot_to_create) return false;
  const allAiShipnos = new Set(aiShips.map((s) => s.shipno));
  let shipno = 200;
  while (allAiShipnos.has(shipno)) shipno++;
  // ... (the existing userid/clsEntry/loadout/cybskill/tick/xcoord/ycoord + repository.createSpawn(...) body) ...
  return true;
}
```

  Refactor `runSpawnSlot` to pick a class (`pickSpawnClass`) and call `await this.spawnOne(chosenClass)`. Behavior for the per-30-tick slot is unchanged (still one ship per slot).

2. In `onModuleInit`, after `await this.repository.hydrateAll();`, add the boot-seed loop:

```ts
if (bootSeedEnabled()) {
  for (const classNumStr of Object.keys(this.classConfigs)) {
    const classNumber = Number(classNumStr);
    const target = this.classConfigs[classNumber].tot_to_create;
    // top up to tot_to_create; spawnOne self-limits, so loop at most `target` times
    for (let i = 0; i < target; i++) {
      const spawned = await this.spawnOne(classNumber);
      if (!spawned) break;
    }
  }
}
```

3. In `cybertron.config.ts` add:

```ts
/** Whether to fill the Cybertron population to tot_to_create at boot (default true). Set CYBERTRON_BOOT_SEED=false to disable. */
export function bootSeedEnabled(): boolean {
  return process.env.CYBERTRON_BOOT_SEED !== 'false';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/game/cybertron/boot-seed.spec.ts test/game/cybertron`
Expected: PASS. `npx tsc --noEmit` → 0 errors. Confirm `runSpawnSlot`'s existing tests still pass (the extraction must not change slot behavior).

- [ ] **Step 5: Commit**

```bash
git add backend/src/game/cybertron/cybertron-tick.service.ts backend/src/game/cybertron/cybertron.config.ts backend/test/game/cybertron/boot-seed.spec.ts
git commit -m "feat(ai): boot-seed Cybertron population to tot_to_create (Plan 2 T3)"
```

---

### Task 4: Full regression + docs

**Files:** docs only + verification.

- [ ] **Step 1: Full suite + tsc**

Run `npx tsc --noEmit` (0 errors) and `npx jest --silent --json --outputFile=/tmp/jest-p2.json`. Confirm: failing count ≤ the 66 pre-existing baseline, and NO combat/cybertron/droid suite newly failing. Fix any combat/AI regressions (adapt tests to correct new behavior; do not weaken).

- [ ] **Step 2: Update docs**

- `docs/PROGRESS.md`: new dated entry for `024-ai-presence` (Completed: C-005 damfact, A-003 gebemean gate, boot-seed; Tests; Decisions: boot-seed default-on via CYBERTRON_BOOT_SEED; Next: Plan 3; Known issues: subsystem damage/hyperphaser/mines/persistence still pending).
- `docs/GAME_MECHANICS.md`: damage scaling (damageFactor), Cybertron fire cadence (gebemean), boot population.
- `specs/022-fidelity-audit-v2/findings.md`: flip A-003 and C-005 to `fixed` with testRefs; note the boot-seed addressed the "AI not a factor" presence root cause.

- [ ] **Step 3: Commit**

```bash
git add docs/PROGRESS.md docs/GAME_MECHANICS.md specs/022-fidelity-audit-v2/findings.md
git commit -m "docs(ai): Plan 2 complete — damageFactor scaling, gebemean gate, boot-seed (Plan 2 T4)"
```

---

## Self-Review

**Spec coverage:** C-005 (damageFactor scaling) → T1 ✓. A-003 (gebemean phaser gate) → T2 ✓. "AI not a factor — empty galaxy" (boot-seed) → T3 ✓. Verification + docs → T4 ✓.

**Type consistency:** `damageScale(damageFactor)` (T1) consumed by `rollHullDamage`/`mineFalloff` (T1) and threaded at the 2 combat-tick sites (T1). `getDamageFactor` added to the cache (T1). `spawnOne` (T3) consumed by `runSpawnSlot` + boot loop (T3).

**Flagged checks (not placeholders):**
- T1: confirm `ShipClassEntry` carries `damageFactor`; if not, add it to the cache load. The `combat-tick.service.spec.ts` and `combat-math.spec.ts` likely assert old `tonFact`-based damage numbers — recompute expected values from `damageScale`.
- T2: verify the original `cyb_attack` evaluates `gebemean` once; avoid double-consuming the PRNG between the phaser gate and the torp-count roll.
- T3: the extraction of `spawnOne` must not change `runSpawnSlot`'s one-per-slot behavior; the boot loop must top up only the deficit (idempotent against `hydrateAll`).

**Out of scope (Plan 3):** subsystem damage (C-010), hyperphaser separation (C-009), mines (C-004), shield-drop-to-fire (C-008), combat-disconnect kill (P-001), midnight staleness (P-016).
