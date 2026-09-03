/**
 * PDAMMAX / PFIRDST — the shape of normal phaser combat.
 *
 * PDAMMAX is the damage base and PFIRDST the distance exponent:
 * `dp = pow(dd, PFIRDST)` (GEFUNCS.C:2077-2087). Both are sysop options, and
 * BOTH were wrong here in the same way and for the same stated reason.
 *
 * This file used to open by asserting that the value "lived in a `.cnf` that is
 * not part of the reference source. So there is no canonical figure to preserve,
 * and the port must choose one" -- and then chose 25 as "the playtest default".
 * MBMGEMSG.MSG ships PDAMMAX 50 and PFIRDST 5; the port ran 25 and 3. The
 * exponent mattered far more than the base: at 3 the falloff is gentle enough
 * that phasers reach across sectors, and a Mark-10 could hit for meaningful
 * damage from well beyond the range at which a new pilot can see the shooter.
 *
 * At canon the weapon is a knife, not a rifle (phasr=100, focus=0, 100-ton
 * victim, kill threshold 100):
 *
 *     phasrtype    point-blank   0.5 sec   1.5 sec   5 sec
 *      1 weakest         35         11         0        0
 *      5                109         59         9        0
 *     10 Interceptor    205        139        48        0
 *     19 maxed          381        301       166        7
 *
 * That is the intended shape: closing to knife range is the whole engagement,
 * and it is why a Cybertron has to come to you. It also means a starter
 * Interceptor's phaser reaches roughly a sector and a half while its scanner
 * sees ten -- you watch a threat approach long before you can touch it.
 *
 * The exponent was 7 here until 2026-09-03, transcribed from
 * GE/MSG/MBMGEMSG.MSG. That file is an earlier partial snapshot; the shipped
 * option database is GE/REL/MBMGEMSG.MSG and says 5. The table above is the
 * difference, and it is not small: at 1.5 sectors a Mark-10 goes from 26 to 48.
 *
 * Exact defaults are owned by test/balance/sysop-options-canon.balance.spec.ts.
 * This file asserts the resulting SHAPE, which is what a retune could break
 * without any single value looking wrong.
 *
 * @see GEMAIN.C:494 numopt(PDAMMAX,1,200) / GEMAIN.C:493 numopt(PFIRDST,1,20)
 * @see GEFUNCS.C:2077-2087 pdamage
 */

import { PDAMMAX, PFIRDST } from '../../src/game/constants';
import { phaserDamage } from '../../src/game/combat/combat-math';
import { SHIP_CLASSES } from '../../prisma/seed/ship-classes';

const KILL_THRESHOLD = 100; // combat-tick.service.ts:180

const shot = (phasrtype: number, distRaw: number, victimMaxTons = 100) =>
  phaserDamage({ phasrtype, phasr: 100, distRaw, focus: 0, victimMaxTons, victimAtWarp: false });

describe('PDAMMAX / PFIRDST balance', () => {
  it('stays inside the original numopt bounds', () => {
    expect(PDAMMAX).toBeGreaterThanOrEqual(1);
    expect(PDAMMAX).toBeLessThanOrEqual(200);
    expect(PFIRDST).toBeGreaterThanOrEqual(1);
    expect(PFIRDST).toBeLessThanOrEqual(20);
  });

  describe('combat shape', () => {
    it('the weakest phaser cannot one-shot, even point-blank', () => {
      expect(shot(1, 500)).toBeLessThan(KILL_THRESHOLD);
      expect(shot(1, 500)).toBeGreaterThan(0);
    });

    it('a maxed phaser kills outright at point-blank', () => {
      expect(shot(19, 500)).toBeGreaterThanOrEqual(KILL_THRESHOLD);
    });

    it('damage falls off steeply, not gently', () => {
      // The exponent is the whole point. Each step out must cost far more than
      // linearly, or phasers become a ranged weapon and closing stops mattering.
      const pointBlank = shot(10, 500);
      const halfSector = shot(10, 5_000);
      const sectorAndAHalf = shot(10, 15_000);
      expect(halfSector).toBeLessThan(pointBlank / 1.4);
      expect(sectorAndAHalf).toBeLessThan(halfSector / 2.5);
    });

    it('only a maxed phaser reaches five sectors, and only for a scratch', () => {
      // At PFIRDST 5 the tail is not quite zero. A Mark-19 lands 7 damage at
      // five sectors -- 14 shots to a kill, at 36 seconds a shot, on a target
      // that can simply leave. Everything below it is still nothing at all.
      for (const phasrtype of [1, 5, 10]) {
        expect(shot(phasrtype, 50_000)).toBe(0);
      }
      expect(shot(19, 50_000)).toBeLessThan(10);
    });

    it('a starter Interceptor cannot touch anything at its own scan range', () => {
      // The scanner is a warning system, not a targeting solution: canon gives
      // the Interceptor a 100_000 scan range and a phaser that dies well inside
      // it. Reads the seeded class so this tracks the ship table.
      const interceptor = SHIP_CLASSES.find((c) => c.classNumber === 1)!;
      expect(shot(interceptor.maxPhaser, interceptor.scanRange)).toBe(0);
    });
  });
});
