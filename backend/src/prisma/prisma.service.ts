import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './client';
import { resolveDatabaseUrl } from './database-url';

/**
 * Owns the Prisma lifecycle — connects on module init, disconnects on destroy.
 * If $connect() throws, the bootstrap error propagates and the process exits non-zero (FR-013).
 * @see https://docs.nestjs.com/recipes/prisma
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Prisma 7 has no query engine to hand a URL to, so the connection is made
    // through a driver adapter instead of the removed `datasources` option.
    // The URL still comes from `resolveDatabaseUrl()`, which binds test runs to
    // TEST_DATABASE_URL so specs that truncate tables can never reach the
    // development database. @see ./database-url.ts
    super({ adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // Prisma 7's driver adapter connects LAZILY. `$connect()` resolves against
    // a pool that has not opened a socket yet, so an unreachable database or a
    // wrong password boots "successfully" and fails at the first player action
    // instead of at startup. FR-013 requires the process to exit non-zero at
    // boot, and Prisma 5 satisfied it because the engine connected eagerly.
    //
    // One trivial round trip restores that, while the process can still refuse
    // to start. Pinned by test/integration/prisma-lifecycle.spec.ts, which
    // poisons the connection string and requires app.init() to reject.
    await this.$queryRaw`SELECT 1`;
    console.log('[Nest] LOG [PrismaService]   Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    console.log('[Nest] LOG [PrismaService]   Disconnected from PostgreSQL');
  }
}

/**
 * `resolveDatabaseUrl()` with the `undefined` case turned into a loud failure.
 *
 * It already throws when a TEST run has no `TEST_DATABASE_URL`. The remaining
 * `undefined` is an application run with no `DATABASE_URL` at all, which the
 * old `datasources` option accepted and quietly turned into a connection
 * attempt against whatever `PGDATABASE`/`PGUSER` happened to be set. Saying so
 * here is better than casting the type away and finding out at the first query.
 */
function requireDatabaseUrl(): string {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. PrismaService has no connection string to give the ' +
        'driver adapter. Copy backend/.env.example to backend/.env and set it.',
    );
  }
  return url;
}
