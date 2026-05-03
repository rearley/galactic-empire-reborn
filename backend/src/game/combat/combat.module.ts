import { Logger, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '../../prisma/prisma.module';
import { PhysicsModule } from '../physics/physics.module';
import { ShipModule } from '../ship/ship.module';
import { TickModule } from '../tick/tick.module';
import { CombatTickService } from './combat-tick.service';
import { MineRegistry } from './mine.registry';
import { MineRepository } from './mine.repository';
import { MathRandomAdapter, RANDOM } from './random.port';

/**
 * Combat module — owns ship-to-ship combat: phasers, torpedoes, missiles,
 * mines, decoys, jammers. Subscribes to PHYSICS tick AFTER PhysicsTickService
 * (PhysicsModule import guarantees ordering — see CombatTickService.onModuleInit).
 *
 * Note: EventEmitterModule is imported (no `.forRoot()`) — PhysicsModule
 * already calls forRoot(), so we just consume the same global emitter.
 *
 * @see specs/006b-combat/plan.md
 */
@Module({
  imports: [PhysicsModule, ShipModule, TickModule, PrismaModule, EventEmitterModule],
  providers: [
    CombatTickService,
    MineRepository,
    MineRegistry,
    { provide: RANDOM, useClass: MathRandomAdapter },
    Logger,
  ],
  exports: [CombatTickService, RANDOM],
})
export class CombatModule {}
