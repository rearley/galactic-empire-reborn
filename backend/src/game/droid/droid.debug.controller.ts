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

  /** POST /debug/droid/spawn?class=31  (31=Scow, 32=Murdonian, 33=Vakory) */
  @Post('spawn')
  forceSpawn(@Query('class') classParam: string): object {
    const classNumber = parseInt(classParam, 10);
    if (!VALID_CLASSES.includes(classNumber as typeof VALID_CLASSES[number])) {
      throw new BadRequestException(`class must be one of ${VALID_CLASSES.join(', ')}`);
    }
    const state = this.spawner.spawn(classNumber, this.droidTick.getLivePopulation());
    if (!state) {
      return { ok: false, reason: 'spawn returned null' };
    }
    return { ok: true, userid: state.userid, shipno: state.shipno, classNumber };
  }
}
