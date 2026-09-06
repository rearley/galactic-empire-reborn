/**
 * Scuttling a ship damages everything near it.
 *
 *   ddist = cdistance(&ptr->coord,&wptr->coord); ddist *= 10000;
 *   if (ddist < MINERANGE && (xsect != 0 || ysect != 0)) {
 *       ddist = 1.0-(ddist/DESTRUCTRANGE);
 *       if (ddist < 0) ddist = 0;
 *       ddist = ddist*ddist*ddist;
 *       if (shieldstat == SHIELDUP) {
 *           damage = ddist*minedammax;
 *           damage = damage*((ptr->shpclass/2)+1);
 *           damage = damage/(gernd()%5+wptr->shieldtype);
 *           ... SELFD6 ... shieldhit(wptr,zothusn,damage+20);
 *       } else {
 *           damage = ddist*minedammax;
 *           damage = damage*((ptr->shpclass/2)+1);
 *           ... SELFD7 ...
 *       }
 *       wptr->damage += damage;
 *       wptr->lastfired = -1;
 *   }
 *
 * @see GEFUNCS.C:1860-1899 destruct
 *
 * The port implemented none of it: DESTRUCTRANGE was defined in constants.ts
 * and referenced by no production code, so a captain could scuttle inside a
 * hostile formation and nobody felt it.
 *
 * Note what the damage scales with — the CLASS OF THE SHIP BLOWING UP, not the
 * victim's. Ramming a fight in a big hull is the point of the mechanic, and it
 * is why this is not simply `mineFalloff` under another name: that function
 * scales by the VICTIM's damageFactor instead.
 *
 * `wptr->lastfired = -1` means no kill credit: a scuttle that finishes someone
 * off scores nothing for anyone.
 */
import { destructBlastDamage } from '../../../src/game/combat/combat-math';
import { MINEDAMMAX, DESTRUCTRANGE } from '../../../src/game/constants';

describe('destructBlastDamage (GEFUNCS.C:1871-1893)', () => {
  it('is hardest at point blank', () => {
    const atZero = destructBlastDamage(0, 1, false, 0, 0);
    const atHalf = destructBlastDamage(DESTRUCTRANGE / 2, 1, false, 0, 0);

    expect(atZero).toBeGreaterThan(atHalf);
  });

  it('falls off with the CUBE of distance, not linearly', () => {
    // At half range the linear term is 0.5, so a cubic law gives 0.125 of the
    // point-blank figure — an eighth, not a half.
    const atZero = destructBlastDamage(0, 1, false, 0, 0);
    const atHalf = destructBlastDamage(DESTRUCTRANGE / 2, 1, false, 0, 0);

    expect(atHalf).toBe(Math.floor(atZero * 0.125));
  });

  it('reaches zero at the edge of the blast', () => {
    expect(destructBlastDamage(DESTRUCTRANGE, 1, false, 0, 0)).toBe(0);
  });

  it('scales with the class of the ship blowing up', () => {
    // `damage * ((ptr->shpclass/2)+1)` — integer division, so class 5 gives 3x.
    const small = destructBlastDamage(0, 1, false, 0, 0);
    const large = destructBlastDamage(0, 5, false, 0, 0);

    expect(large).toBe(small * 3);
  });

  it('point blank in a class-1 hull is MINEDAMMAX', () => {
    expect(destructBlastDamage(0, 1, false, 0, 0)).toBe(MINEDAMMAX * 1);
  });

  it('shields divide the damage by gernd()%5 + shieldtype', () => {
    // roll 0, shieldtype 2 -> divisor 2.
    const bare = destructBlastDamage(0, 1, false, 0, 0);
    const shielded = destructBlastDamage(0, 1, true, 2, 0);

    expect(shielded).toBe(Math.floor(bare / 2));
  });

  it('a bigger roll softens the blow further', () => {
    const roll0 = destructBlastDamage(0, 1, true, 1, 0);
    const roll4 = destructBlastDamage(0, 1, true, 1, 4);

    expect(roll4).toBe(Math.floor(roll0 / 5));
  });
});
