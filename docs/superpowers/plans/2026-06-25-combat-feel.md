# Combat Feel Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ship-to-ship weapons hit the *right* target at the *right* range, faithful to the original C source — fixing the playtest-reported "phasers hit everything except my target" and "I can shoot something multiple sectors away."

**Architecture:** Pure combat math stays in `backend/src/game/combat/combat-math.ts` (deterministic, unit-tested). The `pha`/`tor`/`mis` command handlers consume it. We restore the original `pha <degree> <focus>` command semantics, port the C `pdamage` distance falloff, add the `lockon` quality gate to torpedoes/missiles, and add the cloak/neutral-zone fire gates. Hyperphaser separation (C-009), `damfact`/`ton_fact` (C-005), mines (C-004) and subsystem damage (C-010) are explicitly OUT OF SCOPE — they belong to Plans 2 and 3.

**Tech Stack:** NestJS + TypeScript (strict), Jest. Combat math is framework-free pure functions.

## Global Constants

Copied verbatim from the original C source / `GEMAIN.H`. These are firm pins — a test must fail if they change.

- `PHABIAS = 2` (already in `constants.ts:142`) — phaser arc bias degrees. Beam **half-angle = focus + PHABIAS**.
- `TONFACT = 15000` (already in `constants.ts:168`) — phaser tonnage divisor: `tonfact = 1 + victim.maxTons / TONFACT`.
- `PMINFIRE = 60` (already `constants.ts:134`) — minimum phaser charge to fire.
- `WARP_THRESHOLD = 1000` (already `constants.ts:59`) — `speed >= 1000` ⇒ at warp (`where == 1`).
- `FIRETICKS = 10` (already in constants) — battle-lock ticks set on firer+victim.

New tunable balance constants (the original loads these from a `.cnf` via `numopt(KEY, default, max)`; we pin our chosen defaults and document them as playtest-tunable, following the existing `TDAMMAX`/`MDAMMAX` precedent in `constants.ts:204`):

- `PDAMMAX = 200` — `numopt(PDAMMAX,1,200)`; max-of-range chosen so phasers deal meaningful damage. **Tune during playtest.**
- `PFIRDST = 1` — `numopt(PFIRDST,1,20)`; distance-falloff exponent for normal phaser.
- `TORFACT = 0.1` — `numopt(TORFACT,1,50)/10` ⇒ default 0.1; torpedo lock-quality divisor.
- `MISFACT = 0.1` — `numopt(MISFACT,1,50)/10` ⇒ default 0.1; missile lock-quality divisor.
- `SE100DAM = 101` — `numopt(SE100DAM,1,101)`; self-zap hull damage for firing inside the neutral zone (101 = instant kill, the production intent).
- `PHATOWRP = 0` — `numopt(PHATOWRP,0,100)`; min `phasrtype` to hit a warping victim with a normal phaser. Default 0 ⇒ any phaser can.

---

## File Structure

- `backend/src/game/constants.ts` — add the 6 new balance constants + their exports.
- `backend/src/game/combat/combat-math.ts` — replace `phaserDamage`, change `lineOfFire` to a focus-based half-angle, add `lockFact`. Pure functions, no new deps.
- `backend/src/game/combat/neutral-zone.ts` — **new** tiny module exporting `isInNeutralZone(coord)` (the (0,0)-sector test), so handlers and combat-tick share one predicate. (Today the test is inlined in `combat-tick.service.ts:326`; extract it.)
- `backend/src/game/commands/handlers/phaser.handler.ts` — restore `pha <degree> <focus>` semantics; wire new damage formula; add cloak + neutral-zone + victim-at-warp gates.
- `backend/src/game/commands/handlers/torpedo.handler.ts` — add lock-quality gate + target-cloak/target-at-warp gates + neutral self-zap.
- `backend/src/game/commands/handlers/missile.handler.ts` — add lock-quality gate + firer-cloak gate + neutral self-zap.
- `backend/src/game/commands/messages.ts` — fix `PHA_FMT`, add `PHA_CLOAK`, `WPN_ZAP`, `LOCK_FAIL`, `LOCK_NEUTRAL` message strings.
- Tests under `backend/test/unit/` and `backend/test/game/combat/`.

### C-source references (all line-verified for this plan)
- `GECMDS.C:829-912 cmd_phas` — arg dispatch: `pha <deg>` sets focus=1; `pha <deg> <focus>` validates `valpcnt(margv[2],0,5)`; warp ⇒ `firehp`.
- `GECMDS.C:914-1017 firep` — cloak gate (line 923), neutral self-zap (937-941), beam test `smallest(heading,deg) < percent+PHABIAS` (954), victim-at-warp gate `wptr->where != 1 || phasrtype >= phatowrp` (949), victim neutral immunity (951), damage scaling (956-973), full discharge `phasr=0` (1006).
- `GEFUNCS.C:2060-2093 pdamage` — `disfact=20000+phasrtype*4000; dd=1-dist/disfact (≥0); fd=1-foc/11; dp=dd^pfirdist * fd² * (phasr/100); dam=pdammax*dp`.
- `GEFUNCS.C:1933-1950 valdegree` — degree is **relative**, range **−180..180**, stored as `degrees`.
- `GEFUNCS.C:1906-1927 valpcnt` — focus range **0..5**, stored as `percent`.
- `GECMDS.C:1339-1430 lockon` — target neutral ⇒ fail (FCNONO); gate `cloak<10 && dist*10000 < scanrange`; torpedo `fact=(1.2-speed/5000)*((5-dist)/tor_fact)`, `0` if `wptr->speed>999`; missile `fact=(5-dist)/mis_fact`; succeeds iff `fact>0.7`.
- `GECMDS.C:1525-1532 zaphim` — `ptr->damage += se100dam`.

---

### Task 1: Combat balance constants

**Files:**
- Modify: `backend/src/game/constants.ts` (insert after `MISENGFC`/`JAMTIME` block, ~line 216)
- Test: `backend/test/unit/gemain-pins.spec.ts` (existing — append a `describe`)

**Interfaces:**
- Produces: exported `const PDAMMAX, PFIRDST, TORFACT, MISFACT, SE100DAM, PHATOWRP` from `../../constants`.

- [ ] **Step 1: Write the failing test**

Append to `backend/test/unit/gemain-pins.spec.ts`:

```ts
import { PDAMMAX, PFIRDST, TORFACT, MISFACT, SE100DAM, PHATOWRP } from '../../src/game/constants';

describe('combat balance constants (Plan 1)', () => {
  it('pins phaser + lock + self-zap defaults', () => {
    expect(PDAMMAX).toBe(200);
    expect(PFIRDST).toBe(1);
    expect(TORFACT).toBeCloseTo(0.1, 10);
    expect(MISFACT).toBeCloseTo(0.1, 10);
    expect(SE100DAM).toBe(101);
    expect(PHATOWRP).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/unit/gemain-pins.spec.ts -t "combat balance constants"`
Expected: FAIL — `PDAMMAX` etc. are not exported (compile error / undefined).

- [ ] **Step 3: Add the constants**

In `backend/src/game/constants.ts`, after the `JAMTIME` line (~216), add:

```ts
/** @see GEMAIN.C:494 numopt(PDAMMAX,1,200) — max normal-phaser damage base. Playtest-tunable. */
export const PDAMMAX = 200 as const;
/** @see GEMAIN.C:493 numopt(PFIRDST,1,20) — normal-phaser distance falloff exponent. */
export const PFIRDST = 1 as const;
/** @see GEMAIN.C:506-507 numopt(TORFACT,1,50)/10 — torpedo lock-quality divisor. */
export const TORFACT = 0.1 as const;
/** @see GEMAIN.C:509-510 numopt(MISFACT,1,50)/10 — missile lock-quality divisor. */
export const MISFACT = 0.1 as const;
/** @see GEMAIN.C:463 numopt(SE100DAM,1,101) — self-zap hull damage for firing in the neutral zone. */
export const SE100DAM = 101 as const;
/** @see GEMAIN.C:598 numopt(PHATOWRP,0,100) — min phasrtype to hit a warping victim with normal phaser. */
export const PHATOWRP = 0 as const;
```

(`constants.ts` also has an aggregated re-export object near line 355 — add the six names there too, matching the existing pattern.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/unit/gemain-pins.spec.ts -t "combat balance constants"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/game/constants.ts backend/test/unit/gemain-pins.spec.ts
git commit -m "feat(combat): add tunable phaser/lock/self-zap balance constants (Plan 1 T1)"
```

---

### Task 2: Neutral-zone predicate module

**Files:**
- Create: `backend/src/game/combat/neutral-zone.ts`
- Modify: `backend/src/game/combat/combat-tick.service.ts` (replace the inlined (0,0)-sector test ~line 326 with an import — keep behavior identical)
- Test: `backend/test/unit/neutral-zone.spec.ts` (new)

**Interfaces:**
- Produces: `isInNeutralZone(coord: { xcoord: number; ycoord: number }): boolean` — true when the ship is in the origin sector (the neutral zone), matching C `neutral()` which tests `xsect==0 && ysect==0`.

- [ ] **Step 1: Write the failing test**

`backend/test/unit/neutral-zone.spec.ts`:

```ts
import { isInNeutralZone } from '../../src/game/combat/neutral-zone';

describe('isInNeutralZone', () => {
  it('is true inside the origin sector (-0.5, 0.5)', () => {
    expect(isInNeutralZone({ xcoord: 0, ycoord: 0 })).toBe(true);
    expect(isInNeutralZone({ xcoord: 0.49, ycoord: -0.49 })).toBe(true);
  });
  it('is false outside the origin sector', () => {
    expect(isInNeutralZone({ xcoord: 0.5, ycoord: 0 })).toBe(false);
    expect(isInNeutralZone({ xcoord: 3, ycoord: 2 })).toBe(false);
    expect(isInNeutralZone({ xcoord: -1, ycoord: 0 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/unit/neutral-zone.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

`backend/src/game/combat/neutral-zone.ts`:

```ts
/**
 * True if a coordinate lies in the neutral-zone origin sector.
 *
 * The C source `neutral()` tests `coord1(x)==0 && coord1(y)==0` where
 * `coord1` truncates toward the sector index. The origin sector spans
 * (−0.5, +0.5) on each axis in this port's sector-unit coordinates.
 *
 * @see GEFUNCS.C:neutral, GECMDS.C:937 (firep self-zap gate)
 */
export function isInNeutralZone(coord: { xcoord: number; ycoord: number }): boolean {
  return coord.xcoord > -0.5 && coord.xcoord < 0.5 && coord.ycoord > -0.5 && coord.ycoord < 0.5;
}
```

In `combat-tick.service.ts`, replace the inlined neutral-zone coordinate check (~line 326) with `isInNeutralZone(...)` and add the import. Verify the existing R-3 neutral-zone test (`test/game/combat/combat-tick.service.spec.ts`) still passes — behavior must be identical.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/unit/neutral-zone.spec.ts test/game/combat/combat-tick.service.spec.ts`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add backend/src/game/combat/neutral-zone.ts backend/src/game/combat/combat-tick.service.ts backend/test/unit/neutral-zone.spec.ts
git commit -m "refactor(combat): extract isInNeutralZone predicate (Plan 1 T2)"
```

---

### Task 3: Phaser beam cone — focus-based half-angle

**Files:**
- Modify: `backend/src/game/combat/combat-math.ts:58-75` (`lineOfFire`)
- Test: `backend/test/game/combat/line-of-fire.spec.ts` (new)

**Interfaces:**
- Produces: `lineOfFire(firer, victim, degree, focus)` where the beam half-angle is `focus + PHABIAS` (NOT `(beamWidth+PHABIAS)/2`). `degree` is the relative bearing off the firer's heading (−180..180). Returns true iff the absolute angular offset between the firing direction and the victim bearing is `< focus + PHABIAS`.

- [ ] **Step 1: Write the failing test**

`backend/test/game/combat/line-of-fire.spec.ts`:

```ts
import { lineOfFire } from '../../../src/game/combat/combat-math';

// Firer at origin, heading 0 (north, -y). Victim due north at distance 2.
const firer = { xcoord: 0, ycoord: 0, heading: 0 };
const victimNorth = { xcoord: 0, ycoord: -2 };
// Victim at compass bearing ~10° east of north.
const victim10deg = { xcoord: 2 * Math.sin((10 * Math.PI) / 180), ycoord: -2 * Math.cos((10 * Math.PI) / 180) };

describe('lineOfFire focus-based cone (GECMDS.C:954 smallest < focus+PHABIAS)', () => {
  it('focus 0 ⇒ ±2° cone: hits dead-ahead target', () => {
    expect(lineOfFire(firer, victimNorth, 0, 0)).toBe(true);
  });
  it('focus 0 ⇒ ±2° cone: MISSES a target 10° off-axis', () => {
    expect(lineOfFire(firer, victim10deg, 0, 0)).toBe(false);
  });
  it('focus 5 ⇒ ±7° cone: still misses a target 10° off-axis', () => {
    expect(lineOfFire(firer, victim10deg, 0, 5)).toBe(false);
  });
  it('relative degree aims the beam: bearing 10 with focus 0 hits the 10°-off target', () => {
    expect(lineOfFire(firer, victim10deg, 10, 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/game/combat/line-of-fire.spec.ts`
Expected: FAIL — current `lineOfFire` uses `(beamWidth+PHABIAS)/2`, so with the old call shape the cone is wrong and the off-axis assertions fail.

- [ ] **Step 3: Implement**

Replace `lineOfFire` in `combat-math.ts` (lines 58-75) with:

```ts
/**
 * True if `victim` lies within the phaser firing arc of `firer`.
 *
 * The firing direction is `firer.heading + degree` (degree is the player's
 * RELATIVE bearing, −180..180, per GEFUNCS.C:valdegree). The beam half-angle
 * is `focus + PHABIAS` degrees, matching the original hit test
 * `smallest(vector(firer,victim), heading+degree) < focus + PHABIAS`.
 *
 * @see GECMDS.C:942,953-954 firep
 */
export function lineOfFire(
  firer: { xcoord: number; ycoord: number; heading: number },
  victim: { xcoord: number; ycoord: number },
  degree: number,
  focus: number,
): boolean {
  const dx = victim.xcoord - firer.xcoord;
  const dy = victim.ycoord - firer.ycoord;
  if (dx === 0 && dy === 0) return false;
  // Absolute compass direction to victim: north=0, clockwise. y increases downward so -dy.
  const victimAngle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  // Absolute firing direction = firer heading + relative degree.
  const firingAngle = (firer.heading + degree + 360) % 360;
  let diff = Math.abs(victimAngle - firingAngle);
  if (diff > 180) diff = 360 - diff;
  return diff < focus + PHABIAS;
}
```

(`PHABIAS` is already imported at the top of `combat-math.ts`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/game/combat/line-of-fire.spec.ts`
Expected: PASS. Also run `npx jest test/game/combat/combat-math.spec.ts` and fix any existing `lineOfFire` cases there to the new 4-arg `(firer, victim, degree, focus)` shape (they currently pass `beamWidth`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/game/combat/combat-math.ts backend/test/game/combat/line-of-fire.spec.ts backend/test/game/combat/combat-math.spec.ts
git commit -m "fix(combat): focus-based phaser cone, half-angle = focus+PHABIAS (Plan 1 T3, C-bug)"
```

---

### Task 4: Phaser damage formula — port C `pdamage` + `firep` scaling (C-002)

**Files:**
- Modify: `backend/src/game/combat/combat-math.ts` (replace `phaserDamage` at lines 81-83)
- Test: `backend/test/game/combat/phaser-damage.spec.ts` (new)

**Interfaces:**
- Produces:
  ```ts
  phaserDamage(args: {
    phasrtype: number;   // firer phaser tech level (1..20; 20 = sysop)
    phasr: number;       // firer CURRENT phaser charge
    distRaw: number;     // cdistance(firer,victim) * 10000  (raw units)
    focus: number;       // 0..5
    victimMaxTons: number;
    victimAtWarp: boolean;
  }): number
  ```
  Returns integer hull-equivalent damage (pre-shield). Replaces the old `(percent/100)*maxPhaser/(1+range/100)`.

- [ ] **Step 1: Write the failing test**

`backend/test/game/combat/phaser-damage.spec.ts`:

```ts
import { phaserDamage } from '../../../src/game/combat/combat-math';

describe('phaserDamage — C pdamage falloff (GEFUNCS.C:2060 + firep scaling GECMDS.C:956-973)', () => {
  const base = { phasrtype: 1, phasr: 100, focus: 0, victimMaxTons: 0, victimAtWarp: false };

  it('point-blank deals substantial damage', () => {
    const d = phaserDamage({ ...base, distRaw: 0 });
    // disfact=24000, dd=1, fd=1, dp=1*1*(100/100)=1, dam=PDAMMAX*1=200; (1+1)/2.5=0.8; tonfact=1 -> 160
    expect(d).toBe(160);
  });

  it('falls to zero at/after disfact (24000 raw = 2.4 sectors for phasrtype 1)', () => {
    expect(phaserDamage({ ...base, distRaw: 24000 })).toBe(0);
    expect(phaserDamage({ ...base, distRaw: 30000 })).toBe(0);
  });

  it('half-disfact deals roughly half (linear pfirdist=1)', () => {
    // dist=12000 -> dd=0.5 -> dp=0.5 -> dam=100 -> *0.8 -> 80
    expect(phaserDamage({ ...base, distRaw: 12000 })).toBe(80);
  });

  it('heavier victim takes less (tonfact divisor)', () => {
    const light = phaserDamage({ ...base, distRaw: 0, victimMaxTons: 0 });
    const heavy = phaserDamage({ ...base, distRaw: 0, victimMaxTons: 15000 }); // tonfact=2
    expect(heavy).toBe(Math.floor(light / 2));
  });

  it('focus widens the cone but REDUCES damage (fd² term)', () => {
    const sharp = phaserDamage({ ...base, distRaw: 0, focus: 0 });
    const wide = phaserDamage({ ...base, distRaw: 0, focus: 5 });
    expect(wide).toBeLessThan(sharp);
  });

  it('victim at warp takes half (firep /2 branch)', () => {
    const ground = phaserDamage({ ...base, distRaw: 0, victimAtWarp: false });
    const warp = phaserDamage({ ...base, distRaw: 0, victimAtWarp: true });
    expect(warp).toBe(Math.floor(ground / 2));
  });

  it('sysop phaser (type 20) is fixed at 101', () => {
    expect(phaserDamage({ ...base, phasrtype: 20, distRaw: 0 })).toBe(101);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/game/combat/phaser-damage.spec.ts`
Expected: FAIL — old `phaserDamage` has a different signature/return.

- [ ] **Step 3: Implement**

Replace `phaserDamage` in `combat-math.ts` (lines 81-83). Add `PDAMMAX, PFIRDST, TONFACT` to the import line at the top of the file:

```ts
/**
 * Normal-phaser damage: ports `pdamage` (GEFUNCS.C:2060) plus the `firep`
 * outer scaling (GECMDS.C:956-973).
 *
 *   disfact = 20000 + phasrtype*4000
 *   dd      = max(0, 1 - distRaw/disfact)
 *   fd      = 1 - focus/11
 *   dp      = dd^PFIRDST * fd² * (phasr/100)
 *   dam     = PDAMMAX * dp
 *   factor  = dam * (1+phasrtype)/2.5 / (1 + victimMaxTons/TONFACT)
 *   if victimAtWarp: factor /= 2
 *   if phasrtype == 20 (sysop): return 101
 *
 * @see GEFUNCS.C:2060 pdamage  @see GECMDS.C:956-973 firep
 */
export function phaserDamage(args: {
  phasrtype: number;
  phasr: number;
  distRaw: number;
  focus: number;
  victimMaxTons: number;
  victimAtWarp: boolean;
}): number {
  const { phasrtype, phasr, distRaw, focus, victimMaxTons, victimAtWarp } = args;
  if (phasrtype === 20) return 101; // sysop phaser
  const disfact = 20000 + phasrtype * 4000;
  const dd = Math.max(0, 1 - distRaw / disfact);
  const fd = 1 - focus / 11;
  const dp = Math.pow(dd, PFIRDST) * (fd * fd) * (phasr / 100);
  const dam = PDAMMAX * dp;
  const tonfact = 1 + victimMaxTons / TONFACT;
  let factor = (dam * ((1 + phasrtype) / 2.5)) / tonfact;
  if (victimAtWarp) factor /= 2;
  return Math.floor(factor);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/game/combat/phaser-damage.spec.ts`
Expected: PASS. (`combat-math.spec.ts` may reference the old `phaserDamage` shape — update those cases to the new arg object.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/game/combat/combat-math.ts backend/test/game/combat/phaser-damage.spec.ts backend/test/game/combat/combat-math.spec.ts
git commit -m "fix(combat): port C pdamage distance falloff + firep scaling (Plan 1 T4, C-002)"
```

---

### Task 5: Phaser handler — restore `pha <degree> <focus>` semantics + wire damage + gates (C-006, C-007)

**Files:**
- Modify: `backend/src/game/commands/handlers/phaser.handler.ts`
- Modify: `backend/src/game/commands/messages.ts` (`PHA_FMT`, add `PHA_CLOAK`, `WPN_ZAP`)
- Test: `backend/test/game/commands/handlers/phaser.handler.spec.ts` (existing — add cases; if absent, create)

**Interfaces:**
- Consumes: `phaserDamage` (Task 4), `lineOfFire` (Task 3), `isInNeutralZone` (Task 2), constants `SE100DAM, PHATOWRP, PMINFIRE, FIRETICKS, WARP_THRESHOLD`.
- Command: `pha <degree>` (focus defaults to 1) OR `pha <degree> <focus 0-5>`. `degree` ∈ −180..180 (relative). Always full discharge (`phasr` → 0).

- [ ] **Step 1: Write the failing tests**

Add to `phaser.handler.spec.ts` (use the suite's existing ship/service test harness; shape shown for the new behaviors):

```ts
describe('pha command semantics (Plan 1 T5)', () => {
  it('accepts `pha <degree>` with focus defaulting to 1', () => {
    // firer phasrtype>=1, phasr>=PMINFIRE, not cloaked, not in neutral zone, not at warp.
    const res = handler.command.handler(firer, ['0'], ctx);
    expect(res.lines.some((l) => /no targets|hit/i.test(l.text))).toBe(true);
  });

  it('rejects degree outside −180..180', () => {
    const res = handler.command.handler(firer, ['200', '0'], ctx);
    expect(res.lines[0].text).toMatch(/-180|180/);
  });

  it('rejects focus outside 0..5', () => {
    const res = handler.command.handler(firer, ['0', '6'], ctx);
    expect(res.lines[0].text).toMatch(/0.*5|5/);
  });

  it('refuses to fire while cloaked', () => {
    cloaked.cloak = 10;
    const res = handler.command.handler(cloaked, ['0', '0'], ctx);
    expect(res.lines[0].text).toMatch(/cloak/i);
  });

  it('firing inside the neutral zone self-zaps and deals no outgoing damage', () => {
    const firerInNZ = makeShip({ xcoord: 0, ycoord: 0, phasr: 100, phasrtype: 1 });
    const victim = spawnVictimNear(firerInNZ);
    handler.command.handler(firerInNZ, ['0', '0'], ctx);
    expect(getShip(firerInNZ).damage).toBeGreaterThanOrEqual(101);
    expect(getShip(victim).damage).toBe(0);
  });

  it('fully discharges phasr to 0 after firing', () => {
    handler.command.handler(firer, ['0', '0'], ctx);
    expect(getShip(firer).phasr).toBe(0);
  });

  it('cannot damage a victim at warp when phasrtype < PHATOWRP is impossible at default 0 — but DOES halve damage', () => {
    // With PHATOWRP=0 any phaser hits warp victims; damage is halved (covered in T4).
    const warpVictim = spawnVictimNear(firer, { speed: 2000 });
    const res = handler.command.handler(firer, ['<bearing-to-victim>', '0'], ctx);
    expect(res.lines.some((l) => /hit/i.test(l.text))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/game/commands/handlers/phaser.handler.spec.ts -t "Plan 1 T5"`
Expected: FAIL — current handler validates degree 0-359, focus 1-100, has no cloak/neutral gates, and never fully discharges via this path.

- [ ] **Step 3: Implement the handler changes**

In `messages.ts`:
- Change `PHA_FMT` (line 487) to: `'Format: pha <degree -180..180> [focus 0-5]'`
- Add new IDs in the enum and string table:
  ```ts
  PHA_CLOAK = 'PHA_CLOAK',
  WPN_ZAP = 'WPN_ZAP',
  ```
  ```ts
  [MessageId.PHA_CLOAK]: 'Cannot fire while cloaked.',
  [MessageId.WPN_ZAP]: 'You fired inside the neutral zone! Your own weapons backfire!',
  ```

In `phaser.handler.ts`:
- Set `minArgs: 1` (degree required; focus optional) and `argMissingMessage: formatMessage(MessageId.PHA_FMT)`.
- Replace the parse/validate block (lines 95-130) with relative-degree + optional-focus parsing:

```ts
// Parse: pha <degree> [focus]
const degreeArg = (args[0] ?? '').trim();
if (!/^-?\d+$/.test(degreeArg)) {
  return { lines: [{ text: formatMessage(MessageId.PHA_FMT), category: 'system' }] };
}
const degree = parseInt(degreeArg, 10);
if (degree < -180 || degree > 180) {
  return { lines: [{ text: formatMessage(MessageId.NUMOOR, -180, 180), category: 'system' }] };
}
let focus = 1; // `pha <degree>` ⇒ focus defaults to 1 (GECMDS.C:874)
if (args[1] !== undefined) {
  const focusArg = args[1].trim();
  if (!/^\d+$/.test(focusArg)) {
    return { lines: [{ text: formatMessage(MessageId.PHA_FMT), category: 'system' }] };
  }
  focus = parseInt(focusArg, 10);
  if (focus < 0 || focus > 5) {
    return { lines: [{ text: formatMessage(MessageId.NUMOOR, 0, 5), category: 'system' }] };
  }
}
```

- Add cloak gate right after the `phasrtype`/charge checks (mirroring `firep` line 923):

```ts
if (ship.cloak > 0) {
  return { lines: [{ text: formatMessage(MessageId.PHA_CLOAK), category: 'system' }] };
}
```

- Replace the hyper/beamWidth block (lines 126-131) — Plan 1 keeps the normal-phaser path only; hyperphaser is Plan 3. Compute `phasrtype`/`phasr`/`maxTons` inputs and the at-warp self check:

```ts
// NOTE: hyperphaser (firer at warp) is handled in Plan 3. For Plan 1, if the
// firer is at warp we still fire the normal beam (faithful enough until C-009 lands).
const phasrCharge = ship.phasr; // current charge — used by the damage formula
```

- Add the neutral-zone self-zap immediately before the victim loop (mirroring `firep` 937-941):

```ts
if (isInNeutralZone(ship)) {
  this.shipState.mutate(ship.userid, ship.shipno, (s) => {
    s.damage = s.damage + SE100DAM;
    s.phasr = 0;
    s.cantexit = FIRETICKS;
  });
  return { lines: [{ text: formatMessage(MessageId.WPN_ZAP), category: 'combat' }] };
}
```

- In the victim loop, add the victim-at-warp + victim-neutral gates and switch to the new damage call:

```ts
const victimAtWarp = candidate.speed >= WARP_THRESHOLD;
// Victim-at-warp gate: can only hit a warping victim if phasrtype >= PHATOWRP (GECMDS.C:949).
if (victimAtWarp && ship.phasrtype < PHATOWRP) continue;
// Victims inside the neutral zone are immune (GECMDS.C:951).
if (isInNeutralZone(candidate)) continue;
if (!inScanRange(ship, candidate, scanRange)) continue;
if (!lineOfFire(ship, candidate, degree, focus)) continue;

const distRaw = cdistance(ship, candidate) * 10000;
const damage = phaserDamage({
  phasrtype: ship.phasrtype,
  phasr: phasrCharge,
  distRaw,
  focus,
  victimMaxTons: this.shipClassCache.getMaxTons(candidate.shpclass),
  victimAtWarp,
});
if (damage < 1) continue; // C: `if (damage >= 1)` gates the hit
```

  Use `damage` (already an integer) in place of the old `Math.floor(damage)`/`phaserDamage(...)` calls in the shield/hull branches.

- Replace the firer debit block (lines 222-227) with full discharge:

```ts
this.shipState.mutate(ship.userid, ship.shipno, (s) => {
  s.phasr = 0; // full discharge (GECMDS.C:1006)
  s.cantexit = FIRETICKS;
});
```

- Update imports: add `isInNeutralZone` from `../../combat/neutral-zone`; add `SE100DAM, PHATOWRP` from `../../constants`; drop `HPBEAMW` if now unused; ensure `getMaxTons` exists on `ShipClassCacheService` (it is used elsewhere — confirm; if absent, add a thin getter mirroring `getMaxPhaser`).
- Update the JSDoc validation list at the top of the class to the new semantics.
- Update `recordCombatEvent`'s `maxRange` to remain `scanRange / 10_000` (unchanged).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/game/commands/handlers/phaser.handler.spec.ts`
Expected: PASS. Also run the phaser range suite: `npx jest test/game/commands/handlers/phaser.range.spec.ts` and update any assertions that assumed the old percent/beamWidth semantics.

- [ ] **Step 5: Commit**

```bash
git add backend/src/game/commands/handlers/phaser.handler.ts backend/src/game/commands/messages.ts backend/test/game/commands/handlers/phaser.handler.spec.ts backend/test/game/commands/handlers/phaser.range.spec.ts
git commit -m "fix(combat): faithful pha <degree> <focus> semantics + cloak/neutral gates (Plan 1 T5, C-006/C-007)"
```

---

### Task 6: Torpedo lock-quality gate (C-003)

**Files:**
- Modify: `backend/src/game/combat/combat-math.ts` (add `lockFact`)
- Modify: `backend/src/game/commands/handlers/torpedo.handler.ts`
- Modify: `backend/src/game/commands/messages.ts` (add `LOCK_FAIL`, `LOCK_NEUTRAL`)
- Test: `backend/test/game/combat/lock-fact.spec.ts` (new) + add cases to `torpedo.handler.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  lockFact(kind: 'torpedo' | 'missile', firerSpeed: number, targetSpeed: number, distSectors: number, factor: number): number
  ```
  - torpedo: `targetSpeed > 999` ⇒ `0`; else `(1.2 - (firerSpeed+targetSpeed)/5000) * ((5 - distSectors)/factor)`
  - missile: `(5 - distSectors)/factor`
  Lock succeeds iff returned `fact > 0.7`.

- [ ] **Step 1: Write the failing tests**

`backend/test/game/combat/lock-fact.spec.ts`:

```ts
import { lockFact } from '../../../src/game/combat/combat-math';
import { TORFACT, MISFACT } from '../../../src/game/constants';

describe('lockFact (GECMDS.C:1378-1392)', () => {
  it('torpedo: close, both stationary ⇒ strong lock (>0.7)', () => {
    expect(lockFact('torpedo', 0, 0, 1, TORFACT)).toBeGreaterThan(0.7);
  });
  it('torpedo: target at warp (speed>999) ⇒ no lock (0)', () => {
    expect(lockFact('torpedo', 0, 2000, 1, TORFACT)).toBe(0);
  });
  it('torpedo: far target ⇒ weak lock (<=0.7)', () => {
    // dist 5 ⇒ (5-5)=0 ⇒ fact 0
    expect(lockFact('torpedo', 0, 0, 5, TORFACT)).toBeLessThanOrEqual(0.7);
  });
  it('missile: close ⇒ strong, far ⇒ weak', () => {
    expect(lockFact('missile', 0, 0, 1, MISFACT)).toBeGreaterThan(0.7);
    expect(lockFact('missile', 0, 0, 5, MISFACT)).toBeLessThanOrEqual(0.7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/game/combat/lock-fact.spec.ts`
Expected: FAIL — `lockFact` not defined.

- [ ] **Step 3: Implement `lockFact` + torpedo gate**

Add to `combat-math.ts`:

```ts
/**
 * Lock-quality factor for a torpedo/missile (GECMDS.C:1378-1392). Caller fires
 * only when the result is > 0.7.
 *
 * @param distSectors cdistance(firer, target) in sector units
 * @param factor      TORFACT (torpedo) or MISFACT (missile)
 */
export function lockFact(
  kind: 'torpedo' | 'missile',
  firerSpeed: number,
  targetSpeed: number,
  distSectors: number,
  factor: number,
): number {
  if (kind === 'torpedo') {
    if (targetSpeed > 999) return 0; // target at warp — torpedoes cannot lock
    const speed = firerSpeed + targetSpeed;
    return (1.2 - speed / 5000) * ((5.0 - distSectors) / factor);
  }
  return (5.0 - distSectors) / factor;
}
```

In `messages.ts` add:
```ts
LOCK_FAIL = 'LOCK_FAIL',
LOCK_NEUTRAL = 'LOCK_NEUTRAL',
```
```ts
[MessageId.LOCK_FAIL]: 'Cannot get a firing lock — target too distant or evading.',
[MessageId.LOCK_NEUTRAL]: 'Fire control refuses: target is in the neutral zone.',
```

In `torpedo.handler.ts`, after the target is found (`const target = found.ship;`, line 104) and before slot allocation, add the lock gates (mirroring `lockon` 1363-1422):

```ts
// Target in neutral zone ⇒ fire control refuses (GECMDS.C:1363).
if (isInNeutralZone(target)) {
  return { lines: [{ text: formatMessage(MessageId.LOCK_NEUTRAL), category: 'system' }] };
}
// Fully-cloaked target is unlockable (GECMDS.C:1371 cloak<10).
if (target.cloak >= 10) {
  return { lines: [{ text: formatMessage(MessageId.LOCK_FAIL), category: 'system' }] };
}
// Lock-quality gate (GECMDS.C:1378-1395).
const distSectors = cdistance(ship, target);
const fact = lockFact('torpedo', ship.speed, target.speed, distSectors, TORFACT);
if (fact <= 0.7) {
  return { lines: [{ text: formatMessage(MessageId.LOCK_FAIL), category: 'system' }] };
}
```

Add imports: `lockFact` from `../../combat/combat-math`, `isInNeutralZone` from `../../combat/neutral-zone`, `TORFACT` from `../../constants`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/game/combat/lock-fact.spec.ts test/game/commands/handlers/torpedo.handler.spec.ts`
Expected: PASS. Update any existing torpedo handler test whose targets were placed >~4.9 sectors away (those now correctly fail to lock).

- [ ] **Step 5: Commit**

```bash
git add backend/src/game/combat/combat-math.ts backend/src/game/commands/handlers/torpedo.handler.ts backend/src/game/commands/messages.ts backend/test/game/combat/lock-fact.spec.ts backend/test/game/commands/handlers/torpedo.handler.spec.ts
git commit -m "fix(combat): torpedo lock-quality + neutral/cloak gates (Plan 1 T6, C-003)"
```

---

### Task 7: Missile lock-quality + firer-cloak gate (C-003, C-007)

**Files:**
- Modify: `backend/src/game/commands/handlers/missile.handler.ts`
- Test: add cases to `backend/test/game/commands/handlers/missile.handler.spec.ts`

**Interfaces:**
- Consumes: `lockFact` (Task 6), `isInNeutralZone` (Task 2), `MISFACT` (Task 1), messages `LOCK_FAIL`, `LOCK_NEUTRAL`, `TOR_CLOAK` (reused for the cloak message; or add `MIS_CLOAK`).

- [ ] **Step 1: Write the failing tests**

Add to `missile.handler.spec.ts`:

```ts
describe('missile lock + cloak gates (Plan 1 T7)', () => {
  it('refuses to fire while cloaked', () => {
    cloaked.cloak = 10;
    const res = handler.command.handler(cloaked, ['enemy', '5000'], ctx);
    expect(res.lines[0].text).toMatch(/cloak/i);
  });
  it('fails to lock a target beyond ~4.9 sectors', () => {
    const farTarget = spawnTarget({ sectorsAway: 6 });
    const res = handler.command.handler(firer, [farTarget.shipname, '5000'], ctx);
    expect(res.lines[0].text).toMatch(/lock/i);
  });
  it('locks a near target', () => {
    const nearTarget = spawnTarget({ sectorsAway: 1 });
    const res = handler.command.handler(firer, [nearTarget.shipname, '5000'], ctx);
    expect(res.lines[0].text).toMatch(/away/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/game/commands/handlers/missile.handler.spec.ts -t "Plan 1 T7"`
Expected: FAIL — no cloak gate, no lock gate.

- [ ] **Step 3: Implement**

In `messages.ts` add `MIS_CLOAK = 'MIS_CLOAK'` and `[MessageId.MIS_CLOAK]: 'Cannot fire while cloaked.'`.

In `missile.handler.ts`:
- Add a firer-cloak gate after the launcher-mounted check (validation 1), mirroring torpedo's:
```ts
if (ship.cloak > 0) {
  return { lines: [{ text: formatMessage(MessageId.MIS_CLOAK), category: 'system' }] };
}
```
- After `const target = found.ship;` (line 110), add the same neutral/cloak/lock gates as torpedo but with `kind: 'missile'` and `MISFACT`:
```ts
if (isInNeutralZone(target)) {
  return { lines: [{ text: formatMessage(MessageId.LOCK_NEUTRAL), category: 'system' }] };
}
if (target.cloak >= 10) {
  return { lines: [{ text: formatMessage(MessageId.LOCK_FAIL), category: 'system' }] };
}
const distSectors = cdistance(ship, target);
const fact = lockFact('missile', ship.speed, target.speed, distSectors, MISFACT);
if (fact <= 0.7) {
  return { lines: [{ text: formatMessage(MessageId.LOCK_FAIL), category: 'system' }] };
}
```
- Add imports: `lockFact`, `isInNeutralZone`, `MISFACT`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/game/commands/handlers/missile.handler.spec.ts`
Expected: PASS. Update any existing far-target missile test as in Task 6.

- [ ] **Step 5: Commit**

```bash
git add backend/src/game/commands/handlers/missile.handler.ts backend/src/game/commands/messages.ts backend/test/game/commands/handlers/missile.handler.spec.ts
git commit -m "fix(combat): missile lock-quality + cloak gate (Plan 1 T7, C-003/C-007)"
```

---

### Task 8: Neutral-zone self-zap for torpedo & missile (C-006)

**Files:**
- Modify: `backend/src/game/commands/handlers/torpedo.handler.ts`, `missile.handler.ts`
- Test: add a case to each handler spec.

**Interfaces:** Consumes `isInNeutralZone` (Task 2), `SE100DAM` (Task 1), `MessageId.WPN_ZAP` (Task 5).

- [ ] **Step 1: Write the failing tests**

Add to each handler spec:

```ts
it('firing from inside the neutral zone self-zaps and does not lock (Plan 1 T8)', () => {
  const firerNZ = makeShip({ xcoord: 0, ycoord: 0 /* + valid ammo/launcher */ });
  const res = handler.command.handler(firerNZ, [/* args */], ctx);
  expect(res.lines[0].text).toMatch(/neutral zone/i);
  expect(getShip(firerNZ).damage).toBeGreaterThanOrEqual(101);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/game/commands/handlers/torpedo.handler.spec.ts test/game/commands/handlers/missile.handler.spec.ts -t "T8"`
Expected: FAIL — no neutral-zone self-zap on these handlers.

- [ ] **Step 3: Implement**

In each handler, immediately after all the firer-side validations pass and BEFORE the target lookup, add:

```ts
if (isInNeutralZone(ship)) {
  this.shipState.mutate(ship.userid, ship.shipno, (s) => {
    s.damage = s.damage + SE100DAM;
    s.cantexit = FIRETICKS;
  });
  return { lines: [{ text: formatMessage(MessageId.WPN_ZAP), category: 'combat' }] };
}
```

Add `SE100DAM` to each handler's constants import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/game/commands/handlers/torpedo.handler.spec.ts test/game/commands/handlers/missile.handler.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/game/commands/handlers/torpedo.handler.ts backend/src/game/commands/handlers/missile.handler.ts backend/test/game/commands/handlers/torpedo.handler.spec.ts backend/test/game/commands/handlers/missile.handler.spec.ts
git commit -m "fix(combat): neutral-zone self-zap for torpedo + missile (Plan 1 T8, C-006)"
```

---

### Task 9: Full combat-suite regression + live smoke test

**Files:**
- Create: `docker-compose.yml` at repo root (Postgres + backend + frontend) — none exists today; CLAUDE.md mandates one. (If the team prefers, document direct `nest start`/`vite` instead, but a compose file is the stated requirement.)
- Create: `docs/superpowers/plans/2026-06-25-combat-feel-smoketest.md` — the manual live-combat checklist.

- [ ] **Step 1: Run the full combat + handler test subset green**

Run:
```bash
npx jest test/game/combat test/game/commands/handlers/phaser.handler.spec.ts \
  test/game/commands/handlers/torpedo.handler.spec.ts \
  test/game/commands/handlers/missile.handler.spec.ts \
  test/game/commands/handlers/phaser.range.spec.ts test/unit/gemain-pins.spec.ts
```
Expected: ALL PASS. Fix any stragglers before proceeding.

- [ ] **Step 2: Verify no regression in the broader suite vs. baseline**

Run `npx jest --silent --json --outputFile=/tmp/jest-after.json` and confirm the failing-test count is **≤ 66** (the pre-existing baseline of stale tests documented in this session) AND that none of the newly-failing suites are combat/weapon suites. The 66 pre-existing reds are stale tests addressed in a separate cleanup track — do not let this plan add to them.

- [ ] **Step 3: Author a live smoke-test checklist**

Write `docs/superpowers/plans/2026-06-25-combat-feel-smoketest.md` covering, against a running stack:
1. `pha 0` with two ships in front at 1 sector and one off-axis at 20° — only the on-axis ship is hit.
2. `pha 0 5` (wide focus) — slightly wider cone, lower per-hit damage.
3. Fire at a ship 5+ sectors away — phaser does **no** damage (falloff to 0).
4. `tor <name>` / `mis <name> <charge>` at a target 6 sectors away — "cannot get a lock"; at 1 sector — locks.
5. Cloak, then `pha`/`tor`/`mis` — refused.
6. Move into sector (0,0) and fire — self-zap (ship takes ≥101 damage), no outgoing hit.

- [ ] **Step 4: Run the live smoke test**

Bring up the stack (`docker compose up` once Task 9 Step 1's compose file exists, or run Postgres + `npm run start:dev` in `backend/` + `npm run dev` in `frontend/`). Create two test players (or one player + a seeded Cybertron), and walk the checklist. Record pass/fail per item in the smoke-test doc.

- [ ] **Step 5: Update living docs + commit**

Update `docs/PROGRESS.md` (new dated entry: what landed, tests, decisions, next = Plan 2 AI presence) and `docs/GAME_MECHANICS.md` (phaser cone/falloff, lock-quality, neutral self-zap with C refs). Append a row per fixed finding (C-002/C-003/C-006/C-007) to `specs/022-fidelity-audit-v2/findings.md` flipping disposition to `fixed` with the new testRefs.

```bash
git add docker-compose.yml docs/PROGRESS.md docs/GAME_MECHANICS.md specs/022-fidelity-audit-v2/findings.md docs/superpowers/plans/2026-06-25-combat-feel-smoketest.md
git commit -m "docs(combat): Plan 1 complete — combat-feel fixes, smoke test, findings updated"
```

---

## Self-Review

**Spec coverage** (against the audit findings this plan targets):
- C-002 phaser damage falloff → Task 4 ✓
- C-003 torpedo/missile lock-quality → Tasks 6, 7 ✓
- C-006 neutral-zone self-zap (phaser/torp/missile) → Tasks 5, 8 ✓
- C-007 cloak-fire gate (phaser, missile; torpedo already had it) → Tasks 5, 7 ✓
- "Hits everything except target" (beam width + relative-degree semantics) → Tasks 3, 5 ✓
- Out of scope, correctly deferred to later plans: C-009 hyperphaser (Plan 3), C-005 damfact/ton_fact (Plan 2), C-004 mines (Plan 3), C-010 subsystem damage (Plan 2), A-003 gebemean & AI population (Plan 2).

**Type consistency:** `phaserDamage` is an arg-object (Task 4) consumed only by Task 5. `lineOfFire(firer, victim, degree, focus)` (Task 3) — Task 5 calls it with `(ship, candidate, degree, focus)` ✓. `lockFact(kind, firerSpeed, targetSpeed, distSectors, factor)` (Task 6) consumed identically by Tasks 6 & 7 ✓. `isInNeutralZone` (Task 2) consumed by Tasks 5, 6, 7, 8 ✓.

**Known assumptions to verify during execution (not placeholders — flagged checks):**
- `ShipClassCacheService.getMaxTons` exists (used in Task 5). If not, add a getter mirroring `getMaxPhaser` — folded into Task 5 Step 3.
- The handler spec harnesses (`phaser/torpedo/missile.handler.spec.ts`) provide ship factories; Tasks 5-8 reuse their existing setup helpers (`makeShip`/`spawnVictimNear` names are illustrative — match whatever the suite already defines).
- `PDAMMAX=200` is a balance guess; Task 9's live smoke test is where it gets tuned. If phasers feel too strong/weak, adjust `PDAMMAX` (and re-pin Task 1's test) — no formula change needed.
