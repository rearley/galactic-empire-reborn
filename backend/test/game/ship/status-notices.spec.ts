/**
 * State transitions the captain is told about, all of which the port performed
 * silently. @see repair-events.ts for the canon citation of each.
 *
 * One of these is a missing MECHANIC, not just a missing line: SHMINPWR was
 * defined in constants.ts and used by no production code, so shields never fell
 * for want of power at all. Canon drops them the moment energy goes under 200
 * (GEFUNCS.C:1340-1348), which is what stops a drained ship sitting shielded
 * indefinitely.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipManagementTickService } from '../../../src/game/commands/ship-management-tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import { SHMINPWR } from '../../../src/game/constants';
import {
  SHIP_STATUS_NOTICE,
  ShipStatusNoticeEvent,
} from '../../../src/game/ship/repair-events';

const CLOAK_RAMP_MID = 2;
const SHIELDUP = 1;

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u', shipno: 1, shipname: 'S', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 20, ycoord: 20, damage: 0, energy: 500_000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
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

function harness(ship: ShipState) {
  const map = new Map([[shipKey(ship.userid, ship.shipno), ship]]);
  const shipState = {
    findAllShips: () => Array.from(map.values()),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n));
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    removeFromGame: () => undefined,
  } as unknown as ShipStateService;

  const events = new EventEmitter2();
  const notices: ShipStatusNoticeEvent[] = [];
  events.on(SHIP_STATUS_NOTICE, (e: ShipStatusNoticeEvent) => notices.push(e));

  const svc = new ShipManagementTickService(
    shipState, { subscribe: () => () => {} } as unknown as TickService, events, 50,
  );
  const cloakTick = () => (svc as unknown as { cloakTick: (s: ShipState) => void }).cloakTick(ship);
  const shieldTick = () => (svc as unknown as { shieldPowerTick: (s: ShipState) => void }).shieldPowerTick(ship);
  return { notices, cloakTick, shieldTick };
}

describe('status notices (GEFUNCS.C)', () => {
  it('announces full concealment when the cloak ramp completes', () => {
    const ship = makeShip({ cloak: CLOAK_RAMP_MID });
    const { cloakTick, notices } = harness(ship);

    cloakTick();

    expect(notices.map((n) => n.notice)).toEqual(['cloak-full']);
  });

  it('says nothing on the first tick of the ramp', () => {
    const ship = makeShip({ cloak: 1 });
    const { cloakTick, notices } = harness(ship);

    cloakTick();

    expect(notices).toHaveLength(0);
  });

  it('announces a shot-out cloak finishing its repair', () => {
    const ship = makeShip({ cloak: -1 });
    const { cloakTick, notices } = harness(ship);

    cloakTick();

    expect(notices.map((n) => n.notice)).toEqual(['cloak-repaired']);
  });

  it('drops shields when energy falls under SHMINPWR, and says so', () => {
    const ship = makeShip({ shieldstat: SHIELDUP, shield: 40, energy: SHMINPWR - 1 });
    const { shieldTick, notices } = harness(ship);

    shieldTick();

    expect({ stat: ship.shieldstat, shield: ship.shield }).toEqual({ stat: 0, shield: 0 });
    expect(notices.map((n) => n.notice)).toEqual(['shields-no-power']);
  });

  it('leaves shields alone while there is power', () => {
    const ship = makeShip({ shieldstat: SHIELDUP, shield: 40, energy: SHMINPWR });
    const { shieldTick, notices } = harness(ship);

    shieldTick();

    expect(ship.shieldstat).toBe(SHIELDUP);
    expect(notices).toHaveLength(0);
  });
});

/**
 * The maintenance yard reports finishing, and reports being shot off the job.
 * @see GEFUNCS.C:422 MAINT7, :399 MAINT10
 *
 * A paid repair that is cancelled silently is the worse of the two: the captain
 * undocks believing they are repaired.
 */
describe('maintenance notices (GEFUNCS.C:399, :422)', () => {
  it('announces a completed repair', async () => {
    const { ShipTickService } = await import('../../../src/game/ship/ship-tick.service');
    const ship = makeShip({ repair: 1, damage: 3 });
    const map = new Map([[shipKey(ship.userid, ship.shipno), ship]]);
    const shipState = {
      findAllShips: () => Array.from(map.values()),
      mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
        const s = map.get(shipKey(u, n));
        if (s) { fn(s); s.dirty = true; }
        return s;
      },
    } as unknown as ShipStateService;
    const events = new EventEmitter2();
    const notices: ShipStatusNoticeEvent[] = [];
    events.on(SHIP_STATUS_NOTICE, (e: ShipStatusNoticeEvent) => notices.push(e));

    const subs: Array<{ kind: string; fn: (c: unknown) => void }> = [];
    const svc = new ShipTickService(
      { subscribe: (kind: string, fn: (c: unknown) => void) => { subs.push({ kind, fn }); return () => {}; } } as never,
      shipState, {} as never, undefined, events,
    );
    svc.onModuleInit();
    for (const sub of subs) sub.fn({ kind: sub.kind, tickNumber: 1, firedAt: new Date() });

    expect(notices.map((n) => n.notice)).toContain('maint-complete');
  });

  it('announces a repair cancelled by combat', async () => {
    const { ShipTickService } = await import('../../../src/game/ship/ship-tick.service');
    const ship = makeShip({ repair: 5, damage: 30, cantexit: 3 });
    const map = new Map([[shipKey(ship.userid, ship.shipno), ship]]);
    const shipState = {
      findAllShips: () => Array.from(map.values()),
      mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
        const s = map.get(shipKey(u, n));
        if (s) { fn(s); s.dirty = true; }
        return s;
      },
    } as unknown as ShipStateService;
    const events = new EventEmitter2();
    const notices: ShipStatusNoticeEvent[] = [];
    events.on(SHIP_STATUS_NOTICE, (e: ShipStatusNoticeEvent) => notices.push(e));

    const subs: Array<{ kind: string; fn: (c: unknown) => void }> = [];
    const svc = new ShipTickService(
      { subscribe: (kind: string, fn: (c: unknown) => void) => { subs.push({ kind, fn }); return () => {}; } } as never,
      shipState, {} as never, undefined, events,
    );
    svc.onModuleInit();
    for (const sub of subs) sub.fn({ kind: sub.kind, tickNumber: 1, firedAt: new Date() });

    expect(notices.map((n) => n.notice)).toContain('maint-interrupted');
    expect(ship.repair).toBe(0);
  });
});
