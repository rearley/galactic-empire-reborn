import { Module } from '@nestjs/common';
import { CybertronControlModule } from './cybertron-control.module';
import { CombatModule } from '../combat/combat.module';
import { ShipModule } from '../ship/ship.module';
import { TickModule } from '../tick/tick.module';
import { PhysicsModule } from '../physics/physics.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { CybertronTickService } from './cybertron-tick.service';
import { CybertronRepository } from './cybertron.repository';
import { CybertronDebugController } from './cybertron.debug.controller';
import { debugEndpointsEnabled } from '../../debug/debug-endpoints';
import { EventEmitterModule } from '@nestjs/event-emitter';

const devOnlyControllers = debugEndpointsEnabled() ? [CybertronDebugController] : [];

/**
 * Cybertron AI module — drives persistent Cybertron and Sartern ship behavior.
 * Subscribes to TickKind.PHYSICS after CombatModule (import order guarantees this
 * via NestJS dependency-order onModuleInit).
 *
 * @see specs/007-cybertron-ai/plan.md R-1 (tick ordering)
 * @see GECYBS.C — cyb_lives state machine
 */
@Module({
  // PhysicsModule must stay imported — onModuleInit boot-seed reads ShipClassCacheService
  // to populate spawn stats (phasrtype, shieldtype); dropping it would silently spawn
  // Cybertrons with fallback phaser/shield type 1 (too weak for gameplay).
  imports: [CybertronControlModule, CombatModule, PhysicsModule, ShipModule, TickModule, PrismaModule, EventEmitterModule],
  controllers: [...devOnlyControllers],
  providers: [CybertronTickService, CybertronRepository],
  exports: [CybertronTickService, CybertronRepository],
})
export class CybertronModule {}
