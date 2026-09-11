/**
 * Boot order is a contract, not an accident — and right now it is an accident.
 *
 * NestJS 12 executes lifecycle hooks by component hierarchy level, which can
 * reorder hooks that previously ran in registration order. `TickService`,
 * `GalaxyService` and `ShipClassCacheService` all implement `onModuleInit`, so
 * they are same-phase peers: Nest's phase ordering guarantees nothing between
 * them, and they are exactly what the v12 change moves.
 *
 * This file was written to assert that the heartbeats start LAST. It failed.
 * The measured order under NestJS 10 is:
 *
 *     tick  ->  galaxy  ->  ship-class-cache
 *
 * `TickService.onModuleInit` opens the 1-second ship-update and 6-second
 * physics `setInterval`s before the galaxy exists and before the ship-class
 * table has been read. That is a latent race, not an observed bug — the first
 * tick fires a second later, by which time boot has normally finished — and it
 * is filed rather than fixed, per the standing rule on pre-existing defects.
 * @see issue #30
 *
 * So this is a CHARACTERIZATION test. It pins the order as it is, not as it
 * should be, and its whole job is to make the Nest 12 upgrade's effect on that
 * order visible instead of silent. **If it fails during the upgrade, do not
 * adjust it** — report the new order. A green suite around a changed boot
 * order is precisely the failure this exists to prevent.
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
function recordHook(order: string[], proto: { onModuleInit: () => unknown }, label: string): void {
  const original = proto.onModuleInit;
  vi.spyOn(proto, 'onModuleInit').mockImplementation(function (this: unknown) {
    order.push(label);
    return original.call(this);
  });
}

async function bootAndRecord(): Promise<string[]> {
  const order: string[] = [];
  recordHook(order, TickService.prototype, 'tick');
  recordHook(order, GalaxyService.prototype, 'galaxy');
  recordHook(order, ShipClassCacheService.prototype, 'ship-class-cache');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  it('runs the three boot-critical onModuleInit hooks in a fixed order', async () => {
    expect(await bootAndRecord()).toEqual(['tick', 'galaxy', 'ship-class-cache']);
  });

  it('is the same order on a second boot, so the pin is not a coincidence', async () => {
    // An order that varies run to run would make the assertion above a flake
    // rather than a contract, and would mean the upgrade could reorder things
    // without this file ever going red.
    expect(await bootAndRecord()).toEqual(['tick', 'galaxy', 'ship-class-cache']);
  });
});
