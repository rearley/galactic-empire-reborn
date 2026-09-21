/**
 * Points this worker at its own test database before any spec reads
 * `TEST_DATABASE_URL` — which every Prisma connection in the suite does,
 * `PrismaService` included (src/prisma/database-url.ts). @see ./test-workers.ts
 */
import { TEST_WORKERS, workerDatabaseUrl } from './test-workers';

if (process.env.TEST_DATABASE_URL) {
  process.env.TEST_DATABASE_URL = workerDatabaseUrl(
    process.env.TEST_DATABASE_URL, process.env.VITEST_POOL_ID, TEST_WORKERS,
  );
}
