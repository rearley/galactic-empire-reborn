/**
 * Per-class scanRange seed pin — must match the values rebalanced for the
 * 30×15 sector galaxy. The original wiki tables were calibrated for a
 * much larger world; verbatim values produced sca-lo projections that
 * covered the whole galaxy even for the starter Interceptor, and weapon
 * gates that let mid-class ships fire across the entire map.
 *
 * The original C `shipclass[]` lived in a runtime-loaded `.cnf` file that
 * is not part of the published C source — so there is no "C-canonical"
 * authority to override anyway.
 *
 * Formulas anchored on scanRange:
 *   - sca-lo projection radius (sectors) = scanRange / 1_000
 *   - phaser / lock gate (sectors)        = scanRange / 10_000
 *
 * Galaxy is 30 sectors wide × 15 tall (≈ 33.5 sector diagonal).
 *
 * @see specs/022-fidelity-audit-v2/findings.md S-006
 */

import { SHIP_CLASSES } from '../../prisma/seed/ship-classes';

/**
 * Pinned values, rebalanced for the 30×15 galaxy. Smaller ships should NOT
 * see the whole map via sca-lo; only Battle Cruiser-tier and above earn
 * galaxy-wide overview.
 */
const PINNED_SCANRANGE: ReadonlyMap<number, number> = new Map([
  // ── Player ships ─────────────────────────────────────────────────────────
  // sca-lo (sectors) shown in trailing comment; phaser gate = that / 10.
  [1, 20_000],     // Interceptor          —  20 / 2.0
  [2, 25_000],     // Stealth Fighter      —  25 / 2.5
  [3, 12_000],     // Heavy Freighter      —  12 / 1.2
  [4, 28_000],     // Destroyer            —  28 / 2.8
  [5, 30_000],     // Star Cruiser         —  30 / 3.0
  [6, 50_000],     // Battle Cruiser       —  50 / 5.0  — first galaxy-wide sca-lo
  [7, 40_000],     // Frigate              —  40 / 4.0
  [8, 75_000],     // Dreadnought          —  75 / 7.5
  [9, 18_000],     // Freight Barge        —  18 / 1.8
  [34, 120_000],   // Sysopian Death Star  — 120 / 12.0

  // ── CPU combative ────────────────────────────────────────────────────────
  [21, 25_000],    // Cybertron Scout            — 25 / 2.5
  [22, 45_000],    // Cybertron Battle Cruiser   — 45 / 4.5  (was wiki-typo 1_000)
  [23, 60_000],    // Cybertron Base Star        — 60 / 6.0
  [24, 20_000],    // Sarten Attack Drone        — 20 / 2.0
  [25, 55_000],    // Sarten Obliterator         — 55 / 5.5

  // ── CPU droid ────────────────────────────────────────────────────────────
  [31, 12_000],    // Lydorian Garbage Scow      — 12 / 1.2
  [32, 30_000],    // Murdonian Transport        — 30 / 3.0  (audit-motivating fightback ship)
  [33, 25_000],    // Vakory Survey Drone        — 25 / 2.5
]);

describe('per-class scanRange seed pin (compressed for 30×15 galaxy)', () => {
  for (const [classNumber, expected] of PINNED_SCANRANGE.entries()) {
    test(`class ${classNumber} scanRange = ${expected}`, () => {
      const cls = SHIP_CLASSES.find((c) => c.classNumber === classNumber);
      expect(cls).toBeDefined();
      expect(cls!.scanRange).toBe(expected);
    });
  }

  test('every seed class is pinned', () => {
    for (const cls of SHIP_CLASSES) {
      expect(PINNED_SCANRANGE.has(cls.classNumber)).toBe(true);
    }
  });

  test('every pinned class is in the seed', () => {
    for (const classNumber of PINNED_SCANRANGE.keys()) {
      expect(SHIP_CLASSES.some((c) => c.classNumber === classNumber)).toBe(true);
    }
  });

  test('Interceptor sca-lo cannot cover the full 30×15 galaxy', () => {
    // sca-lo projection radius = scanRange / 1000 (sectors). Must be less
    // than the longest galaxy span (~33 sector diagonal) so a starter ship
    // does NOT reveal everything on a single scan.
    const interceptor = SHIP_CLASSES.find((c) => c.classNumber === 1)!;
    const scaLoRadiusSectors = interceptor.scanRange / 1000;
    expect(scaLoRadiusSectors).toBeLessThan(30);
  });
});
