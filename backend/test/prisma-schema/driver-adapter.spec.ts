/**
 * Prisma 7 has no query engine to hand a URL to, so the connection is made
 * through a driver adapter. The adapter must be built from
 * `resolveDatabaseUrl()`, because that function is the only thing stopping a
 * test run from truncating the DEVELOPMENT database.
 *
 * A connection string read straight from `DATABASE_URL` here would silently
 * undo that protection, and no other test would notice — every spec that
 * truncates would simply be truncating `ge` instead of `ge_test`, and pass.
 * That has happened here before, which is why `database-url.ts` exists.
 *
 * @see src/prisma/database-url.ts
 * @see docs/DECISIONS.md 2026-09-11
 */
import { PrismaService } from '../../src/prisma/prisma.service';

describe('PrismaService under Prisma 7', () => {
  it('connects to the test database, not the development one', async () => {
    const service = new PrismaService();
    await service.onModuleInit();
    try {
      const [row] = await service.$queryRaw<Array<{ db: string }>>`
        SELECT current_database() AS db`;
      expect(row.db).toBe('ge_test');
    } finally {
      await service.onModuleDestroy();
    }
  });

  it('runs a real query through the driver adapter', async () => {
    // Proves the adapter is wired, not just that the client constructed. A
    // PrismaClient with no adapter throws on the first query, not on `new`.
    const service = new PrismaService();
    await service.onModuleInit();
    try {
      await expect(service.shipClass.count()).resolves.toBeGreaterThanOrEqual(0);
    } finally {
      await service.onModuleDestroy();
    }
  });
});
