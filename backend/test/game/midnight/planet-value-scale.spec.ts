/**
 * PLTVCASH and PLTVDIV were pinned to 201,228,378 — which is not a value at
 * all. It is the `lngopt` MAX BOUND, the third argument, and the same number
 * appears as the ceiling for maxpl, weight, value, manhours, phaserprice and
 * shieldprice (GEMAIN.C:557-596). C's own expression proves it: with
 * pltvcash = 201228378, `(cash+tax)/(1000000L/pltvcash)` divides by zero.
 *
 *   v = (cash + tax) / (1000000L / pltvcash)
 *   for each item: v += value[i] * (qty[i] / pltvdiv)
 *
 * Consequences of the ceiling-as-value mistake:
 *   - PLTVCASH turned the divisor into a ~201x MULTIPLIER, so banked planet
 *     cash dominated the leaderboard and combat contributed nothing measurable
 *     to `score = plscore + klscore`.
 *   - PLTVDIV truncated every stockpile to 0 (MAXPL tops out at 1e9, well
 *     under the divisor), so inventory was invisible to score and the only
 *     rational play was converting everything to cash.
 *
 * @see GEMAIN.C:593, 596 (the lngopt calls) and GEMAIN.C:1348-1359 (value_pl)
 */

import { valuePlanet } from '../../../src/game/midnight/value-pl';
import { PLTVCASH, PLTVDIV } from '../../../src/game/midnight/midnight.constants';
import { BASEPRICE, NUMITEMS, I_MEN } from '../../../src/game/constants/items';

const noItems = Array.from({ length: NUMITEMS }, () => 0n);

describe('PLTVCASH and PLTVDIV are usable sysop values', () => {
  it('PLTVCASH is a real divisor — C needs `1000000 / pltvcash` to be non-zero', () => {
    expect(PLTVCASH).toBeGreaterThan(0);
    expect(PLTVCASH).toBeLessThanOrEqual(1_000_000);
    expect(Math.floor(1_000_000 / PLTVCASH)).toBeGreaterThan(0);
  });

  it('PLTVDIV is small enough for a real stockpile to survive it', () => {
    expect(PLTVDIV).toBeGreaterThan(0);
    expect(PLTVDIV).toBeLessThanOrEqual(1_000_000);
  });
});

describe('valuePlanet — GEMAIN.C:1348-1359', () => {
  it('divides banked cash rather than multiplying it', () => {
    const v = valuePlanet(1_000_000n, 0n, noItems, BASEPRICE, PLTVCASH, PLTVDIV);
    expect(v).toBeLessThan(1_000_000n);
    expect(v).toBeGreaterThan(0n);
  });

  it('counts tax alongside cash', () => {
    const a = valuePlanet(1_000_000n, 0n, noItems, BASEPRICE, PLTVCASH, PLTVDIV);
    const b = valuePlanet(500_000n, 500_000n, noItems, BASEPRICE, PLTVCASH, PLTVDIV);
    expect(a).toBe(b);
  });

  it('makes a real stockpile visible to the score', () => {
    const items = Array.from({ length: NUMITEMS }, () => 0n);
    items[I_MEN] = 1_000_000n;
    const v = valuePlanet(0n, 0n, items, BASEPRICE, PLTVCASH, PLTVDIV);
    expect(v).toBeGreaterThan(0n);
  });

  it('keeps a developed planet in the same order of magnitude as a few kills', () => {
    // An Interceptor kill is worth 750 points, a Dreadnought 10000. A planet
    // holding a million credits and a million colonists should be worth a
    // comparable amount, not 200x or 0.
    const items = Array.from({ length: NUMITEMS }, () => 0n);
    items[I_MEN] = 1_000_000n;
    const v = Number(valuePlanet(1_000_000n, 0n, items, BASEPRICE, PLTVCASH, PLTVDIV));
    expect(v).toBeGreaterThan(100);
    expect(v).toBeLessThan(100_000);
  });
});
