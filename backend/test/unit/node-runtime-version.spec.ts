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

  /**
   * The one runtime this file can actually observe: the one running it.
   *
   * Every other assertion here reads a FILE. All four agreed on 24 while this
   * machine ran the whole backend suite on Node v22.22.2 for weeks, and the
   * guard stayed green — `engines` is advisory unless `engine-strict` is set,
   * so nothing refused. That is the exact failure the docblock above describes,
   * in the environment where most of the evidence is produced.
   *
   * It stopped being theoretical in Phase 5: NestJS 12 ships ESM and a
   * CommonJS consumer needs `require(esm)`, which arrived in Node 24.9. On 22
   * that surfaced as "Must use import to load ES Module" from `@nestjs/testing`
   * — a runtime-version problem wearing a module-system costume.
   *
   * A hard failure, not a warning: a suite run on the wrong major is not weaker
   * evidence, it is evidence about a runtime nobody deploys. `.nvmrc` names the
   * version and `.npmrc` sets `engine-strict`, so the fix is `nvm use`.
   * @see issue #31
   */
  it('runs on the Node major everything else declares', () => {
    expect(process.versions.node.split('.')[0]).toBe(String(EXPECTED_MAJOR));
  });

  it('has a .nvmrc naming that major, so `nvm use` needs no lore', () => {
    expect(read('.nvmrc').trim()).toMatch(new RegExp(`^v?${EXPECTED_MAJOR}(\\.|$)`));
  });

  it('sets engine-strict, so npm refuses the wrong major instead of warning', () => {
    expect(read('.npmrc')).toMatch(/^engine-strict\s*=\s*true$/m);
  });

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

  it('backend/package.json pins @types/node to the runtime major', () => {
    // Frontend has no @types/node dependency, so this check is backend-only.
    const pkg = JSON.parse(read('backend/package.json')) as {
      devDependencies?: Record<string, string>;
    };
    const range = pkg.devDependencies?.['@types/node'];

    expect(range).toBeDefined();
    expect(range).toMatch(new RegExp(`^\\^${EXPECTED_MAJOR}\\.`));
  });
});
