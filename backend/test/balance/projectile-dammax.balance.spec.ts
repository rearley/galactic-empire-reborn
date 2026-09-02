/**
 * TDAMMAX / MDAMMAX must stay inside the bounds the original enforces.
 *
 * These are sysop options read through numopt, which CLAMPS them:
 *
 *   GEMAIN.C:508  tdammax = (double)numopt(TDAMMAX,1,100);
 *   GEMAIN.C:511  mdammax = (double)numopt(MDAMMAX,1,100);
 *   GEMAIN.C:513  minedammax = (double)numopt(MNDAMMAX,1,200);
 *
 * The port used TDAMMAX=200 and MDAMMAX=300 — values the original game cannot
 * produce at all, since numopt would clamp them to 100. This is a fidelity
 * defect rather than a balance preference: torpedoes were doing up to 2x, and
 * missiles up to 3x, the maximum damage the original permits.
 *
 * It showed up in playtesting as a single torpedo destroying a Murdonian
 * Transport outright. Torpedo damage rolls as `tdammax * rndm(.5)`
 * (GEFUNCS.C:1555), so at the legal ceiling of 100 a torpedo tops out near 50 —
 * half the 100-damage kill threshold — while at 200 it reached exactly lethal.
 *
 * MINEDAMMAX=150 was already inside its (wider) 1..200 bound and is unchanged.
 */

import { TDAMMAX, MDAMMAX, MINEDAMMAX } from '../../src/game/constants';

describe('projectile damage ceilings stay within the original numopt bounds', () => {
  it('TDAMMAX is within 1..100 (GEMAIN.C:508)', () => {
    expect(TDAMMAX).toBeGreaterThanOrEqual(1);
    expect(TDAMMAX).toBeLessThanOrEqual(100);
  });

  it('MDAMMAX is within 1..100 (GEMAIN.C:511)', () => {
    expect(MDAMMAX).toBeGreaterThanOrEqual(1);
    expect(MDAMMAX).toBeLessThanOrEqual(100);
  });

  it('MINEDAMMAX is within 1..200 (GEMAIN.C:513)', () => {
    expect(MINEDAMMAX).toBeGreaterThanOrEqual(1);
    expect(MINEDAMMAX).toBeLessThanOrEqual(200);
  });

  it('leaves a torpedo needing several hits to kill, per the shipped values', () => {
    // MBMGEMSG.MSG ships TDAMMAX 35 and MDAMMAX 25, not the 1..100 ceiling.
    // At 100 an unshielded torpedo dealt 50-100 against a 100-damage kill
    // threshold, i.e. a one-shot; at 35 it deals 17-35, so three or four hits.
    // Exact defaults are owned by sysop-options-canon.balance.spec.ts.
    expect(TDAMMAX).toBeLessThan(100);
    expect(MDAMMAX).toBeLessThan(100);
    expect(TDAMMAX).toBeGreaterThan(MDAMMAX);
  });

  it('a torpedo roll cannot reach the 100-damage kill threshold on its own', () => {
    // GEFUNCS.C:1555 — damfact = tdammax * rndm(.5), so the ceiling is tdammax/2.
    expect(TDAMMAX * 0.5).toBeLessThan(100);
  });
});
