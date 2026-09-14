import { defineConfig } from 'vitest/config';

/**
 * Vitest for the wire contract.
 *
 * Replaces a Jest setup that existed for a single spec file and carried
 * `jest`, `ts-jest` and `@types/jest` — roughly 630 transitive packages — to
 * run it. The backend and the frontend were both already on Vitest; this was
 * the last Jest in the monorepo.
 *
 * Deliberately smaller than the backend's config. This package has no
 * decorators, so it needs no SWC transform for `emitDecoratorMetadata`; no
 * database, so it needs no global setup or single-threading. Vitest's default
 * esbuild transform is enough for plain TypeScript.
 *
 * `globals: true` matches the backend, so specs read the same in both places.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
  },
});
