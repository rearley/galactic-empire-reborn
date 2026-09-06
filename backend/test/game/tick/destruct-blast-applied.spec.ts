/**
 * The blast is applied to everything in range when the countdown reaches zero.
 * @see GEFUNCS.C:1860-1899
 *
 * Canon's gate is `ddist < MINERANGE && (xsect != 0 || ysect != 0)` — one
 * sector's reach, and NOTHING in the neutral zone. `wptr->lastfired = -1`
 * afterwards, so a scuttle that finishes someone off credits nobody.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipManagementTickService } from '../../../src/game/commands/ship-management-tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u', shipno: 1, shipname: 'S', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 20, ycoord: 20, damage: 0, energy: 50_000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  } as ShipState;
}

function harness(ships: ShipState[]) {
  const map = new Map<string, ShipState>();
  for (const s of ships) map.set(shipKey(s.userid, s.shipno), s);
  const shipState = {
    findAllShips: () => Array.from(map.values()),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n));
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    removeFromGame: (s: { userid: string; shipno: number }) => map.delete(shipKey(s.userid, s.shipno)),
  } as unknown as ShipStateService;

  const svc = new ShipManagementTickService(
    shipState,
    { subscribe: () => () => {} } as unknown as TickService,
    new EventEmitter2(),
    50,
  );
  /** Drive the final tick of the countdown directly. */
  const detonate = (ship: ShipState) =>
    (svc as unknown as { destructTick: (s: ShipState) => void }).destructTick(ship);
  return { detonate };
}

describe('self-destruct blast (GEFUNCS.C:1860-1899)', () => {
  it('damages a neighbour inside one sector', () => {
    const bomb = makeShip({ userid: 'bomb', shipno: 1, destruct: 1, xcoord: 20, ycoord: 20 });
    const near = makeShip({ userid: 'near', shipno: 1, xcoord: 20.02, ycoord: 20 });
    const { detonate } = harness([bomb, near]);

    detonate(bomb);

    expect(near.damage).toBeGreaterThan(0);
  });

  it('leaves a ship beyond the blast untouched', () => {
    const bomb = makeShip({ userid: 'bomb', shipno: 1, destruct: 1, xcoord: 20, ycoord: 20 });
    const far = makeShip({ userid: 'far', shipno: 1, xcoord: 22, ycoord: 20 });
    const { detonate } = harness([bomb, far]);

    detonate(bomb);

    expect(far.damage).toBe(0);
  });

  it('credits nobody for the kill — lastfired is cleared', () => {
    const bomb = makeShip({ userid: 'bomb', shipno: 1, destruct: 1, xcoord: 20, ycoord: 20 });
    const near = makeShip({ userid: 'near', shipno: 1, xcoord: 20.02, ycoord: 20, lastfired: 9 });
    const { detonate } = harness([bomb, near]);

    detonate(bomb);

    expect(near.lastfired).toBe(-1);
  });

  it('does not go off in the neutral zone', () => {
    // `(xsect != 0 || ysect != 0)` — sector (0,0) is exempt.
    const bomb = makeShip({ userid: 'bomb', shipno: 1, destruct: 1, xcoord: 0.5, ycoord: 0.5 });
    const near = makeShip({ userid: 'near', shipno: 1, xcoord: 0.52, ycoord: 0.5 });
    const { detonate } = harness([bomb, near]);

    detonate(bomb);

    expect(near.damage).toBe(0);
  });

  it('a heavier hull does more damage at the same range', () => {
    const light = makeShip({ userid: 'l', shipno: 1, destruct: 1, shpclass: 1, xcoord: 20, ycoord: 20 });
    const vLight = makeShip({ userid: 'vl', shipno: 1, xcoord: 20.02, ycoord: 20 });
    harness([light, vLight]).detonate(light);

    const heavy = makeShip({ userid: 'h', shipno: 1, destruct: 1, shpclass: 9, xcoord: 20, ycoord: 20 });
    const vHeavy = makeShip({ userid: 'vh', shipno: 1, xcoord: 20.02, ycoord: 20 });
    harness([heavy, vHeavy]).detonate(heavy);

    expect(vHeavy.damage).toBeGreaterThan(vLight.damage);
  });
});
