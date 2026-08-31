import { rollSpawnPosition, SPAWN_MIN_PLANET_DISTANCE } from '../../../src/game/onboarding/spawn-placement';

/**
 * C drops a new ship at a RANDOM point inside the neutral sector and re-rolls
 * while it lands within 1000 raw units of a planet, then gives it a random
 * heading (GEFUNCS.C:195-217).
 *
 * The port put every new pilot at exactly (0.0, 0.0) — the sector's corner —
 * facing 0. Found by playing a new pilot: heading 0 decreases y, so a fresh
 * captain who set a course for the next sector and engaged warp drifted off the
 * bottom edge while still turning, wrapped to sector (0,14), and was shot by a
 * Cybertron within seconds of their first command. Every new player would have
 * met that, and they would all have been stacked on the same point.
 */
const SECTOR = { x: 0, y: 0 };

/** Deterministic sequence stand-in for gernd(). */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('rollSpawnPosition', () => {
  it('lands inside the spawn sector, never on its edge', () => {
    for (let i = 0; i < 50; i++) {
      const p = rollSpawnPosition(SECTOR, [], Math.random);
      expect(p.xcoord).toBeGreaterThan(SECTOR.x);
      expect(p.xcoord).toBeLessThan(SECTOR.x + 1);
      expect(p.ycoord).toBeGreaterThan(SECTOR.y);
      expect(p.ycoord).toBeLessThan(SECTOR.y + 1);
    }
  });

  it('faces a random heading rather than always north', () => {
    const headings = new Set(
      Array.from({ length: 30 }, () => rollSpawnPosition(SECTOR, [], Math.random).heading),
    );
    expect(headings.size).toBeGreaterThan(1);
    for (const h of headings) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it('re-rolls away from a planet it would have landed on top of', () => {
    const planet = { xcoord: 0.2, ycoord: 0.2 };
    // First roll lands on the planet, second lands clear.
    const rand = seq([0.2, 0.2, 0.5, 0.8, 0.8, 0.1]);
    const p = rollSpawnPosition(SECTOR, [planet], rand);

    const dist = Math.hypot(p.xcoord - planet.xcoord, p.ycoord - planet.ycoord) * 10_000;
    expect(dist).toBeGreaterThanOrEqual(SPAWN_MIN_PLANET_DISTANCE);
  });

  it('keeps clear of every planet in the sector, not just the first', () => {
    const planets = [
      { xcoord: 0.5, ycoord: 0.5 },
      { xcoord: 0.2, ycoord: 0.3 },
      { xcoord: 0.7, ycoord: 0.2 },
      { xcoord: 0.3, ycoord: 0.7 },
      { xcoord: 0.8, ycoord: 0.8 },
    ];
    for (let i = 0; i < 40; i++) {
      const p = rollSpawnPosition(SECTOR, planets, Math.random);
      for (const planet of planets) {
        const dist = Math.hypot(p.xcoord - planet.xcoord, p.ycoord - planet.ycoord) * 10_000;
        expect(dist).toBeGreaterThanOrEqual(SPAWN_MIN_PLANET_DISTANCE);
      }
    }
  });

  it('gives up rather than looping forever if the sector is impossibly crowded', () => {
    // A planet on every candidate point: the roll must still return something.
    const rand = () => 0.5;
    const p = rollSpawnPosition(SECTOR, [{ xcoord: 0.5, ycoord: 0.5 }], rand);
    expect(Number.isFinite(p.xcoord)).toBe(true);
    expect(Number.isFinite(p.ycoord)).toBe(true);
  });

  it('honours a non-zero spawn sector', () => {
    const p = rollSpawnPosition({ x: 4, y: 9 }, [], Math.random);
    expect(Math.floor(p.xcoord)).toBe(4);
    expect(Math.floor(p.ycoord)).toBe(9);
  });
});
