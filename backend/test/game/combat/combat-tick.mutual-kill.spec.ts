/**
 * T030 — mutual-kill same-tick attribution.
 *
 * When ship A has damaged ship B to >= 100 AND ship B has damaged ship A
 * to >= 100 in the same tick, the attacker snapshot built before any
 * removeFromGame() runs must ensure both COMBAT_SHIP_DESTROYED events have
 * non-null attackerUserid. Without the snapshot, whichever victim is processed
 * first is removed from the active map before the second victim's kill
 * resolution runs, causing the second event's attacker lookup to return null.
 *
 * @see specs/019-physics-polish/spec.md §Plan-Phase Decisions
 * @see GEFUNCS.C:killem (line 1103)
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
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 50000,
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
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  };
}

async function makeHarness(ships: ShipState[], seed = 42) {
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
    get: (userid: string, shipno: number) => shipMap.get(shipKey(userid, shipno)),
  } as unknown as import('../../../src/game/ship/ship-state.service').ShipStateService;

  const subscribers: Array<(c: TickContext) => void> = [];
  const tickService = {
    subscribe: (_kind: TickKind, h: (c: TickContext) => void) => {
      subscribers.push(h);
      return () => {};
    },
    registerSnapshotProvider: jest.fn(),
  } as unknown as import('../../../src/game/tick/tick.service').TickService;

  const mineRepo = {
    findAllActive: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    delete: jest.fn(),
  } as unknown as MineRepository;

  const mineRegistry = new MineRegistry();
  const events = new EventEmitter2();
  const logger = new Logger('MutualKillSpec');
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);

  const classCache = new ShipClassCacheService({} as never);
  classCache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange: 100000, maxTons: 5000, points: 100,
  } as never);

  const service = new CombatTickService(
    tickService, shipState, mineRepo, mineRegistry,
    new Mulberry32Adapter(seed), events, logger, classCache,
  );
  await service.onModuleInit();

  return {
    service, shipMap, events,
    fire: () => {
      const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };
      for (const h of subscribers) h(ctx);
    },
  };
}

describe('CombatTickService — mutual-kill same-tick attribution (T030)', () => {
  it('both COMBAT_SHIP_DESTROYED events have non-null attackerUserid in mutual-kill scenario', async () => {
    // Ship A (shipno=1, userid='alice') has lastfired=2 (Bob's channel)
    // Ship B (shipno=2, userid='bob')   has lastfired=1 (Alice's channel)
    // Both have damage >= 100 entering kill resolution.
    //
    // Without the attacker snapshot, whichever ship is processed first (alice,
    // since 'alice:1' < 'bob:2' lexicographically) gets removed from the map,
    // and when bob's kill is processed, findActiveAttackerByChannel can't find alice.
    const alice = makeShip({ userid: 'alice', shipno: 1, damage: 105, lastfired: 2, status: 1 });
    const bob = makeShip({ userid: 'bob', shipno: 2, damage: 105, lastfired: 1, status: 1 });

    const h = await makeHarness([alice, bob]);

    const destroyedEvents: CombatShipDestroyedEvent[] = [];
    h.events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) => destroyedEvents.push(e));

    h.fire();

    // Both ships should have been destroyed
    expect(destroyedEvents).toHaveLength(2);

    // Both events should have non-null attackerUserid
    for (const ev of destroyedEvents) {
      expect(ev.attackerUserid).not.toBeNull();
    }

    // Alice is destroyed by Bob and vice-versa
    const aliceDestroyed = destroyedEvents.find((e) => e.victimUserid === 'alice');
    const bobDestroyed = destroyedEvents.find((e) => e.victimUserid === 'bob');

    expect(aliceDestroyed).toBeDefined();
    expect(bobDestroyed).toBeDefined();
    expect(aliceDestroyed!.attackerUserid).toBe('bob');
    expect(bobDestroyed!.attackerUserid).toBe('alice');
  });

  it('one-sided kill (not mutual) still correctly attributes attacker', async () => {
    // Alice fires at Bob; Bob does NOT fire at Alice; only Bob dies.
    const alice = makeShip({ userid: 'alice', shipno: 1, damage: 50, lastfired: 0, status: 1 });
    const bob = makeShip({ userid: 'bob', shipno: 2, damage: 105, lastfired: 1, status: 1 });

    const h = await makeHarness([alice, bob]);

    const destroyedEvents: CombatShipDestroyedEvent[] = [];
    h.events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) => destroyedEvents.push(e));

    h.fire();

    expect(destroyedEvents).toHaveLength(1);
    const ev = destroyedEvents[0];
    expect(ev.victimUserid).toBe('bob');
    expect(ev.attackerUserid).toBe('alice');
  });

  it('attacker with null lastfired (channel=0 not matching any ship) produces null attackerUserid', async () => {
    // Bob's lastfired = 99, no ship with shipno=99 exists → attacker is null
    const bob = makeShip({ userid: 'bob', shipno: 2, damage: 105, lastfired: 99, status: 1 });

    const h = await makeHarness([bob]);

    const destroyedEvents: CombatShipDestroyedEvent[] = [];
    h.events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) => destroyedEvents.push(e));

    h.fire();

    expect(destroyedEvents).toHaveLength(1);
    expect(destroyedEvents[0].attackerUserid).toBeNull();
  });
});
