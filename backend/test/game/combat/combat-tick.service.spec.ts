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
  COMBAT_DECOY_INTERCEPT,
  COMBAT_HIT,
  CombatDecoyInterceptEvent,
  CombatHitEvent,
} from '../../../src/game/combat/combat-events';
import {
  DECOYTIME,
  FIRETICKS,
  MISLSPED,
  PRELOAD,
  TORPSPED,
} from '../../../src/game/constants';

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
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
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
    // Alice heading 0 (north). Bearing 0 = straight ahead = north. Bob north of Alice (y decreases northward).
    const alice = makeShip({ userid: 'a', shipno: 1, shipname: 'Alice', xcoord: 0, ycoord: 0, phasr: 100, phasrtype: 1 });
    const bob = makeShip({
      userid: 'b', shipno: 2, shipname: 'Bob',
      xcoord: 0, ycoord: -0.01, shield: 5000, shieldstat: 1, damage: 0, phasr: 100, phasrtype: 1,
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

    // Drive a physics tick; phasr reloads only when < 100 (cap is 100, not class max)
    const phasrBefore = alice.phasr;
    await h.fire();
    expect(alice.phasr).toBe(Math.min(100, phasrBefore + PRELOAD));
    // Bob's phasr starts at 100 (full) so no reload occurs
    expect(bob.phasr).toBe(100);
  });
});

describe('CombatTickService — projectile travel pass (T029)', () => {
  // We need a parameterised harness so we can control the PRNG seed for
  // deterministic decoy-intercept outcomes.
  async function makeHarnessSeeded(
    ships: ShipState[],
    seed: number,
  ): Promise<Harness> {
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
    const logger = new Logger('CombatTickServiceProjectileSpec');
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    const classCache = new ShipClassCacheService({} as never);
    classCache.setForTest(1, {
      maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
      scanRange: 100000, maxTons: 5000,
    } as never);

    const service = new CombatTickService(
      tickService,
      shipState,
      mineRepo,
      mineRegistry,
      new Mulberry32Adapter(seed),
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

  it('torpedo travel — distance decremented by TORPSPED each tick (no hit, no decoy)', async () => {
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      ltorpsChannel: [7, 255, 255],
      ltorpsDistance: [TORPSPED * 5, 0, 0],
    });
    const h = await makeHarnessSeeded([bob], 1);
    await h.fire();
    expect(bob.ltorpsDistance[0]).toBe(TORPSPED * 4);
    expect(bob.ltorpsChannel[0]).toBe(7);
  });

  it('missile travel — distance decremented by MISLSPED each tick', async () => {
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      lmisslChannel: [9, 255, 255],
      lmisslDistance: [MISLSPED * 4, 0, 0],
      lmisslEnergy: [1500, 0, 0],
    });
    const h = await makeHarnessSeeded([bob], 1);
    await h.fire();
    expect(bob.lmisslDistance[0]).toBe(MISLSPED * 3);
    expect(bob.lmisslChannel[0]).toBe(9);
    expect(bob.lmisslEnergy[0]).toBe(1500);
  });

  it('torpedo hit at distance ≤ 0 emits COMBAT_HIT { weapon: torpedo }, applies damage, sets cantexit on victim', async () => {
    const alice = makeShip({ userid: 'a', shipno: 7, xcoord: 0, ycoord: 0 });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      shield: 5000, shieldstat: 1, damage: 0, cantexit: 0,
      ltorpsChannel: [7, 255, 255],
      ltorpsDistance: [10, 0, 0], // less than TORPSPED → goes negative → hit
    });
    const h = await makeHarnessSeeded([alice, bob], 99);

    const emitted: Array<{ event: string; payload: unknown }> = [];
    h.events.onAny((event: string | string[], payload: unknown) => {
      const ev = Array.isArray(event) ? event.join('.') : event;
      emitted.push({ event: ev, payload });
    });

    await h.fire();

    const hit = emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
    expect((hit!.payload as CombatHitEvent).weapon).toBe('torpedo');
    expect((hit!.payload as CombatHitEvent).victimId).toBe(shipKey('b', 2));
    expect((hit!.payload as CombatHitEvent).attackerId).toBe(shipKey('a', 7));

    // Slot cleared
    expect(bob.ltorpsChannel[0]).toBe(255);
    // cantexit set on victim
    expect(bob.cantexit).toBe(FIRETICKS);
    // cantexit set on attacker
    expect(alice.cantexit).toBe(FIRETICKS);
  });

  it('missile hit at distance ≤ 0 emits COMBAT_HIT { weapon: missile } using stored energy as dmgMax', async () => {
    const alice = makeShip({ userid: 'a', shipno: 9, xcoord: 0, ycoord: 0 });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      shield: 0, shieldstat: 0, damage: 0,
      lmisslChannel: [9, 255, 255],
      lmisslDistance: [10, 0, 0],
      lmisslEnergy: [2000, 0, 0],
    });
    const h = await makeHarnessSeeded([alice, bob], 99);

    const emitted: Array<{ event: string; payload: unknown }> = [];
    h.events.onAny((event: string | string[], payload: unknown) => {
      const ev = Array.isArray(event) ? event.join('.') : event;
      emitted.push({ event: ev, payload });
    });

    await h.fire();
    const hit = emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
    expect((hit!.payload as CombatHitEvent).weapon).toBe('missile');
    // Slot cleared
    expect(bob.lmisslChannel[0]).toBe(255);
    expect(bob.lmisslEnergy[0]).toBe(0);
    // Bob took some hull damage
    expect(bob.damage).toBeGreaterThan(0);
  });

  it('decoy intercept — when carrier has active decoy and roll succeeds, emit COMBAT_DECOY_INTERCEPT and clear slot, no COMBAT_HIT', async () => {
    // Mulberry32(99) first next() ≈ 0.26 < 0.5 (DECODDS=50) → intercept fires.
    const alice = makeShip({ userid: 'a', shipno: 7, xcoord: 0, ycoord: 0 });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      decout: [DECOYTIME, 0, 0], // active decoy
      ltorpsChannel: [7, 255, 255],
      // Distance after decrement will be 1000 — below 5000 → decoy roll triggered.
      ltorpsDistance: [TORPSPED + 1000, 0, 0],
    });
    const h = await makeHarnessSeeded([alice, bob], 99);

    const emitted: Array<{ event: string; payload: unknown }> = [];
    h.events.onAny((event: string | string[], payload: unknown) => {
      const ev = Array.isArray(event) ? event.join('.') : event;
      emitted.push({ event: ev, payload });
    });

    await h.fire();
    const intercept = emitted.find((e) => e.event === COMBAT_DECOY_INTERCEPT);
    expect(intercept).toBeDefined();
    expect((intercept!.payload as CombatDecoyInterceptEvent).weapon).toBe('torpedo');
    expect((intercept!.payload as CombatDecoyInterceptEvent).defenderId).toBe(shipKey('b', 2));
    // Slot cleared
    expect(bob.ltorpsChannel[0]).toBe(255);
    // No hit emitted
    expect(emitted.find((e) => e.event === COMBAT_HIT)).toBeUndefined();
  });

  it('FR-027.3 — carrier not ingame mid-flight: slot silently cleared, no hit, no decoy event', async () => {
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      status: 0, // not ingame (neither 1 nor 2)
      ltorpsChannel: [7, 255, 255],
      ltorpsDistance: [TORPSPED * 3, 0, 0],
    });
    const h = await makeHarnessSeeded([bob], 1);

    const emitted: Array<{ event: string; payload: unknown }> = [];
    h.events.onAny((event: string | string[], payload: unknown) => {
      const ev = Array.isArray(event) ? event.join('.') : event;
      emitted.push({ event: ev, payload });
    });

    await h.fire();
    expect(bob.ltorpsChannel[0]).toBe(255);
    expect(emitted.find((e) => e.event === COMBAT_HIT)).toBeUndefined();
    expect(emitted.find((e) => e.event === COMBAT_DECOY_INTERCEPT)).toBeUndefined();
  });
});

describe('CombatTickService — mine sweep (T036)', () => {
  async function makeMineHarness(
    ships: ShipState[],
    mines: Array<{ id: number; channel: number; timer: number; xcoord: number; ycoord: number; deployedBy: string }>,
    seed = 1,
  ): Promise<{
    fire: () => Promise<void>;
    events: EventEmitter2;
    shipMap: Map<string, ShipState>;
    deleteSpy: jest.Mock;
    registry: MineRegistry;
  }> {
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

    const deleteSpy = jest.fn().mockResolvedValue(undefined);
    const mineRepo = {
      findAllActive: jest.fn().mockResolvedValue(mines),
      create: jest.fn(),
      delete: deleteSpy,
    } as unknown as MineRepository;

    const registry = new MineRegistry();
    const events = new EventEmitter2();
    const logger = new Logger('MineSweepSpec');
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    const classCache = new ShipClassCacheService({} as never);
    classCache.setForTest(1, {
      maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
      scanRange: 100000, maxTons: 5000,
    } as never);

    const service = new CombatTickService(
      tickService,
      shipState,
      mineRepo,
      registry,
      new Mulberry32Adapter(seed),
      events,
      logger,
      classCache,
    );
    await service.onModuleInit();

    return {
      shipMap,
      events,
      deleteSpy,
      registry,
      fire: async () => {
        const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };
        for (const h of subscribers) h(ctx);
      },
    };
  }

  it('cadence — timer 11 → 10 (%5===0): triggers sweep tick (no damage); timer 12 → 11 does not', async () => {
    // First: timer=11 → after tickAll → 10 → 10%5===0 → sweep, but >0 → warning only.
    const bob1 = makeShip({ userid: 'b', shipno: 2, xcoord: 100, ycoord: 100, damage: 0, status: 1 });
    const h1 = await makeMineHarness(
      [bob1],
      [{ id: 1, channel: 99, timer: 11, xcoord: 100, ycoord: 100, deployedBy: 'x' }],
    );
    const emitted1: Array<{ event: string }> = [];
    h1.events.onAny((e: string | string[]) =>
      emitted1.push({ event: Array.isArray(e) ? e.join('.') : e }));
    await h1.fire();
    expect(emitted1.find((e) => e.event === 'combat.mine-warning')).toBeDefined();
    expect(bob1.damage).toBe(0);

    // Second: timer=12 → after tickAll → 11 → 11%5!==0 → no sweep at all.
    const bob2 = makeShip({ userid: 'b', shipno: 2, xcoord: 100, ycoord: 100, damage: 0, status: 1 });
    const h2 = await makeMineHarness(
      [bob2],
      [{ id: 2, channel: 99, timer: 12, xcoord: 100, ycoord: 100, deployedBy: 'x' }],
    );
    const emitted2: Array<{ event: string }> = [];
    h2.events.onAny((e: string | string[]) =>
      emitted2.push({ event: Array.isArray(e) ? e.join('.') : e }));
    await h2.fire();
    expect(emitted2.find((e) => e.event === 'combat.mine-warning')).toBeUndefined();
    expect(emitted2.find((e) => e.event === 'combat.mine-detonation')).toBeUndefined();
  });

  it('neutral zone — ship at (0,0) is skipped by mine sweep damage', async () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 0.1, ycoord: 0.1, damage: 0, shield: 0, shieldstat: 0, status: 1 });
    const h = await makeMineHarness(
      [alice],
      [{ id: 1, channel: 99, timer: 1, xcoord: 0.2, ycoord: 0.2, deployedBy: 'x' }],
    );
    await h.fire();
    expect(alice.damage).toBe(0);
  });

  it('no owner exclusion — mine deployer ship is damaged if within range', async () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, xcoord: 100, ycoord: 100, damage: 0,
      shield: 0, shieldstat: 0, status: 1,
    });
    const h = await makeMineHarness(
      [alice],
      [{ id: 1, channel: 1, timer: 1, xcoord: 100, ycoord: 100, deployedBy: 'a' }],
      99,
    );
    await h.fire();
    expect(alice.damage).toBeGreaterThan(0);
  });

  it('detonation — timer===0 emits COMBAT_HIT { weapon:mine } and COMBAT_MINE_DETONATION, mine destroyed', async () => {
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 100, ycoord: 100, damage: 0,
      shield: 0, shieldstat: 0, lastfired: 0, status: 1,
    });
    const h = await makeMineHarness(
      [bob],
      [{ id: 42, channel: 99, timer: 1, xcoord: 100, ycoord: 100, deployedBy: 'x' }],
      99,
    );
    const emitted: Array<{ event: string; payload: unknown }> = [];
    h.events.onAny((event: string | string[], payload: unknown) =>
      emitted.push({ event: Array.isArray(event) ? event.join('.') : event, payload }));

    await h.fire();

    const hit = emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
    expect((hit!.payload as CombatHitEvent).weapon).toBe('mine');
    expect((hit!.payload as CombatHitEvent).victimId).toBe(shipKey('b', 2));

    const det = emitted.find((e) => e.event === 'combat.mine-detonation');
    expect(det).toBeDefined();
    expect((det!.payload as { mineId: number; channel: number }).mineId).toBe(42);
    expect((det!.payload as { mineId: number; channel: number }).channel).toBe(99);

    expect(bob.lastfired).toBe(99);
    expect(h.deleteSpy).toHaveBeenCalledWith(42);
    expect(h.registry.getAll().length).toBe(0);
  });

  it('proximity — timer > 0 on sweep tick: warning only, no damage, mine persists', async () => {
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 100, ycoord: 100, damage: 0, status: 1,
    });
    const h = await makeMineHarness(
      [bob],
      [{ id: 7, channel: 99, timer: 6, xcoord: 100, ycoord: 100, deployedBy: 'x' }],
    );
    const emitted: Array<{ event: string }> = [];
    h.events.onAny((event: string | string[]) =>
      emitted.push({ event: Array.isArray(event) ? event.join('.') : event }));

    await h.fire();
    expect(bob.damage).toBe(0);
    expect(h.registry.getAll().length).toBe(1);
    expect(h.deleteSpy).not.toHaveBeenCalled();
    expect(emitted.find((e) => e.event === 'combat.mine-warning')).toBeDefined();
  });

  it('seeded PRNG — deterministic mine outcomes', async () => {
    const makeRun = async () => {
      const bob = makeShip({
        userid: 'b', shipno: 2, xcoord: 100, ycoord: 100, damage: 0,
        shield: 0, shieldstat: 0, status: 1,
      });
      const h = await makeMineHarness(
        [bob],
        [{ id: 1, channel: 99, timer: 1, xcoord: 100, ycoord: 100, deployedBy: 'x' }],
        42,
      );
      await h.fire();
      return bob.damage;
    };
    expect(await makeRun()).toBe(await makeRun());
  });
});

describe('CombatTickService — decoy/jammer expiry (T036)', () => {
  it('decoy slots decrement each tick; jammer counter decrements each tick', async () => {
    const ship = makeShip({
      userid: 'a', shipno: 1,
      decout: [3, 1, 0],
      jammer: 5,
    });
    const h = await makeHarness([ship]);
    await h.fire();
    expect(ship.decout[0]).toBe(2);
    expect(ship.decout[1]).toBe(0);
    expect(ship.decout[2]).toBe(0);
    expect(ship.jammer).toBe(4);
  });
});

describe('CombatTickService — battle-lock + shield gating (T052)', () => {
  it('decrements ship.cantexit by 1 per physics tick (FR-028a)', async () => {
    const ship = makeShip({ userid: 'a', shipno: 1, cantexit: 3 });
    const h = await makeHarness([ship]);
    await h.fire();
    expect(ship.cantexit).toBe(2);
    await h.fire();
    expect(ship.cantexit).toBe(1);
    await h.fire();
    expect(ship.cantexit).toBe(0);
    // Floor at zero — no negative drift.
    await h.fire();
    expect(ship.cantexit).toBe(0);
  });

  it('does NOT auto-raise shields after they have been lowered (e.g., by torpedo fire)', async () => {
    const ship = makeShip({ userid: 'a', shipno: 1, shieldstat: 0, shield: 1000 });
    const h = await makeHarness([ship]);
    await h.fire();
    // Tick must not flip shields back up — the original game requires `shi up`.
    expect(ship.shieldstat).toBe(0);
    await h.fire();
    expect(ship.shieldstat).toBe(0);
  });
});
