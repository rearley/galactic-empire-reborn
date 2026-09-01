/**
 * Ion cannons are a planet's teeth.
 *
 * GEFUNCS.C:1785-1812 `fireion`, called for every ship on each 6-second
 * `warrtia` pass (GEMAIN.C:2265):
 *
 *   if (ptr->hostile > 1) {
 *     plnum = ptr->hostile - 10;
 *     if (plptr->items[I_IONCANNON].qty > 0) {
 *       ptr->lastfired = -1;
 *       if (ptr->shieldstat == SHIELDUP) {
 *         ptr->damage += (idammax * rndm(.15));
 *         shieldhit(ptr, usrn, (gernd()%50)+40);
 *       } else {
 *         ptr->damage += (idammax * (rndm(.50) + .50));
 *       }
 *     }
 *   }
 *
 * None of this existed in the port. Ion cannons were a tradeable item with no
 * effect, there was no reason to garrison a colony, and `hostile` — which
 * `fireion` is the sole consumer of — was written nowhere and read nowhere.
 *
 * `lastfired = -1` matters: a pilot killed by a planet's guns hands the kill
 * to nobody.
 */

import { resolveIonCannonHit, ION_SHIELD_KNOCK_MIN, ION_SHIELD_KNOCK_SPREAD } from '../../../src/game/planet/ion-cannon';
import { IDAMMAX } from '../../../src/game/constants';
import { Random } from '../../../src/game/combat/random.port';

const fixed = (v: number) => ({ next: () => v }) as Random;

describe('resolveIonCannonHit — GEFUNCS.C:1793-1808', () => {
  describe('against raised shields', () => {
    it('scratches the hull — at most 15% of IDAMMAX', () => {
      for (const r of [0, 0.5, 0.999]) {
        expect(resolveIonCannonHit(fixed(r), true).hullDamage).toBeLessThan(IDAMMAX * 0.15);
      }
    });

    it('knocks the shield by 40..89', () => {
      const lo = resolveIonCannonHit(fixed(0), true).shieldKnock;
      const hi = resolveIonCannonHit(fixed(0.999), true).shieldKnock;
      expect(lo).toBe(ION_SHIELD_KNOCK_MIN);
      expect(hi).toBe(ION_SHIELD_KNOCK_MIN + ION_SHIELD_KNOCK_SPREAD - 1);
    });
  });

  describe('against a bare hull', () => {
    it('hits for half to all of IDAMMAX', () => {
      expect(resolveIonCannonHit(fixed(0), false).hullDamage).toBe(Math.floor(IDAMMAX * 0.5));
      expect(resolveIonCannonHit(fixed(0.999), false).hullDamage).toBeLessThanOrEqual(IDAMMAX);
      expect(resolveIonCannonHit(fixed(0.999), false).hullDamage).toBeGreaterThanOrEqual(IDAMMAX * 0.9);
    });

    it('does not knock a shield that is not up', () => {
      expect(resolveIonCannonHit(fixed(0.5), false).shieldKnock).toBe(0);
    });
  });

  it('is far more dangerous with shields down than up', () => {
    const up = resolveIonCannonHit(fixed(0.9), true).hullDamage;
    const down = resolveIonCannonHit(fixed(0.9), false).hullDamage;
    expect(down).toBeGreaterThan(up * 4);
  });

  it('always clears kill credit — a planet kill belongs to nobody', () => {
    expect(resolveIonCannonHit(fixed(0.5), true).clearsKillCredit).toBe(true);
    expect(resolveIonCannonHit(fixed(0.5), false).clearsKillCredit).toBe(true);
  });
});
