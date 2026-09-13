/**
 * A raw `PrismaClient` for the handful of specs that need one alongside
 * `PrismaService` — usually to seed rows before the application boots.
 *
 * Prisma 7 removed the `datasources` option; a connection now requires a driver
 * adapter. Rather than repeat that construction at seven call sites, it lives
 * here once, with the missing-URL case turned into a loud failure instead of a
 * client that constructs happily and throws on its first query.
 *
 * This is NOT the shared test client. `test/prisma-schema/helpers/prisma-test-client.ts`
 * owns the singleton bound to `TEST_DATABASE_URL` along with `truncateAll()`;
 * prefer that one. This exists for specs that need a SECOND, separately
 * configured connection.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/prisma/client';

export function makePrismaClient(connectionString: string | undefined): PrismaClient {
  if (!connectionString) {
    throw new Error(
      'makePrismaClient was given no connection string. A spec that needs its own ' +
        'Prisma connection must pass one — TEST_DATABASE_URL in almost every case.',
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
