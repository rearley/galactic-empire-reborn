/**
 * JAMTIME must stay inside the bound the original enforces.
 *
 *   GEMAIN.C:496  jamtime = numopt(JAMTIME,1,10);
 *
 * numopt CLAMPS, so 10 is the highest value the original game can run with. The
 * port used 20, meaning jammers persisted for twice the maximum duration the
 * original permits — the same class of defect as TDAMMAX/MDAMMAX, not a balance
 * preference.
 *
 * The semantics are identical on both sides, which is what makes the values
 * directly comparable: C sets `wptr->jammer = jamtime * ddist` where ddist is a
 * 0..1 range falloff (GECMDS.C:1644), and jammerCounter decays from JAMTIME at
 * distance 0 to 0 at scanrange.
 *
 * Contrast DECODDS, which is NOT comparable to its 1..20 bound: C uses a 1-in-N
 * roll (`gernd()%decodds==0`) while decoyIntercept uses a percentage
 * (`rand*100 < decodds`), so the numbers mean different things.
 */

import { JAMTIME } from '../../src/game/constants';
import { jammerCounter } from '../../src/game/combat/combat-math';

describe('JAMTIME balance', () => {
  it('is within the numopt bound of 1..10 (GEMAIN.C:496)', () => {
    expect(JAMTIME).toBeGreaterThanOrEqual(1);
    expect(JAMTIME).toBeLessThanOrEqual(10);
  });

  it('defaults to the legal ceiling of 10', () => {
    expect(JAMTIME).toBe(10);
  });

  it('a jammer at the carrier lasts JAMTIME ticks, and none beyond scan range', () => {
    const scanrange = 15_000;
    expect(jammerCounter(0, scanrange, JAMTIME)).toBe(JAMTIME);
    expect(jammerCounter(scanrange + 1, scanrange, JAMTIME)).toBe(0);
  });

  it('decays with distance rather than applying full strength everywhere', () => {
    const scanrange = 15_000;
    const near = jammerCounter(1_000, scanrange, JAMTIME);
    const far = jammerCounter(12_000, scanrange, JAMTIME);
    expect(far).toBeLessThan(near);
  });
});
