import { Controller, Get, Header } from '@nestjs/common';
import { StatsService, PublicStats } from './stats.service';

/**
 * Unauthenticated. Everything here is already visible in-game via `ros`, and
 * the 15s cache in StatsService is what makes it safe to leave open.
 */
@Controller('public')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('stats')
  @Header('Cache-Control', 'public, max-age=15')
  async getStats(): Promise<PublicStats> {
    return this.stats.getStats();
  }
}
