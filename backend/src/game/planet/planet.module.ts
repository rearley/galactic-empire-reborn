import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GalaxyModule } from '../galaxy/galaxy.module';
import { ShipModule } from '../ship/ship.module';
import { TickModule } from '../tick/tick.module';
import { MathRandomAdapter, RANDOM } from '../combat/random.port';
import { PlanetStateService } from './planet-state.service';
import { PlanetTickService } from './planet-tick.service';
import { PlanetEconomyService } from './planet-economy.service';

/**
 * PlanetModule provides its OWN binding for the RANDOM port (rather than
 * importing CombatModule) to avoid pulling the entire combat dependency
 * graph into the planet subsystem. The token is shared in name only —
 * production planets and combat both end up with MathRandomAdapter; tests
 * inject a Mulberry32Adapter into whichever provider they exercise.
 */
@Module({
  imports: [PrismaModule, GalaxyModule, ShipModule, TickModule],
  providers: [
    PlanetStateService,
    PlanetTickService,
    PlanetEconomyService,
    { provide: RANDOM, useClass: MathRandomAdapter },
  ],
  exports: [PlanetStateService, PlanetEconomyService],
})
export class PlanetModule {}
