import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A Cybertron's claim changes in ONE file.
 *
 * `cybmine` (whom an AI has claimed) and `cybupdate` (its idle-wander cadence)
 * are never meaningful alone: canon writes them together with the course,
 * cadence and activation fields that make up one state change. On 2026-09-20
 * four defects in a row, v0.27.4-v0.27.8, were each a claim that changed without
 * its companions — released but left crawling at a combat speed, restored across
 * a restart onto a recycled channel, a cruise speed restored only when it was 0.
 *
 * `cyb-transitions.ts` holds one function per transition, each writing the
 * complete set beside the canon lines it mirrors. This fails when a write turns
 * up anywhere else. The fix is a call to an existing transition, or a new one
 * in that file — not an entry in an allow-list here.
 *
 * Object literals (`cybmine: 255` in a spawner or mapper) are construction, not
 * a transition, and do not match.
 * @see issue #59, src/game/cybertron/cyb-transitions.ts
 */
const SRC = join(__dirname, '../../src');
const HOME = 'game/cybertron/cyb-transitions.ts';
const WRITE = /\.(cybmine|cybmineKey|cybupdate)\s*(?:[-+]?=(?!=)|\+\+|--)/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

/** `file:line  source` for every write, comments excluded. */
function writesIn(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => !/^\s*(\/\/|\*)/.test(line) && WRITE.test(line))
    .map(({ line, n }) => `${relative(SRC, file)}:${n}  ${line.trim()}`);
}

describe('Cybertron claim writes', () => {
  it('happen only in cyb-transitions.ts', () => {
    const stray = walk(SRC)
      .filter((f) => relative(SRC, f) !== HOME)
      .flatMap(writesIn);
    expect(stray).toEqual([]);
  });

  it('the pattern sees every form of write it is guarding against', () => {
    for (const w of ['s.cybmine = 3', 'v.cybmine=ch', 'ship.cybupdate--', 'ship.cybupdate -= 1']) {
      expect(w).toMatch(WRITE);
    }
    for (const r of ['s.cybmine === 255', 's.cybmine !== x', 'cybmine: 255']) {
      expect(r).not.toMatch(WRITE);
    }
  });

  it('still finds the transitions themselves, so the scan is not reading nothing', () => {
    expect(writesIn(join(SRC, HOME)).length).toBeGreaterThan(10);
  });
});
