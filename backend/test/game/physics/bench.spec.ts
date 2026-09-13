import { EventEmitter2 } from '@nestjs/event-emitter';
import { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(userid: string, shipno: number): ShipState {
  return baseMakeShip({
    userid: userid,
    shipno: shipno,
    shipname: `S${userid}${shipno}`,
    heading: 90,
    head2b: 90,
    speed: 1500,
    speed2b: 1500,
    xcoord: 5 + (shipno % 10) * 0.1,
    ycoord: 5 + (shipno % 5) * 0.1,
    energy: 100000,
    cantexit: 5,
    hypha: 5,
    topspeed: 10,
  });
}

/**
 * SC-004 / R-10 — 100 ships through one full stride rotation (three
 * advanceAll() calls, canon's 3-second window) must complete in
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

    // Canon strides the fleet by 3 (GEMAIN.C:2472-2489), so ONE advanceAll call
    // touches a third of the hulls. Measure a full rotation, or this budget
    // silently becomes "34 ships in under 50 ms" while still claiming 100.
    const start = process.hrtime.bigint();
    service.advanceAll(ctx);
    service.advanceAll(ctx);
    service.advanceAll(ctx);
    const elapsedNs = process.hrtime.bigint() - start;

    expect(Number(elapsedNs)).toBeLessThan(50_000_000); // 50 ms
  });
});
