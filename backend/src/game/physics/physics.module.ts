import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ShipModule } from '../ship/ship.module';
import { GalaxyModule } from '../galaxy/galaxy.module';
import { TickModule } from '../tick/tick.module';
import { PhysicsTickService } from './physics-tick.service';
import { ShipClassCacheService } from './ship-class-cache.service';
import { MathRandomAdapter, RANDOM } from '../combat/random.port';

/**
 * Physics tick — owns the 6-second per-ship advancement and the in-memory
 * ShipClass cache consumed by both the tick and the warp command.
 * @see specs/006a-physics-tick/plan.md
 */
@Module({
  // GalaxyModule supplies planet/wormhole positions for the gravity check.
  imports: [EventEmitterModule.forRoot(), ShipModule, TickModule, GalaxyModule],
  providers: [
    ShipClassCacheService,
    PhysicsTickService,
    // PhysicsTickService takes RANDOM as @Optional() so the many hand-built
    // test harnesses can construct it with fewer arguments. Nothing provided
    // one here, so in the RUNNING game it resolved to undefined and the
    // warp-boundary missile shake — guarded by `&& this.random` — could never
    // fire. Optional means "harnesses may omit it", not "production may".
    // @see GEFUNCS.C:497-521, test/e2e/missile-shake.e2e.spec.ts
    { provide: RANDOM, useClass: MathRandomAdapter },
  ],
  exports: [ShipClassCacheService],
})
export class PhysicsModule {}
