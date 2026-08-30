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
 * Pinned values. Round 3 makes the PLAYER classes a single proportional
 * compression of canon (`reference/wiki/player-ships.md` x 0.15), because
 * rounds 1-2 were ad-hoc: the factor ranged 0.075..0.300, which broke canonical
 * ties and reordered the classes — the Freight Barge lost its 2:1 scanner
 * advantage over the Interceptor entirely, and the Dreadnought's canonical 2x
 * lead became 1.14x. @see test/balance/ship-class-scaling.balance.spec.ts
 *
 * Two derived radii matter, and they differ by the sca-lo multiplier of 3:
 *   phaser / lock gate (sectors) = scanRange / 10_000
 *   sca-lo projection radius     = scanRange * 3 / 10_000
 *
 * The round-2 concern — "no single ship sees half the map" — was really about
 * the STARTER: verbatim canon gave the Interceptor a 30-sector projection
 * radius, covering everything. At 0.15 the Interceptor is unchanged at 4.5
 * sectors, so that concern is preserved exactly.
 *
 * The Dreadnought does now project 22.5 sectors, i.e. most of the galaxy. That
 * is deliberate and canonical: its canon scanRange of 500 000 is a 50-sector
 * radius, so out-ranging everything is the flagship's defining trait. A smaller
 * anchor (0.10) would cap it at 15 sectors but would also drop the Interceptor
 * to 1.0-sector detection while Cybertrons still detect at 2.5 — worse for the
 * new-pilot experience this session has been trying to fix.
 *
 * AI classes are NOT rescaled — see the balance spec for why (their canon table
 * spans a 700x ratio and one entry looks like a transcription error).
 */
const PINNED_SCANRANGE: ReadonlyMap<number, number> = new Map([
  // ── Player ships ─────────────────────────────────────────────────────────
  [1, 15_000],     // Interceptor          — 1.5 sector gate / 4.5 projection
  [2, 30_000],     // Stealth Fighter      — 3.0 / 9.0
  [3, 7_500],      // Heavy Freighter      — 0.75 / 2.3  (weakest, as in canon)
  [4, 15_000],     // Destroyer            — 1.5 / 4.5
  [5, 30_000],     // Star Cruiser         — 3.0 / 9.0
  [6, 37_500],     // Battle Cruiser       — 3.75 / 11.3
  [7, 37_500],     // Frigate              — 3.75 / 11.3 (ties Battle Cruiser, as in canon)
  [8, 75_000],     // Dreadnought          — 7.5 / 22.5  (2x the next best, as in canon)
  [9, 30_000],     // Freight Barge        — 3.0 / 9.0   (2x the Interceptor, as in canon)
  [34, 150_000],    // Sysopian Death Star  — 5.0

  // ── CPU combative ────────────────────────────────────────────────────────
  [21, 7_500],    // Cybertron Scout            — 2.5  (was 1.0 — invisible to players)
  [22, 15_000],    // Cybertron Battle Cruiser   — 3.5
  [23, 30_000],    // Cybertron Base Star        — 4.0
  [24, 3_000],    // Sarten Attack Drone        — 2.0
  [25, 60_000],    // Sarten Obliterator         — 3.5

  // ── CPU droid ────────────────────────────────────────────────────────────
  [31, 3_750],    // Lydorian Garbage Scow      — 1.0
  [32, 3_750],    // Murdonian Transport        — 2.5
  [33, 3_750],    // Vakory Survey Drone        — 3.0
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
