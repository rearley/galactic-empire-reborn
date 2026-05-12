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
  [1, 10_000],     // Interceptor          — 10 / 1.0
  [2, 12_000],     // Stealth Fighter      — 12 / 1.2
  [3, 8_000],      // Heavy Freighter      —  8 / 0.8
  [4, 15_000],     // Destroyer            — 15 / 1.5  — half galaxy
  [5, 18_000],     // Star Cruiser         — 18 / 1.8
  [6, 25_000],     // Battle Cruiser       — 25 / 2.5
  [7, 20_000],     // Frigate              — 20 / 2.0
  [8, 30_000],     // Dreadnought          — 30 / 3.0  — full galaxy width
  [9, 8_000],      // Freight Barge        —  8 / 0.8
  [34, 40_000],    // Sysopian Death Star  — 40 / 4.0  — over galaxy

  // ── CPU combative ────────────────────────────────────────────────────────
  [21, 10_000],    // Cybertron Scout            — 10 / 1.0
  [22, 18_000],    // Cybertron Battle Cruiser   — 18 / 1.8  (was wiki-typo 1_000)
  [23, 25_000],    // Cybertron Base Star        — 25 / 2.5
  [24, 10_000],    // Sarten Attack Drone        — 10 / 1.0
  [25, 20_000],    // Sarten Obliterator         — 20 / 2.0

  // ── CPU droid ────────────────────────────────────────────────────────────
  [31,  5_000],    // Lydorian Garbage Scow      —  5 / 0.5
  [32, 12_000],    // Murdonian Transport        — 12 / 1.2  (audit-motivating fightback ship)
  [33, 10_000],    // Vakory Survey Drone        — 10 / 1.0
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
