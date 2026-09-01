/**
 * Dev-only planet-economy accelerator for QA. Mounted only when
 * GE_DEBUG_ENDPOINTS is set.
 *
 * A real PLANTOCK is 1800s, so confirming that a colony grows, starves, banks
 * tax or runs its production rates correctly costs hours of wall-clock per
 * in-game day. This runs those ticks on demand.
 */

import { BadRequestException, Controller, Get, Post, Query } from '@nestjs/common';
import { PlanetTickService } from './planet-tick.service';
import { PlanetStateService } from './planet-state.service';

const MAX_FORCED_TICKS = 500;

@Controller('debug/planet')
export class PlanetDebugController {
  constructor(
    private readonly planetTick: PlanetTickService,
    private readonly planets: PlanetStateService,
  ) {}

  /** GET /debug/planet/state?x=0&y=0&p=1 — the LIVE in-memory planet, not the DB row. */
  @Get('state')
  state(@Query('x') x: string, @Query('y') y: string, @Query('p') p: string): object {
    const planet = this.planets.get(Number(x), Number(y), Number(p));
    if (!planet) return { ok: false, reason: 'not found' };
    return {
      ok: true,
      name: planet.name,
      userid: planet.userid,
      items: planet.items.map((it, i) => ({
        i, qty: it.qty.toString(), reserve: it.reserve, sell: it.sell, markup2a: it.markup2a,
      })),
    };
  }

  /**
   * POST /debug/planet/tick?times=N[&x=&y=&p=]
   *
   * Without x/y/p this ages EVERY populated planet, which includes the
   * neutral-zone trading posts — they carry 1,032,000 men, so their economy
   * runs too and a few hundred forced ticks starve their food and troops.
   * Name a planet to age just that one.
   */
  @Post('tick')
  async forceTick(
    @Query('times') timesParam?: string,
    @Query('x') x?: string,
    @Query('y') y?: string,
    @Query('p') p?: string,
  ): Promise<object> {
    const times = timesParam === undefined ? 1 : Number(timesParam);
    if (!Number.isInteger(times) || times < 1 || times > MAX_FORCED_TICKS) {
      throw new BadRequestException(`times must be an integer 1..${MAX_FORCED_TICKS}`);
    }

    let only: { xsect: number; ysect: number; plnum: number } | undefined;
    if (x !== undefined || y !== undefined || p !== undefined) {
      if (x === undefined || y === undefined || p === undefined) {
        throw new BadRequestException('x, y and p must be supplied together');
      }
      const parts = [Number(x), Number(y), Number(p)];
      if (!parts.every(Number.isInteger)) {
        throw new BadRequestException('x, y and p must be integers');
      }
      only = { xsect: parts[0], ysect: parts[1], plnum: parts[2] };
    }

    const result = await this.planetTick.forceTick(times, only);
    return { ok: true, ...result };
  }
}
