/**
 * Dev-only force-spawn endpoint for QA. Excluded from production builds.
 * @see specs/008-droid-ai/quickstart.md — manual verification recipe
 */

import { Controller, Post, Query, BadRequestException } from '@nestjs/common';
import { DroidTickService } from './droid-tick.service';
import { DroidSpawner } from './droid-spawner';
import { DROID_CLASS_SCOW, DROID_CLASS_TRANSPORT, DROID_CLASS_VAKORY } from '../constants';

const VALID_CLASSES = [DROID_CLASS_SCOW, DROID_CLASS_TRANSPORT, DROID_CLASS_VAKORY];

@Controller('debug/droid')
export class DroidDebugController {
  constructor(
    private readonly spawner: DroidSpawner,
    private readonly droidTick: DroidTickService,
  ) {}

  /**
   * POST /debug/droid/spawn?class=31[&x=<num>&y=<num>]
   *   31=Scow, 32=Murdonian, 33=Vakory
   *
   * `x`/`y` place the droid at exact universe coordinates instead of scattering
   * it, so a playtester can put a target in front of their ship — read your
   * position with `rep nav` and spawn there. Both must be supplied together.
   */
  @Post('spawn')
  forceSpawn(
    @Query('class') classParam: string,
    @Query('x') xParam?: string,
    @Query('y') yParam?: string,
  ): object {
    const classNumber = parseInt(classParam, 10);
    if (!VALID_CLASSES.includes(classNumber as typeof VALID_CLASSES[number])) {
      throw new BadRequestException(`class must be one of ${VALID_CLASSES.join(', ')}`);
    }

    let at: { x: number; y: number } | undefined;
    if (xParam !== undefined || yParam !== undefined) {
      if (xParam === undefined || yParam === undefined) {
        throw new BadRequestException('x and y must be supplied together');
      }
      const x = Number(xParam);
      const y = Number(yParam);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new BadRequestException('x and y must be finite numbers');
      }
      at = { x, y };
    }

    const state = this.spawner.spawn(classNumber, this.droidTick.getLivePopulation(), at);
    if (!state) {
      return { ok: false, reason: 'spawn returned null' };
    }
    return { ok: true, userid: state.userid, shipno: state.shipno, classNumber, shipname: state.shipname, xcoord: state.xcoord, ycoord: state.ycoord };
  }
}
