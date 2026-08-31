import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { TickService } from '../tick/tick.service';
import { TickKind } from '../tick/tick.types';
import { PLANTIME, PLANTOCK_SECONDS } from '../constants';
import { PlanetStateService } from './planet-state.service';
import { planetKey } from './planet-state.types';

/**
 * Fires a production tick for every owned planet every PLANTIME seconds.
 * @see GEMAIN.C:469 plantime / GEPLANET.C:195 multiply()
 */
/**
 * Planet records processed per sweep, as C's `plarti` does.
 * @see GEMAIN.C:963 `#define MAXTIC 20`
 */
export const MAXTIC = 20;

@Injectable()
export class PlanetTickService implements OnModuleInit {
  private readonly logger = new Logger(PlanetTickService.name);

  /** When each planet last had its economy run, keyed by planetKey. */
  private readonly lastTickMs = new Map<string, number>();

  constructor(
    private readonly planets: PlanetStateService,
    private readonly tickService: TickService,
    /**
     * Injectable clock so the cadence can be tested without real time.
     * Optional: Nest has no token for it and falls back to the default.
     */
    @Optional() private readonly now: () => number = () => Date.now(),
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(
      `PLANET_UPDATE sweep every ${PLANTIME}s; each planet updated once per ${PLANTOCK_SECONDS}s ` +
      `(max ${MAXTIC} per sweep)`,
    );
    this.tickService.subscribe(TickKind.PLANET_UPDATE, () => this.advance());
    this.tickService.startPlanetUpdateTimer(PLANTIME * 1000);
  }

  /**
   * One sweep. A planet is due when PLANTOCK has elapsed since its own last
   * update, and at most MAXTIC are processed per sweep — C walks the planet file
   * with a persistent cursor, doing up to MAXTIC records per kick and pacing the
   * kicks so a full pass takes `plantock` (GEMAIN.C:656, plarti).
   *
   * Running every owned planet on every sweep made the economy ~33x too fast.
   */
  private async advance(): Promise<void> {
    const nowMs = this.now();
    const periodMs = PLANTOCK_SECONDS * 1000;

    const due = this.planets
      .all()
      .filter((p) => p.userid !== null)
      .filter((p) => {
        const key = planetKey(p.xsect, p.ysect, p.plnum);
        const last = this.lastTickMs.get(key);
        return last === undefined || nowMs - last >= periodMs;
      })
      .slice(0, MAXTIC);

    for (const p of due) {
      const key = planetKey(p.xsect, p.ysect, p.plnum);
      this.lastTickMs.set(key, nowMs);
      await this.planets.runEconomicTickFor(key);
    }
  }
}
