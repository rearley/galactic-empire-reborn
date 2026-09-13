import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The production image installs its runtime dependencies, not the build ones.
 *
 * The runtime stage used to copy the builder's whole `node_modules`, because
 * `docker-entrypoint.sh` shells `./node_modules/.bin/prisma migrate deploy` at
 * container start and the CLI was a devDependency. So the build toolchain
 * shipped to production: `@swc/core`, `@rolldown`, `vite`, `@nestjs/cli`,
 * `vitest` and the linter, about 250MB of an image watchtower pulls on every
 * merge to master.
 *
 * `npm ci --omit=dev` could not be used until the classification was fixed,
 * and the classification was wrong in the dangerous direction: `@prisma/client`
 * was a devDependency while `dist/generated/prisma` requires
 * `@prisma/client/runtime/client` at runtime. An `--omit=dev` install before
 * that move produced an image that could not boot.
 *
 * A file test, like its neighbours: CI has no Docker daemon, so this guards the
 * directives and a human verifies the boot.
 * @see issue #7, issue #39  @see dockerfile-nonroot.spec.ts
 */
const BACKEND = join(__dirname, '../..');
const REPO = join(BACKEND, '..');
const read = (rel: string): string => readFileSync(join(REPO, rel), 'utf8');

const dockerfile = read('backend/Dockerfile');
/** Directive lines only — a comment naming a package proves nothing. */
const directives = dockerfile
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('#'))
  .join('\n');

const pkg = JSON.parse(read('backend/package.json')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe('the backend image ships runtime dependencies only', () => {
  it('installs the runtime tree with --omit=dev, in its own stage', () => {
    expect(directives).toMatch(/FROM node:\d+-alpine AS prod-deps/);
    expect(directives).toMatch(/npm ci --omit=dev/);
  });

  it('takes node_modules from that stage, not from the builder', () => {
    expect(directives).toMatch(/COPY --from=prod-deps[^\n]*node_modules \/app\/node_modules/);
    expect(directives).not.toMatch(/COPY --from=builder[^\n]*\/app\/node_modules \/app\/node_modules/);
  });

  /**
   * The four the container genuinely needs, each for a reason a reader can
   * check: the generated client requires `@prisma/client/runtime/*`, the
   * entrypoint shells `prisma`, and `prisma.config.ts` is TypeScript, so the CLI
   * needs a compiler and a loader to read the schema path and the migration URL
   * out of it.
   */
  it.each(['@prisma/client', 'prisma', 'typescript', 'ts-node'])(
    'declares %s as a runtime dependency',
    (name) => {
      expect(`${name} in dependencies: ${name in pkg.dependencies}`)
        .toBe(`${name} in dependencies: true`);
      expect(name in pkg.devDependencies).toBe(false);
    },
  );

  it('leaves the build toolchain in devDependencies, where --omit=dev drops it', () => {
    for (const name of ['@swc/core', 'vitest', 'unplugin-swc', '@nestjs/cli', 'oxlint']) {
      expect(`${name} is dev-only: ${name in pkg.devDependencies && !(name in pkg.dependencies)}`)
        .toBe(`${name} is dev-only: true`);
    }
  });

  it('still gives the entrypoint the CLI it shells', () => {
    expect(read('backend/docker-entrypoint.sh')).toContain('./node_modules/.bin/prisma');
  });

  it('needs no by-name pruning any more', () => {
    // `rm -rf node_modules/oxlint...` was the interim fix for #7. An
    // --omit=dev install removes the reason for it; leaving it behind would be
    // a line that looks load-bearing and is not.
    expect(directives).not.toMatch(/rm -rf[^\n]*oxlint/);
  });
});
