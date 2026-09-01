/**
 * `shieldhit` has THREE outcomes in C, and the port collapsed two of them.
 *
 * GEFUNCS.C:2453-2469:
 *
 *   wptr->shield -= knock;
 *   if (wptr->shield <= 2)              // shields BLOWN
 *     { prfmsg(SHDAMAG);
 *       wptr->shieldstat = SHIELDDM;    //   ... into the DAMAGED state
 *       wptr->shield -= (knock*3); }    //   ... and take a further beating
 *   else if (wptr->shield < SHMINCHG)   // shields merely WARNED
 *     { prfmsg(SHKNKDN); }              //   ... and stay UP
 *
 * The port returned one `knockedDown` boolean for both branches and every
 * caller responded `shieldstat = 0` — plain "down". Two consequences:
 *
 *   1. shields failed two charge points early (at < SHMINCHG rather than <= 2);
 *   2. they failed into a state the pilot could re-raise instantly, instead of
 *      SHIELDDM, which `shi up` refuses (GECMDS.C:3145) and only the repair
 *      climb in ShipTickService clears.
 *
 * So the shieldrep path was unreachable from combat and sustained phaser
 * pressure — the defining Cybertron and PvP tactic — bought nothing.
 *
 * @see GEFUNCS.C:2430 shieldhit  @see GEMAIN.H:159-161 SHIELDUP/DN/DM
 */

import { shieldhit } from '../../../src/game/combat/combat-math';
import { SHMINCHG, SHIELDDM } from '../../../src/game/constants';

describe('shieldhit returns a three-way outcome', () => {
  it('reports "none" while the shield is comfortably charged', () => {
    // type 1: dmax = 76, knock = 76, 200 -> 124
    expect(shieldhit(200, 1, 100).outcome).toBe('none');
  });

  it('reports "warned" — and leaves the shield UP — between 3 and SHMINCHG', () => {
    // type 20 drains nothing, so charge stays put at 4: > 2 but < SHMINCHG(5)
    const r = shieldhit(4, 20, 100);
    expect(r.outcome).toBe('warned');
    expect(r.newCharge).toBe(4);
  });

  it('reports "damaged" only once charge falls to 2 or below', () => {
    expect(shieldhit(2, 20, 100).outcome).toBe('damaged');
  });

  it('SHMINCHG alone does not blow the shield — 3 and 4 only warn', () => {
    for (const charge of [3, 4]) {
      expect(shieldhit(charge, 20, 100).outcome).toBe('warned');
    }
    expect(SHMINCHG).toBe(5);
  });

  it('a blown shield takes a further knock*3 on the way down', () => {
    // type 1: dmax = 76, knock = 76. 10 - 76 = -66, then -66 - 228 = -294
    const r = shieldhit(10, 1, 100);
    expect(r.outcome).toBe('damaged');
    expect(r.newCharge).toBe(-294);
    expect(r.shieldConsumed).toBe(76);
  });

  it('exposes SHIELDDM as the state a blown shield lands in', () => {
    // The repair climb in ShipTickService keys off this value; it is not 0.
    expect(SHIELDDM).toBe(3);
  });
});

/**
 * `shieldup()` (GEFUNCS.C:2409-2415) grants no charge — it only flips
 * `shieldstat`. Every hit resolution in C then branches solely on
 * `shieldstat != SHIELDUP` (GECMDS.C:986), so a shield raised on an empty
 * capacitor still absorbs the next hit in full, and blows on it.
 *
 * The port ANDed in `shield > 0`, so a defender who had just raised shields,
 * or who was pinned at 0 charge, ate full hull damage as though bare-hulled.
 */
describe('a raised shield absorbs even at zero charge', () => {
  it('the first hit is absorbed, and blows the shield into SHIELDDM', () => {
    // type 1 at 0 charge: knock = 76, newCharge = -76 <= 2 -> damaged
    const r = shieldhit(0, 1, 100);
    expect(r.hullDamage).toBe(0);
    expect(r.outcome).toBe('damaged');
  });
});
