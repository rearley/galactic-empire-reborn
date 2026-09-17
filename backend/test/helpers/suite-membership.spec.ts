/**
 * The projects split may not change WHICH files the suite runs.
 *
 * `vitest.config.ts` no longer carries one `include` list; it carries two,
 * computed by `isolation-policy.ts`. That is a performance change, and a
 * performance change must not quietly alter what CI checks — in either
 * direction. An early draft of the policy scanned `test/` recursively and
 * pulled in `test/manual/T053.manual.spec.ts`, which has its own config and its
 * own `test:manual` script: five tests joined `npm test` that had never been
 * part of it. The opposite slip is worse and quieter — a directory dropped from
 * `SUITE_ROOTS` removes its specs from every run, and nothing fails.
 *
 * So this file pins the membership itself, independently of how the split is
 * implemented.
 *
 * @see https://github.com/rearley/galactic-empire-reborn/issues/51
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { splitSpecs, requiresIsolation } from './isolation-policy';

const ROOT = resolve(__dirname, '..', '..');

/**
 * An independent walk. Deliberately NOT `allSpecs` from the policy module: a
 * guard that reuses the thing it guards cannot catch a bug in it.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.spec.ts')) out.push(relative(ROOT, p));
  }
  return out;
}

const everySpecUnderTest = walk(join(ROOT, 'test')).sort();
const { isolated, shared } = splitSpecs(ROOT);
const union = [...isolated, ...shared].sort();

describe('the projects split runs exactly the suite it used to', () => {
  it('claims every spec except the separately-configured manual suite', () => {
    const expected = everySpecUnderTest.filter((f) => !f.startsWith('test/manual/'));
    expect(union).toEqual(expected);
  });

  it('leaves the manual suite out — it has its own config and script', () => {
    // If this ever legitimately changes, the manual suite's own config has to
    // change with it. Silently running it twice is not the way there.
    expect(union.filter((f) => f.startsWith('test/manual/'))).toEqual([]);
    expect(everySpecUnderTest.some((f) => f.startsWith('test/manual/'))).toBe(true);
  });

  it('puts every spec in exactly one project', () => {
    expect(new Set(union).size).toBe(union.length);
    const both = isolated.filter((f) => shared.includes(f));
    expect(both).toEqual([]);
  });

  it('agrees with the per-file rule, file by file', () => {
    // Catches a split that is internally consistent but classifies wrongly —
    // e.g. a loop that appends to the same array for both branches.
    const misfiled = union.filter(
      (f) => requiresIsolation(join(ROOT, f)) !== isolated.includes(f),
    );
    expect(misfiled).toEqual([]);
  });

  it('keeps the shared project the large majority, or the split earns nothing', () => {
    // Not a style assertion. `isolate: false` is the entire point of the split;
    // if a change pushes most files back into `isolated`, the suite has
    // silently returned to its old cost and someone should notice here rather
    // than from a slow CI run. Measured at 78/592 when written.
    expect(shared.length).toBeGreaterThan(union.length * 0.75);
  });
});
