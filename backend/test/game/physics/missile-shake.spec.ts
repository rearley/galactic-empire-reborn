/**
 * Crossing a warp boundary shakes off missiles locked onto you.
 *
 * Inside accel's non-snap accelerate branch, after the energy debit succeeds
 * and only when the ship crosses an INTEGER warp boundary:
 *
 *     if ((ptr->speed + accelrate)/1000 >= (4 + gernd()%4))
 *       { for each lmissl: distance = 0; ... prfmsg(MISSL2); }
 *
 * (GEFUNCS.C:497-521.) The threshold is redrawn every crossing, so warp 4 works
 * a quarter of the time and warp 7 always. This is "jump to warp to break a
 * missile lock" — the counter to guided weapons, and it was not implemented at
 * all: `missileShakeWarp()` existed as a helper with no caller.
 *
 * MISSL2: "The missile tracking us has lost lockon and self destructed Sir!"
 * @see GE/REL/MBMGEMSG.MSG:2630
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { SHIP_MISSILE_SHAKEN } from '../../../src/game/physics/speed-events';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickKind, TickContext } from '../../../src/game/tick/tick.types';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Runner', shpclass: 1, channel: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 65000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: -1,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...over,
  } as ShipState;
}

/**
 * `roll` fixes gernd()%4, so the threshold is `4 + roll`.
 *
 * gernd is `floor(next * 65536)` and 65536 is divisible by 4, so a fraction
 * like 0.875 lands on a multiple of 4 and always gives roll 0 — the first
 * version of this harness could not express roll 3 at all. Dividing the roll
 * BY 65536 makes gernd return the roll itself.
 */
function harness(ships: ShipState[], roll: number) {
  const map = new Map(ships.map((s) => [shipKey(s.userid, s.shipno), s]));
  const shipState = {
    findAllShips: () => [...map.values()],
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n)); if (s) { fn(s); s.dirty = true; } return s;
    },
  } as never;
  const subs: Array<(c: TickContext) => void> = [];
  const tickService = { subscribe: (_k: TickKind, f: (c: TickContext) => void) => { subs.push(f); return () => {}; } } as never;
  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, { maxAcceleration: 2000, maxWarp: 10 });
  const events = new EventEmitter2();
  const shaken: unknown[] = [];
  events.on(SHIP_MISSILE_SHAKEN, (e) => shaken.push(e));
  const random = { next: () => roll / 65536 };
  const svc = new PhysicsTickService(tickService, shipState, cache, events, undefined, random);
  svc.onModuleInit();
  let n = 0;
  return {
    shaken,
    tick: () => { const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: ++n, firedAt: new Date() }; for (const f of subs) f(ctx); },
  };
}

describe('missile shake on crossing a warp boundary', () => {
  it('clears every locked missile and reports it once', () => {
    // 3900 -> 5900 crosses warp 3 into warp 5; threshold 4 + 0 = 4.
    const ship = makeShip({
      speed: 3900, speed2b: 9000,
      lmisslChannel: [7, 8], lmisslDistance: [4000, 2500], lmisslEnergy: [10, 10],
    });
    const h = harness([ship], 0);
    h.tick();
    expect(ship.lmisslDistance).toEqual([0, 0]);
    expect(h.shaken).toHaveLength(1);
  });

  it('says nothing when no missile was tracking you', () => {
    const ship = makeShip({ speed: 3900, speed2b: 9000 });
    const h = harness([ship], 0);
    h.tick();
    expect(h.shaken).toEqual([]);
  });

  it('does not shake below the drawn threshold', () => {
    // Same crossing into warp 5, but the draw asks for warp 7.
    const ship = makeShip({
      speed: 3900, speed2b: 9000,
      lmisslChannel: [7], lmisslDistance: [4000], lmisslEnergy: [10],
    });
    const h = harness([ship], 3);
    h.tick();
    expect(ship.lmisslDistance).toEqual([4000]);
    expect(h.shaken).toEqual([]);
  });

  it('does not shake when the tick stays inside one warp band', () => {
    // 5100 -> 5600: no integer crossing, so canon never reaches the test.
    const ship = makeShip({
      speed: 5100, speed2b: 5600,
      lmisslChannel: [7], lmisslDistance: [4000], lmisslEnergy: [10],
    });
    const h = harness([ship], 0);
    h.tick();
    expect(ship.lmisslDistance).toEqual([4000]);
  });
});
