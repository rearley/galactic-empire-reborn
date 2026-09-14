import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlayerModule } from '../game/player/player.module';
import { PresenceService } from './presence.service';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { GuideController } from './guide.controller';
import { CalculatorController } from './calculator.controller';

@Module({
  imports: [PrismaModule, PlayerModule],
  controllers: [StatsController, GuideController, CalculatorController],
  providers: [PresenceService, StatsService],
  exports: [PresenceService],
})
export class PublicModule {}
