/**
 * Every canon reader must be pointed at the 3.2e option database.
 *
 * The distribution ships THREE copies of MBMGEMSG.MSG. `mbmgemp/` and `GE/REL/`
 * are byte-identical and are release 3.2e (1994-08-06, the last one).
 * `GE/MSG/MBMGEMSG.MSG` is the PRE-3.2d configuration, and reading it put three
 * wrong balance constants into this codebase:
 *
 *     PFIRDST   7  ->  5    phaser range falloff exponent
 *     HPFIRDST  9  ->  5    hyperphaser equivalent
 *     ITMWT13 200  -> 50    weight of 100 gold
 *
 * All three are documented changes. GEREADME.DOC's 3.2d notes say the option
 * documentation "was backwards -- you REDUCE the value in HPFIRDST and PFIRDST
 * to increase the range and power", and that gold's weight "has been reduced".
 * So the stale copy does not merely lag; it reverses deliberate balance work.
 *
 * The values themselves are pinned by sibling specs. What THIS file pins is the
 * thing no value test can see: which file those specs read. A generator is only
 * as trustworthy as its source path, and that path was wrong for months while
 * every value test passed.
 *
 * @see reference/ge-upstream/PROVENANCE.md
 * @see reference/ge-upstream/mbmgemp/GE/DOCS/GEREADME.DOC — 3.2d and 3.2e notes
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../../..');
const UPSTREAM = join(REPO, 'reference/ge-upstream/mbmgemp');

/** The 3.2e files, by content. Read-only vendored source — these never change. */
const SHIPPED = {
  'GE/REL/MBMGEMSG.MSG': '7ac033e903b0c1beff753515749a0924',
  'GE/REL/MBMGESHP.MSG': '7eb03ace913b9bb7701851bb0a82cdf5',
};

const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');

/** Every .ts/.mjs file in the repo that could name a .MSG path. */
function sourceFiles(): string[] {
  const roots = ['backend/src', 'backend/test', 'tools'];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (e === 'node_modules' || e === 'dist') continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|mjs|js)$/.test(e)) out.push(p);
    }
  };
  for (const r of roots) walk(join(REPO, r));
  return out;
}

describe('canon source provenance', () => {
  it.each(Object.entries(SHIPPED))('%s is the 3.2e file we think it is', (rel, hash) => {
    expect(md5(join(UPSTREAM, rel))).toBe(hash);
  });

  it('GE/REL is byte-identical to the distribution root copy', () => {
    // If these ever diverge, the "which copy" question is open again and
    // PROVENANCE.md's reasoning needs redoing before trusting either.
    expect(md5(join(UPSTREAM, 'GE/REL/MBMGEMSG.MSG')))
      .toBe(md5(join(UPSTREAM, 'MBMGEMSG.MSG')));
  });

  it('the stale copy is still present and still different — this is not paranoia', () => {
    // Kept as evidence, not as a source. If someone ever deletes it, this test
    // should be deleted with it and PROVENANCE.md updated.
    expect(md5(join(UPSTREAM, 'GE/MSG/MBMGEMSG.MSG')))
      .not.toBe(md5(join(UPSTREAM, 'GE/REL/MBMGEMSG.MSG')));
  });

  it.each([
    ['GE/MSG/MBMGEMSG.MSG', /GE\/MSG\/MBMGEMSG\.MSG/],
    // GE/REL2 is a SECOND, differently-tuned instance of the module -- a sysop
    // could run two games side by side off its own MBMG2*.DAT files. Of the 60
    // sysop options it shares with the standard release, 33 have different
    // values (CYBGOLD 1200 -> 25, HPDAMMAX 50 -> 35, CLENGUSE 7500 -> 2600,
    // DECODDS 11 -> 8). Nothing inside the file marks it as an alternate, so a
    // value lifted from it looks exactly like canon and is not.
    ['GE/REL2/MBMG2*.MSG', /MBMG2[A-Z]*\.MSG/],
  ])('no source or test file reads %s', (_label, pattern) => {
    const offenders = sourceFiles().filter((f) => {
      const text = readFileSync(f, 'utf8');
      // A comment warning people off the file is the point, not a violation.
      const isWarning = /never read|do not read|NOT canon|stale|earlier partial|pre-3\.2d|differently-tuned/i.test(text);
      return pattern.test(text) && !isWarning;
    });
    expect(offenders.map((f) => f.slice(REPO.length + 1))).toEqual([]);
  });

  it('the ids release 3.2d and 3.2e added are present in the file we read', () => {
    // ITMPR01/SHLDPR01/PHSRPR01 arrived in 3.2d; CYBBASEM/CYBLASTM in 3.2e.
    // The C source reads all five by name, so a file lacking them cannot be the
    // configuration this C was built against.
    const text = readFileSync(join(UPSTREAM, 'GE/REL/MBMGEMSG.MSG'), 'latin1');
    for (const id of ['ITMPR01', 'SHLDPR01', 'PHSRPR01', 'CYBBASEM', 'CYBLASTM']) {
      expect([id, new RegExp(`^${id} \\{`, 'm').test(text)]).toEqual([id, true]);
    }
  });
});
