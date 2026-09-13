/**
 * The heartbeats must start AFTER the world they tick.
 *
 * This file was written to assert exactly that, and it failed: the measured
 * order under NestJS 10 was
 *
 *     tick  ->  galaxy  ->  ship-class-cache
 *
 * because `TickService` opened its 1-second and 6-second intervals in
 * `onModuleInit`, a same-phase peer of the two services that build the world.
 * Nest guarantees nothing between peers in one phase, so the order was an
 * accident of registration — and the intervals were live before the galaxy
 * existed and before the ship-class table had been read. It stood as a
 * CHARACTERIZATION test pinning that accident while the restructure ran.
 *
 * `TickService` now starts them in `onApplicationBootstrap`, which Nest runs
 * strictly after every `onModuleInit` has resolved. So this asserts the
 * invariant rather than the accident: whatever order the two `onModuleInit`
 * peers run in, both finish before a tick can fire. That also survives NestJS
 * 12's move to hierarchy-level hook ordering, which is what would have
 * reshuffled the old pin silently. @see issue #30
 *
 * @see docs/superpowers/plans/2026-09-11-restructure-phase-5-runtime-upgrades.md Task 3
 */
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../src/game/tick/tick.service';

/**
 * Record when a hook runs WITHOUT replacing it.
 *
 * The real implementations still run, so this observes the boot the
 * application actually performs. A double would record the order Nest called
 * the doubles in, which is only the same question if the doubles carry the
 * same dependencies — and they do not.
 */
function recordModuleInit(
  order: string[],
  proto: { onModuleInit: () => unknown },
  label: string,
): void {
  const original = proto.onModuleInit;
  vi.spyOn(proto, 'onModuleInit').mockImplementation(function (this: unknown) {
    order.push(label);
    return original.call(this);
  });
}

function recordBootstrap(
  order: string[],
  proto: { onApplicationBootstrap: () => unknown },
  label: string,
): void {
  const original = proto.onApplicationBootstrap;
  vi.spyOn(proto, 'onApplicationBootstrap').mockImplementation(function (this: unknown) {
    order.push(label);
    return original.call(this);
  });
}

async function bootAndRecord(): Promise<string[]> {
  const order: string[] = [];
  recordBootstrap(order, TickService.prototype, 'tick');
  recordModuleInit(order, GalaxyService.prototype, 'galaxy');
  recordModuleInit(order, ShipClassCacheService.prototype, 'ship-class-cache');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  // `init()` runs onModuleInit AND onApplicationBootstrap, in that order.
  await moduleRef.init();
  // close() before returning, so the real setInterval timers TickService opened
  // are cleared whatever the caller then asserts. A failed assertion that
  // skipped this would leak them into every later spec in the run.
  await moduleRef.close();
  return order;
}

describe('boot order', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts the heartbeats only after the galaxy and the class cache are built', async () => {
    const order = await bootAndRecord();

    expect(order).toContain('galaxy');
    expect(order).toContain('ship-class-cache');
    // The assertion that matters: tick is LAST, whatever order its two
    // predecessors ran in between themselves.
    expect(order.at(-1)).toBe('tick');
    expect(order.indexOf('tick')).toBeGreaterThan(order.indexOf('galaxy'));
    expect(order.indexOf('tick')).toBeGreaterThan(order.indexOf('ship-class-cache'));
  });

  it('holds on a second boot, so it is a contract and not a coincidence', async () => {
    // An order that varied run to run would make the assertion above a flake
    // rather than a contract, and would mean a later change could reorder
    // things without this file ever going red.
    expect((await bootAndRecord()).at(-1)).toBe('tick');
  });
});
