/**
 * Gravity does not reach you at warp, and never touches an AI ship.
 *
 * `moveship` calls it under one condition:
 *
 *     \/* Cybertrons ignore gravity *\/
 *     if (ptr->where == 0 && ptr->status == GESTAT_USER)
 *         gravity(ptr,usrn);
 *
 * (GEFUNCS.C:794-795.) `where == 0` is normal space; `where == 1` is
 * hyperspace, i.e. at warp. **Canon never runs the gravity check while you are
 * warping, so you cannot fly into a planet at warp.** The comment above the
 * line says the other half out loud: AI ships are exempt too.
 *
 * The port called `gravity()` on every move with neither condition, and cited
 * these exact lines while doing it. Two consequences, both observed in round 5:
 * two players independently flew into planets at warp — three deaths between
 * them — after `nav` plotted a course through one; and every Cybertron and
 * droid was subject to a pull canon exempts them from.
 *
 * The 250/50/25 warning ladder cannot save anyone at speed: a ship covers 1,385
 * raw units per tick at warp 9, so it crosses all three bands and the kill
 * threshold inside a single tick. That is precisely why canon does not run the
 * check there at all.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { PHYSICS_GRAVITY } from '../../../src/game/physics/physics-events';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickKind, TickContext } from '../../../src/game/tick/tick.types';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'T', shpclass: 1, channel: 1,
    heading: 90, head2b: 90, speed: 3000, speed2b: 3000,
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

/** A planet sitting exactly where the ship will be after one tick. */
function harness(ship: ShipState) {
  const map = new Map([[shipKey(ship.userid, ship.shipno), ship]]);
  const shipState = {
    findAllShips: () => [...map.values()],
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n)); if (s) { fn(s); s.dirty = true; } return s;
    },
  } as never;
  const subs: Array<{ k: TickKind; f: (c: TickContext) => void }> = [];
  const tickService = { subscribe: (k: TickKind, f: (c: TickContext) => void) => { subs.push({ k, f }); return () => {}; } } as never;
  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, { maxAcceleration: 3000, maxWarp: 10 });
  const events = new EventEmitter2();
  const seen: unknown[] = [];
  events.on(PHYSICS_GRAVITY, (e) => seen.push(e));
  const galaxy = {
    getGravityBodies: () => [{ plnum: 1, xcoord: ship.xcoord, ycoord: ship.ycoord, isWormhole: false }],
  } as never;
  const svc = new PhysicsTickService(tickService, shipState, cache, events, galaxy);
  svc.onModuleInit();
  return {
    seen,
    tick: () => {
      // One canon MOVEMENT STEP is three seconds: warrti2a runs on the
      // 1-second timer and strides the fleet by 3, so each ship rotates,
      // accelerates and moves once per three ticks (GEMAIN.C:2462-2493).
      // Firing three advances every ship exactly once, whichever third it
      // belongs to. This fired once and relied on the ship being first in the
      // list — which stopped being true when the stride moved onto the ship's
      // own channel, as canon's `zothusn` always was.
      for (let i = 0; i < 3; i++) {
        for (const s of subs) if (s.k === TickKind.SHIP_UPDATE) s.f({ kind: TickKind.SHIP_UPDATE, tickNumber: i + 1, firedAt: new Date() });
      }
    },
  };
}

describe('gravity is gated exactly as moveship gates it', () => {
  it('pulls a player flying in NORMAL SPACE', () => {
    const h = harness(makeShip({ where: 0, status: 1 }));
    h.tick();
    expect(h.seen.length).toBeGreaterThan(0);
  });

  it('does NOT reach a player at warp — where === 1', () => {
    // The whole point: you cannot fly into a planet at warp in the original.
    const h = harness(makeShip({ where: 1, status: 1 }));
    h.tick();
    expect(h.seen).toEqual([]);
  });

  it('does NOT touch an AI ship — "Cybertrons ignore gravity"', () => {
    const h = harness(makeShip({ where: 0, status: 2 }));
    h.tick();
    expect(h.seen).toEqual([]);
  });

  it('leaves a warping ship undamaged where a coasting one would die', () => {
    const warping = makeShip({ where: 1, status: 1 });
    const hw = harness(warping);
    hw.tick();
    expect(warping.damage).toBe(0);
  });
});
