import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ShipModule } from '../ship/ship.module';
import { TeamRepository } from './team.repository';
import { TeamService } from './team.service';

@Module({
  imports: [PrismaModule, ShipModule],
  providers: [TeamRepository, TeamService],
  exports: [TeamService, TeamRepository],
})
export class TeamModule {}
