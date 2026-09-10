/**
 * A citation must prove what it claims, and a divergence must be a decision.
 *
 * Two gaps, both found on 2026-09-10 while asking what the suite actually
 * guarantees before restructuring anything.
 *
 * GAP ONE — a passing test proves the code matches the test. It does not prove
 * the test is right. Almost every spec here hardcodes its expected value, which
 * is correct: running one must not depend on reading C. But that makes the
 * citation beside the number the ONLY tether between it and canon. If the
 * number was invented and the citation is wrong, the suite goes green forever
 * and then actively defends the invention against anyone who tries to fix it.
 *
 * `docs-truth.balance.spec.ts` checks that a cited line EXISTS. It cannot know
 * whether that line says what the comment claims, and it says so. This file
 * closes the difference wherever the comment quotes the line it cites — which
 * is already the house style, so there is no new syntax to learn:
 *
 *   @see GEMAIN.C:1977 `#define MAXTIC	20`
 *
 * It earned its place immediately: that citation said `GEMAIN.C:963` when
 * `MAXTIC` is defined at 1977. The value was right, the pointer was a thousand
 * lines out, and the bounds check passed because GEMAIN.C is long enough.
 *
 * GAP TWO — a divergence from canon is supposed to be a decision, written in
 * `docs/DECISIONS.md`. Twice it was instead parked in a test docblock, in prose
 * good enough to read like a decision had been taken. Two droid cases said
 * canon differs and were pinned as-is; both turned out to be plain defects and
 * were fixed. A third is still open in `rep sys`. Nobody had ruled on any of
 * them, and nothing could have told you they existed.
 *
 * So divergence gets one spelling — `@divergence <slug>` — checked in BOTH
 * directions, and the prose people actually reach for when parking one is
 * trapped.
 *
 * Both checks are deliberately narrow, for the reason `docs-truth` gives: a
 * noisy test gets disabled, and a disabled test is worse than no test.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../../..');

/** Both vendored trees — the source legitimately cites GELIB.C. @see PROVENANCE.md */
const CANON_DIRS = [
  join(REPO, 'reference/ge-upstream/mbmgemp'),
  join(REPO, 'reference/ge-source'),
];

function loadCanon(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const dir of CANON_DIRS) {
    for (const f of readdirSync(dir)) {
      if (!/\.[CH]$/i.test(f)) continue;
      out.set(f.toUpperCase(), readFileSync(join(dir, f), 'latin1').split('\n'));
    }
  }
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const SOURCE_FILES = [
  ...walk(join(REPO, 'backend/src')),
  ...walk(join(REPO, 'backend/test')),
];

const rel = (f: string) => f.replace(`${REPO}/`, '');

/**
 * This file quotes citations as EXAMPLES — real ones to show the shape, and
 * invented ones to show what a failure looks like. Scanning itself would make
 * the examples fail and would move both counts below, so it sits outside every
 * check it performs.
 */
const SCANNED = SOURCE_FILES.filter((f) => !f.endsWith('canon-citations.balance.spec.ts'));

describe('a quoted citation says what the original says', () => {
  const canon = loadCanon();

  it('has a vendored original to check against at all', () => {
    // Guard the guard: without this every assertion below passes vacuously.
    expect(canon.size).toBeGreaterThan(5);
    expect(canon.get('GECMDS.C')?.length).toBeGreaterThan(1000);
  });

  /**
   * `FILE.C:123 \`fragment\`` — a citation with the line quoted after it.
   *
   * Whitespace is stripped from both sides before comparing. Canon indents with
   * tabs and spaces its semicolons oddly (`for (othusn=0 ; othusn < nships ;`),
   * and a quote that differs only in spacing is a correct quote. Matching on
   * exact text produced six false failures out of forty-seven and would have
   * made this file the kind of test people delete.
   */
  // Matched per LINE, not across the file: the quote has to sit on the same
  // line as the citation. A wrapped quote is simply not counted, which costs a
  // handful of legitimate ones and is worth it — a whole-file match would pair
  // a citation with any backtick that happened to follow it anywhere below.
  const QUOTED = /\b(GE[A-Z]+\.[CH]):(\d+)\s*`([^`]+)`/g;

  /**
   * How far either side of the cited line to look. Canon citations routinely
   * point at the head of a short block rather than at the exact statement, and
   * five lines covers that without being wide enough to hit an unrelated match.
   */
  const WINDOW = 5;

  const strip = (s: string) => s.replace(/\s+/g, '');

  /**
   * A bare identifier — `initshp`, `findshp`, `warhupa` — is a reference to a
   * FUNCTION, not a quote of a line: "the initshp function, around line 194".
   * Those are checked against the whole file instead of the window, because the
   * declaration is usually a dozen lines above the body being cited.
   */
  const isSymbol = (s: string) => /^[a-z_]\w*$/i.test(s.trim());

  function collect() {
    const pairs: Array<{ where: string; file: string; line: number; frag: string }> = [];
    for (const f of SCANNED) {
      readFileSync(f, 'utf8').split('\n').forEach((text, idx) => {
        for (const m of text.matchAll(QUOTED)) {
          const frag = m[3];
          // Too short to be distinctive — a stray backtick after a citation
          // catches things like a lone comma.
          if (strip(frag).length < 6) continue;
          // A paraphrase, not a quote: `if (delta > 0) ... else delta = 0`.
          if (frag.includes('...')) continue;
          pairs.push({
            where: `${rel(f)}:${idx + 1}`,
            file: m[1].toUpperCase(),
            line: Number(m[2]),
            frag,
          });
        }
      });
    }
    return pairs;
  }

  const pairs = collect();

  it('finds the quoted citations it exists to check', () => {
    // If a refactor changed the comment style, this file would silently stop
    // checking anything. Fail loudly instead.
    expect(pairs.length).toBeGreaterThan(35);
  });

  it('finds every quoted fragment at the line it is cited to', () => {
    const bad: string[] = [];
    for (const p of pairs) {
      const lines = canon.get(p.file);
      if (!lines) { bad.push(`${p.where} → ${p.file} is not vendored`); continue; }
      const haystack = isSymbol(p.frag)
        ? lines.join('\n')
        : lines.slice(Math.max(0, p.line - 1 - WINDOW), p.line + WINDOW).join('\n');
      if (!strip(haystack).includes(strip(p.frag))) {
        bad.push(`${p.where} → ${p.file}:${p.line} does not contain \`${p.frag}\``);
      }
    }
    // How to fix one of these: open the cited file at that line and either
    // correct the number or correct the quote. Do NOT delete the quote — that
    // removes the only proof the number is right.
    expect(bad).toEqual([]);
  });

  /**
   * A ratchet, not a target.
   *
   * Quoting the line is what makes a citation checkable, so the number of
   * checked citations must never fall. It may absolutely rise, and the right
   * time to raise it is when you touch a citation for any other reason.
   */
  it('never loses ground on the number of citations that prove themselves', () => {
    const BASELINE = 78;
    expect(pairs.length).toBeGreaterThanOrEqual(BASELINE);
  });

  /**
   * The mirror ratchet, and the one that actually changes behaviour: a NEW
   * citation has to carry its quote.
   *
   * The pair works like a pincer. The count above may not fall and the count
   * below may not rise, so adding `GECMDS.C:1234` on its own fails while adding
   * ``GECMDS.C:1234 `if (x > 0)` `` passes. Nobody has to backfill the 3,268
   * bare citations already here; they are grandfathered and get quoted when
   * someone touches them for another reason.
   *
   * This exists because of a specific miss. On 2026-09-10 three line numbers
   * were written wrong in one commit — two pointing at a commented-out
   * statement and a damage assignment, one at the print above the line it
   * claimed. All three sat in prose with no quote, so the check above never
   * looked at them, and they were found by a human asking "are you sure?"
   * rather than by this file.
   *
   * The honest limit stays: a quoted citation proves the right NEIGHBOURHOOD,
   * because the window is five lines either side. Matching the exact line was
   * measured and produced six false failures in forty-seven.
   */
  it('never adds a citation that cannot prove itself', () => {
    let total = 0;
    for (const f of SCANNED) {
      total += [...readFileSync(f, 'utf8').matchAll(/\b(GE[A-Z]+\.[CH]):(\d+)/g)].length;
    }
    const unquoted = total - pairs.length;
    // To fix a failure here: put the cited line in backticks after the
    // citation. Do not raise this number to get past it — that is the one move
    // that makes the guard stop working.
    const BASELINE = 3268;
    expect(unquoted).toBeLessThanOrEqual(BASELINE);
  });
});

describe('a divergence from canon is a decision, not a comment', () => {
  const DECISIONS = readFileSync(join(REPO, 'docs/DECISIONS.md'), 'utf8');
  const MARKER = /@divergence\s+([a-z0-9][a-z0-9-]*)/g;

  function markersIn(text: string): string[] {
    return [...text.matchAll(MARKER)].map((m) => m[1]);
  }

  it('has an entry in DECISIONS.md for every @divergence in the code', () => {
    const recorded = new Set(markersIn(DECISIONS));
    const missing: string[] = [];
    for (const f of SCANNED) {
      readFileSync(f, 'utf8').split('\n').forEach((line, idx) => {
        for (const slug of markersIn(line)) {
          if (!recorded.has(slug)) missing.push(`${rel(f)}:${idx + 1} → @divergence ${slug}`);
        }
      });
    }
    // Add `@divergence <slug>` to the decision entry that rules on it.
    expect(missing).toEqual([]);
  });

  it('has code for every divergence DECISIONS.md records', () => {
    // The other direction matters as much. A divergence that gets quietly
    // brought back to canon leaves a decision entry describing behaviour the
    // game no longer has, which is the same rot in the opposite direction.
    const inCode = new Set(SCANNED.flatMap((f) => markersIn(readFileSync(f, 'utf8'))));
    const orphaned = [...new Set(markersIn(DECISIONS))].filter((s) => !inCode.has(s));
    expect(orphaned).toEqual([]);
  });

  /**
   * The phrases below are what someone writes when they have noticed a
   * divergence and are parking it. They are NOT descriptions of canon — "canon
   * does not gate the AI on hypha" is a fine thing to write and is not here,
   * because it says what the original does rather than what we do differently.
   *
   * The list was validated against the whole corpus before it shipped: three
   * hits, of which one was a genuine unrecorded divergence in `rep sys` and two
   * were a field's own doc comment and a test title.
   */
  const PARKING_LANGUAGE = [
    /where canon differs/i,
    /diverges? from canon/i,
    /deliberately not asserted/i,
    /not mistaken for a regression/i,
    /pinned as it stands/i,
  ];

  /**
   * `guide.ts` holds GUIDE_DEVIATIONS, which IS the player-facing register of
   * where this port differs. Its own field documentation naturally uses the
   * language this trap looks for.
   */
  const NOT_A_PARKING_SPOT = ['backend/src/public/guide.ts'];

  const isComment = (t: string) => /^\s*(\/\/|\*|\/\*)/.test(t);

  it('never parks a divergence in prose instead of recording it', () => {
    const parked: string[] = [];
    for (const f of SCANNED) {
      const r = rel(f);
      if (NOT_A_PARKING_SPOT.includes(r)) continue;
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((text, idx) => {
        if (!isComment(text)) return;
        if (!PARKING_LANGUAGE.some((re) => re.test(text))) return;
        // The marker may sit anywhere in the same comment block. Look at the
        // twelve lines either side rather than the one line, because these
        // notes are long and the tag usually goes at the end.
        const block = lines.slice(Math.max(0, idx - 12), idx + 13).join('\n');
        if (!MARKER.test(block)) parked.push(`${r}:${idx + 1} → ${text.trim()}`);
        MARKER.lastIndex = 0;
      });
    }
    // To fix: decide. Either bring the code back to canon, or record the
    // deviation in docs/DECISIONS.md and tag both with `@divergence <slug>`.
    expect(parked).toEqual([]);
  });
});
