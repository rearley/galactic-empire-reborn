/**
 * Vitest for a NestJS backend that is still CommonJS.
 *
 * Replaces `jest.config.ts`. Three of these options are load-bearing and one
 * of them is not obvious, so each says why rather than being copied forward.
 *
 * **The SWC transform is not a preference.** Vitest's default esbuild transform
 * does not implement `emitDecoratorMetadata`, so `design:paramtypes` is never
 * emitted, every Nest constructor injection resolves to `undefined`, and the
 * failure surfaces at runtime as an unrelated null dereference rather than at
 * type-check. @see https://docs.nestjs.com/recipes/swc
 *
 * **Files run in parallel, each worker on its own database.** This once ran
 * one file at a time (Jest's `maxWorkers: 1`) because every suite shared the
 * one `ge_test`, and one file's truncate could wipe another's fixtures. Since
 * #51 the global setup clones `ge_test_1` … `ge_test_N`, one per worker, so
 * nothing is shared and the suite runs about three times faster.
 * @see test/helpers/test-workers.ts
 *
 * **Two projects, split on `isolate`.** The suite was 283s, and the breakdown
 * said `import 47% / tests 44%` — most of it was re-evaluating 1,006 modules
 * 1,757 times, once per file. `isolate: false` evaluates them once per worker
 * instead and the suite is ~89s. It is not safe for every file: a spec that
 * mocks a module, touches `process.env`, or stands up a Nest module shares that
 * state with its neighbours. Those keep their own graph. Which file lands where
 * is READ OFF THE FILE by `test/helpers/isolation-policy.ts` rather than
 * listed, because a hand-maintained list is a snapshot of one afternoon's
 * failures and the next spec to stub an env var would join `shared` silently.
 * @see issue #51
 *
 * **`globals: true`** keeps `describe`/`it`/`expect` available without an
 * import across 640-odd spec files. Migrating those imports is a separate
 * question from changing the runner and is not bundled into it.
 *
 * The galaxy-size note from the Jest config is preserved below verbatim in
 * substance, because it explains a deliberate deviation and deleting it would
 * lose the reason.
 */
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { splitSpecs } from './test/helpers/isolation-policy';
import { TEST_WORKERS } from './test/helpers/test-workers';

const { isolated, shared } = splitSpecs(__dirname);

/**
 * Everything both projects need. Repeated rather than inherited because Vitest
 * does not merge the root `test` block into a project's, and a silently dropped
 * `setupFiles` here would regenerate the full-size galaxy in every spec.
 */
const common = {
  globals: true,
  environment: 'node' as const,
  root: __dirname,
  // Galaxy generation is O((2*UNIVMAX+1)^2) and several suites regenerate the
  // whole world per run. At the deployed UNIVMAX=100 that is 40_401 sectors
  // each time, which took the suite from ~4 to ~10 minutes. Tests exercise
  // generation LOGIC, not world size, so they run a small galaxy.
  //
  // The one property that genuinely depends on the deployed size -- that the
  // galaxy is large enough that no ship's weapon reach dominates it -- is
  // asserted against backend/config/game.config.json directly, so shrinking
  // the galaxy here cannot mask a bad deployed value.
  // @see test/integration/range-and-ai.spec.ts
  setupFiles: ['test/helpers/test-galaxy-size.ts', 'test/helpers/per-worker-db.ts'],
  testTimeout: 30_000,
  // Files run in PARALLEL, one worker per core up to four, and each worker has
  // a database of its own (`ge_test_1` … `ge_test_N`, cloned by the global
  // setup). This used to be `fileParallelism: false`, Jest's `maxWorkers: 1`,
  // because every suite shared the one `ge_test` and one file's truncate could
  // wipe another's fixtures. Nothing is shared now, so nothing needs sorting
  // into "touches the database" and "does not" — the split issue #51 first
  // proposed, which measurement showed would have parallelised only the cheap
  // files. ~150 s became ~50 s. @see test/helpers/test-workers.ts
  fileParallelism: true,
  maxWorkers: TEST_WORKERS,
  // Forks rather than threads, and NOT `singleFork`. Pinning all 627 files
  // into one long-lived process ran the heap into a native abort
  // (`memory allocation of 133606233069056 bytes failed`, core dumped) part
  // way through the run. A recycled child process per file bounds the memory.
  // (This once also said forks kept execution sequential; it is parallel now,
  // one database per worker — see `fileParallelism` above.)
  //
  // `isolate: false` in the `shared` project moves toward that old failure by
  // reusing one graph per worker, so peak RSS was measured after the split
  // rather than assumed. @see issue #51
  pool: 'forks' as const,
};

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globalSetup: ['test/prisma-schema/helpers/global-setup.ts'],
    projects: [
      {
        plugins: [swc.vite()],
        test: {
          ...common,
          name: 'shared',
          include: shared,
          // The 193 seconds. Safe here precisely because `isolation-policy.ts`
          // kept every file that reaches outside its own scope out of this list.
          isolate: false,
        },
      },
      {
        plugins: [swc.vite()],
        test: {
          ...common,
          name: 'isolated',
          include: isolated,
          // Exactly the behaviour the whole suite had before the split.
          isolate: true,
        },
      },
    ],
  },
});
