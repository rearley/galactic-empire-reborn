/**
 * The generated help must still match MBMGEHLP.MSG.
 *
 * `src/game/commands/help/canon-help.generated.ts` is produced by
 * tools/extract-help.mjs. The project rule is that canon is never
 * hand-transcribed — it is generated and pinned by a test that re-reads the
 * original, because hand-transcription is what produced the scanRange drift.
 *
 * This re-parses the shipped .MSG and compares it entry for entry.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CANON_HELP } from '../../src/game/commands/help/canon-help.generated';

const MSG = resolve(__dirname, '../../..', 'reference/ge-upstream/mbmgemp/GE/REL/MBMGEHLP.MSG');

/** The extractor's logic, re-implemented here so the test cannot share a bug. */
function parse(raw: string): Map<string, string[]> {
  const stripped = raw.replace(/\x1b?\[[0-9;]*[A-Za-z]/g, '');
  const out = new Map<string, string[]>();
  const re = /^(HLP[A-Z0-9]*)\s*\{([\s\S]*?)^[ \t]*\}[ \t]*T/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const body = m[2].split(/\r?\n/).map((l) => l.replace(/\s+$/, ''));
    while (body.length && body[0] === '') body.shift();
    while (body.length && body[body.length - 1] === '') body.pop();
    out.set(m[1], body);
  }
  return out;
}

const canonAvailable = existsSync(MSG);
const d = canonAvailable ? describe : describe.skip;

d('generated help matches the shipped MBMGEHLP.MSG', () => {
  const fromFile = parse(readFileSync(MSG, 'latin1'));

  it('extracts all 61 of canon\'s entries', () => {
    // Anchoring the terminator on a line-initial '}' found only 22 and merged
    // the other 39 into their neighbours: canon closes most pages with
    // `ESC[0m} T`, the reset sitting on the same line before the brace.
    expect(fromFile.size).toBe(61);
    expect(Object.keys(CANON_HELP)).toHaveLength(61);
  });

  it('every entry matches the original line for line', () => {
    for (const [id, lines] of fromFile) {
      expect(CANON_HELP[id]).toEqual(lines);
    }
  });

  it('carries no ANSI escapes into the game', () => {
    for (const lines of Object.values(CANON_HELP)) {
      for (const line of lines) {
        expect(line).not.toMatch(/\x1b/);
        expect(line).not.toMatch(/\[[0-9;]*m/);
      }
    }
  });

  it('keeps the pages a player reached for in play', () => {
    // `hel mine`, `hel tor`, `hel pha` — the three tried during a live session.
    expect(CANON_HELP.HLPMIN.join('\n')).toContain('neutron mine');
    expect(CANON_HELP.HLPMIN.join('\n')).toContain('1 to 50');
    expect(CANON_HELP.HLPTOR.join('\n')).toContain('lock on the ship');
    expect(CANON_HELP.HLPPHA.join('\n')).toContain('The more narrow the beam');
  });
});
