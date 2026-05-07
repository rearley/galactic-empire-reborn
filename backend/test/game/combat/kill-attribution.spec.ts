/**
 * T053 — kill-attribution: when multiple attackers hit the same victim in
 * one tick, the kill is credited to whichever attacker's hit was processed
 * LAST (i.e., whoever's shipno ends up in `victim.lastfired` at the moment
 * the kill-resolution pass runs). Per the existing pass ordering, torpedoes
 * resolve before missiles, so a torpedo from A + missile from C => C wins.
 *
 * @see specs/006b-combat/tasks.md T053
 * @see GEFUNCS.C:killem, GEFUNCS.C:acctm
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
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../../../src/game/combat/combat-events';

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

async function makeHarness(ships: ShipState[], seed = 99) {
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
  const logger = new Logger('KillAttributionSpec');
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

describe('CombatTickService — kill attribution (T053, FR-026)', () => {
  it('credits last attacker (missile after torpedo) when both hits land same tick and damage >= 100', async () => {
    // Alice (channel 7) torpedoes Bob; Carol (channel 9) missiles Bob; both
    // arrive same tick. Torps process before missiles in the carrier's slot
    // walk, so Carol's shipno is the value of bob.lastfired at kill time.
    const alice = makeShip({ userid: 'a', shipno: 7, xcoord: 0, ycoord: 0, kills: 0 });
    const carol = makeShip({ userid: 'c', shipno: 9, xcoord: 0, ycoord: 0, kills: 0 });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      shield: 0, shieldstat: 0,
      damage: 95, // pre-existing damage; either hit pushes him over 100
      ltorpsChannel: [7, 255, 255],
      ltorpsDistance: [10, 0, 0],   // resolves to hit
      lmisslChannel: [9, 255, 255],
      lmisslDistance: [10, 0, 0],   // resolves to hit
      lmisslEnergy: [3000, 0, 0],   // big charge → guaranteed >= 5 hull damage
    });

    const h = await makeHarness([alice, carol, bob]);

    const destroyedEvents: CombatShipDestroyedEvent[] = [];
    h.events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) => destroyedEvents.push(e));

    h.fire();

    expect(bob.damage).toBeGreaterThanOrEqual(100);
    expect(destroyedEvents).toHaveLength(1);
    const ev = destroyedEvents[0];
    expect(ev.victimId).toBe(shipKey('b', 2));
    // Carol fires last (missile after torpedo) → her channel wins.
    expect(ev.attackerChannel).toBe(9);
    expect(ev.attackerId).toBe(shipKey('c', 9));
    // Carol's kills incremented; Alice's not.
    expect(carol.kills).toBe(1);
    expect(alice.kills).toBe(0);
    // Bob is removed from the active map.
    expect(h.shipMap.has(shipKey('b', 2))).toBe(false);
  });
});
