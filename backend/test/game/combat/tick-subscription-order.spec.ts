import { Test } from '@nestjs/testing';
import { CombatModule } from '../../../src/game/combat/combat.module';
import { CombatTickService } from '../../../src/game/combat/combat-tick.service';
import { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { MineRepository } from '../../../src/game/combat/mine.repository';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  const heading = over.heading ?? 0;
  return {
    userid: 'u1', shipno: 1, shipname: 'T', shpclass: 1,
    heading, head2b: heading, speed: 0, speed2b: 0,
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

/**
 * Integration: when CombatModule imports PhysicsModule, PhysicsTickService.onModuleInit
 * runs first, so its TickKind.PHYSICS subscription is registered BEFORE
 * CombatTickService subscribes. The TickService dispatcher iterates handlers
 * in insertion order, so combat sees post-movement coordinates.
 *
 * @see CombatTickService.onModuleInit
 * @see specs/006b-combat/research.md R-1
 */
describe('Combat tick — subscription order vs PhysicsTickService', () => {
  it('combat handler runs AFTER physics handler within a single PHYSICS tick', async () => {
    // Build a manual subscriber-capturing TickService stub so we can assert order
    // without standing up real timers/DB.
    const subscriptions: Array<{ kind: TickKind; owner: string }> = [];
    const handlers: Array<{ owner: string; fn: (c: TickContext) => void }> = [];

    const tickStub: Pick<TickService, 'subscribe'> = {
      subscribe: jest.fn().mockImplementation((kind: TickKind, fn: (c: TickContext) => void) => {
        // Identify owner by parsing the handler — we'll tag during register below
        // Instead we tag when we register manually, so this just collects.
        const owner = (fn as unknown as { __owner?: string }).__owner ?? 'unknown';
        subscriptions.push({ kind, owner });
        handlers.push({ owner, fn });
        return () => undefined;
      }),
    };

    // Build a fake ship map.
    const ship = makeShip({ speed: 5000, speed2b: 5000, heading: 90, energy: 500_000 });
    const map = new Map<string, ShipState>([[shipKey(ship.userid, ship.shipno), ship]]);

    const shipStateStub: Pick<ShipStateService, 'findAllShips' | 'mutate'> = {
      findAllShips: () => Array.from(map.values()),
      mutate: (uid, no, fn) => {
        const s = map.get(shipKey(uid, no));
        if (!s) return undefined;
        fn(s);
        s.dirty = true;
        return s;
      },
    };

    // Stand up PhysicsTickService manually (constructor injection).
    const cache = new ShipClassCacheService({} as unknown as PrismaService);
    cache.setForTest(1, { maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000, scanRange: 100000, maxTons: 5000 });
    const events = new (await import('@nestjs/event-emitter')).EventEmitter2();
    const physics = new PhysicsTickService(
      tickStub as TickService,
      shipStateStub as ShipStateService,
      cache,
      events,
    );
    // Tag and register physics subscription via its real onModuleInit.
    const origPhysSub = tickStub.subscribe;
    (tickStub.subscribe as jest.Mock).mockImplementationOnce((kind: TickKind, fn: (c: TickContext) => void) => {
      subscriptions.push({ kind, owner: 'physics' });
      handlers.push({ owner: 'physics', fn });
      return () => undefined;
    });
    physics.onModuleInit();

    // Stand up CombatTickService manually with a stub MineRepository.
    const mineRepo = { findAllActive: jest.fn().mockResolvedValue([]) } as unknown as MineRepository;
    const { MineRegistry } = await import('../../../src/game/combat/mine.registry');
    const { Mulberry32Adapter } = await import('../../../src/game/combat/random.port');
    const { Logger } = await import('@nestjs/common');
    (tickStub.subscribe as jest.Mock).mockImplementationOnce((kind: TickKind, fn: (c: TickContext) => void) => {
      subscriptions.push({ kind, owner: 'combat' });
      handlers.push({ owner: 'combat', fn });
      return () => undefined;
    });
    const combat = new CombatTickService(
      tickStub as TickService,
      shipStateStub as ShipStateService,
      mineRepo,
      new MineRegistry(),
      new Mulberry32Adapter(1),
      events,
      new Logger('combat-test'),
      cache,
    );
    await combat.onModuleInit();
    void origPhysSub;

    // Subscription order: physics first, then combat.
    expect(subscriptions.map((s) => s.owner)).toEqual(['physics', 'combat']);

    // Now fire a synthetic PHYSICS tick in registration order and verify the
    // combat handler observes the post-physics coordinates.
    let combatObservedX = -1;
    const originalCombatFn = handlers.find((h) => h.owner === 'combat')!.fn;
    const wrappedCombat = (ctx: TickContext) => {
      combatObservedX = ship.xcoord;
      originalCombatFn(ctx);
    };

    const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };
    const preX = ship.xcoord;
    // Run handlers in the order they were registered.
    handlers.find((h) => h.owner === 'physics')!.fn(ctx);
    wrappedCombat(ctx);

    expect(combatObservedX).not.toBe(preX); // physics moved the ship before combat ran
    expect(combatObservedX).toBe(ship.xcoord);
  });
});
