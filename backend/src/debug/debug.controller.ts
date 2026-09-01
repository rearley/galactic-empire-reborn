import { Controller, Get } from '@nestjs/common';
import { TickService } from '../game/tick/tick.service';
import { TickKind } from '../game/tick/tick.types';

@Controller('debug')
export class DebugController {
  constructor(private readonly tickService: TickService) {}

  @Get('tick-stats')
  getTickStats(): { shipUpdate: number; physics: number; planetUpdate: number } {
    const stats = this.tickService.getStats();
    return {
      shipUpdate: stats[TickKind.SHIP_UPDATE],
      physics: stats[TickKind.PHYSICS],
      // The planet economy runs on its own timer, started by PlanetTickService
      // rather than in TickService.onModuleInit. Omitting it here hid the fact
      // that a stalled planet tick is invisible from the outside.
      planetUpdate: stats[TickKind.PLANET_UPDATE],
    };
  }
}
