/**
 * Shields must REDUCE projectile hull damage, not eliminate it.
 *
 * GEFUNCS.C:1552-1576 resolves a torpedo hit in two branches, and BOTH apply
 * hull damage — `ptr->damage += damfact` appears in each:
 *
 *   shields UP    damfact = tdammax * rndm(.5)          -> [0, 0.5) * tdammax
 *                 ptr->damage += ton_fact(damfact)
 *                 shieldhit(ptr, usrn, (gernd()%20)+10)  <- drains the shield
 *
 *   shields DOWN  damfact = tdammax * (rndm(.5)+.5)     -> [0.5, 1) * tdammax
 *                 ptr->damage += ton_fact(damfact)
 *
 * So raising shields roughly HALVES incoming projectile damage and costs shield
 * charge; it does not confer immunity.
 *
 * The port instead set `hullDamage = 0` whenever shields were up, making a
 * shielded ship completely invulnerable to torpedoes and missiles until its
 * shields collapsed, and rolled a single [0,1) factor for both cases rather than
 * the two disjoint ranges. It also fed the hull damage into shieldhit as the
 * drain percentage, where C uses an independent 10..29 roll.
 *
 * @see GEFUNCS.C:1552 torpedo hit resolution
 * @see GEFUNCS.C:2430 shieldhit — drains charge only, never applies hull damage
 */

import { rollProjectileHullDamage, SHIELD_DRAIN_MIN, SHIELD_DRAIN_SPREAD } from '../../../src/game/combat/combat-math';
import { Random } from '../../../src/game/combat/random.port';

/** Deterministic Random stub returning a fixed sequence. */
function fixedRandom(values: number[]): Random {
  let i = 0;
  return { next: () => values[i++ % values.length] } as Random;
}

const TDAMMAX = 100;

describe('projectile hull damage respects the shield branch (GEFUNCS.C:1552)', () => {
  describe('shields UP — damfact = tdammax * rndm(.5)', () => {
    it('still deals hull damage; shields are not immunity', () => {
      const dmg = rollProjectileHullDamage(fixedRandom([0.99]), TDAMMAX, 100, true);
      expect(dmg).toBeGreaterThan(0);
    });

    it('never exceeds half of tdammax', () => {
      for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
        const dmg = rollProjectileHullDamage(fixedRandom([r]), TDAMMAX, 100, true);
        expect(dmg).toBeLessThan(TDAMMAX * 0.5);
      }
    });
  });

  describe('shields DOWN — damfact = tdammax * (rndm(.5)+.5)', () => {
    it('is never below half of tdammax', () => {
      for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
        const dmg = rollProjectileHullDamage(fixedRandom([r]), TDAMMAX, 100, false);
        expect(dmg).toBeGreaterThanOrEqual(TDAMMAX * 0.5 - 1);
      }
    });

    it('never exceeds tdammax', () => {
      const dmg = rollProjectileHullDamage(fixedRandom([0.999]), TDAMMAX, 100, false);
      expect(dmg).toBeLessThanOrEqual(TDAMMAX);
    });
  });

  it('an unshielded hit always hurts at least as much as a shielded one', () => {
    for (const r of [0.1, 0.5, 0.9]) {
      const up = rollProjectileHullDamage(fixedRandom([r]), TDAMMAX, 100, true);
      const down = rollProjectileHullDamage(fixedRandom([r]), TDAMMAX, 100, false);
      expect(down).toBeGreaterThan(up);
    }
  });

  it('scales by the victim damageFactor exactly as ton_fact does', () => {
    // damageScale = 100/damageFactor, so a tougher hull (200) takes half.
    const soft = rollProjectileHullDamage(fixedRandom([0.4]), TDAMMAX, 100, false);
    const tough = rollProjectileHullDamage(fixedRandom([0.4]), TDAMMAX, 200, false);
    expect(tough).toBe(Math.floor(soft / 2));
  });

  it('exposes the C shield-drain roll range of 10..29 (gernd()%20 + 10)', () => {
    expect(SHIELD_DRAIN_MIN).toBe(10);
    expect(SHIELD_DRAIN_SPREAD).toBe(20);
  });
});
