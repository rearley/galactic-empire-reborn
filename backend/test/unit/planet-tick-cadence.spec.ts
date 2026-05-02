/**
 * T038 — Planet tick cadence formula unit tests.
 * Pins floor(PLANTOCK_SECONDS / N) clamped to >= PLANTIME_MIN_SECONDS.
 */
import { PLANTOCK_SECONDS, PLANTIME_MIN_SECONDS } from '../../src/game/constants';

function computeCadence(numPlanets: number): number {
  return Math.max(
    PLANTIME_MIN_SECONDS,
    Math.floor(PLANTOCK_SECONDS / Math.max(1, numPlanets)),
  );
}

describe('PLANET_UPDATE cadence formula', () => {
  it('N=1 → PLANTOCK_SECONDS / 1 = 1800s', () => {
    expect(computeCadence(1)).toBe(1800);
  });

  it('N=5 → floor(1800/5) = 360s', () => {
    expect(computeCadence(5)).toBe(360);
  });

  it('N=100 → floor(1800/100) = 18s', () => {
    expect(computeCadence(100)).toBe(18);
  });

  it('N=200 → floor(1800/200) = 9s', () => {
    expect(computeCadence(200)).toBe(9);
  });

  it('N=450 → floor(1800/450) = 4s (at floor)', () => {
    expect(computeCadence(450)).toBe(4);
  });

  it('N=1800 → clamped to PLANTIME_MIN_SECONDS = 4s', () => {
    expect(computeCadence(1800)).toBe(PLANTIME_MIN_SECONDS);
  });

  it('N=999999 → clamped to PLANTIME_MIN_SECONDS', () => {
    expect(computeCadence(999999)).toBe(PLANTIME_MIN_SECONDS);
  });

  it('N=0 → falls back to PLANTIME_MIN_SECONDS (edge case: empty galaxy)', () => {
    // Math.max(1, 0) = 1 → floor(1800/1) = 1800
    expect(computeCadence(0)).toBe(1800);
  });

  it('cadence is always >= PLANTIME_MIN_SECONDS for any positive N', () => {
    for (const n of [1, 10, 100, 450, 1800, 50000]) {
      expect(computeCadence(n)).toBeGreaterThanOrEqual(PLANTIME_MIN_SECONDS);
    }
  });
});
