import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ShipModule } from '../ship/ship.module';
import { TickModule } from '../tick/tick.module';
import { PhysicsTickService } from './physics-tick.service';
import { ShipClassCacheService } from './ship-class-cache.service';

/**
 * Physics tick — owns the 6-second per-ship advancement and the in-memory
 * ShipClass cache consumed by both the tick and the warp command.
 * @see specs/006a-physics-tick/plan.md
 */
@Module({
  imports: [EventEmitterModule.forRoot(), ShipModule, TickModule],
  providers: [ShipClassCacheService, PhysicsTickService],
  exports: [ShipClassCacheService],
})
export class PhysicsModule {}
