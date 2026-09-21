/**
 * Each Vitest worker gets its own test database, so the suite can run files in
 * parallel without one file's truncate wiping another's fixtures. @see #51
 */
import { TEST_WORKERS, workerDatabaseUrl } from './test-workers';

const BASE = 'postgresql://ge:ge@localhost:5432/ge_test';

describe('workerDatabaseUrl', () => {
  it('gives worker N the database ge_test_N', () => {
    expect(workerDatabaseUrl(BASE, '1', 4)).toBe('postgresql://ge:ge@localhost:5432/ge_test_1');
    expect(workerDatabaseUrl(BASE, '4', 4)).toBe('postgresql://ge:ge@localhost:5432/ge_test_4');
  });

  it('keeps credentials, host and query string intact', () => {
    expect(workerDatabaseUrl('postgresql://u:p%40ss@db:6543/ge_test?schema=public', '2', 4))
      .toBe('postgresql://u:p%40ss@db:6543/ge_test_2?schema=public');
  });

  it('leaves the URL alone outside a worker, e.g. in global setup', () => {
    expect(workerDatabaseUrl(BASE, undefined, 4)).toBe(BASE);
  });

  it('refuses a worker id with no database made for it, rather than sharing one', () => {
    expect(() => workerDatabaseUrl(BASE, '5', 4)).toThrow(/worker 5/);
  });

  it('never rewrites twice', () => {
    expect(workerDatabaseUrl(workerDatabaseUrl(BASE, '3', 4), '3', 4)).toBe('postgresql://ge:ge@localhost:5432/ge_test_3');
  });
});

describe('TEST_WORKERS', () => {
  it('is between 1 and 4', () => {
    expect(TEST_WORKERS).toBeGreaterThanOrEqual(1);
    expect(TEST_WORKERS).toBeLessThanOrEqual(4);
  });
});
