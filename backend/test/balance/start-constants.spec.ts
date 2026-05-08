/**
 * Balance regression tests: starting ship state constants.
 * These tests MUST fail if any constant changes — they are the canary for fidelity drift.
 * @see GEMAIN.C:521 STRTCASH — starting credits
 * @see GEFUNCS.C:initshp — ship class 1 (Interceptor), 3 flux pods at items[I_FLUX=4]
 */
import { START_CASH, START_FLUX_PODS, START_CLASS } from '../../src/game/constants/onboarding';

describe('Starting ship state balance constants', () => {
  it('START_CASH is 5000n (canonical STRTCASH from GEMAIN.C:521)', () => {
    expect(START_CASH).toBe(5000n);
  });

  it('START_FLUX_PODS is 3 (canonical items[I_FLUX] from GEFUNCS.C:initshp)', () => {
    expect(START_FLUX_PODS).toBe(3);
  });

  it('START_CLASS is 1 (canonical Interceptor from GEFUNCS.C:initshp)', () => {
    expect(START_CLASS).toBe(1);
  });
});
