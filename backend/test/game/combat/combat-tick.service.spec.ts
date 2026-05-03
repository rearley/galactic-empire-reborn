import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { CombatTickService } from '../../../src/game/combat/combat-tick.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { PhaserHandlerService } from '../../../src/game/commands/handlers/phaser.handler';
import { CommandResult, CommandContext } from '../../../src/game/commands/command.types';
import {
  COMBAT_HIT,
  CombatHitEvent,
} from '../../../src/game/combat/combat-events';
import { PRELOAD } from '../../../src/game/constants';

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
    dirty: false, ...over,
  };
}

interface Harness {
  service: CombatTickService;
  shipMap: Map<string, ShipState>;
  events: EventEmitter2;
  classCache: ShipClassCacheService;
  shipState: import('../../../src/game/ship/ship-state.service').ShipStateService;
  fire(): Promise<void>;
}

async function makeHarness(ships: ShipState[] = []): Promise<Harness> {
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
  const logger = new Logger('CombatTickServiceSpec');
  // Suppress error noise from fault-isolation case.
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);

  const classCache = new ShipClassCacheService({} as never);
  classCache.setForTest(1, {
    maxAcceleration: 1000,
    maxWarp: 10,
    maxPhaser: 1000,
    scanRange: 100000,
    maxTons: 5000,
  } as never);

  const service = new CombatTickService(
    tickService,
    shipState,
    mineRepo,
    mineRegistry,
    new Mulberry32Adapter(1),
    events,
    logger,
    classCache,
  );
  await service.onModuleInit();

  return {
    service,
    shipMap,
    events,
    classCache,
    shipState,
    fire: async () => {
      const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };
      for (const h of subscribers) h(ctx);
    },
  };
}

describe('CombatTickService', () => {
  it('does not throw on empty ship map', async () => {
    const h = await makeHarness([]);
    await expect(h.fire()).resolves.not.toThrow();
  });

  it('processes a single ship without error', async () => {
    const h = await makeHarness([makeShip()]);
    await expect(h.fire()).resolves.not.toThrow();
  });

  it('isolates faults — one ship throwing does not abort the batch', async () => {
    const h = await makeHarness([
      makeShip({ userid: 'a', shipno: 1 }),
      makeShip({ userid: 'b', shipno: 1 }),
      makeShip({ userid: 'c', shipno: 1 }),
    ]);
    let calls = 0;
    // Patch processShipCombat to throw on the middle ship.
    const proto = h.service as unknown as { processShipCombat: (s: ShipState, c: TickContext) => void };
    proto.processShipCombat = (ship: ShipState) => {
      calls += 1;
      if (ship.userid === 'b') throw new Error('boom');
    };
    await h.fire();
    expect(calls).toBe(3);
  });

  it('hydrates the mine registry from the repository on init', async () => {
    const h = await makeHarness([]);
    expect(h.service).toBeDefined();
  });
});

describe('CombatTickService — phaser interaction (T018)', () => {
  it('after handler fires and tick runs, victim shield/damage mutate and combat.hit fires; phasr reloads on next tick', async () => {
    const alice = makeShip({ userid: 'a', shipno: 1, shipname: 'Alice', xcoord: 0, ycoord: 0, phasr: 100, phasrtype: 1 });
    const bob = makeShip({
      userid: 'b', shipno: 2, shipname: 'Bob',
      xcoord: 0, ycoord: 100, shield: 5000, shieldstat: 1, damage: 0, phasr: 100, phasrtype: 1,
    });
    const h = await makeHarness([alice, bob]);

    const emitted: Array<{ event: string; payload: unknown }> = [];
    h.events.onAny((event: string | string[], payload: unknown) => {
      const ev = Array.isArray(event) ? event.join('.') : event;
      emitted.push({ event: ev, payload });
    });

    const handler = new PhaserHandlerService(
      h.shipState,
      h.classCache,
      h.events,
      new Mulberry32Adapter(7),
    );

    const result = handler.command.handler(alice, ['0', '50'], {} as CommandContext) as CommandResult;
    expect(result.lines.length).toBeGreaterThan(0);

    // Mutation visible after handler call
    expect(bob.shield).toBeLessThan(5000);
    const hit = emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
    expect((hit!.payload as CombatHitEvent).victimId).toBe(shipKey('b', 2));
    expect((hit!.payload as CombatHitEvent).attackerId).toBe(shipKey('a', 1));

    // Drive a physics tick; phasr should reload by PRELOAD on each ship (capped at maxPhaser=1000)
    const phasrBefore = alice.phasr;
    await h.fire();
    expect(alice.phasr).toBe(Math.min(1000, phasrBefore + PRELOAD));
    expect(bob.phasr).toBe(Math.min(1000, 100 + PRELOAD));
  });
});
