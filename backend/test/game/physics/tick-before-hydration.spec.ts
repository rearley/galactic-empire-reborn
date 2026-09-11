/**
 * The movement tick must not run before the ship-class cache is hydrated.
 *
 * Moving `rotateship`/`accel`/`moveship` onto canon's 1-second timer
 * (GEMAIN.C:2462-2493) exposed a boot race that the 6-second tick had always
 * hidden: `ShipClassCacheService` hydrates from Postgres asynchronously during
 * bootstrap, and the first physics tick now fires at t=1s instead of t=6s. On a
 * live restart this produced eight "ShipClass 21 not in cache" faults on tick 4
 * — every Cybertron skipping a movement step and logging an error, once per
 * boot.
 *
 * Per-ship fault isolation caught it, which is why it was only noise rather
 * than a crash. But a tick that cannot read the world should not process it:
 * skip the tick and let the next one (one second later) do the work.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(): ShipState {
  return baseMakeShip({
    userid: 'u',
    shipname: 'S',
    shpclass: 21,
    head2b: 90,
    speed: 6500,
    speed2b: 6500,
    xcoord: 20,
    ycoord: 20,
    energy: 500_000,
    phasrtype: 1,
    items: new Array(NUMITEMS).fill(0n),
    topspeed: 20,
  });
}

describe('physics tick before the ship-class cache is hydrated', () => {
  it('skips the tick instead of faulting on every ship', () => {
    const ship = makeShip();
    const map = new Map([[shipKey(ship.userid, ship.shipno), ship]]);
    const shipState = {
      findAllShips: () => Array.from(map.values()),
      mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
        const s = map.get(shipKey(u, n));
        if (s) { fn(s); s.dirty = true; }
        return s;
      },
    } as unknown as ShipStateService;

    // An EMPTY cache — exactly the state during bootstrap.
    const cache = new ShipClassCacheService({} as never);

    const svc = new PhysicsTickService(
      { subscribe: () => () => {} } as unknown as TickService,
      shipState, cache, new EventEmitter2(),
    );

    const ctx = { kind: TickKind.SHIP_UPDATE, tickNumber: 1, firedAt: new Date() } as TickContext;
    svc.advanceAll(ctx);
    svc.advanceAll(ctx);
    svc.advanceAll(ctx);

    expect(svc.getFaultCount()).toBe(0);
  });
});
