import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The production image must not ship the linter.
 *
 * The runtime stage copies the builder's whole `node_modules`, deliberately:
 * `docker-entrypoint.sh` runs `prisma migrate deploy` at container start, so the
 * Prisma CLI has to be present, and the CLI is a devDependency. The linter rides
 * along on that decision — `oxlint` and `oxlint-tsgolint` bring their
 * platform-specific binaries, about 52 MB of a 822 MB image, in a runtime that
 * will never lint anything.
 *
 * The cost is per-deploy, not one-off: watchtower pulls a new `:latest` on every
 * merge to master, so this is bandwidth and disk on every release.
 *
 * A file test, like its neighbours: CI has no Docker daemon, so this guards the
 * directive and a human verifies the boot. @see dockerfile-nonroot.spec.ts
 * @see issue #7
 */
const REPO = join(__dirname, '../../..');
const dockerfile = readFileSync(join(REPO, 'backend/Dockerfile'), 'utf8');

/** Directive lines only — a comment mentioning oxlint proves nothing. */
const directives = dockerfile
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('#'))
  .join('\n');

describe('the backend image does not ship the linter', () => {
  it('removes the linter packages and their platform binaries', () => {
    // Named explicitly rather than matched loosely: the point is that a reader
    // can see exactly what leaves the image.
    for (const pkg of ['oxlint', 'oxlint-tsgolint', '@oxlint', '@oxlint-tsgolint']) {
      expect(`removes ${pkg}: ${directives.includes(`node_modules/${pkg}`)}`)
        .toBe(`removes ${pkg}: true`);
    }
    expect(directives).toMatch(/rm -rf/);
  });

  it('strips them in the BUILDER, before the runtime stage copies node_modules', () => {
    const builderEnd = directives.indexOf('FROM node:24-alpine\n');
    const strip = directives.search(/rm -rf[^\n]*oxlint/);
    expect(strip).toBeGreaterThan(-1);
    expect(strip).toBeLessThan(builderEnd);
  });

  it('still ships what the entrypoint needs at container start', () => {
    // The two things that make the whole node_modules copy necessary. If either
    // of these stops being true, the copy can be replaced with an --omit=dev
    // install, which is the larger fix this test does not attempt.
    const entrypoint = readFileSync(join(REPO, 'backend/docker-entrypoint.sh'), 'utf8');
    expect(entrypoint).toContain('./node_modules/.bin/prisma');
    expect(directives).toMatch(/COPY --from=builder[^\n]*node_modules \/app\/node_modules/);
  });

  it('never installs the linter in the runtime stage by another route', () => {
    const runtime = directives.slice(directives.indexOf('FROM node:24-alpine\n'));
    expect(runtime).not.toMatch(/npm (ci|install|i)\b/);
  });
});
