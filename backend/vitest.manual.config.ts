/**
 * Opt-in manual smoke test suite. Run with: npm run test:manual
 *
 * Replaces `jest.manual.config.ts`. It deliberately does NOT load the shared
 * global setup: these specs are run by hand against a live stack, and resetting
 * `ge_test` underneath one is the opposite of what they are for.
 */
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Same reason as the main config: esbuild does not implement
  // `emitDecoratorMetadata`, so Nest's DI would resolve every injected
  // constructor parameter to `undefined`.
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: 'node',
    root: __dirname,
    include: ['test/manual/**/*.manual.spec.ts'],
    // The env the live stack runs on. Not the global setup — that resets
    // `ge_test`, which is exactly what these specs must not do. @see issue #37
    setupFiles: ['test/helpers/load-dotenv.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
    pool: 'forks',
  },
});
