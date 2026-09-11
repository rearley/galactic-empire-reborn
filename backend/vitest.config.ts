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

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: 'node',
    root: __dirname,
    include: [
      'test/prisma-schema/**/*.spec.ts',
      'test/auth/**/*.spec.ts',
      'test/unit/**/*.spec.ts',
      'test/integration/**/*.spec.ts',
      'test/e2e/**/*.spec.ts',
      'test/game/**/*.spec.ts',
      'test/gateway/**/*.spec.ts',
      'test/helpers/**/*.spec.ts',
      'test/balance/**/*.spec.ts',
      'test/mail/**/*.spec.ts',
      'test/team/**/*.spec.ts',
      'test/invariants/**/*.spec.ts',
      'test/public/**/*.spec.ts',
    ],
    globalSetup: ['test/prisma-schema/helpers/global-setup.ts'],
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
    // lets one suite's truncate wipe another's fixtures.
    fileParallelism: false,
    // Forks rather than threads, and NOT `singleFork`. Pinning all 627 files
    // into one long-lived process ran the heap into a native abort
    // (`memory allocation of 133606233069056 bytes failed`, core dumped) part
    // way through the run. A recycled child process per file bounds the memory
    // and keeps execution sequential, which is the property that actually
    // matters here.
    pool: 'forks',
  },
});
