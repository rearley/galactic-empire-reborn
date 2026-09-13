/**
 * The documentation must not lie about the code or about canon.
 *
 * The point is narrow and specific: this project has repeatedly written code
 * from a doc that was wrong. A 2026-09-05 audit of every living doc against the
 * C source, the shipped .MSG data and the implementation found 115 real
 * discrepancies — a starter-ship table computed against the wrong shield type,
 * a scanRange compression justified by mistaking the scan viewport for the
 * galaxy, an options table sitting at clamp bounds because a comment asserted
 * canon's defaults were unrecoverable. Each of those shaped code before anyone
 * noticed.
 *
 * An audit is a snapshot. This is the part that keeps.
 *
 * The checks below are deliberately NARROW. A broader version was prototyped —
 * comparing every option name in the docs against its canon default — and it
 * produced 69 candidates of which nearly all were false: deliberate documented
 * deviations, digits captured out of adjacent option NAMES, and append-only
 * entries correctly recording what a value used to be. A noisy test gets
 * disabled, and a disabled test is worse than no test. So each check here is
 * one that ran clean at zero false positives on the whole corpus.
 *
 * NOT covered, and deliberately: PROGRESS.md and DECISIONS.md are append-only
 * logs. They legitimately name things that were rejected, renamed or deleted,
 * and rewriting them to satisfy a linter would destroy the record. DECISIONS
 * marks superseded entries in place instead.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { scanLine } from './citation-scan';
import { SYSOP_OPTIONS } from '../../src/game/config/game-config';

const REPO = resolve(__dirname, '../../..');

/** Docs that describe the CURRENT state and must therefore be true today. */
const CURRENT_STATE_DOCS = [
  'CLAUDE.md',
  'reference/CLAUDE.md',
  'docs/README.md',
  'docs/ARCHITECTURE.md',
  'docs/DATA_MODEL.md',
  'docs/GAME_MECHANICS.md',
];

/** Append-only logs: historical by design, checked only for canon assertions. */
const LOG_DOCS = ['docs/DECISIONS.md'];

function read(rel: string): string[] {
  return readFileSync(join(REPO, rel), 'utf8').split('\n');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

describe('docs cite a real original', () => {
  const C_SOURCE = join(REPO, 'reference/ge-source');

  /** Line counts of every vendored C/H file, for citation bounds. */
  //
  // BOTH vendored trees. `ge-source/` holds nine files; the full upstream
  // distribution adds GELIB.C, SECURE.C, MBMGEGRF.C and GESAMPLE.C, and the
  // source legitimately cites GELIB.C. Checking only ge-source/ reported eight
  // real citations as pointing at a file we do not vendor. @see PROVENANCE.md
  const UPSTREAM = join(REPO, 'reference/ge-upstream/mbmgemp');
  const lineCounts = new Map<string, number>();
  for (const dir of [UPSTREAM, C_SOURCE]) {
    for (const f of readdirSync(dir)) {
      if (!/\.[CH]$/i.test(f)) continue;
      lineCounts.set(f.toUpperCase(), readFileSync(join(dir, f), 'latin1').split('\n').length);
    }
  }

  it('has a vendored C source to check against at all', () => {
    // Guard the guard: if the tree moved, every assertion below would pass
    // vacuously.
    expect(lineCounts.size).toBeGreaterThan(5);
    expect(lineCounts.get('GECMDS.C')).toBeGreaterThan(1000);
  });

  /**
   * The SOURCE carries far more citations than the docs — roughly 1,900 across
   * src/ and test/ — and CLAUDE.md calls them load-bearing rather than
   * decoration: they are how a reader tells canon from our own work.
   *
   * They were unchecked until 2026-09-10. That matters most for the
   * restructuring this suite is being built to support: a refactor that moves
   * or deletes code can leave a citation pointing at a line that has nothing to
   * do with the claim beside it, and nothing would say so. A citation nobody
   * verifies is a comment that looks like evidence.
   *
   * This checks the BOUND only — that the file exists and is long enough. It
   * cannot know whether line 1039 still says what the comment claims. That is
   * the honest limit of a cheap check, and it still catches the whole class of
   * "cited a file we do not vendor" and "cited past the end".
   */
  it('points every citation in the SOURCE at a line that exists', () => {
    // `scanLine` rather than a local regex, so the `FILE.C:123, :456` shorthand
    // is bounds-checked too. Before 2026-09-11 the continuation numbers were
    // invisible here: 201 citations across backend/ could have pointed past the
    // end of the file, or at a file we do not vendor, and this test would have
    // stayed green. @see issue #11
    const files = [...walk(join(REPO, 'backend/src')), ...walk(join(REPO, 'backend/test'))];
    const bad: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, idx) => {
        for (const c of scanLine(line)) {
          const len = lineCounts.get(c.file);
          const where = `${f.replace(REPO + '/', '')}:${idx + 1}`;
          if (len === undefined) bad.push(`${where} → ${c.file}:${c.line} (no such vendored file)`);
          else if (c.line > len) bad.push(`${where} → ${c.file}:${c.line} (file has ${len} lines)`);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it('points every FILE.C:line citation at a line that exists', () => {
    const bad: string[] = [];
    for (const doc of [...CURRENT_STATE_DOCS, ...LOG_DOCS]) {
      read(doc).forEach((line, idx) => {
        for (const c of scanLine(line)) {
          const len = lineCounts.get(c.file);
          if (len === undefined) bad.push(`${doc}:${idx + 1} → ${c.file}:${c.line} (no such file)`);
          else if (c.line > len) bad.push(`${doc}:${idx + 1} → ${c.file}:${c.line} (file has ${len} lines)`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});

describe('docs name real files', () => {
  it('has no backticked repo path that does not exist', () => {
    // A path in backticks reads as "go and look at this". If it is gone, say so
    // in prose rather than leaving a link to nowhere.
    const PATH_RE =
      /`((?:backend|frontend|tools|reference|docs|specs)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|mjs|prisma|json|md|MSG|C|H))`/g;
    const bad: string[] = [];
    for (const doc of CURRENT_STATE_DOCS) {
      read(doc).forEach((line, idx) => {
        for (const m of line.matchAll(PATH_RE)) {
          if (!existsSync(join(REPO, m[1]))) bad.push(`${doc}:${idx + 1} → ${m[1]}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});

describe('docs name real code', () => {
  /** Every exported class, function and const in the app. */
  const symbols = new Set<string>();
  for (const root of ['backend/src', 'frontend/src']) {
    for (const file of walk(join(REPO, root))) {
      const src = readFileSync(file, 'utf8');
      for (const re of [
        /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g,
        /export\s+(?:async\s+)?function\s+(\w+)/g,
        /export\s+const\s+(\w+)/g,
        /export\s+(?:interface|type|enum)\s+(\w+)/g,
      ]) {
        for (const m of src.matchAll(re)) symbols.add(m[1]);
      }
    }
  }

  it('found the codebase', () => {
    expect(symbols.size).toBeGreaterThan(200);
    expect(symbols.has('ShipStateService')).toBe(true);
  });

  it('names no Service/Handler/Repository that does not exist', () => {
    // This is the check that would have caught ShipService, PlanetService,
    // CombatService, CommandService, CybertronService, DroidService and
    // LandHandlerService — seven classes named in ARCHITECTURE and CLAUDE.md
    // that the code has never had, or no longer has.
    const bad: string[] = [];
    for (const doc of CURRENT_STATE_DOCS) {
      read(doc).forEach((line, idx) => {
        for (const m of line.matchAll(
          /`(\w+(?:Service|Handler|Repository|Registry|Guard|Gateway|Subscriber))`/g,
        )) {
          if (!symbols.has(m[1])) bad.push(`${doc}:${idx + 1} → ${m[1]}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});

describe('docs state canon correctly', () => {
  /**
   * Only EXPLICIT assertions about what the original ships — "canon's default
   * is N", "canon ships N". A doc is free to state the port's own deviating
   * value; what it may not do is misreport the original, because that is the
   * sentence someone codes from.
   */
  const ASSERTION =
    /`?\b([A-Z][A-Z0-9_]{2,})\b`?[^.\n]{0,60}?[Cc]anon(?:'s)?\s+(?:default|value|ships?)\s+(?:is\s+|of\s+)?\**(\d[\d_,]*)|[Cc]anon(?:'s)?\s+(?:default|value|ships?)\s+(?:for\s+)?`?([A-Z][A-Z0-9_]{2,})`?\s*(?:is|=|of)?\s*\**(\d[\d_,]*)/g;

  const found: Array<{ where: string; opt: string; said: number; canon: number }> = [];
  for (const doc of [...CURRENT_STATE_DOCS, ...LOG_DOCS]) {
    read(doc).forEach((line, idx) => {
      for (const m of line.matchAll(ASSERTION)) {
        const opt = m[1] ?? m[3];
        const raw = m[2] ?? m[4];
        const spec = (SYSOP_OPTIONS as Record<string, { canonDefault: number } | undefined>)[opt];
        if (!spec || raw === undefined) continue;
        found.push({
          where: `${doc}:${idx + 1}`,
          opt,
          said: Number(raw.replace(/[_,]/g, '')),
          canon: spec.canonDefault,
        });
      }
    });
  }

  it('finds some canon assertions to check', () => {
    // Guard the guard again: a regex that matches nothing would pass silently.
    expect(found.length).toBeGreaterThan(5);
  });

  it('never misreports what the original ships', () => {
    const wrong = found
      .filter((f) => f.said !== f.canon)
      .map((f) => `${f.where} claims canon ${f.opt} = ${f.said}, but it is ${f.canon}`);
    expect(wrong).toEqual([]);
  });
});
