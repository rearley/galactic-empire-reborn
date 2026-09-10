import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A linter that is not wired into CI is a linter nobody runs.
 *
 * The backend had no lint config at all until 2026-09-10. Strict TypeScript was
 * doing the work — 4 uses of `any` in 41,826 lines — but nothing enforced the
 * rest, and a public repository with no lint configuration reads badly however
 * good the code is.
 *
 * This asserts the config exists, both packages expose the script, and CI
 * actually calls it. The last clause is the one that matters: the first two
 * without it are decoration.
 *
 * @see docs/superpowers/specs/2026-09-10-restructure-design.md
 */
const REPO = join(__dirname, '../../..');

function read(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8');
}

describe('lint gate', () => {
  it('has a config at the repo root', () => {
    expect(() => read('.oxlintrc.json')).not.toThrow();
    expect(JSON.parse(read('.oxlintrc.json'))).toHaveProperty('rules');
  });

  it.each(['backend/package.json', 'frontend/package.json'])(
    '%s exposes a lint script',
    (rel) => {
      const pkg = JSON.parse(read(rel)) as { scripts?: Record<string, string> };

      expect(pkg.scripts?.lint).toMatch(/oxlint/);
    },
  );

  it('CI runs the linter in both jobs', () => {
    const runs = read('.github/workflows/ci.yml')
      .split('\n')
      .filter((l) => l.includes('run: npm run lint'));

    expect(runs).toHaveLength(2);
  });
});
