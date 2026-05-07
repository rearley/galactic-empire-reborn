/**
 * T054 — in-flight cleanup (FR-027):
 *  1. firer dies: every other ship's incoming projectile slots whose
 *     `.channel === dead.shipno` are cleared (channel = 255).
 *  2. carrier (target) leaves game mid-flight: slot is silently cleared,
 *     no hit emitted, no decoy event. (Already tested in combat-tick spec
 *     for status=0 path; covered here again to match T054 surface.)
 *
 * @see specs/006b-combat/tasks.md T054
 * @see GEFUNCS.C:1755-1778 firer-dies cleanup
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { CombatTickService } from '../../../src/game/combat/combat-tick.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import {
  COMBAT_HIT,
  COMBAT_DECOY_INTERCEPT,
} from '../../../src/game/combat/combat-events';
import { TORPSPED } from '../../../src/game/constants';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'T', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false,
    dirty: false, ...over,
  };
}

async function makeHarness(ships: ShipState[], seed = 1) {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(shipKey(userid, shipno));
      if (!s) return undefined;
      fn(s);
      s.dirty = true;
      return s;
    },
    removeFromGame: (ship: { userid: string; shipno: number }) => {
      shipMap.delete(shipKey(ship.userid, ship.shipno));
    },
  } as unknown as import('../../../src/game/ship/ship-state.service').ShipStateService;

  const subscribers: Array<(c: TickContext) => void> = [];
  const tickService = {
    subscribe: (_kind: TickKind, h: (c: TickContext) => void) => {
      subscribers.push(h);
      return () => {};
    },
  } as unknown as import('../../../src/game/tick/tick.service').TickService;

  const mineRepo = {
    findAllActive: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    delete: jest.fn(),
  } as unknown as MineRepository;

  const mineRegistry = new MineRegistry();
  const events = new EventEmitter2();
  const logger = new Logger('InFlightCleanupSpec');
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);

  const classCache = new ShipClassCacheService({} as never);
  classCache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange: 100000, maxTons: 5000,
  } as never);

  const service = new CombatTickService(
    tickService, shipState, mineRepo, mineRegistry,
    new Mulberry32Adapter(seed), events, logger, classCache,
  );
  await service.onModuleInit();

  return {
    service, shipMap, events, shipState,
    fire: () => {
      const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };
      for (const h of subscribers) h(ctx);
    },
  };
}

describe('CombatTickService — in-flight cleanup (T054, FR-027)', () => {
  it('firer death clears incoming projectile slots on other ships that reference the dead shipno', async () => {
    // Alice (channel 7) has a torpedo en-route to Bob.
    // Alice dies this tick (damage already at 100; lastfired set so kill resolves cleanly).
    // After kill resolution, Bob's ltorpsChannel[0] (=7) should be cleared.
    const alice = makeShip({
      userid: 'a', shipno: 7, xcoord: 0, ycoord: 0,
      damage: 100, lastfired: 99, // killed by phantom shipno 99 (no attribution)
    });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      ltorpsChannel: [7, 255, 255],
      ltorpsDistance: [TORPSPED * 5, 0, 0], // long flight; no hit this tick
    });

    const h = await makeHarness([alice, bob]);
    h.fire();

    // Alice removed from game.
    expect(h.shipMap.has(shipKey('a', 7))).toBe(false);
    // Bob's incoming-from-Alice slot cleared.
    expect(bob.ltorpsChannel[0]).toBe(255);
    expect(bob.ltorpsDistance[0]).toBe(0);
  });

  it('FR-027.3 — carrier leaves game mid-flight: slot silently cleared, no hit, no decoy', async () => {
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      status: 0, // not ingame
      ltorpsChannel: [7, 255, 255],
      ltorpsDistance: [TORPSPED * 3, 0, 0],
    });
    const h = await makeHarness([bob]);

    const emitted: string[] = [];
    h.events.onAny((event: string | string[]) => {
      const ev = Array.isArray(event) ? event.join('.') : event;
      emitted.push(ev);
    });

    h.fire();
    expect(bob.ltorpsChannel[0]).toBe(255);
    expect(emitted).not.toContain(COMBAT_HIT);
    expect(emitted).not.toContain(COMBAT_DECOY_INTERCEPT);
  });
});
