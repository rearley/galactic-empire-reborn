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
 * This asserts the config exists with real rule categories, both packages
 * expose a lint script that actually runs against a path (not just
 * `oxlint --version`), and CI actually calls it. Without the CI clause the
 * rest is decoration; without the "actually lints something" clause the
 * script could be `oxlint --version` and this file would still pass.
 *
 * @see docs/superpowers/specs/2026-09-10-restructure-design.md
 */
const REPO = join(__dirname, '../../..');

function read(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8');
}

/**
 * oxlint accepts `//` comments in its JSON config (confirmed against 1.82.0
 * via --print-config), and .oxlintrc.json uses them to record why
 * unicorn/no-new-array and eslint/no-unused-vars are configured the way they
 * are. Plain `JSON.parse` chokes on those, so strip line comments first.
 * Good enough for this file: nothing in it needs a `//` inside a string.
 */
function parseJsonc(text: string): unknown {
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
}

describe('lint gate', () => {
  it('has a config at the repo root', () => {
    expect(() => read('.oxlintrc.json')).not.toThrow();
    expect(parseJsonc(read('.oxlintrc.json'))).toHaveProperty('rules');
  });

  it('the config declares non-empty rule categories', () => {
    const config = parseJsonc(read('.oxlintrc.json')) as {
      categories?: Record<string, string>;
    };

    expect(config.categories).toBeDefined();
    expect(Object.keys(config.categories ?? {}).length).toBeGreaterThan(0);
  });

  it.each(['backend/package.json', 'frontend/package.json'])(
    '%s exposes a lint script',
    (rel) => {
      const pkg = JSON.parse(read(rel)) as { scripts?: Record<string, string> };

      expect(pkg.scripts?.lint).toMatch(/oxlint/);
    },
  );

  it.each(['backend/package.json', 'frontend/package.json'])(
    '%s lint script actually lints a path, not just an informational flag',
    (rel) => {
      const pkg = JSON.parse(read(rel)) as { scripts?: Record<string, string> };
      const script = pkg.scripts?.lint ?? '';

      // `oxlint --version` or `oxlint --help` would satisfy `/oxlint/` above
      // while checking nothing. The script must run against a real target:
      // its last argument must be a path/target, not a flag (`--version`,
      // `--help`, or any other `-`/`--` option).
      expect(script).not.toMatch(/--version\b/);
      expect(script).not.toMatch(/--help\b/);
      const tokens = script.trim().split(/\s+/);
      const lastToken = tokens.at(-1) ?? '';
      expect(lastToken.startsWith('-')).toBe(false);
    },
  );

  it('CI runs the linter in both jobs', () => {
    const runs = read('.github/workflows/ci.yml')
      .split('\n')
      .filter((l) => l.includes('run: npm run lint'));

    expect(runs).toHaveLength(2);
  });
});
