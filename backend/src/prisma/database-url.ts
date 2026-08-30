/**
 * Chooses which Postgres database the Prisma client connects to.
 *
 * Under Jest, specs build Nest testing modules around PrismaModule and then
 * truncate tables. Without this guard PrismaService resolved `DATABASE_URL`
 * (the dev database), so running the suite destroyed dev game state. Test runs
 * must therefore bind to `TEST_DATABASE_URL`, and must fail loudly rather than
 * silently fall back to the dev database when it is missing.
 */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const isTest = Boolean(env['JEST_WORKER_ID']) || env['NODE_ENV'] === 'test';

  if (!isTest) return env['DATABASE_URL'];

  const testUrl = env['TEST_DATABASE_URL'];
  if (!testUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Refusing to run tests against DATABASE_URL — ' +
        'a test run would truncate the development database. ' +
        'Copy backend/.env.example to backend/.env and set TEST_DATABASE_URL.',
    );
  }

  return testUrl;
}
