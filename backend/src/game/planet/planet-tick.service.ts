import { shouldRunEconomy } from './planet-economy';
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
      // C skips a planet with no population outright — no starvation, no gold
      // conversion, no tax. @see GEMAIN.C:2132
      .filter((p) => shouldRunEconomy(p))
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

  /**
   * Run `times` production ticks immediately on every populated planet,
   * ignoring the PLANTOCK schedule. Playtest accelerator only — a real
   * PLANTOCK is 30 minutes, so watching a colony actually grow otherwise
   * costs hours of wall-clock per in-game day.
   *
   * Reached only through the GE_DEBUG_ENDPOINTS cheat routes; nothing in the
   * game loop calls it.
   */
  async forceTick(times: number): Promise<{ planets: number; ticks: number }> {
    const populated = this.planets.all().filter((p) => shouldRunEconomy(p));
    for (let i = 0; i < times; i++) {
      for (const p of populated) {
        await this.planets.runEconomicTickFor(planetKey(p.xsect, p.ysect, p.plnum));
      }
    }
    // Re-arm the normal schedule so the forced run does not also grant a free
    // scheduled tick on the next sweep.
    const nowMs = this.now();
    for (const p of populated) {
      this.lastTickMs.set(planetKey(p.xsect, p.ysect, p.plnum), nowMs);
    }
    return { planets: populated.length, ticks: times };
  }
}
