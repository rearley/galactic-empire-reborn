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

/**
 * Manual dispatch must be able to DEPLOY, not just re-run the tests.
 *
 * 2026-09-15: a push carrying real source changes failed lint, so no image was
 * built. The next push was test-only, so the gate correctly said "nothing to
 * build" — and two releases sat on master while production reported an older
 * version. The gate reads ONE push range and cannot know the previous push
 * produced no image.
 *
 * `workflow_dispatch` is the recovery path for precisely that, and it did not
 * work: both the gate job and the build job were fenced behind
 * `github.event_name == 'push'`, so a dispatch ran the suites and skipped
 * everything that ships.
 */
describe('a manual dispatch can ship', () => {
  const jobCondition = (name: string): string => {
    const at = ci.indexOf(`name: ${name}`);
    expect(at, `job "${name}" not found in ci.yml`).toBeGreaterThan(-1);
    const block = ci.slice(at, at + 1200);
    const m = /^\s*if: (.+)$/m.exec(block);
    return m ? m[1] : '';
  };

  it('lets a dispatch reach the build gate', () => {
    expect(jobCondition('Build needed?')).toContain('workflow_dispatch');
  });

  it('lets a dispatch reach the publish job', () => {
    expect(jobCondition('Build and publish images')).toContain('workflow_dispatch');
  });

  it('still requires the gate to say yes', () => {
    // Dispatch must not become a way to bypass the build-input rule; it only
    // widens WHO may ask, not WHAT qualifies.
    expect(jobCondition('Build and publish images')).toContain("needs.changes.outputs.build == 'true'");
  });

  it('keeps workflow_dispatch as a declared trigger', () => {
    expect(ci).toMatch(/^\s*workflow_dispatch:\s*$/m);
  });
});
