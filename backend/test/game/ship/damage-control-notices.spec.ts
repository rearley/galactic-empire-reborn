/**
 * Damage Control announces a system coming back online.
 *
 *   if (ptr->tactical < 0) { ++ptr->tactical; if (ptr->tactical == 0) prfmsg(TAREPR); }
 *   if (ptr->helm < 0)     { ++ptr->helm;     if (ptr->helm == 0)     prfmsg(HLREPR); }
 *   if (ptr->firecntl > 0) { --ptr->firecntl; if (ptr->firecntl == 0) prfmsg(FCREPR); }
 *   if (ptr->phasr < 0)    { ++ptr->phasr;    if (ptr->phasr == 0)    prfmsg(PHREPR); }
 *
 * @see GEFUNCS.C:1016-1080 checkdam
 *
 * The port implemented every one of these recoveries and announced none of
 * them. After a fight that knocked out the helm, tactical display or fire
 * control, a captain got the BROKE refusals when they tried to use the system
 * — those are implemented — but was never told when it came back. The only way
 * to find out was to keep retrying the command until it stopped failing.
 *
 * The message fires exactly ONCE, on the tick the counter reaches zero, not on
 * every tick of the recovery.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipTickService } from '../../../src/game/ship/ship-tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import {
  SHIP_SYSTEM_REPAIRED,
  ShipSystemRepairedEvent,
} from '../../../src/game/ship/repair-events';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u', shipno: 1, shipname: 'S', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 20, ycoord: 20, damage: 0, energy: 500_000,
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

function harness(ship: ShipState) {
  const map = new Map([[shipKey(ship.userid, ship.shipno), ship]]);
  const shipState = {
    findAllShips: () => Array.from(map.values()),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n));
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
  } as unknown as ShipStateService;

  const subs: Array<{ kind: TickKind; fn: (c: TickContext) => void }> = [];
  const tickService = {
    subscribe: (kind: TickKind, fn: (c: TickContext) => void) => { subs.push({ kind, fn }); return () => {}; },
  } as unknown as TickService;

  const events = new EventEmitter2();
  const repaired: ShipSystemRepairedEvent[] = [];
  events.on(SHIP_SYSTEM_REPAIRED, (e: ShipSystemRepairedEvent) => repaired.push(e));

  const svc = new ShipTickService(
    tickService, shipState,
    {} as never,          // maintenanceService
    undefined,            // planets
    events,
  );
  svc.onModuleInit();

  const tick = () => {
    const ctx = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() } as TickContext;
    for (const s of subs) if (s.kind === TickKind.PHYSICS) s.fn(ctx);
  };
  return { tick, repaired };
}

describe('Damage Control notices (GEFUNCS.C:1016-1080)', () => {
  it('announces the tactical display coming back', () => {
    const ship = makeShip({ tactical: -1 });
    const { tick, repaired } = harness(ship);

    tick();

    expect(repaired.map((r) => r.system)).toEqual(['tactical']);
  });

  it('announces the helm coming back', () => {
    const ship = makeShip({ helm: -1 });
    const { tick, repaired } = harness(ship);

    tick();

    expect(repaired.map((r) => r.system)).toEqual(['helm']);
  });

  it('announces fire control coming back', () => {
    const ship = makeShip({ firecntl: 1 });
    const { tick, repaired } = harness(ship);

    tick();

    expect(repaired.map((r) => r.system)).toEqual(['firecntl']);
  });

  it('announces a shot-out phaser bank coming back', () => {
    const ship = makeShip({ phasr: -1 });
    const { tick, repaired } = harness(ship);

    tick();

    expect(repaired.map((r) => r.system)).toEqual(['phaser']);
  });

  it('says nothing while the system is still recovering', () => {
    // -3 needs three ticks; only the last one is an announcement.
    const ship = makeShip({ helm: -3 });
    const { tick, repaired } = harness(ship);

    tick();
    tick();

    expect(repaired).toHaveLength(0);

    tick();

    expect(repaired.map((r) => r.system)).toEqual(['helm']);
  });

  it('says nothing for a system that was never damaged', () => {
    const ship = makeShip();
    const { tick, repaired } = harness(ship);

    tick();

    expect(repaired).toHaveLength(0);
  });
});
