/**
 * Balance regression tests: starting ship state constants.
 * These tests MUST fail if any constant changes — they are the canary for fidelity drift.
 * @see GEMAIN.C:521 STRTCASH — starting credits
 * @see GEFUNCS.C:initshp — ship class 1 (Interceptor), 3 flux pods at items[I_FLUX=4]
 */
import { START_CASH, START_FLUX_PODS, START_CLASS } from '../../src/game/constants/onboarding';
import { SHIP_CLASSES } from '../../prisma/seed/ship-classes';

describe('Starting ship state balance constants', () => {
  it('START_CASH is canon: STRTCASH x 1000, i.e. 100_000 credits', () => {
    // Was pinned at 5000n and titled "canonical STRTCASH from GEMAIN.C:521".
    // GEMAIN.C:521-522 is `startcash = numopt(STRTCASH,1,32000); *= 1000L`,
    // and MBMGEMSG.MSG ships STRTCASH 100 -- so canon is 100 000. At 5 000
    // nothing was purchasable: the cheapest hull is 40 000 and the Interceptor
    // 65 000, so every opening decision a new player faces was closed off.
    expect(START_CASH).toBe(100_000n);
  });

  it('START_CASH buys at least the cheapest hull', () => {
    // The property that matters, expressed against the ship table rather than
    // a number, so a retune of either side has to stay coherent.
    const cheapestHull = SHIP_CLASSES
      .filter((c) => c.category === 'PLAYER' && c.classNumber < 21)
      .reduce((min, c) => (c.maxPrice < min ? c.maxPrice : min), 2_000_000_000n);
    expect(START_CASH).toBeGreaterThanOrEqual(cheapestHull);
  });

  it('START_FLUX_PODS is 3 (canonical items[I_FLUX] from GEFUNCS.C:initshp)', () => {
    expect(START_FLUX_PODS).toBe(3);
  });

  it('START_CLASS is 1 (canonical Interceptor from GEFUNCS.C:initshp)', () => {
    expect(START_CLASS).toBe(1);
  });
});
