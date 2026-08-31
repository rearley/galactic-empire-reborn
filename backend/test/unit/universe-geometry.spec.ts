import { wrapUniverse } from '../../src/game/physics/physics-math';
import { UNIVMAX } from '../../src/game/constants';

/**
 * C's universe is a square from −univmax to +univmax with the neutral zone at
 * its CENTRE: `NEUTRAL_X = NEUTRAL_Y = 0` (GEMAIN.H:70-71), coordinates seeded
 * as `rndm(univmax*2) - univmax` (GEMAIN.C:2204), and wrapped by subtracting or
 * adding `univmax*2` when a ship crosses an edge (GEFUNCS.C:653-700).
 *
 * The port generated sectors 0..29 x 0..14 and wrapped on those bounds, which
 * put the hub in a CORNER: half of all headings walked a new pilot straight off
 * an edge and round to the far side of the galaxy, and the hub's neighbourhood
 * was a quadrant instead of a disc — which is why the nearest inhabited planet
 * sat eight sectors away.
 */
describe('universe wrapping — GEFUNCS.C:653-700', () => {
  it('leaves a coordinate inside the universe alone', () => {
    expect(wrapUniverse(0, 10)).toBe(0);
    expect(wrapUniverse(9.5, 10)).toBe(9.5);
    expect(wrapUniverse(-9.5, 10)).toBe(-9.5);
  });

  it('wraps past the far edge back to the near one', () => {
    // C: xcoord -= univmax*2
    expect(wrapUniverse(10.5, 10)).toBeCloseTo(-9.5, 6);
  });

  it('wraps past the near edge round to the far one', () => {
    // C: xcoord += univmax*2
    expect(wrapUniverse(-10.5, 10)).toBeCloseTo(9.5, 6);
  });

  it('keeps the origin central — equal room in both directions', () => {
    expect(wrapUniverse(UNIVMAX - 0.5, UNIVMAX)).toBeCloseTo(UNIVMAX - 0.5, 6);
    expect(wrapUniverse(-(UNIVMAX - 0.5), UNIVMAX)).toBeCloseTo(-(UNIVMAX - 0.5), 6);
  });

  it('handles a coordinate several universes out', () => {
    const wrapped = wrapUniverse(10 + 40 * 3, 10);
    expect(wrapped).toBeGreaterThanOrEqual(-10);
    expect(wrapped).toBeLessThanOrEqual(10);
  });

  it('returns 0 for a non-finite coordinate rather than NaN', () => {
    expect(wrapUniverse(Number.NaN, 10)).toBe(0);
    expect(wrapUniverse(Number.POSITIVE_INFINITY, 10)).toBe(0);
  });
});
