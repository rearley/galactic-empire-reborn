/**
 * Entering hyperspace has consequences. In the port it had none.
 *
 * GEFUNCS.C:580-628 `hyperspace(ptr, usrn, flag)`:
 *
 *   flag == 1 (entering)
 *     if (shieldstat == SHIELDUP) shieldstat = SHIELDDN;   // HYSHDN
 *     if (cloak > 0)              cloak = 0;               // HYCLDN
 *     where = 1;
 *     for (i=0;i<MAXTORPS;++i) ltorps[i].distance = 0;
 *     for (i=0;i<MAXDECOY;++i) decout[i] = 0;
 *
 *   flag == 0 (leaving)
 *     where = 0;
 *
 * The port emitted a PHYSICS_HYPERSPACE event that nothing listened to, so
 * `where` was never set to 1 for a player. Every `where === 1` gate in report,
 * cloak and combat was unreachable dead code, you could run at warp with
 * shields up and cloaked, and a torpedo lock survived the jump. Hyperspace's
 * whole risk/reward — you go fast, but you go naked and you shake nothing off
 * for free — was absent.
 */

import { applyHyperspaceTransition } from '../../../src/game/physics/hyperspace';
import { ShipState } from '../../../src/game/ship/ship-state.types';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'T', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 3, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: -1, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  };
}

describe('entering hyperspace — GEFUNCS.C:588-612', () => {
  it('sets where = 1', () => {
    const s = makeShip();
    applyHyperspaceTransition(s, 'enter');
    expect(s.where).toBe(1);
  });

  it('drops raised shields', () => {
    const s = makeShip({ shieldstat: 1, shield: 70 });
    applyHyperspaceTransition(s, 'enter');
    expect(s.shieldstat).toBe(0);
  });

  it('collapses an active cloak', () => {
    const s = makeShip({ cloak: 10 });
    applyHyperspaceTransition(s, 'enter');
    expect(s.cloak).toBe(0);
  });

  it('leaves a DAMAGED cloak alone — C tests `cloak > 0`', () => {
    const s = makeShip({ cloak: -4 });
    applyHyperspaceTransition(s, 'enter');
    expect(s.cloak).toBe(-4);
  });

  it('shakes off every torpedo in flight', () => {
    const s = makeShip({ ltorpsChannel: [7, 9, 255], ltorpsDistance: [4000, 2500, 0] });
    applyHyperspaceTransition(s, 'enter');
    expect(s.ltorpsDistance).toEqual([0, 0, 0]);
  });

  it('burns off deployed decoys', () => {
    const s = makeShip({ decout: [12, 3, 0, 0, 0] });
    applyHyperspaceTransition(s, 'enter');
    expect(s.decout.every((t) => t === 0)).toBe(true);
  });

  it('does NOT clear missiles — C only zeroes torps and decoys here', () => {
    // Missiles are killed by the separate warp 4-8 check in accel
    // (GEFUNCS.C:507-523), not by the hyperspace transition.
    const s = makeShip({ lmisslChannel: [7, 255, 255], lmisslDistance: [3000, 0, 0] });
    applyHyperspaceTransition(s, 'enter');
    expect(s.lmisslDistance[0]).toBe(3000);
  });
});

describe('leaving hyperspace — GEFUNCS.C:614-626', () => {
  it('sets where = 0 and touches nothing else', () => {
    const s = makeShip({ where: 1, shieldstat: 0, cloak: 0, decout: [5, 0] });
    applyHyperspaceTransition(s, 'exit');
    expect(s.where).toBe(0);
    expect(s.decout).toEqual([5, 0]);
  });
});
