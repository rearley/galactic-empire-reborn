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
 * **`singleThread` replaces Jest's `maxWorkers: 1`**, for the same unchanged
 * reason: every suite shares the one `ge_test` database, and running them in
 * parallel lets one suite's truncate wipe another's fixtures. Sequential
 * execution is the simplest correct isolation here.
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
  setupFiles: ['test/helpers/test-galaxy-size.ts'],
  testTimeout: 30_000,
  // `fileParallelism: false` is the direct replacement for Jest's
  // `maxWorkers: 1`, and it is here for the same unchanged reason: every
  // suite shares the one `ge_test` database, so running two files at once
  // lets one suite's truncate wipe another's fixtures. It still holds with
  // the projects split: the two run one after the other, not side by side.
  fileParallelism: false,
  // Forks rather than threads, and NOT `singleFork`. Pinning all 627 files
  // into one long-lived process ran the heap into a native abort
  // (`memory allocation of 133606233069056 bytes failed`, core dumped) part
  // way through the run. A recycled child process per file bounds the memory
  // and keeps execution sequential, which is the property that actually
  // matters here.
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
