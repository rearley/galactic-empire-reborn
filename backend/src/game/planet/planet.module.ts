import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GalaxyModule } from '../galaxy/galaxy.module';
import { ShipModule } from '../ship/ship.module';
import { TickModule } from '../tick/tick.module';
import { PlanetStateService } from './planet-state.service';
import { PlanetTickService } from './planet-tick.service';

@Module({
  imports: [PrismaModule, GalaxyModule, ShipModule, TickModule],
  providers: [PlanetStateService, PlanetTickService],
  exports: [PlanetStateService],
})
export class PlanetModule {}
