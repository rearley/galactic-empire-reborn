import { EventEmitter2 } from '@nestjs/event-emitter';
import { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';

function makeShip(userid: string, shipno: number): ShipState {
  return {
    userid, shipno, shipname: `S${userid}${shipno}`, shpclass: 1,
    heading: 90, head2b: 90, speed: 1500, speed2b: 1500,
    xcoord: 5 + (shipno % 10) * 0.1, ycoord: 5 + (shipno % 5) * 0.1,
    damage: 0, energy: 100000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 5, repair: 0, hypha: 5,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false,
    dirty: false,
  };
}

/**
 * SC-004 / R-10 — 100 ships through one advanceAll() call must complete in
 * under 50 ms on the project's CI runner. Skipped on low-perf runners that
 * set CI_LOW_PERF=1.
 */
describe('PhysicsTickService perf budget', () => {
  const skip = process.env.CI_LOW_PERF === '1';
  const it_ = skip ? it.skip : it;

  it_('advances 100 ships in under 50 ms', () => {
    const shipMap = new Map<string, ShipState>();
    for (let i = 1; i <= 100; i++) {
      const s = makeShip('u', i);
      shipMap.set(shipKey(s.userid, s.shipno), s);
    }
    const shipStateStub = {
      findAllShips: () => Array.from(shipMap.values()),
      mutate: (uid: string, sn: number, fn: (s: ShipState) => void) => {
        const s = shipMap.get(shipKey(uid, sn));
        if (s) { fn(s); s.dirty = true; }
        return s;
      },
    } as any;
    const tickStub = { subscribe: () => () => {} } as any;
    const cache = new ShipClassCacheService({} as any);
    cache.setForTest(1, { maxAcceleration: 1000, maxWarp: 10 });
    const service = new PhysicsTickService(tickStub, shipStateStub, cache, new EventEmitter2());
    const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };

    // Warm up the JIT.
    for (let i = 0; i < 3; i++) service.advanceAll(ctx);

    const start = process.hrtime.bigint();
    service.advanceAll(ctx);
    const elapsedNs = process.hrtime.bigint() - start;

    expect(Number(elapsedNs)).toBeLessThan(50_000_000); // 50 ms
  });
});
