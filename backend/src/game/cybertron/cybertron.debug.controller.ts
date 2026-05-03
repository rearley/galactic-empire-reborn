import { Controller, Get } from '@nestjs/common';
import { ShipStateService } from '../ship/ship-state.service';
import { buildCybertronClassConfigs } from './cybertron.config';

/**
 * Dev-only debug endpoint: per-class Cybertron population snapshot.
 * Gated behind NODE_ENV !== 'production' by the module registration.
 *
 * @see specs/007-cybertron-ai/quickstart.md step 2
 * @see specs/007-cybertron-ai/tasks.md T071
 */
@Controller('debug/cybertron-stats')
export class CybertronDebugController {
  private readonly classConfigs = buildCybertronClassConfigs();

  constructor(private readonly shipState: ShipStateService) {}

  @Get()
  getStats(): object {
    const allShips = this.shipState.findAllShips();
    const autoShips = allShips.filter((s) => s.status === 2 && s.userid.startsWith('Cybrg-'));

    const byClass: Record<number, { count: number; totToCreate: number }> = {};
    for (const [cls, cfg] of Object.entries(this.classConfigs)) {
      byClass[Number(cls)] = { count: 0, totToCreate: cfg.tot_to_create };
    }

    for (const ship of autoShips) {
      const entry = byClass[ship.shpclass];
      if (entry) {
        entry.count++;
      } else {
        byClass[ship.shpclass] = { count: 1, totToCreate: 0 };
      }
    }

    return {
      totalAutoShips: autoShips.length,
      byClass,
    };
  }
}
