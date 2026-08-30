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

describe('scanRange compression is PROPORTIONAL to canon', () => {
  /**
   * Canon values reach 500 000 raw units (50 sectors), which spans the whole
   * 30x15 playfield, so they had to be compressed for this port. The original
   * compression was ad-hoc — the factor ranged 0.075..0.300, a 4x spread — which
   * broke canonical ties and reordered the classes: the Freight Barge lost its
   * 2:1 scanner advantage over the Interceptor entirely, and the Dreadnought's
   * canonical 2x lead over the next best became 1.14x.
   *
   * A single factor keeps every canonical relationship intact while still
   * fitting the grid: the Dreadnought tops out at 75 000 (7.5 sectors).
   */
  const FACTOR = 0.15;

  it('applies one factor uniformly, so canonical ratios survive', () => {
    for (const c of PLAYER_CLASSES) {
      expect(c.scanRange).toBe(CANON_SCAN[c.classNumber] * FACTOR);
    }
  });

  it('preserves canonical ties', () => {
    const scan = Object.fromEntries(PLAYER_CLASSES.map((c) => [c.classNumber, c.scanRange]));
    // Battle Cruiser / Frigate, and Stealth Fighter / Star Cruiser / Freight Barge.
    expect(CANON_SCAN[6]).toBe(CANON_SCAN[7]);
    expect(scan[6]).toBe(scan[7]);
    expect(CANON_SCAN[2]).toBe(CANON_SCAN[5]);
    expect(scan[2]).toBe(scan[5]);
    expect(scan[5]).toBe(scan[9]);
  });

  it('preserves the class ordering', () => {
    const scan = Object.fromEntries(PLAYER_CLASSES.map((c) => [c.classNumber, c.scanRange]));
    const rank = (o: Record<number, number>) =>
      Object.keys(o).map(Number).sort((a, b) => o[a] - o[b] || a - b).join(',');
    expect(rank(scan)).toBe(rank(CANON_SCAN));
  });

  it("restores the Freight Barge's 2:1 advantage over the Interceptor", () => {
    const scan = Object.fromEntries(PLAYER_CLASSES.map((c) => [c.classNumber, c.scanRange]));
    expect(CANON_SCAN[9] / CANON_SCAN[1]).toBe(2);
    expect(scan[9] / scan[1]).toBe(2);
  });

  it("restores the Dreadnought's 2x lead over the next-best scanner", () => {
    const scan = Object.fromEntries(PLAYER_CLASSES.map((c) => [c.classNumber, c.scanRange]));
    expect(CANON_SCAN[8] / CANON_SCAN[6]).toBe(2);
    expect(scan[8] / scan[6]).toBe(2);
  });

  it('still fits the 30x15 grid — the widest scanner is 7.5 sectors', () => {
    const widest = Math.max(...PLAYER_CLASSES.map((c) => c.scanRange));
    expect(widest).toBe(75_000);
    expect(widest / 10_000).toBeLessThan(30); // grid width in sectors
  });

  it('the Heavy Freighter remains the weakest scanner, as in canon', () => {
    const scan = Object.fromEntries(PLAYER_CLASSES.map((c) => [c.classNumber, c.scanRange]));
    const weakest = Math.min(...Object.values(scan));
    expect(scan[3]).toBe(weakest);
    expect(scan[3]).toBe(7_500);
  });
});

describe('AI class scanRange is proportional to canon, on the same factor', () => {
  /**
   * Canon: reference/wiki/cpu-ships.md, plus class 34 from player-ships.md.
   *
   * ONE correction to canon: the wiki lists the Cybertron Battle Cruiser at
   * 1 000 — 0.1 sectors, 50x below the Scout and 200x below the Base Star,
   * which reads as a dropped zero rather than design intent. It is treated as
   * 100 000, placing it between the Scout (50 000) and the Base Star (200 000).
   *
   * Before this rescale the AI table ranged 0.05..35x canon — a 700x spread,
   * with two values left uncompressed and two inflated ABOVE canon. Because
   * C-001 gates phaser reach on the firer's scanRange, an inflated scanner was
   * also an inflated weapon envelope.
   */
  const AI_CANON_SCAN: Record<number, number> = {
    21: 50_000,
    22: 100_000, // wiki says 1 000 — treated as a transcription error
    23: 200_000,
    24: 20_000,
    25: 400_000,
    31: 25_000,
    32: 25_000,
    33: 25_000,
    34: 1_000_000,
  };

  const AI_CLASSES = SHIP_CLASSES.filter((c) => c.classNumber >= 21)
    .slice()
    .sort((a, b) => a.classNumber - b.classNumber);

  const FACTOR = 0.15;

  it('applies the SAME factor as the player table', () => {
    for (const c of AI_CLASSES) {
      expect(c.scanRange).toBe(AI_CANON_SCAN[c.classNumber] * FACTOR);
    }
  });

  it('no AI scanner exceeds its canonical value any more', () => {
    for (const c of AI_CLASSES) {
      expect(c.scanRange).toBeLessThan(AI_CANON_SCAN[c.classNumber]);
    }
  });

  it('preserves the canonical AI ordering', () => {
    const scan = Object.fromEntries(AI_CLASSES.map((c) => [c.classNumber, c.scanRange]));
    const rank = (o: Record<number, number>) =>
      Object.keys(o).map(Number).sort((a, b) => o[a] - o[b] || a - b).join(',');
    expect(rank(scan)).toBe(rank(AI_CANON_SCAN));
  });

  it('the three droid classes share one scan range, as in canon', () => {
    const scan = Object.fromEntries(AI_CLASSES.map((c) => [c.classNumber, c.scanRange]));
    expect(scan[31]).toBe(scan[32]);
    expect(scan[32]).toBe(scan[33]);
  });

  it('the Cybertron Base Star still out-scans the Scout, as in canon', () => {
    const scan = Object.fromEntries(AI_CLASSES.map((c) => [c.classNumber, c.scanRange]));
    expect(scan[23]).toBeGreaterThan(scan[21]);
    expect(AI_CANON_SCAN[23] / AI_CANON_SCAN[21]).toBe(scan[23] / scan[21]);
  });

  it('no COMBATIVE AI out-scans the best player ship', () => {
    // The Sysopian Death Star (34) is admin-only and deliberately god-tier
    // (100m tons, warp 255, canon scan 1m = a 100-sector radius), so it is
    // exempt. Every Cybertron and droid must stay within player reach.
    const widestPlayer = Math.max(...PLAYER_CLASSES.map((c) => c.scanRange));
    for (const c of AI_CLASSES.filter((x) => x.classNumber !== 34)) {
      expect(c.scanRange).toBeLessThanOrEqual(widestPlayer);
    }
  });

  it('every AI class can still see beyond its own sector, so none is inert', () => {
    // Round 2 over-compressed and "Cybertrons appeared inert in playtest"
    // (ship-class-scanrange-pin.spec.ts). The weakest AI scanner must still
    // reach past the sector it occupies.
    for (const c of AI_CLASSES) {
      expect(c.scanRange / 10_000).toBeGreaterThanOrEqual(0.3);
    }
  });
});
