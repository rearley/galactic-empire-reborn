import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The backend container must not run as root.
 *
 * A process that never writes to disk and only needs to bind port 3000 has no
 * reason to be root, and root inside the container is the difference between a
 * remote-code bug being a bad day and being a very bad one. Nothing in the app
 * writes files at runtime, and 3000 is above 1024, so there is nothing to give
 * up. Found by the 2026-09-09 security review.
 *
 * The entrypoint uses `./node_modules/.bin/prisma` rather than `npx`: npx wants
 * a writable cache under $HOME and resolving it as a non-root user was a
 * failure mode waiting for a deploy. The binary is already in the image.
 *
 * A file test rather than a container test — CI has no Docker daemon — so this
 * guards the directive and the human verifies the boot. Both were done when
 * this landed. @see docs/audits/2026-09-09-security-review.md
 */
describe('backend Dockerfile', () => {
  const dockerfile = readFileSync(join(__dirname, '../../Dockerfile'), 'utf8');
  const entrypoint = readFileSync(join(__dirname, '../../docker-entrypoint.sh'), 'utf8');

  it('drops to a non-root user before the entrypoint', () => {
    const userLines = dockerfile.split('\n').filter((l) => l.trim().startsWith('USER '));

    expect(userLines).not.toHaveLength(0);
    expect(userLines[userLines.length - 1]).toMatch(/USER\s+node\b/);
  });

  it('sets USER after the last RUN, so the build still has the permissions it needs', () => {
    const lastUser = dockerfile.lastIndexOf('\nUSER ');
    const lastRun = dockerfile.lastIndexOf('\nRUN ');

    expect(lastUser).toBeGreaterThan(lastRun);
  });

  it('does not shell out to npx, which needs a writable HOME cache', () => {
    // Code lines only — the file explains in a comment why npx is avoided, and
    // an assertion that trips over its own documentation is a bad assertion.
    const code = entrypoint
      .split('\n')
      .filter((l) => !l.trim().startsWith('#'))
      .join('\n');

    expect(code).not.toMatch(/\bnpx\b/);
    expect(code).toMatch(/node_modules\/\.bin\/prisma/);
  });
});
