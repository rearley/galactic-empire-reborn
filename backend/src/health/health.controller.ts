import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/** Shape returned by GET /health. */
export interface HealthResponse {
  status: 'ok' | 'error';
  database: 'up' | 'down';
  /** Process uptime in whole seconds. */
  uptime: number;
}

/**
 * Liveness/readiness probe.
 *
 * `docker-compose.yml` healthchecks the backend container with
 * `wget -qO- http://localhost:3000/health`, so this route must stay
 * unauthenticated and cheap. It reports 503 rather than 200 when Postgres is
 * unreachable so an orchestrator does not route traffic to a backend that
 * cannot serve game state.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(200)
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    let database: 'up' | 'down' = 'up';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    if (database === 'down') {
      res.status(503);
      return { status: 'error', database, uptime: Math.floor(process.uptime()) };
    }

    return { status: 'ok', database, uptime: Math.floor(process.uptime()) };
  }
}
