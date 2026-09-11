/**
 * The citation scanner is the thing two guards trust, so it gets its own test.
 *
 * `canon-citations.balance.spec.ts` and `docs-truth.balance.spec.ts` both used
 * to find citations with `/\b(GE[A-Z]+\.[CH]):(\d+)/g`, which requires the
 * filename on every number. The codebase does not write them that way — it
 * writes the file once and then continues with bare line numbers:
 *
 *   GECMDS.C:1198, :1313
 *   GEFUNCS.C:1595-1603 (TORP1) and :1680-1688 (MISSL1)
 *   GECMDS.C:2516 then :2521
 *
 * 197 citations in `backend/` were written that way and were invisible to both
 * guards: uncounted by the totals, never bounds-checked, never eligible for
 * quote verification. A citation in that form could point anywhere and nothing
 * would say so.
 *
 * @see docs/DECISIONS.md 2026-09-11 — the citation scanner
 */
import { scanLine } from './citation-scan';

describe('scanLine', () => {
  it('finds a plain citation', () => {
    expect(scanLine('// @see GECMDS.C:1198 does a thing')).toEqual([
      { file: 'GECMDS.C', line: 1198, quote: null },
    ]);
  });

  it('attributes a bare continuation to the file named before it', () => {
    expect(scanLine('// @see GECMDS.C:1198, :1313')).toEqual([
      { file: 'GECMDS.C', line: 1198, quote: null },
      { file: 'GECMDS.C', line: 1313, quote: null },
    ]);
  });

  it('carries the file across prose, not just a comma', () => {
    // The corpus uses "and", "then", "/", and a parenthesised symbol between
    // the two numbers. All of them mean the same thing.
    expect(scanLine('// GEFUNCS.C:1374 and :1384, then :1390').map((c) => c.line)).toEqual([
      1374, 1384, 1390,
    ]);
  });

  it('switches file when a second one is named', () => {
    expect(scanLine('// GECYBS.C:441, GEDROIDS.C:277, :282')).toEqual([
      { file: 'GECYBS.C', line: 441, quote: null },
      { file: 'GEDROIDS.C', line: 277, quote: null },
      { file: 'GEDROIDS.C', line: 282, quote: null },
    ]);
  });

  it('ignores a bare line number with no file named before it', () => {
    // Otherwise every object literal and every ratio in the suite becomes a
    // citation. The file has to come first, on the same line.
    expect(scanLine('const x = { a:1, b:2 };')).toEqual([]);
  });

  it('does not read an object key or a digit-led colon as a continuation', () => {
    expect(scanLine('// GECMDS.C:1198 — see { speed:3 } at 12:30').map((c) => c.line)).toEqual([
      1198,
    ]);
  });

  it('takes the quote that immediately follows a citation', () => {
    const got = scanLine('// @see GEMAIN.C:1977 `#define MAXTIC\t20`');
    expect(got).toEqual([{ file: 'GEMAIN.C', line: 1977, quote: '#define MAXTIC\t20' }]);
  });

  it('gives the quote to the number it follows, not to the whole run', () => {
    const got = scanLine('// GECMDS.C:1198, :1313 `torpedo lock`');
    expect(got).toEqual([
      { file: 'GECMDS.C', line: 1198, quote: null },
      { file: 'GECMDS.C', line: 1313, quote: 'torpedo lock' },
    ]);
  });

  it('normalises the filename to upper case', () => {
    expect(scanLine('// @see gecmds.c:1198'.toUpperCase())[0].file).toBe('GECMDS.C');
  });

  it('reads a range citation as its first line, as the old regex did', () => {
    expect(scanLine('// @see GEFUNCS.C:1595-1603 (TORP1)').map((c) => c.line)).toEqual([1595]);
  });
});
