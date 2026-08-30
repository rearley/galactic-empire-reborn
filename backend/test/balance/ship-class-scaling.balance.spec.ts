/**
 * Ship class table fidelity and scaling consistency.
 *
 * Canonical values come from the GE 3.2e stats table
 * (reference/wiki/player-ships.md, sourced from MBMGESHP.MSG). Every attribute
 * below matches canon exactly EXCEPT scanRange, which was deliberately
 * compressed for this port's fixed 30x15 grid.
 *
 * Note there are NINE player classes (1-9), not ten — class 34 is the
 * admin-only Sysopian Death Star.
 */

import { SHIP_CLASSES } from '../../prisma/seed/ship-classes';

/** The seed module is the source of truth for the class table. */
const PLAYER_CLASSES = SHIP_CLASSES.filter((c) => c.classNumber <= 9)
  .slice()
  .sort((a, b) => a.classNumber - b.classNumber);
const byNumber = new Map(SHIP_CLASSES.map((c) => [c.classNumber, c]));

/** #, shields, phaser, accel, warp, tons, price, points, damageFactor */
const CANON: Array<[number, string, number, number, number, number, number, number, number, number]> = [
  [1, 'Interceptor',      10, 10,  5_000, 10,   1_000,    65_000,    750,  90],
  [2, 'Stealth Fighter',  15, 15,  5_000, 20,   2_000,   500_000,  1_500,  90],
  [3, 'Heavy Freighter',   5,  5,  3_000,  8,  60_000,    40_000,    500, 200],
  [4, 'Destroyer',        15, 15,  5_000, 25,   5_000,   600_000,  2_000,  90],
  [5, 'Star Cruiser',     15, 15, 10_000, 25,   3_000,   700_000,  5_000, 100],
  [6, 'Battle Cruiser',   19, 19,  3_000, 30,   6_000,   800_000,  5_000, 125],
  [7, 'Frigate',          12, 12, 10_000, 30,  12_000, 1_250_000,  5_000, 125],
  [8, 'Dreadnought',      19, 19, 15_000, 50,  40_000, 2_000_000, 10_000, 125],
  [9, 'Freight Barge',     6,  3,  1_000, 15, 200_000, 3_000_000,  5_000, 200],
];

/** Canonical scanRange, before this port's compression. */
const CANON_SCAN: Record<number, number> = {
  1: 100_000, 2: 200_000, 3: 50_000, 4: 100_000, 5: 200_000,
  6: 250_000, 7: 250_000, 8: 500_000, 9: 200_000,
};

describe('ship class table matches the canonical GE 3.2e stats', () => {
  it('seeds exactly nine player classes (1-9)', () => {
    expect(PLAYER_CLASSES.map((c) => c.classNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it.each(CANON)(
    'class %s (%s) matches canon on shields/phaser/accel/warp/tons/price/points/damageFactor',
    (classNumber, typeName, shields, phaser, accel, warp, tons, price, points, dmg) => {
      const row = byNumber.get(classNumber)!;
      expect(row).toBeDefined();
      expect(row.typeName).toBe(typeName);
      expect(row.maxShields).toBe(shields);
      expect(row.maxPhaser).toBe(phaser);
      expect(row.maxAcceleration).toBe(accel);
      expect(row.maxWarp).toBe(warp);
      expect(row.maxTons).toBe(tons);
      expect(Number(row.maxPrice)).toBe(price);
      expect(row.points).toBe(points);
      expect(row.damageFactor).toBe(dmg);
    },
  );

  it('only the Heavy Freighter and Freight Barge are exempt from unprovoked Cybertron attack', () => {
    expect(PLAYER_CLASSES.filter((c) => !c.cybCanAttack).map((c) => c.classNumber)).toEqual([3, 9]);
  });

  it('the Interceptor alone cannot attack planets', () => {
    expect(PLAYER_CLASSES.filter((c) => !c.canAttackPlanet).map((c) => c.classNumber)).toEqual([1]);
  });
});

describe('scanRange compression — DOCUMENTED divergence from canon', () => {
  /**
   * scanRange was compressed for the 30x15 grid (commits 3bc1dff, 11ade00):
   * canon values reach 500 000 raw units (50 sectors), which spans the whole
   * playfield. The compression is NOT proportional, and it reorders the classes.
   *
   *   class          canon     ours   ratio
   *   Interceptor   100 000   15 000   0.150
   *   Stealth F.    200 000   18 000   0.090
   *   Heavy Freig.   50 000   15 000   0.300
   *   Destroyer     100 000   25 000   0.250
   *   Star Cruiser  200 000   28 000   0.140
   *   Battle Cr.    250 000   35 000   0.140
   *   Frigate       250 000   30 000   0.120
   *   Dreadnought   500 000   40 000   0.080
   *   Freight Barge 200 000   15 000   0.075
   *
   * Compression factor spans 0.075..0.300 — a 4x spread — so canonical
   * relationships are not preserved. These tests pin the CURRENT values and
   * state the consequences, so a future rescale is a deliberate act.
   */
  it('pins the current compressed values', () => {
    expect(Object.fromEntries(PLAYER_CLASSES.map((c) => [c.classNumber, c.scanRange]))).toEqual({
      1: 15_000, 2: 18_000, 3: 15_000, 4: 25_000, 5: 28_000,
      6: 35_000, 7: 30_000, 8: 40_000, 9: 15_000,
    });
  });

  it('every compressed value is below canon (compression, not inflation)', () => {
    for (const c of PLAYER_CLASSES) {
      expect(c.scanRange).toBeLessThan(CANON_SCAN[c.classNumber]);
    }
  });

  it('DIVERGENCE: canonical ties are broken by the rescale', () => {
    const scan = Object.fromEntries(PLAYER_CLASSES.map((c) => [c.classNumber, c.scanRange]));

    // Canon: Battle Cruiser and Frigate both 250 000; Stealth Fighter, Star
    // Cruiser and Freight Barge all 200 000; Interceptor and Destroyer 100 000.
    expect(CANON_SCAN[6]).toBe(CANON_SCAN[7]);
    expect(scan[6]).not.toBe(scan[7]);          // tie broken
    expect(CANON_SCAN[2]).toBe(CANON_SCAN[5]);
    expect(scan[2]).not.toBe(scan[5]);          // tie broken
  });

  it('DIVERGENCE: the Freight Barge drops from mid-tier to the bottom tier', () => {
    const scan = Object.fromEntries(PLAYER_CLASSES.map((c) => [c.classNumber, c.scanRange]));

    // Canon: the Barge (200 000) out-scans the Interceptor (100 000) 2:1.
    expect(CANON_SCAN[9]).toBeGreaterThan(CANON_SCAN[1]);
    // Ours: they are equal, so the Barge lost its scanner advantage entirely.
    expect(scan[9]).toBe(scan[1]);
  });

  it("DIVERGENCE: the Dreadnought's 2x scanner advantage is flattened", () => {
    const scan = Object.fromEntries(PLAYER_CLASSES.map((c) => [c.classNumber, c.scanRange]));

    // Canon: 500 000 vs the next best 250 000 — exactly double.
    expect(CANON_SCAN[8] / CANON_SCAN[6]).toBe(2);
    // Ours: 40 000 vs 35 000 — a marginal edge for the flagship.
    expect(scan[8] / scan[6]).toBeLessThan(1.2);
  });
});
