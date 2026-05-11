/**
 * S-006 — Pin test: per-class scanRange seed values must match
 * `reference/wiki/{player,cpu}-ships.md` (authoritative since the original
 * C `shipclass[]` values come from a runtime-loaded `.cnf` config that is
 * not part of the C source).
 *
 * If any of these values changes, this test fails — alerting the next
 * audit that a per-class scan-range seed has drifted.
 *
 * @see reference/wiki/player-ships.md  — classes 1-9, 34
 * @see reference/wiki/cpu-ships.md     — classes 21-25 (combative), 31-33 (droid)
 * @see specs/022-fidelity-audit-v2/findings.md S-006
 */

import { SHIP_CLASSES } from '../../prisma/seed/ship-classes';

/**
 * Source: wiki tables. Each entry pins one class's scanRange.
 * Comment cites the wiki row.
 */
const PINNED_SCANRANGE: ReadonlyMap<number, number> = new Map([
  // ── Player ships (reference/wiki/player-ships.md) ────────────────────────
  [1, 100_000],   // Interceptor          — "100k"
  [2, 200_000],   // Stealth Fighter      — "200k"
  [3, 50_000],    // Heavy Freighter      — "50k"
  [4, 100_000],   // Destroyer            — "100k"
  [5, 200_000],   // Star Cruiser         — "200k"
  [6, 250_000],   // Battle Cruiser       — "250k"
  [7, 250_000],   // Frigate              — "250k"
  [8, 500_000],   // Dreadnought          — "500k"
  [9, 200_000],   // Freight Barge        — "200k"
  [34, 1_000_000], // Sysopian Death Star — "1m"

  // ── CPU combative (reference/wiki/cpu-ships.md) ──────────────────────────
  [21, 50_000],   // Cybertron Scout         — "50k"
  [22, 1_000],    // Cybertron Battle Cruiser — wiki literally "1000"; flagged in findings
  [23, 200_000],  // Cybertron Base Star      — "200k"
  [24, 20_000],   // Sarten Attack Drone      — "20k"
  [25, 400_000],  // Sarten Obliterator       — "400k"

  // ── CPU droid (reference/wiki/cpu-ships.md) ──────────────────────────────
  [31, 25_000],   // Lydorian Garbage Scow   — "25000"
  [32, 25_000],   // Murdonian Transport     — "25000"
  [33, 25_000],   // Vakory Survey Drone     — "25000" (was 20_000 before S-006 fix)
]);

describe('S-006 — per-class scanRange seed pin', () => {
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
});
