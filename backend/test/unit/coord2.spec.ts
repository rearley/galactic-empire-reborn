import { coord1, coord2 } from '../../src/game/physics/coord';

/**
 * `rep nav` at y = -9.24 printed "sector (5, -10) intra (5, -24)": the sector
 * came from floor and the intra offset from `coord % 1`, which in JS keeps the
 * sign of the dividend. The two disagreed, and an intra offset can never be
 * negative — it is a position INSIDE the sector named on the same line.
 *
 * C computes it as `modf(1 + modf(dcoord, &d1), &d1) * SSMAX` (GECMDS.C:3088),
 * where the `1 +` exists for exactly this reason: it lifts a negative fraction
 * back into [0,1) so the result agrees with `coord1`'s floor.
 */
describe('coord1 / coord2 — sector and intra-sector position', () => {
  it('sector index is the floor, including below zero', () => {
    expect(coord1(9.24)).toBe(9);
    expect(coord1(-9.24)).toBe(-10);
    expect(coord1(0)).toBe(0);
    expect(coord1(-0.5)).toBe(-1);
  });

  it('intra offset is never negative', () => {
    expect(coord2(-9.24)).toBe(7599); // C truncates the same double: 0.7599999.. * 10000
    expect(coord2(-0.5)).toBe(5000);
    expect(coord2(-0.01)).toBe(9900);
  });

  it('intra offset matches C for positive coordinates', () => {
    expect(coord2(9.24)).toBe(2400);
    expect(coord2(0)).toBe(0);
    expect(coord2(4.5)).toBe(5000);
  });

  it('intra offset always lands inside the sector coord1 names', () => {
    for (const v of [-12.7, -1.001, -0.0001, 0, 0.0001, 3.33, 29.999]) {
      const c2 = coord2(v);
      expect(c2).toBeGreaterThanOrEqual(0);
      expect(c2).toBeLessThan(10000);
      // Reconstructing the coordinate from the two parts returns the original.
      expect(coord1(v) + c2 / 10000).toBeCloseTo(v, 3);
    }
  });
});
