/**
 * Canon moves every ship once per THREE seconds, not once per six.
 *
 * `warrti2a` is registered on the 1-second timer and walks the fleet with a
 * stride of 3, rotating which third it touches:
 *
 *   static int clicker = 0;
 *   zothusn = clicker;
 *   while (zothusn < nships) {
 *       if (ingegame(zothusn)) {
 *           rotateship(wptr,zothusn);
 *           accel(wptr,zothusn);
 *           moveship(wptr,zothusn);
 *           destruct(wptr,zothusn);
 *       }
 *       zothusn += 3;
 *   }
 *   clicker = (clicker+1)%3;
 *   rtkick(TICKTIME2,warrti2);          // TICKTIME2 == 1
 *
 * @see GEMAIN.C:2462-2493 warrti2a
 *
 * The stride is load-smoothing — a third of the fleet per second — but its
 * effect on gameplay is the cadence: any individual ship rotates, accelerates,
 * moves and counts down its self-destruct every 3 seconds.
 *
 * The port ran all four on the 6-second PHYSICS tick, and
 * `positionIntegration` carries canon's per-CALL displacement with no dt term
 * (physics-math.ts:121-133) — so every ship flew at exactly half canon's speed,
 * turned half as fast, took twice as long to reach an ordered warp, and took
 * twice as long to blow up. CLAUDE.md's tick table encoded it ("Physics tick:
 * 6 seconds — moves ships"), which is why the code was written that way.
 *
 * Note what canon leaves on the 6-second timer, which the port already has
 * right: repairship, shieldstat/shieldchg, cloakstat, checktm, fireion,
 * recharge and checkdam (GEMAIN.C warrtia). Only the four above move.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import { COORD_SCALE } from '../../../src/game/constants';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

const SPEED = 6_500; // one step = 6500/65000 = 0.1 sectors along the heading

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    // Channel 3 puts a lone ship in the first third, so a harness that fires a
    // single second still moves it. Canon's stride is indexed by the ship's own
    // table slot (`zothusn`), and this port's equivalent is `channel` — every
    // ship in the map holds one. @see physics-tick.service.ts strideSlot
    userid: 'u',
    shipname: 'S',
    channel: 3,
    speed: SPEED,
    speed2b: SPEED,
    xcoord: 20,
    ycoord: 20,
    energy: 5_000_000,
    phasrtype: 1,
    items: new Array(NUMITEMS).fill(0n),
    topspeed: 20,
    ...over,
  });
}

function harness(ships: ShipState[]) {
  const map = new Map<string, ShipState>();
  for (const s of ships) map.set(shipKey(s.userid, s.shipno), s);

  const shipState = {
    findAllShips: () => Array.from(map.values()),
    get: (u: string, n: number) => map.get(shipKey(u, n)),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(u, n));
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
  } as unknown as ShipStateService;

  const subs: Array<{ kind: TickKind; fn: (c: TickContext) => void }> = [];
  const tickService = {
    subscribe: (kind: TickKind, fn: (c: TickContext) => void) => {
      subs.push({ kind, fn });
      return () => {};
    },
  } as unknown as TickService;

  const shipClassCache = {
    get: () => ({ maxAcceleration: 5000, maxWarp: 20, scanRange: 100_000, maxTons: 1000 }),
    getMaxAcceleration: () => 5000,
    getMaxWarp: () => 20,
    getTopSpeed: () => 20_000,
  } as unknown as ShipClassCacheService;

  const svc = new PhysicsTickService(
    tickService, shipState, shipClassCache, new EventEmitter2(),
  );
  svc.onModuleInit();

  let n = 0;
  /**
   * Fire one tick of a given kind — only the handlers registered for that kind,
   * exactly as TickService dispatches. A kind-blind harness would let a
   * subscription move between timers without any test noticing, which is the
   * bug class this file exists to pin.
   */
  const fire = (kind: TickKind) => {
    const ctx = { kind, tickNumber: ++n, firedAt: new Date() } as TickContext;
    for (const s of subs) if (s.kind === kind) s.fn(ctx);
  };
  const second = () => fire(TickKind.SHIP_UPDATE);
  const sixSecondTick = () => fire(TickKind.PHYSICS);

  return { svc, subs, second, sixSecondTick };
}

const STEP = SPEED / COORD_SCALE; // displacement of ONE canon move, in sectors

describe('movement cadence — canon moves each ship every 3s (GEMAIN.C:2462-2493)', () => {
  it('subscribes to the 1-second tick, which is where canon runs warrti2a', () => {
    const { subs } = harness([makeShip()]);

    expect(subs.map((s) => s.kind)).toContain(TickKind.SHIP_UPDATE);
  });

  it('moves a ship exactly one step per three seconds', () => {
    const ship = makeShip();
    const { second } = harness([ship]);
    const y0 = ship.ycoord;

    second(); second(); second();

    // heading 0 travels toward decreasing y (physics-math.ts:129).
    expect(ship.ycoord).toBeCloseTo(y0 - STEP, 9);
  });

  it('covers twice the ground in six seconds that the 6s tick did', () => {
    const ship = makeShip();
    const { second } = harness([ship]);
    const y0 = ship.ycoord;

    for (let i = 0; i < 6; i++) second();

    // Six seconds is two canon moves. The old 6s-tick port managed one.
    expect(ship.ycoord).toBeCloseTo(y0 - 2 * STEP, 9);
  });

  it('starves no ship — every hull in a fleet advances once per three seconds', () => {
    const fleet = Array.from({ length: 7 }, (_, i) =>
      makeShip({ userid: `u${i}`, shipno: 1, xcoord: 20 + i }),
    );
    const start = fleet.map((s) => s.ycoord);
    const { second } = harness(fleet);

    second(); second(); second();

    for (let i = 0; i < fleet.length; i++) {
      expect({ ship: i, y: Number(fleet[i].ycoord.toFixed(9)) })
        .toEqual({ ship: i, y: Number((start[i] - STEP).toFixed(9)) });
    }
  });

  it('advances no ship twice in the same three-second window', () => {
    // Distinct channels, as a real fleet has: the stride spreads them across
    // the three seconds, which is the load-smoothing this asserts.
    const fleet = Array.from({ length: 3 }, (_, i) => makeShip({ userid: `u${i}`, shipno: 1, channel: i + 1 }));
    const start = fleet.map((s) => s.ycoord);
    const { second } = harness(fleet);

    second();

    // Exactly one of the three has moved after the first second.
    const moved = fleet.filter((s, i) => s.ycoord !== start[i]);
    expect(moved).toHaveLength(1);
  });
});

describe('countdowns stay on the 6-second timer (GEFUNCS.C:1522-1541 checktm)', () => {
  // hypha (hyper-phaser cooldown) and cantexit (battle lock) are decremented
  // inside checktm, which canon calls from warrtia — the 6-SECOND timer — not
  // from warrti2a. Moving them onto the movement cadence would expire both
  // twice as fast: a hyper-phaser would recharge in half the time and a ship
  // could run from a fight twice as soon.
  it('does not decrement hypha or cantexit on the 1-second movement tick', () => {
    const ship = makeShip({ hypha: 10, cantexit: 10 });
    const { second } = harness([ship]);

    second(); second(); second();

    expect({ hypha: ship.hypha, cantexit: ship.cantexit })
      .toEqual({ hypha: 10, cantexit: 10 });
  });

  it('decrements them once per 6-second tick', () => {
    const ship = makeShip({ hypha: 10, cantexit: 10 });
    const { sixSecondTick } = harness([ship]);

    sixSecondTick();

    expect({ hypha: ship.hypha, cantexit: ship.cantexit })
      .toEqual({ hypha: 9, cantexit: 9 });
  });

  it('floors at zero rather than going negative', () => {
    const ship = makeShip({ hypha: 0, cantexit: 0 });
    const { sixSecondTick } = harness([ship]);

    sixSecondTick();

    expect({ hypha: ship.hypha, cantexit: ship.cantexit })
      .toEqual({ hypha: 0, cantexit: 0 });
  });

  it('counts down every ship, not a third of them', () => {
    // The stride is a movement optimisation; the countdown pass is not strided,
    // so a fleet does not drift out of sync on battle locks.
    const fleet = Array.from({ length: 5 }, (_, i) =>
      makeShip({ userid: `u${i}`, shipno: 1, cantexit: 10, hypha: 10 }),
    );
    const { sixSecondTick } = harness(fleet);

    sixSecondTick();

    expect(fleet.map((s) => s.cantexit)).toEqual([9, 9, 9, 9, 9]);
  });
});
