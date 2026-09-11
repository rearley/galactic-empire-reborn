/**
 * Where the Prisma CLI finds the database, since Prisma 7 removed `url` from
 * the datasource block.
 *
 * This is the MIGRATION connection only — `prisma migrate`, `prisma db push`,
 * `prisma db seed`. The APPLICATION's connection is built in
 * `src/prisma/prisma.service.ts` from `resolveDatabaseUrl()`, which binds a
 * test run to TEST_DATABASE_URL so a spec that truncates tables can never
 * reach the development database.
 *
 * Keeping them separate is deliberate. If this file resolved the application's
 * URL too, that protection would move out of a unit-tested function and into
 * CLI configuration, where nothing asserts it.
 *
 * Prisma 7 no longer reads `.env` on its own, so this file loads it. Without
 * that the CLI fails with `PrismaConfigEnvError: Cannot resolve environment
 * variable: DATABASE_URL` even though the variable is sitting in `backend/.env`
 * where it always was.
 *
 * @see src/prisma/database-url.ts
 * @see docs/DECISIONS.md 2026-09-11
 */
import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

loadEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: env('DATABASE_URL') },
  migrations: { seed: 'ts-node prisma/seed.ts' },
});
