import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlayerModule } from '../player/player.module';
import { GalaxyModule } from '../galaxy/galaxy.module';
import { ShipStateModule } from '../ship/ship-state.module';
import { TickModule } from '../tick/tick.module';
import { MathRandomAdapter, RANDOM } from '../combat/random.port';
import { PlanetStateService } from './planet-state.service';
import { PLANET_STATE_PORT } from './planet-state.port';
import { PlanetTickService } from './planet-tick.service';
import { PlanetEconomyService } from './planet-economy.service';
import { PlanetAttackService } from './planet-attack.service';
import { PlanetDebugController } from './planet.debug.controller';
import { debugEndpointsEnabled } from '../../debug/debug-endpoints';
import {
  PLATTRT1, PLATTRT2, PLATTRF1, PLATTRF2, PLATTRF3, FIRETICKS,
  loadPlattrt1, loadPlattrt2, loadPlattrf1, loadPlattrf2, loadPlattrf3, loadFireticks,
} from '../commands/attack.config';

/**
 * PlanetModule provides its OWN binding for the RANDOM port (rather than
 * importing CombatModule) to avoid pulling the entire combat dependency
 * graph into the planet subsystem. The token is shared in name only —
 * production planets and combat both end up with MathRandomAdapter; tests
 * inject a Mulberry32Adapter into whichever provider they exercise.
 */
const devOnlyControllers = debugEndpointsEnabled() ? [PlanetDebugController] : [];

@Module({
  controllers: devOnlyControllers,
  imports: [PrismaModule, PlayerModule, GalaxyModule, ShipStateModule, TickModule],
  providers: [
    PlanetStateService,
    PlanetTickService,
    PlanetEconomyService,
    PlanetAttackService,
    { provide: PLANET_STATE_PORT, useExisting: PlanetStateService },
    { provide: RANDOM, useClass: MathRandomAdapter },
    { provide: PLATTRT1, useFactory: () => loadPlattrt1() },
    { provide: PLATTRT2, useFactory: () => loadPlattrt2() },
    { provide: PLATTRF1, useFactory: () => loadPlattrf1() },
    { provide: PLATTRF2, useFactory: () => loadPlattrf2() },
    { provide: PLATTRF3, useFactory: () => loadPlattrf3() },
    { provide: FIRETICKS, useFactory: () => loadFireticks() },
  ],
  exports: [PlanetStateService, PlanetEconomyService, PlanetAttackService, PlanetTickService, PLANET_STATE_PORT],
})
export class PlanetModule {}
