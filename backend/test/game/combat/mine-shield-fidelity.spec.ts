/**
 * Mine damage through raised shields.
 *
 * GEFUNCS.C:1441-1463 — `wptr->damage += damage` sits AFTER the if/else, so hull
 * damage lands in both branches. Shields do not confer immunity; they divide the
 * damage by the shield MARK:
 *
 *   shields UP    damage = ton_fact(ddist^3 * minedammax)
 *                 damage = damage / (gernd()%5 + wptr->shieldtype)   <-- divisor
 *                 shieldhit(wptr, zothusn, damage + 20)
 *   shields DOWN  damage = ton_fact(ddist^3 * minedammax)
 *
 *   ...then, common to both:  wptr->damage += damage
 *
 * The port set `hullDamage = 0` whenever shields were up — the same defect
 * already fixed for torpedoes and missiles — and passed the undivided damage to
 * shieldhit instead of `damage + 20`.
 *
 * Note this divisor is what makes SHIELD TYPE (the Mark) reduce mine damage.
 * Shield CHARGE never scales damage for any weapon; it is the pool that decides
 * how long shields stay up.
 *
 * @see GEFUNCS.C:1441 mine detonation
 */

import { mineShieldedDamage, MINE_SHIELD_DRAIN_BONUS, MINE_SHIELD_DIVISOR_SPREAD } from '../../../src/game/combat/combat-math';
import { Random } from '../../../src/game/combat/random.port';

function fixedRandom(values: number[]): Random {
  let i = 0;
  return { next: () => values[i++ % values.length] } as Random;
}

describe('mine damage through raised shields (GEFUNCS.C:1441)', () => {
  it('still deals hull damage — shields are not immunity', () => {
    const dmg = mineShieldedDamage(fixedRandom([0]), 100, 1);
    expect(dmg).toBeGreaterThan(0);
  });

  it('divides by (gernd()%5 + shieldtype)', () => {
    // rand 0 -> gernd()%5 == 0, shieldtype 4 -> divisor 4
    expect(mineShieldedDamage(fixedRandom([0]), 100, 4)).toBe(25);
    // rand just under 1 -> gernd()%5 == 4, shieldtype 1 -> divisor 5
    expect(mineShieldedDamage(fixedRandom([0.999]), 100, 1)).toBe(20);
  });

  it('a higher shield Mark reduces mine damage', () => {
    const mark1 = mineShieldedDamage(fixedRandom([0]), 100, 1);
    const mark10 = mineShieldedDamage(fixedRandom([0]), 100, 10);
    expect(mark10).toBeLessThan(mark1);
  });

  it('never exceeds the unshielded damage', () => {
    for (const r of [0, 0.5, 0.999]) {
      expect(mineShieldedDamage(fixedRandom([r]), 100, 1)).toBeLessThanOrEqual(100);
    }
  });

  it('exposes the C shield-drain bonus of +20 and the 0..4 divisor spread', () => {
    expect(MINE_SHIELD_DRAIN_BONUS).toBe(20);
    expect(MINE_SHIELD_DIVISOR_SPREAD).toBe(5);
  });
});
