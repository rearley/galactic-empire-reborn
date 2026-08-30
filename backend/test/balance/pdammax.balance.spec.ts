/**
 * PDAMMAX — max normal-phaser damage base.
 *
 * Unlike the GEMAIN.H defines, this is a sysop option: GEMAIN.C:494 reads it as
 * `numopt(PDAMMAX,1,200)`, where 1 and 200 are only the clamp bounds — the value
 * itself lived in a `.cnf` that is not part of the reference source. So there is
 * no canonical figure to preserve, and the port must choose one.
 *
 * The port originally took the upper bound, 200. Because
 * combat-tick.service.ts:180 destroys any ship at `damage >= 100`, that made a
 * single point-blank hit lethal for every phaser type (phasrtype 1 => 155,
 * phasrtype 19 => 1581), so combat had no arc at all.
 *
 * 25 is the playtest default: a fully-charged point-blank hit from a maxed
 * phaser just crosses the kill line, while weaker phasers and longer shots need
 * several hits. Override with the PDAMMAX env var to retune without a rebuild;
 * the value is clamped to the original's 1..200 bounds.
 *
 * @see GEMAIN.C:494 numopt(PDAMMAX,1,200)
 * @see docs/GAME_MECHANICS.md — PDAMMAX marked "tune during playtest"
 */

import { PDAMMAX } from '../../src/game/constants';
import { phaserDamage } from '../../src/game/combat/combat-math';

const KILL_THRESHOLD = 100; // combat-tick.service.ts:180

describe('PDAMMAX balance', () => {
  it('defaults to 25', () => {
    expect(PDAMMAX).toBe(25);
  });

  it('stays inside the original numopt(PDAMMAX,1,200) bounds', () => {
    expect(PDAMMAX).toBeGreaterThanOrEqual(1);
    expect(PDAMMAX).toBeLessThanOrEqual(200);
  });

  describe('resulting combat shape (phasr=100, focus=0, victimMaxTons=100)', () => {
    const shot = (phasrtype: number, distRaw: number) =>
      phaserDamage({ phasrtype, phasr: 100, distRaw, focus: 0, victimMaxTons: 100, victimAtWarp: false });

    it('a maxed phaser still kills in one point-blank hit', () => {
      expect(shot(19, 500)).toBeGreaterThanOrEqual(KILL_THRESHOLD);
    });

    it('the weakest phaser no longer one-shots — combat has an arc', () => {
      expect(shot(1, 500)).toBeLessThan(KILL_THRESHOLD);
    });

    it('a mid-tier phaser needs more than one hit at point-blank', () => {
      expect(shot(5, 500)).toBeLessThan(KILL_THRESHOLD);
      expect(shot(5, 500)).toBeGreaterThan(0);
    });

    it('a starter Interceptor cannot one-shot from its maximum range', () => {
      const INTERCEPTOR_SCAN_RANGE = 15_000;
      expect(shot(10, INTERCEPTOR_SCAN_RANGE)).toBeLessThan(KILL_THRESHOLD);
    });
  });
});
