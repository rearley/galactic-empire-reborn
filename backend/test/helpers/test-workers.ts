import { availableParallelism } from 'node:os';

/**
 * How many Vitest workers run the backend suite, and the database each uses.
 *
 * Files run in parallel, one worker per core up to four, and each worker has a
 * database of its own — `ge_test_1` … `ge_test_N`, cloned from the freshly reset
 * `ge_test` by the global setup. That is what makes parallelism safe without
 * sorting 700 files into "touches the database" and "does not": nothing is
 * shared, so nothing needs classifying. The suite went from ~150 s to ~50 s.
 *
 * Issue #51 proposed the other design, a parallel `pure` project and a serial
 * `db` one, and measured first: the import-graph classifier certifies only ~200
 * files as database-free, and they were already the cheap ones. The time was in
 * the 85 isolated files, most of which reach Prisma.
 * @see issue #51, docs/DECISIONS.md 2026-09-21
 */
export const TEST_WORKERS = Math.max(1, Math.min(4, availableParallelism()));

/**
 * The test database for one worker: `…/ge_test` becomes `…/ge_test_<poolId>`.
 * Outside a worker (no pool id, as in the global setup) the URL is unchanged.
 * A pool id with no database made for it throws, rather than quietly pointing
 * two workers at one database — the exact interference this exists to prevent.
 */
export function workerDatabaseUrl(url: string, poolId: string | undefined, workers: number): string {
  if (poolId === undefined) return url;
  const n = Number(poolId);
  if (!Number.isInteger(n) || n < 1 || n > workers) {
    throw new Error(`worker ${poolId} has no test database: only ge_test_1..${workers} are created`);
  }
  const u = new URL(url);
  const name = u.pathname.slice(1).replace(/_\d+$/, '');
  u.pathname = `/${name}_${n}`;
  return u.toString();
}
