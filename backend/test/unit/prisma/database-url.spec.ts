/**
 * PrismaService must never point at the development database while tests run.
 *
 * Regression guard: 20 spec files build a Nest testing module around
 * PrismaModule and then call deleteMany()/TRUNCATE. Because PrismaService took
 * no datasource override it resolved DATABASE_URL — the dev database `ge` —
 * so a full `npm test` run silently destroyed dev game state (observed: the
 * Planet table emptied, leaving a galaxy that could never regenerate because
 * GalaxyMeta still existed).
 */

import { resolveDatabaseUrl } from '../../../src/prisma/database-url';

const DEV = 'postgresql://ge:ge@localhost:5432/ge';
const TEST = 'postgresql://ge:ge@localhost:5432/ge_test';

describe('resolveDatabaseUrl', () => {
  it('uses DATABASE_URL in normal (non-test) execution', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: DEV, TEST_DATABASE_URL: TEST })).toBe(DEV);
  });

  it('uses TEST_DATABASE_URL when running under a Jest worker', () => {
    expect(
      resolveDatabaseUrl({ DATABASE_URL: DEV, TEST_DATABASE_URL: TEST, JEST_WORKER_ID: '1' }),
    ).toBe(TEST);
  });

  it('uses TEST_DATABASE_URL when running under a Vitest worker', () => {
    // Vitest sets VITEST_WORKER_ID, never JEST_WORKER_ID. The NODE_ENV=test
    // fallback below happens to cover it today, but relying on that would make
    // the protection depend on a default the runner is free to change — and
    // what it protects is the development database.
    expect(
      resolveDatabaseUrl({ DATABASE_URL: DEV, TEST_DATABASE_URL: TEST, VITEST_WORKER_ID: '1' }),
    ).toBe(TEST);
  });

  it('uses TEST_DATABASE_URL when VITEST is set without a worker id', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: DEV, TEST_DATABASE_URL: TEST, VITEST: 'true' })).toBe(
      TEST,
    );
  });

  it('uses TEST_DATABASE_URL when NODE_ENV is test', () => {
    expect(
      resolveDatabaseUrl({ DATABASE_URL: DEV, TEST_DATABASE_URL: TEST, NODE_ENV: 'test' }),
    ).toBe(TEST);
  });

  it('throws under test when TEST_DATABASE_URL is unset rather than falling back to the dev DB', () => {
    expect(() => resolveDatabaseUrl({ DATABASE_URL: DEV, JEST_WORKER_ID: '1' })).toThrow(
      /TEST_DATABASE_URL/,
    );
    expect(() => resolveDatabaseUrl({ DATABASE_URL: DEV, VITEST_WORKER_ID: '1' })).toThrow(
      /TEST_DATABASE_URL/,
    );
  });

  it('resolves the real process env to the test database inside this suite', () => {
    // This spec itself runs under the test runner, so the live resolution must
    // be ge_test.
    expect(resolveDatabaseUrl()).toBe(process.env['TEST_DATABASE_URL']);
    expect(resolveDatabaseUrl()).not.toBe(process.env['DATABASE_URL']);
  });
});
