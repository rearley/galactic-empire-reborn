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
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  const heading = over.heading ?? 0;
  return baseMakeShip({
    shipname: 'T',
    heading: heading,
    head2b: heading,
    energy: 50000,
    topspeed: 10,
    ...over,
  });
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
    // Records only what the SERVICES actually do — the tick kind and the
    // registration order. The previous version had the test tag each
    // subscription with an owner name itself and then asserted the order it had
    // just imposed, which passed no matter what the services registered.
    const subscriptions: Array<{ kind: TickKind }> = [];
    const handlers: Array<{ kind: TickKind; fn: (c: TickContext) => void }> = [];

    const tickStub: Pick<TickService, 'subscribe' | 'registerSnapshotProvider'> = {
      subscribe: vi.fn().mockImplementation((kind: TickKind, fn: (c: TickContext) => void) => {
        subscriptions.push({ kind });
        handlers.push({ kind, fn });
        return () => undefined;
      }),
      registerSnapshotProvider: vi.fn(),
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
    physics.onModuleInit();
    const physicsKinds = subscriptions.map((s2) => s2.kind);
    const physicsHandlers = handlers.length;

    // Stand up CombatTickService manually with a stub MineRepository.
    const mineRepo = { findAllActive: vi.fn().mockResolvedValue([]) } as unknown as MineRepository;
    const { MineRegistry } = await import('../../../src/game/combat/mine.registry');
    const { Mulberry32Adapter } = await import('../../../src/game/combat/random.port');
    const { Logger } = await import('@nestjs/common');
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

    // PhysicsTickService registers movement on the 1-second timer (canon
    // warrti2a) and the hypha/cantexit countdowns on the 6-second one (canon
    // checktm). CombatTickService is 6-second only (canon warrtia).
    expect(physicsKinds).toEqual([TickKind.SHIP_UPDATE, TickKind.PHYSICS]);
    expect(subscriptions.slice(physicsHandlers).map((s2) => s2.kind)).toEqual([TickKind.PHYSICS]);

    // Among the 6-second subscribers, physics is registered before combat —
    // CombatModule imports PhysicsModule, so Nest runs its onModuleInit first,
    // and TickService dispatches in registration order.
    const physicsIdx = subscriptions.findIndex((s2) => s2.kind === TickKind.PHYSICS);
    const combatIdx = subscriptions.length - 1;
    expect(physicsIdx).toBeLessThan(combatIdx);

    // Movement happens on the 1-second tick, so by the time a 6-second combat
    // tick runs, combat sees the moved coordinates. Firing the real handlers in
    // registration order proves the ship actually moved first.
    const preX = ship.xcoord;
    const shipUpdateCtx: TickContext = { kind: TickKind.SHIP_UPDATE, tickNumber: 1, firedAt: new Date() };
    for (let i = 0; i < 3; i++) {
      // three 1-second ticks = one canon move for every ship (stride of 3)
      for (const h of handlers) if (h.kind === TickKind.SHIP_UPDATE) h.fn(shipUpdateCtx);
    }
    expect(ship.xcoord).not.toBe(preX);

    // Combat is the last registered PHYSICS handler (it constructs after
    // physics), so capture what it sees when its turn comes.
    let combatObservedX = -1;
    const physicsCtx: TickContext = { kind: TickKind.PHYSICS, tickNumber: 2, firedAt: new Date() };
    const physicsKindHandlers = handlers.filter((h) => h.kind === TickKind.PHYSICS);
    physicsKindHandlers.forEach((h, i) => {
      if (i === physicsKindHandlers.length - 1) combatObservedX = ship.xcoord;
      h.fn(physicsCtx);
    });

    expect(combatObservedX).toBe(ship.xcoord);
    expect(combatObservedX).not.toBe(preX);
  });
});
