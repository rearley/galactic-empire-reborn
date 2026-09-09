/**
 * When shields fall for want of power, the pilot must be TOLD.
 *
 *   if (ptr->shieldstat == SHIELDUP)
 *     if (ptr->energy < SHMINPWR) {
 *         ptr->shieldstat = SHIELDDN;
 *         ptr->shield = 0;
 *         prfmsg(SHDNNOP);            <-- "Shields have come down due to
 *         outprfge(ALWAYS,usrn);           lack of power, Sir!!!"
 *     } else shieldchg(ptr,usrn);
 *   @see GEFUNCS.C:1340-1348 shieldstat, MBMGEMSG.MSG:2306 SHDNNOP
 *
 * Canon has ONE implementation of this rule and it always narrates. The port
 * grew two, both on the 6-second tick:
 *
 *   ShipManagementTickService.shieldPowerTick — drops AND emits the notice
 *   ShipTickService.processRestorativeTick               — drops SILENTLY
 *
 * Whichever ran first won, and the loser then saw `shieldstat !== SHIELDUP`
 * and returned. So the outcome depended on module init order, and when the
 * silent one went first the pilot lost their shields with nothing on screen —
 * the exact failure the port has already fixed for firing a torpedo
 * (torpedo.handler.ts) and for the charge climb (SHLDAT/SHLDUP).
 *
 * One owner now: ShipManagementTickService. ShipTickService still refuses to
 * CHARGE below SHMINPWR, which is the other half of canon's branch, but it no
 * longer drops.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipTickService } from '../../../src/game/ship/ship-tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import { SHMINPWR } from '../../../src/game/constants';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Runner', shpclass: 1, channel: 3,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 100,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 4, shieldstat: 1, shield: 40, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  } as ShipState;
}

function harness(ship: ShipState) {
  const map = new Map([[shipKey(ship.userid, ship.shipno), ship]]);
  const shipState = {
    findAllShips: () => [...map.values()],
    get: (u: string, n: number) => map.get(shipKey(u, n)),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n));
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
  } as unknown as ShipStateService;

  const events = new EventEmitter2();
  const svc = new ShipTickService(
    { subscribe: () => () => {} } as never,
    shipState,
    {} as never,
    undefined,
    events,
  );
  return { svc, ship, events };
}

const processOne = (svc: ShipTickService, ship: ShipState) =>
  (svc as unknown as { processRestorativeTick: (s: ShipState) => void }).processRestorativeTick(ship);

describe('shields falling for want of power belong to ONE owner', () => {
  it('ShipTickService does not silently drop them out from under the pilot', () => {
    // Below SHMINPWR with shields up. If this service drops them here, the
    // service that would have narrated it finds nothing left to report.
    const { svc, ship } = harness(makeShip({ energy: SHMINPWR - 1, shieldstat: 1 }));

    processOne(svc, ship);

    expect(ship.shieldstat).toBe(1);
  });

  it('and does not CHARGE them below the power floor either — canon branches', () => {
    // The other half of GEFUNCS.C:1340-1348: shieldchg runs only in the else.
    const { svc, ship } = harness(makeShip({ energy: SHMINPWR - 1, shieldstat: 1, shield: 10 }));
    const before = ship.shield;

    processOne(svc, ship);

    expect(ship.shield).toBe(before);
  });

  it('still charges normally when there is power', () => {
    const { svc, ship } = harness(makeShip({ energy: 50_000, shieldstat: 1, shield: 10 }));

    processOne(svc, ship);

    // shieldchg adds shieldtype*3 = 12. @see GEFUNCS.C:2510
    expect(ship.shield).toBe(22);
  });
});
