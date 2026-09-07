import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PresenceService } from './presence.service';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';

@Module({
  imports: [PrismaModule],
  controllers: [StatsController],
  providers: [PresenceService, StatsService],
  exports: [PresenceService],
})
export class PublicModule {}
