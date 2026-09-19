import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlayerModule } from '../game/player/player.module';
import { PresenceService } from './presence.service';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { GuideController } from './guide.controller';
import { ChangelogController } from './changelog.controller';
import { CalculatorController } from './calculator.controller';
import { MyPlanetsController } from './my-planets.controller';
import { PlanetModule } from '../game/planet/planet.module';

@Module({
  imports: [PrismaModule, PlayerModule, PlanetModule],
  controllers: [StatsController, GuideController, ChangelogController, CalculatorController, MyPlanetsController],
  providers: [PresenceService, StatsService],
  exports: [PresenceService],
})
export class PublicModule {}
