import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../../..');
const ci = readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8');

/** The gate's own pattern, lifted from the workflow rather than restated. */
function notABuildInput(): RegExp {
  const m = /NOT_A_BUILD_INPUT='([^']+)'/.exec(ci);
  if (!m) throw new Error('NOT_A_BUILD_INPUT not found in ci.yml');
  return new RegExp(m[1]);
}

/**
 * What may and may not ship an image.
 *
 * A push touching only `.githooks/` deployed to production. Hooks run on a
 * developer's machine and are never copied into a container, so that build
 * could not have changed anything it published — it spent a CI run and
 * restarted a live game to ship a byte-identical image.
 *
 * The pattern is read out of the workflow instead of being repeated here, so
 * this cannot drift into testing a copy of the rule rather than the rule.
 */
describe('the build gate', () => {
  const re = notABuildInput();

  it('does not build for git hooks, which never reach an image', () => {
    expect(re.test('.githooks/pre-commit')).toBe(true);
    expect(re.test('.githooks/commit-msg')).toBe(true);
  });

  it('still ignores tests, tools, docs and specs', () => {
    ['backend/test/x.spec.ts', 'frontend/test/x.spec.tsx', 'tools/x.mjs',
     'docs/PROGRESS.md', 'specs/001-a/spec.md', 'README.md', 'LICENSE', 'NOTICE']
      .forEach((f) => expect([f, re.test(f)]).toEqual([f, true]));
  });

  it('still builds for anything that reaches an image', () => {
    ['backend/src/main.ts', 'frontend/src/App.tsx', 'packages/wire/src/index.ts',
     'backend/Dockerfile', 'VERSION', 'package-lock.json', '.github/workflows/ci.yml']
      .forEach((f) => expect([f, re.test(f)]).toEqual([f, false]));
  });
});
