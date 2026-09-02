import { headingToward, positionIntegration } from '../../src/game/physics/physics-math';

/**
 * Two Cybertron pursuit-steering sites used `atan2(dx, dy)` while every other
 * heading computation in the port — including the Cybertron's own FIRING
 * bearing three lines away — uses `atan2(dx, -dy)`. Those differ by a Y-axis
 * flip, so a Cybertron ordered to chase a target due north turned due south.
 * It aimed correctly and drove the wrong way.
 *
 * The convention is fixed by `positionIntegration`, which advances `y - cos(heading)`:
 * heading 0 is north, i.e. DECREASING y. The right test is not "does it match
 * a formula" but "is it the inverse of how ships actually move".
 */
describe('headingToward is the inverse of positionIntegration', () => {
  it('points at a target and moving on that heading closes the distance', () => {
    const targets = [
      { dx: 0, dy: -1 },   // due north
      { dx: 0, dy: 1 },    // due south
      { dx: 1, dy: 0 },    // due east
      { dx: -1, dy: 0 },   // due west
      { dx: 3, dy: -4 },
      { dx: -2.5, dy: 1.5 },
      { dx: 0.1, dy: 0.9 },
    ];

    for (const { dx, dy } of targets) {
      const heading = headingToward(dx, dy);
      const before = Math.hypot(dx, dy);
      // Move a small step along that heading from the origin.
      const moved = positionIntegration(0, 0, heading, 100);
      const after = Math.hypot(dx - moved.x, dy - moved.y);
      expect(after).toBeLessThan(before);
    }
  });

  it('gives the compass headings a pilot would expect', () => {
    expect(headingToward(0, -1)).toBeCloseTo(0, 6);    // north
    expect(headingToward(1, 0)).toBeCloseTo(90, 6);    // east
    expect(headingToward(0, 1)).toBeCloseTo(180, 6);   // south
    expect(headingToward(-1, 0)).toBeCloseTo(270, 6);  // west
  });

  it('never returns a negative or >=360 heading', () => {
    for (let a = 0; a < 360; a += 7) {
      const r = (a * Math.PI) / 180;
      const h = headingToward(Math.sin(r), -Math.cos(r));
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it('does NOT use the flipped convention the AI had', () => {
    // atan2(dx, dy) would answer 180 for a target due north.
    expect(headingToward(0, -1)).not.toBeCloseTo(180, 3);
  });
});
