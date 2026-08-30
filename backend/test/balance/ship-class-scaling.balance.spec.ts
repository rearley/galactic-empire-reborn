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

describe('AI class scanRange — UNRESOLVED divergence from canon', () => {
  /**
   * Canon (reference/wiki/cpu-ships.md, and class 34 from player-ships.md):
   *
   *   cls  name                    canon      ours    ratio
   *   21   Cybertron Scout         50 000    25 000    0.50
   *   22   Cyb Battle Cruiser       1 000    35 000   35.00   <-- inflated 35x
   *   23   Cyb Base Star          200 000    40 000    0.20
   *   24   Sarten Attack Drone     20 000    20 000    1.00   <-- uncompressed
   *   25   Sarten Obliterator     400 000    35 000    0.087
   *   31   Lydorian Scow           25 000    10 000    0.40
   *   32   Murdonian Transport     25 000    25 000    1.00   <-- uncompressed
   *   33   Vakory Survey Drone     25 000    30 000    1.20   <-- inflated
   *   34   Sysopian Death Star  1 000 000    50 000    0.05
   *
   * The ratio spans 0.05..35 — a 700x spread, against 4x on the player table
   * before it was made proportional. Some values are compressed, two are the
   * raw canon figure, and two are inflated above it.
   *
   * This matters beyond detection: C-001 gates phaser reach on the firer's
   * scanRange, so an inflated scanner is also an inflated weapon envelope. The
   * Cybertron Battle Cruiser engaging from 3.5 sectors is a plausible cause of
   * the brutal new-pilot experience seen in playtest (three starter ships lost
   * in quick succession).
   *
   * NOT rescaled here, for two reasons:
   *  1. It materially changes AI difficulty — a balance decision.
   *  2. The canon figure for class 22 (1 000, i.e. 0.1 sectors) is suspect: it
   *     is 50x below the Scout and 200x below the Base Star, which reads more
   *     like a wiki transcription error than a design intent. Rescaling from a
   *     bad baseline would be worse than leaving it.
   *
   * These tests pin the CURRENT values so any change is deliberate.
   */
  const AI_CANON_SCAN: Record<number, number> = {
    21: 50_000, 22: 1_000, 23: 200_000, 24: 20_000, 25: 400_000,
    31: 25_000, 32: 25_000, 33: 25_000, 34: 1_000_000,
  };

  const AI_CLASSES = SHIP_CLASSES.filter((c) => c.classNumber >= 21)
    .slice()
    .sort((a, b) => a.classNumber - b.classNumber);

  it('pins the current AI scan ranges', () => {
    expect(Object.fromEntries(AI_CLASSES.map((c) => [c.classNumber, c.scanRange]))).toEqual({
      21: 25_000, 22: 35_000, 23: 40_000, 24: 20_000, 25: 35_000,
      31: 10_000, 32: 25_000, 33: 30_000, 34: 50_000,
    });
  });

  it('DIVERGENCE: the AI table is not proportional, unlike the player table', () => {
    const ratios = AI_CLASSES.map((c) => c.scanRange / AI_CANON_SCAN[c.classNumber]);
    const spread = Math.max(...ratios) / Math.min(...ratios);
    expect(spread).toBeGreaterThan(100); // ~700x today
  });

  it('DIVERGENCE: some AI scanners exceed their canonical value', () => {
    const inflated = AI_CLASSES
      .filter((c) => c.scanRange > AI_CANON_SCAN[c.classNumber])
      .map((c) => c.classNumber);
    expect(inflated).toEqual([22, 33]);
  });

  it('no AI scanner out-ranges the widest player scanner by more than 1x', () => {
    // A guard against AI out-seeing every player ship. The Dreadnought is the
    // player ceiling at 75 000 after the proportional rescale.
    const widestPlayer = Math.max(...PLAYER_CLASSES.map((c) => c.scanRange));
    for (const c of AI_CLASSES) {
      expect(c.scanRange).toBeLessThanOrEqual(widestPlayer);
    }
  });
});
