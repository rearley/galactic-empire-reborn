import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `npm run test:manual` must actually run.
 *
 * The script existed over three specs, two of which failed on invocation, and
 * nothing ran it: not CI, and not `vitest.config.ts`, whose `include` list does
 * not mention `test/manual`. So a named npm script was broken for anyone who
 * reached for it after reading its README, and the one spec that did pass was
 * invisible. A test nobody runs is not a test. @see issue #37
 *
 * This guards the CONTRACT, since CI cannot run the suite itself — it needs a
 * live stack and it writes to `DATABASE_URL`:
 *
 *  - the script exists and points at the manual config;
 *  - the config loads the env those specs need, and does NOT load the global
 *    setup that resets `ge_test` underneath the stack they are testing;
 *  - every file in `test/manual/` states its live-stack prerequisite, so nothing
 *    that belongs in the main suite drifts back in here;
 *  - the README lists exactly the files that exist.
 */
const BACKEND = join(__dirname, '../..');
const read = (rel: string): string => readFileSync(join(BACKEND, rel), 'utf8');

describe('the manual smoke suite is reachable and honest', () => {
  const specs = readdirSync(join(BACKEND, 'test/manual')).filter((f) => f.endsWith('.ts'));

  it('has a script wired to its own config', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:manual']).toContain('vitest.manual.config.ts');
    expect(existsSync(join(BACKEND, 'vitest.manual.config.ts'))).toBe(true);
  });

  it('loads the env its specs need', () => {
    // Prisma 7 loads no .env, and the manual config skips the global setup that
    // does it for the main suite — which is why T053 threw at import.
    expect(read('vitest.manual.config.ts')).toMatch(/setupFiles:.*load-dotenv/s);
  });

  it('does NOT reset the database the live stack is using', () => {
    const config = read('vitest.manual.config.ts');
    expect(config).not.toMatch(/globalSetup/);
  });

  it('holds at least one spec, and every one of them needs a live stack', () => {
    expect(specs.length).toBeGreaterThan(0);
    for (const f of specs) {
      const text = read(join('test/manual', f));
      expect(`${f}: ${/Prerequisites/i.test(text)}`).toBe(`${f}: true`);
    }
  });

  it('has a README naming exactly the specs that exist', () => {
    const readme = read('test/manual/README.md');
    for (const f of specs) expect(readme).toContain(f);
    // And nothing that does not: a retired spec left in the table reads as
    // coverage. T077 gated a document that was consolidated away.
    for (const m of readme.matchAll(/(\w+\.manual\.spec\.ts)/g)) {
      expect(`${m[1]} exists: ${specs.includes(m[1])}`).toBe(`${m[1]} exists: true`);
    }
  });
});
