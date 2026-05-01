import { Controller, Get } from '@nestjs/common';
import { TickService } from '../game/tick/tick.service';
import { TickKind } from '../game/tick/tick.types';

@Controller('debug')
export class DebugController {
  constructor(private readonly tickService: TickService) {}

  @Get('tick-stats')
  getTickStats(): { shipUpdate: number; physics: number } {
    const stats = this.tickService.getStats();
    return {
      shipUpdate: stats[TickKind.SHIP_UPDATE],
      physics: stats[TickKind.PHYSICS],
    };
  }
}
