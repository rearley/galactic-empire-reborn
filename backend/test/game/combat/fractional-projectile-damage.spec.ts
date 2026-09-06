/**
 * Torpedo and missile hull damage is FRACTIONAL. The phaser's is not.
 *
 * `WARSHP.damage` is a `double` (GEMAIN.H:332, "Damage on this ship (0-100%)"),
 * and canon adds to it without a cast for both projectiles:
 *
 *   ptr->damage += damfact;              // torpedo, GEFUNCS.C:1574
 *   ptr->damage += mdammax*damfact;      // missile, GEFUNCS.C:1644, :1658
 *
 * The phaser is the deliberate exception — it truncates on the way in:
 *
 *   damage = (int)(factor);              // GECMDS.C:969, :1063
 *
 * The port floored all three. For phasers that is right; for projectiles it
 * silently deleted every hit worth less than one point. The missile is where it
 * shows: against a SHIELDED target the roll is `rndm(.1)`, so a 20,000-charge
 * missile on a 90-damfact hull earns 0.2-1.0 hull, and flooring made that ZERO
 * on almost every hit. Twenty missiles that should have taken ~8% off did
 * nothing at all.
 *
 * Reported from play: "missiles seem interesting.. even at like 3k I don't seem
 * to record hits at 20000".
 *
 * @see docs/DECISIONS.md 2026-09-06
 */

import {
  rollMissileHullDamage,
  rollProjectileHullDamage,
} from '../../../src/game/combat/combat-math';
import { Random } from '../../../src/game/combat/random.port';

const fixed = (v: number) => ({ next: () => v }) as Random;

describe('projectile hull damage keeps its fraction (GEFUNCS.C:1574, :1644)', () => {
  it('a shielded missile hit is worth a fraction, not nothing', () => {
    // factor = next * 0.1 = 0.05; charge 20000; damfact 90.
    const dmg = rollMissileHullDamage(fixed(0.5), 20_000, 90, true);

    expect(dmg).toBeGreaterThan(0);
    expect(dmg).toBeLessThan(1);
  });

  it('accumulates across a volley instead of vanishing', () => {
    const perHit = rollMissileHullDamage(fixed(0.5), 20_000, 90, true);
    expect(perHit * 20).toBeGreaterThan(5);
  });

  it('keeps the fraction on torpedoes too', () => {
    // TDAMMAX 35, factor 0.05, damfact 90 -> 1.94, not 1.
    const dmg = rollProjectileHullDamage(fixed(0.1), 35, 90, true);

    expect(dmg).toBeGreaterThan(1.9);
    expect(dmg).toBeLessThan(2);
  });

  it('still scales with the charge carried', () => {
    const small = rollMissileHullDamage(fixed(0.5), 5_000, 90, true);
    const large = rollMissileHullDamage(fixed(0.5), 40_000, 90, true);

    expect(large).toBeGreaterThan(small * 7);
  });

  it('an unshielded missile hit still lands properly', () => {
    const dmg = rollMissileHullDamage(fixed(0.5), 20_000, 90, false);
    expect(dmg).toBeGreaterThan(4);
  });
});
