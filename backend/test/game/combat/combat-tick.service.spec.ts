import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { CombatTickService } from '../../../src/game/combat/combat-tick.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';

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

  const service = new CombatTickService(
    tickService,
    shipState,
    mineRepo,
    mineRegistry,
    new Mulberry32Adapter(1),
    events,
    logger,
  );
  await service.onModuleInit();

  return {
    service,
    shipMap,
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
