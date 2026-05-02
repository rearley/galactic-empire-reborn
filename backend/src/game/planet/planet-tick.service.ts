import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TickService } from '../tick/tick.service';
import { TickKind } from '../tick/tick.types';
import { PLANTIME_MIN_SECONDS, PLANTOCK_SECONDS } from '../constants';
import { PlanetStateService } from './planet-state.service';
import { planetKey } from './planet-state.types';

/**
 * Subscribes to PLANET_UPDATE ticks and advances one planet per firing
 * in deterministic round-robin order.
 * Cadence: floor(PLANTOCK_SECONDS / planetCount) clamped to >= PLANTIME_MIN_SECONDS.
 * @see GEMAIN.C:656 plantime = plantock / numrecs (deliberate deviation in research Decision 3)
 * @see contracts/planet-tick.md
 */
@Injectable()
export class PlanetTickService implements OnModuleInit {
  private readonly logger = new Logger(PlanetTickService.name);
  private cursor = 0;
  private keys: string[] = [];

  constructor(
    private readonly planets: PlanetStateService,
    private readonly tickService: TickService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.keys = this.planets
      .all()
      .map((p) => planetKey(p.xsect, p.ysect, p.plnum));

    const intervalSec = Math.max(
      PLANTIME_MIN_SECONDS,
      Math.floor(PLANTOCK_SECONDS / Math.max(1, this.keys.length)),
    );

    this.logger.log(
      `PLANET_UPDATE cadence: every ${intervalSec}s (plantock=${PLANTOCK_SECONDS}s, planets=${this.keys.length})`,
    );

    this.tickService.subscribe(TickKind.PLANET_UPDATE, () => this.advance());
    this.tickService.startPlanetUpdateTimer(intervalSec * 1000);
  }

  private async advance(): Promise<void> {
    if (this.keys.length === 0) return;
    const key = this.keys[this.cursor];
    this.cursor = (this.cursor + 1) % this.keys.length;
    await this.planets.runEconomicTickFor(key);
  }
}
