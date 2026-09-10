import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Production, CI and the declared engine must agree on one Node major.
 *
 * Node 20 reached end of life on 2026-04-30 and no longer receives security
 * patches, and this repo shipped it in both images for four months after that.
 * The subtler failure is disagreement: if CI runs a different major than the
 * image does, a green suite is evidence about a runtime nobody deploys.
 *
 * A file test rather than a container test — CI has no Docker daemon — so this
 * guards the directives and the human verifies the boot, the same split used by
 * `dockerfile-nonroot.spec.ts`.
 *
 * @see docs/superpowers/specs/2026-09-10-restructure-design.md
 */
const REPO = join(__dirname, '../../..');
const EXPECTED_MAJOR = 24;

function read(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8');
}

describe('Node runtime version', () => {
  const dockerfiles = ['backend/Dockerfile', 'frontend/Dockerfile'];

  it.each(dockerfiles)('%s builds on the expected Node major', (rel) => {
    const froms = read(rel)
      .split('\n')
      .filter((l) => l.trim().startsWith('FROM node:'));

    expect(froms).not.toHaveLength(0);
    for (const line of froms) {
      expect(line).toMatch(new RegExp(`FROM node:${EXPECTED_MAJOR}-alpine\\b`));
    }
  });

  it('CI runs the same major the images do', () => {
    const versions = read('.github/workflows/ci.yml')
      .split('\n')
      .filter((l) => l.includes('node-version:'))
      .map((l) => l.split('node-version:')[1].trim());

    expect(versions).not.toHaveLength(0);
    expect(new Set(versions)).toEqual(new Set([String(EXPECTED_MAJOR)]));
  });

  it.each(['backend/package.json', 'frontend/package.json'])(
    '%s declares the engine it needs',
    (rel) => {
      const pkg = JSON.parse(read(rel)) as { engines?: { node?: string } };

      expect(pkg.engines?.node).toBe(`>=${EXPECTED_MAJOR}`);
    },
  );
});
