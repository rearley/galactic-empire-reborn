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
 * Pinned values, rebalanced (round 2) for the 30×15 galaxy. The earlier round
 * compressed scanRange so far that AI ships effectively never saw a moving
 * player — Cybertrons appeared inert in playtest. These values give every
 * class a meaningful engagement bubble (≥1 sector) while keeping max vision
 * to ~15% of the 33.5-sector diagonal so no single ship sees half the map.
 *
 * Phaser gate (sectors) = scanRange / 10_000.
 */
const PINNED_SCANRANGE: ReadonlyMap<number, number> = new Map([
  // ── Player ships ─────────────────────────────────────────────────────────
  [1, 15_000],     // Interceptor          — 1.5 sectors
  [2, 18_000],     // Stealth Fighter      — 1.8
  [3, 15_000],     // Heavy Freighter      — 1.5
  [4, 25_000],     // Destroyer            — 2.5
  [5, 28_000],     // Star Cruiser         — 2.8
  [6, 35_000],     // Battle Cruiser       — 3.5
  [7, 30_000],     // Frigate              — 3.0
  [8, 40_000],     // Dreadnought          — 4.0
  [9, 15_000],     // Freight Barge        — 1.5
  [34, 50_000],    // Sysopian Death Star  — 5.0

  // ── CPU combative ────────────────────────────────────────────────────────
  [21, 25_000],    // Cybertron Scout            — 2.5  (was 1.0 — invisible to players)
  [22, 35_000],    // Cybertron Battle Cruiser   — 3.5
  [23, 40_000],    // Cybertron Base Star        — 4.0
  [24, 20_000],    // Sarten Attack Drone        — 2.0
  [25, 35_000],    // Sarten Obliterator         — 3.5

  // ── CPU droid ────────────────────────────────────────────────────────────
  [31, 10_000],    // Lydorian Garbage Scow      — 1.0
  [32, 25_000],    // Murdonian Transport        — 2.5
  [33, 30_000],    // Vakory Survey Drone        — 3.0
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
