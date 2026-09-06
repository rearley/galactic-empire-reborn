/**
 * The generated class pages must still match the original file.
 *
 * `class-help.generated.ts` is produced by tools/extract-class-help.mjs from
 * GE/REL/MBMGESHP.MSG. This re-reads that same file and compares, so the
 * generated artifact cannot drift from canon — the project rule is to generate
 * canon and pin it with a test that re-reads the original, never to
 * hand-transcribe it.
 *
 * Guards one specific trap: class 5's page is TRUNCATED in canon, closing
 * mid-line as `Price:          }` with the value missing. An extractor anchored
 * on `^\}` skips that terminator, runs past it, and silently swallows classes 6
 * and 7 — which is exactly what the first version of the script did. The count
 * assertion below is what caught it.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLASS_HELP } from '../../src/game/commands/help/class-help.generated';

const SRC = resolve(__dirname, '../../../reference/ge-upstream/mbmgemp/GE/REL/MBMGESHP.MSG');
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

function extract(text: string): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const re = /^S(\d+)HELP \{([\s\S]*?)\}\s*\(S\d+TYPE#/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const body = stripAnsi(m[2])
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .filter((l, i) => !(i === 0 && l.trim() === '***'));
    while (body.length && body[body.length - 1].trim() === '') body.pop();
    while (body.length && body[0].trim() === '') body.shift();
    if (body.length) out.set(Number(m[1]), body);
  }
  return out;
}

describe('class help pages match MBMGESHP.MSG', () => {
  const canon = extract(readFileSync(SRC, 'latin1'));

  it('extracts every page the file defines', () => {
    // 34, not 32: classes 6 and 7 hide behind class 5's truncated terminator.
    expect(canon.size).toBe(34);
    expect(Object.keys(CLASS_HELP)).toHaveLength(canon.size);
  });

  it('every generated page is byte-identical to canon', () => {
    for (const [n, lines] of canon) {
      expect(CLASS_HELP[n]).toEqual(lines);
    }
  });

  it('includes the two classes the truncation used to hide', () => {
    expect(CLASS_HELP[6].join('\n')).toContain('Battle Cruiser');
    expect(CLASS_HELP[7].join('\n')).toContain('Frigate');
  });
});
