/**
 * `damstr` has six bands in C and the port invented its own.
 *
 * GECMDS.C:2110-2131:
 *
 *   < 2   "no"
 *   < 12  "very light"
 *   < 25  "light"
 *   < 50  "moderate"
 *   < 75  "heavy"
 *   else  "severe"
 *
 * The port had `<10 Undamaged / <25 Light / <50 Moderate / <75 Heavy /
 * <90 Critical / else Destroyed`. Two problems beyond the wording: a ship at
 * 95% hull damage read as "Destroyed" while it was still flying and fighting,
 * and the "very light" band — the one that tells you a shot landed at all —
 * did not exist, so anything under 10% read as undamaged.
 */

import { damstr } from '../../../src/game/combat/combat-math';

describe('damstr — GECMDS.C:2110-2131', () => {
  it('reports the six C bands', () => {
    expect(damstr(0)).toBe('no');
    expect(damstr(1)).toBe('no');
    expect(damstr(2)).toBe('very light');
    expect(damstr(11)).toBe('very light');
    expect(damstr(12)).toBe('light');
    expect(damstr(24)).toBe('light');
    expect(damstr(25)).toBe('moderate');
    expect(damstr(49)).toBe('moderate');
    expect(damstr(50)).toBe('heavy');
    expect(damstr(74)).toBe('heavy');
    expect(damstr(75)).toBe('severe');
    expect(damstr(99)).toBe('severe');
  });

  it('never calls a living ship destroyed', () => {
    // A ship at 95 is badly hurt but still flying; only 100+ is death.
    expect(damstr(95)).toBe('severe');
  });

  it('distinguishes a scratch from no damage at all', () => {
    expect(damstr(1)).not.toBe(damstr(5));
  });
});
