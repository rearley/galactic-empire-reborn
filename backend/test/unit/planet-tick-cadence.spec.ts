/**
 * T038 — Planet tick cadence formula unit tests.
 * Pins floor(PLANTOCK_SECONDS / N) clamped to >= PLANTIME_MIN_SECONDS.
 *
 * Expressed against PLANTOCK_SECONDS rather than a literal. These hard-coded
 * 1800, which made them a second, silent declaration of the sweep length: when
 * PLANTOCK became the sysop option it is in the original (GEMAIN.C:469, in
 * MINUTES, canon 360) they failed on arithmetic that was never the subject of
 * the test. The FORMULA is what is being pinned here; the value belongs to
 * test/balance/sysop-options-canon.balance.spec.ts.
 */
import { PLANTOCK_SECONDS, PLANTIME_MIN_SECONDS } from '../../src/game/constants';

function computeCadence(numPlanets: number): number {
  return Math.max(
    PLANTIME_MIN_SECONDS,
    Math.floor(PLANTOCK_SECONDS / Math.max(1, numPlanets)),
  );
}

describe('PLANET_UPDATE cadence formula', () => {
  it.each([1, 5, 100, 200, 450])('N=%s → floor(PLANTOCK_SECONDS / N)', (n) => {
    expect(computeCadence(n)).toBe(
      Math.max(PLANTIME_MIN_SECONDS, Math.floor(PLANTOCK_SECONDS / n)),
    );
  });

  it('divides the whole sweep across the planets', () => {
    // The property the formula exists for: N planets each updated once per
    // PLANTOCK_SECONDS, so the cadence times the count is the sweep length.
    const n = 100;
    expect(computeCadence(n) * n).toBeCloseTo(PLANTOCK_SECONDS, -1);
  });

  it('N=1800 → clamped to PLANTIME_MIN_SECONDS = 4s', () => {
    expect(computeCadence(1800)).toBe(PLANTIME_MIN_SECONDS);
  });

  it('N=999999 → clamped to PLANTIME_MIN_SECONDS', () => {
    expect(computeCadence(999999)).toBe(PLANTIME_MIN_SECONDS);
  });

  it('N=0 → falls back to PLANTIME_MIN_SECONDS (edge case: empty galaxy)', () => {
    // Math.max(1, 0) = 1 → the whole sweep in one tick
    expect(computeCadence(0)).toBe(PLANTOCK_SECONDS);
  });

  it('cadence is always >= PLANTIME_MIN_SECONDS for any positive N', () => {
    for (const n of [1, 10, 100, 450, 1800, 50000]) {
      expect(computeCadence(n)).toBeGreaterThanOrEqual(PLANTIME_MIN_SECONDS);
    }
  });
});
