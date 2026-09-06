/**
 * A missile's stored charge is an ENERGY value (1..50000), not a damage cap.
 *
 * GEFUNCS.C:1620-1660 resolves a missile hit as:
 *
 *   damfact = mptr->energy;
 *   damfact = ton_fact(ptr,damfact);    // divide by the hull's damfact/100
 *   mptr->energy = damfact;
 *
 *   shields UP    damfact = damfact/50000.0;
 *                 damfact = damfact * rndm(.1);        -> [0, 0.1)
 *                 ptr->damage += mdammax*damfact;
 *                 power = mptr->energy/999;
 *                 power = power * (rndm(.5)+.5);
 *                 shieldhit(ptr,usrn,power);
 *
 *   shields DOWN  damfact = damfact/50000.0;
 *                 damfact = damfact * (rndm(.5)+.5);   -> [0.5, 1)
 *                 ptr->damage += mdammax*damfact;
 *
 * `mdammax` is numopt(MDAMMAX,1,100) — clamped to 100 (GEMAIN.C:511). So the
 * hardest a missile can ever hit is 100 hull damage, and a full-charge 50000
 * missile is the only one that reaches it.
 *
 * The port passed the raw charge straight in as `dmgMax`, so a 20000-charge
 * missile rolled up to 20000 hull damage — roughly 200x the ceiling, and an
 * instant kill on anything in the game.
 *
 * @see GEFUNCS.C:1620-1660  @see GEMAIN.C:511 mdammax = numopt(MDAMMAX,1,100)
 */

import { rollMissileHullDamage, missileShieldDrain } from '../../../src/game/combat/combat-math';
import { MDAMMAX } from '../../../src/game/constants';
import { Random } from '../../../src/game/combat/random.port';

function fixedRandom(values: number[]): Random {
  let i = 0;
  return { next: () => values[i++ % values.length] } as Random;
}

const MAX_CHARGE = 50000;

describe('missile hull damage is normalised against the 50000 charge scale', () => {
  it('a full-charge missile with shields down never exceeds MDAMMAX', () => {
    const dmg = rollMissileHullDamage(fixedRandom([0.999]), MAX_CHARGE, 100, false);
    expect(dmg).toBeLessThanOrEqual(MDAMMAX);
  });

  it('a mid-charge missile does not one-shot a healthy hull', () => {
    // The exploit: 20000 charge used to roll up to 20000 hull damage.
    const dmg = rollMissileHullDamage(fixedRandom([0.999]), 20000, 100, false);
    expect(dmg).toBeLessThanOrEqual(MDAMMAX * 0.4);
  });

  it('damage is linear in charge', () => {
    const half = rollMissileHullDamage(fixedRandom([0.6]), MAX_CHARGE / 2, 100, false);
    const full = rollMissileHullDamage(fixedRandom([0.6]), MAX_CHARGE, 100, false);
    expect(half).toBe(Math.floor(full / 2));
  });

  it('shields UP uses rndm(.1), not the torpedo rndm(.5)', () => {
    // Worst case through shields is under a tenth of the ceiling.
    for (const r of [0, 0.5, 0.999]) {
      const dmg = rollMissileHullDamage(fixedRandom([r]), MAX_CHARGE, 100, true);
      expect(dmg).toBeLessThan(MDAMMAX * 0.1);
    }
  });

  it('shields DOWN is at least half the ceiling at full charge', () => {
    const dmg = rollMissileHullDamage(fixedRandom([0]), MAX_CHARGE, 100, false);
    expect(dmg).toBeGreaterThanOrEqual(MDAMMAX * 0.5 - 1);
  });

  it('scales by the victim damageFactor exactly as ton_fact does', () => {
    const soft = rollMissileHullDamage(fixedRandom([0.4]), MAX_CHARGE, 100, false);
    const tough = rollMissileHullDamage(fixedRandom([0.4]), MAX_CHARGE, 200, false);
    // CORRECTION 2026-09-06: was `Math.floor(soft / 2)`, which only held while
    // the damage was floored. Canon adds missile damage to a double uncast
    // (`ptr->damage += mdammax*damfact`, GEFUNCS.C:1644), so the ratio is exact.
    expect(tough).toBeCloseTo(soft / 2, 10);
  });
});

describe('missile shield drain is charge-derived, not the torpedo 10..29 roll', () => {
  it('is energy/999 scaled by rndm(.5)+.5', () => {
    // C: power = energy/999; power *= (rndm(.5)+.5)
    expect(missileShieldDrain(fixedRandom([0]), MAX_CHARGE, 100)).toBe(
      Math.floor((MAX_CHARGE / 999) * 0.5),
    );
  });

  it('a small missile drains far less shield than a full-charge one', () => {
    const small = missileShieldDrain(fixedRandom([0.5]), 1000, 100);
    const big = missileShieldDrain(fixedRandom([0.5]), MAX_CHARGE, 100);
    expect(small).toBeLessThan(big);
  });
});
