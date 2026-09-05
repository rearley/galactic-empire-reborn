/**
 * "Phasers fired — no targets in arc" must not be said when there WAS a target
 * in the arc.
 *
 * Live play, 2026-09-04: a Mark-2 Interceptor lined a Sarten Attack Drone up at
 * bearing 0, range 1.2, and fired. The drone was at speed 6939 with where=1, so
 * `firep`'s hyperspace gate excluded it — `wptr->where != 1 || ptr->phasrtype
 * >= phatowrp` (GECMDS.C:949), and PHATOWRP is 5. The refusal was correct. The
 * MESSAGE was not: the target was dead ahead and inside the cone.
 *
 * Canon prints no summary at all here — `firep` prints PFIRED and then says
 * nothing when nothing connects (MBMGEMSG.MSG has PFIRED and no counterpart).
 * The summary line is this port's invention, which is fine, but an invented
 * line that states something false is worse than canon's silence.
 *
 * So the two cases are separated. Nothing in the cone still reads as an empty
 * arc; a target in the cone that the phaser cannot reach says so instead.
 */
import { selectPhaserVictims } from '../../../src/game/combat/firep';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS, PHATOWRP } from '../../../src/game/constants';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u', shipno: 1, shipname: 'S', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 50_000,
    phasr: 500, phasrtype: 2, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 1, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 8_000, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
    channel: over.channel ?? over.shipno ?? 1,
  } as ShipState;
}

const sweep = (firer: ShipState, ships: ShipState[]) =>
  selectPhaserVictims({
    firer, allShips: ships, degree: 0, focus: 1, phasrCharge: firer.phasr,
    scanRange: 400_000, maxTonsFor: () => 1_000,
  });

/** Dead ahead: heading 0 points toward decreasing y. */
const AHEAD = { xcoord: 5, ycoord: 4.8 };

describe('why a phaser volley connected with nothing', () => {
  it('reports a target that was in the arc but at warp, separately from an empty arc', () => {
    const firer = makeShip({ phasrtype: PHATOWRP - 1 });
    const runner = makeShip({ userid: 'v', shipno: 2, ...AHEAD, where: 1, speed: 6939 });

    const result = sweep(firer, [firer, runner]);

    expect(result.victims).toHaveLength(0);
    expect(result.unreachableAtWarp).toBe(1);
  });

  it('an empty cone is still an empty cone', () => {
    const firer = makeShip();
    // Directly astern.
    const behind = makeShip({ userid: 'v', shipno: 2, xcoord: 5, ycoord: 5.2 });

    const result = sweep(firer, [firer, behind]);

    expect(result.victims).toHaveLength(0);
    expect(result.unreachableAtWarp).toBe(0);
  });

  it('counts nothing as unreachable once the phaser is good enough', () => {
    const firer = makeShip({ phasrtype: PHATOWRP });
    const runner = makeShip({ userid: 'v', shipno: 2, ...AHEAD, where: 1, speed: 6939 });

    const result = sweep(firer, [firer, runner]);

    expect(result.victims).toHaveLength(1);
    expect(result.unreachableAtWarp).toBe(0);
  });
});
