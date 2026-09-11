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
import { makeShip as baseMakeShip } from '../../helpers/make-ship';
import { canonMaxWarp } from '../../helpers/canon-max-warp';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'u',
    shipname: 'S',
    xcoord: 5,
    ycoord: 5,
    energy: 50_000,
    phasr: 500,
    phasrtype: 2,
    percent: 1,
    items: new Array(NUMITEMS).fill(0n),
    topspeed: canonMaxWarp(over.shpclass ?? 1),
    channel: over.channel ?? over.shipno ?? 1,
    ...over,
  });
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
