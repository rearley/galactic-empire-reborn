import {
  CANON_UNIVMAX,
  CANON_TOT_TO_CREATE,
  scaleAiPopulation,
} from '../../src/game/cybertron/cyb-population';

/**
 * Canon spawns a FIXED number of Cybertrons — 24 across five classes — and
 * never scales it to the size of the galaxy. That is fine at canon's
 * UNIVMAX 300, where 24 hulls are scattered across 601x601 = 361,201 sectors.
 *
 * We deploy at UNIVMAX 100, which is 201x201 = 40,401 sectors: the same 24
 * hulls in an eighth of the space, so a player meets a Cybertron roughly nine
 * times more often than the original ever allowed. Per-kill economics are
 * canon to the credit (rnd%1200 gold at 1000 cr each, salvage divided by
 * rnd%5+1), which means the CREDITS PER HOUR are ~9x canon and the run to a
 * 2,000,000 cr Dreadnought is ~9x shorter than it was in 1992.
 *
 * So this is not a deviation we chose — it fell out of the UNIVMAX one.
 *
 * @see docs/DECISIONS.md — AI population scales with UNIVMAX
 */
describe('AI population scales with the galaxy', () => {
  it('reproduces canon exactly at canon\'s UNIVMAX', () => {
    // The point of scaling LINEARLY rather than by area: at 300 it must be a
    // no-op, or we have quietly rebalanced the original.
    for (const [cls, canonCount] of Object.entries(CANON_TOT_TO_CREATE)) {
      expect(scaleAiPopulation(canonCount, CANON_UNIVMAX)).toBe(canonCount);
    }
    const total = Object.values(CANON_TOT_TO_CREATE)
      .reduce((a, b) => a + scaleAiPopulation(b, CANON_UNIVMAX), 0);
    expect(total).toBe(24);
  });

  it('gives 9 Cybertrons at our deployed UNIVMAX 100', () => {
    const scaled = Object.fromEntries(
      Object.entries(CANON_TOT_TO_CREATE).map(([c, n]) => [c, scaleAiPopulation(n, 100)]),
    );
    // 10→3, 5→2, 1→1 (clamped), 6→2, 2→1 (clamped)
    expect(scaled).toEqual({ 21: 3, 22: 2, 23: 1, 24: 2, 25: 1 });
    expect(Object.values(scaled).reduce((a, b) => a + b, 0)).toBe(9);
  });

  it('never removes a class entirely, however small the galaxy', () => {
    // The Base Star is canon's single boss hull. Rounding 1 * (100/300) down
    // deletes it from the game, and a player would never learn it exists.
    expect(scaleAiPopulation(1, 100)).toBe(1);
    expect(scaleAiPopulation(1, 10)).toBe(1);
    expect(scaleAiPopulation(10, 10)).toBeGreaterThanOrEqual(1);
  });

  it('scales back up if a future galaxy is bigger', () => {
    // The ratio is the point: raise UNIVMAX for a busier server and the AI
    // population follows without anyone remembering to edit a second table.
    expect(scaleAiPopulation(10, 200)).toBe(7);
    expect(scaleAiPopulation(10, 300)).toBe(10);
    expect(scaleAiPopulation(10, 600)).toBe(20);
  });
});
