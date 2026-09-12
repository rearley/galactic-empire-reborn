import { Controller, Get, HttpCode, Logger, OnApplicationBootstrap, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/** Shape returned by GET /health. */
export interface HealthResponse {
  status: 'ok' | 'error';
  database: 'up' | 'down';
  /**
   * Whether the database still holds the migrations it held when this process
   * booted. `unknown` when the migration table could not be read, which is a
   * different fault and must not be reported as drift.
   */
  schema: 'current' | 'moved' | 'unknown';
  /** Applied migration count, or -1 when it could not be read. */
  migrations: number;
  /** What moved, when something did — a reader should not have to go digging. */
  schemaDetail?: string;
  /** Process uptime in whole seconds. */
  uptime: number;
}

interface MigrationRow {
  migration_name: string;
}

/**
 * Liveness/readiness probe.
 *
 * `docker-compose.yml` healthchecks the backend container with
 * `wget -qO- http://localhost:3000/health`, so this route must stay
 * unauthenticated and cheap. It reports 503 rather than 200 when Postgres is
 * unreachable so an orchestrator does not route traffic to a backend that
 * cannot serve game state.
 *
 * It also reports 503 when the DATABASE HAS MOVED since this process booted,
 * which is the fault that made the first version of this file useless. A dev
 * backend started on 8 September 2026 kept running while a migration on the 9th
 * dropped a column its in-memory Prisma client still wrote; every ship flush
 * failed from that moment, 5,220,711 times over three days, and this endpoint
 * answered `{"status":"ok","database":"up"}` throughout — because connectivity
 * was never the problem. A process cannot notice its own client going stale, but
 * it can notice the migration list changing underneath it.
 *
 * Restarting is the remedy, and 503 is how an orchestrator is told to do it.
 * Production applies migrations in the entrypoint before the app starts, so the
 * boot snapshot is taken after them and a normal deploy never trips this.
 * @see issue #36
 */
@Controller('health')
export class HealthController implements OnApplicationBootstrap {
  private readonly logger = new Logger(HealthController.name);

  /** The applied migrations as they stood at boot. `null` if unreadable then. */
  private bootMigrations: string[] | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    this.bootMigrations = await this.appliedMigrations();
    // Identity at boot, because "what is running?" is the precondition for every
    // other question. The three-day outage was diagnosed by reading a 2.4 GB log,
    // and the process could have said this on the first line.
    this.logger.log(
      `Boot identity: ${this.bootMigrations?.length ?? '?'} migrations applied` +
        `${this.bootMigrations?.length ? ` (latest ${this.bootMigrations.at(-1)})` : ''}` +
        `, version ${process.env.APP_VERSION || 'dev'}, sha ${(process.env.GIT_SHA || 'unknown').slice(0, 7)}`,
    );
  }

  /** Applied, finished migrations in order, or `null` if the table is unreadable. */
  private async appliedMigrations(): Promise<string[] | null> {
    try {
      const rows = await this.prisma.$queryRaw<MigrationRow[]>`
        SELECT migration_name FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL
        ORDER BY migration_name
      `;
      return rows.map((r) => r.migration_name);
    } catch {
      return null;
    }
  }

  @Get()
  @HttpCode(200)
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const uptime = Math.floor(process.uptime());

    let database: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    if (database === 'down') {
      res.status(503);
      return { status: 'error', database, schema: 'unknown', migrations: -1, uptime };
    }

    const now = await this.appliedMigrations();
    if (now === null || this.bootMigrations === null) {
      // Cannot tell. Not drift, and not a reason to fail a probe: a database
      // that answers SELECT 1 but not the migration table is its own fault, and
      // reporting "moved" would send someone to restart the wrong thing.
      return { status: 'ok', database, schema: 'unknown', migrations: now?.length ?? -1, uptime };
    }

    const added = now.filter((m) => !this.bootMigrations!.includes(m));
    const removed = this.bootMigrations.filter((m) => !now.includes(m));
    if (added.length > 0 || removed.length > 0) {
      res.status(503);
      const detail =
        `${[...added.map((m) => `+${m}`), ...removed.map((m) => `-${m}`)].join(', ')} ` +
        'since this process booted — its Prisma client predates the change. Restart it.';
      return {
        status: 'error',
        database,
        schema: 'moved',
        migrations: now.length,
        schemaDetail: detail,
        uptime,
      };
    }

    return { status: 'ok', database, schema: 'current', migrations: now.length, uptime };
  }
}
