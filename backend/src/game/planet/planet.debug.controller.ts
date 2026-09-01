/**
 * Dev-only planet-economy accelerator for QA. Mounted only when
 * GE_DEBUG_ENDPOINTS is set.
 *
 * A real PLANTOCK is 1800s, so confirming that a colony grows, starves, banks
 * tax or runs its production rates correctly costs hours of wall-clock per
 * in-game day. This runs those ticks on demand.
 */

import { BadRequestException, Controller, Post, Query } from '@nestjs/common';
import { PlanetTickService } from './planet-tick.service';

const MAX_FORCED_TICKS = 500;

@Controller('debug/planet')
export class PlanetDebugController {
  constructor(private readonly planetTick: PlanetTickService) {}

  /** POST /debug/planet/tick?times=N — N production ticks on every populated planet. */
  @Post('tick')
  async forceTick(@Query('times') timesParam?: string): Promise<object> {
    const times = timesParam === undefined ? 1 : Number(timesParam);
    if (!Number.isInteger(times) || times < 1 || times > MAX_FORCED_TICKS) {
      throw new BadRequestException(`times must be an integer 1..${MAX_FORCED_TICKS}`);
    }
    const result = await this.planetTick.forceTick(times);
    return { ok: true, ...result };
  }
}
