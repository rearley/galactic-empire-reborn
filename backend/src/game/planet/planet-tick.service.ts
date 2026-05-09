import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TickService } from '../tick/tick.service';
import { TickKind } from '../tick/tick.types';
import { PLANTIME } from '../constants';
import { PlanetStateService } from './planet-state.service';
import { planetKey } from './planet-state.types';

/**
 * Fires a production tick for every owned planet every PLANTIME seconds.
 * @see GEMAIN.C:469 plantime / GEPLANET.C:195 multiply()
 */
@Injectable()
export class PlanetTickService implements OnModuleInit {
  private readonly logger = new Logger(PlanetTickService.name);

  constructor(
    private readonly planets: PlanetStateService,
    private readonly tickService: TickService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(`PLANET_UPDATE cadence: every ${PLANTIME}s (all owned planets per tick)`);
    this.tickService.subscribe(TickKind.PLANET_UPDATE, () => this.advance());
    this.tickService.startPlanetUpdateTimer(PLANTIME * 1000);
  }

  private async advance(): Promise<void> {
    const owned = this.planets.all().filter((p) => p.userid !== null);
    for (const p of owned) {
      await this.planets.runEconomicTickFor(planetKey(p.xsect, p.ysect, p.plnum));
    }
  }
}
