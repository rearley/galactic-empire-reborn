import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '../../prisma/prisma.module';
import { MidnightService } from './midnight.service';
import { MidnightRepository } from './midnight.repository';
import { AdminTokenGuard } from './admin-token.guard';
import { AdminMidnightController } from './admin-midnight.controller';

/**
 * Midnight maintenance module — nightly four-phase cleanup pass.
 *
 * @see GEMAIN.C:gemidnighta (1084-1335)
 * @see specs/009-midnight-job/plan.md
 */
@Module({
  imports: [PrismaModule, EventEmitterModule],
  providers: [MidnightService, MidnightRepository, AdminTokenGuard],
  controllers: [AdminMidnightController],
  exports: [MidnightService],
})
export class MidnightModule {}
