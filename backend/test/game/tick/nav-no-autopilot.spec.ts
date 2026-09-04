/**
 * The physics tick does not steer a player's ship. Nothing does.
 *
 * `nav` in canon is a read-only bearing report: cmd_navigate is argument
 * validation, `cdistance`, `cbearing`, `prfmsg(NAV01)`, return
 * (GECMDS.C:5109-5156). It never steers, never moves, never holds a course.
 * You read the bearing, you turn, you burn, you watch, you stop.
 *
 * The port had an autopilot and it produced six defects of its own — an
 * arrival test on sector membership that broke onboarding, a fixed arrival
 * shell that made arrival impossible above warp 1, undocking a captain who
 * only asked for a bearing, a bare speed order cancelling a turn, war/imp
 * lying about the course, and finally plotting courses straight through
 * planets. Withdrawn 2026-09-04.
 *
 * This file replaces nav-autopilot.integration.spec.ts and asserts the
 * absence: a ship carrying the old fields is still not steered by anything.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickKind, TickContext } from '../../../src/game/tick/tick.types';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'T', shpclass: 1, channel: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.0, ycoord: 5.0, damage: 0, energy: 65000,
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
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...over,
  } as ShipState;
}

function harness(ship: ShipState) {
  const map = new Map([[shipKey(ship.userid, ship.shipno), ship]]);
  const shipState = {
    findAllShips: () => [...map.values()],
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n)); if (s) { fn(s); s.dirty = true; } return s;
    },
  } as never;
  const subs: Array<(c: TickContext) => void> = [];
  const tickService = { subscribe: (_k: TickKind, f: (c: TickContext) => void) => { subs.push(f); return () => {}; } } as never;
  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, { maxAcceleration: 10000, maxWarp: 10 });
  const events = new EventEmitter2();
  const seen: string[] = [];
  events.onAny((name) => seen.push(String(name)));
  const svc = new PhysicsTickService(tickService, shipState, cache, events);
  svc.onModuleInit();
  let n = 0;
  return {
    seen,
    tick: (times = 1) => {
      for (let i = 0; i < times; i++) {
        for (const f of subs) f({ kind: TickKind.PHYSICS, tickNumber: ++n, firedAt: new Date() });
      }
    },
  };
}

describe('no autopilot', () => {
  it('does not steer head2b toward a stored target', () => {
    // The old fields are still on ShipState (holdcourse is canon's, for the
    // AI). Set them anyway: nothing should read them for a player.
    const ship = makeShip({
      xcoord: 5, ycoord: 5, heading: 0, head2b: 0,
      holdcourse: 1, navTargetX: 8, navTargetY: 5,
      speed: 5000, speed2b: 5000,
    });
    const h = harness(ship);
    h.tick(5);
    expect(ship.head2b).toBe(0);
  });

  it('never cuts the engines by itself', () => {
    // Arrival used to stop the ship. A pilot stops their own ship now.
    const ship = makeShip({
      xcoord: 8.4999, ycoord: 5.4999, heading: 90, head2b: 90,
      holdcourse: 1, navTargetX: 8, navTargetY: 5,
      speed: 1000, speed2b: 1000,
    });
    const h = harness(ship);
    h.tick(3);
    expect(ship.speed2b).toBe(1000);
  });

  it('emits no arrival event', () => {
    const ship = makeShip({
      xcoord: 8.5, ycoord: 5.5, holdcourse: 1, navTargetX: 8, navTargetY: 5,
      speed: 1000, speed2b: 1000,
    });
    const h = harness(ship);
    h.tick(3);
    expect(h.seen.filter((e) => e.includes('nav'))).toEqual([]);
  });

  it('still flies the ship on the heading the pilot set', () => {
    // Removing the autopilot must not remove movement.
    const ship = makeShip({ heading: 90, head2b: 90, speed: 5000, speed2b: 5000 });
    const h = harness(ship);
    h.tick(3);
    expect(ship.xcoord).toBeGreaterThan(5.0);
  });
});
