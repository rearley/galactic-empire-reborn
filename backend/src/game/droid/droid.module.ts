import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CybertronModule } from '../cybertron/cybertron.module';
import { ShipModule } from '../ship/ship.module';
import { TickModule } from '../tick/tick.module';
import { PhysicsModule } from '../physics/physics.module';
import { CombatModule } from '../combat/combat.module';
import { DroidTickService } from './droid-tick.service';
import { DroidSpawner } from './droid-spawner';
import { DroidDebugController } from './droid.debug.controller';

const devOnlyControllers = process.env.NODE_ENV !== 'production' ? [DroidDebugController] : [];

/**
 * Droid AI module — drives ephemeral Droid ship behavior.
 * Subscribes to TickKind.PHYSICS after CybertronModule (import order guarantees this).
 *
 * @see specs/008-droid-ai/plan.md §Architecture
 * @see GEDROIDS.C — droid_lives, droid_init
 */
@Module({
  imports: [CybertronModule, CombatModule, PhysicsModule, ShipModule, TickModule, EventEmitterModule],
  controllers: [...devOnlyControllers],
  providers: [DroidTickService, DroidSpawner],
  exports: [DroidTickService],
})
export class DroidModule {}
