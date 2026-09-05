/**
 * A message id that exists in canon must READ its text from canon.
 *
 * CLAUDE.md's rule is "do not hand-transcribe canon into the codebase" — and
 * the message table had 36 entries doing exactly that: the key was a real
 * canon id, but the value was a string somebody had retyped. Sixteen had
 * drifted from the original, and the drift was invisible because the id
 * matched and the text read plausibly:
 *
 *   FORHELP   said "Type 'help' for a list of commands."
 *             canon says "For assistance type HELP."
 *   PHITDEF   had lost canon's leading "%c" entirely, so a deflected phaser
 *             hit never told the victim which ship letter to shoot back at.
 *   PHITYOU,
 *   KILLEDBY,
 *   NUMOOR    had lost their leading "***" / newline banner, the marker that
 *             separates an alert from ordinary output.
 *
 * This fails the build on the next one rather than waiting for a playtest.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MESSAGES_TS = join(__dirname, '../../src/game/commands/messages.ts');
const CANON_TS = join(__dirname, '../../src/game/commands/canon-messages.generated.ts');

function canonIds(): Set<string> {
  const src = readFileSync(CANON_TS, 'utf8');
  return new Set(Array.from(src.matchAll(/^ {2}([A-Z0-9_]+): '/gm), (m) => m[1]));
}

/** Every `[MessageId.X]: <value>` row in the message table. */
function tableRows(): { id: string; value: string }[] {
  const src = readFileSync(MESSAGES_TS, 'utf8');
  return Array.from(src.matchAll(/^ {2}\[MessageId\.([A-Z0-9_]+)\]:\s*(.+?),\s*$/gm), (m) => ({
    id: m[1],
    value: m[2].trim(),
  }));
}

describe('canon message ids are referenced, never retyped', () => {
  it('has no id that exists in canon but carries a hand-written string', () => {
    const canon = canonIds();
    const offenders = tableRows()
      .filter((r) => canon.has(r.id) && !r.value.startsWith('CANON_MESSAGES'))
      .map((r) => `${r.id} = ${r.value}`);

    expect(offenders).toEqual([]);
  });

  it('resolves every CANON_MESSAGES.X reference to an id the original actually defines', () => {
    // The other direction: a reference to an id that canon does not have would
    // silently yield undefined and print "undefined" to a player.
    const canon = canonIds();
    const dangling = tableRows()
      .map((r) => /^CANON_MESSAGES\.([A-Z0-9_]+)$/.exec(r.value)?.[1])
      .filter((id): id is string => id !== undefined && !canon.has(id));

    expect(dangling).toEqual([]);
  });

  it('still finds a substantial canon table, so a broken regex cannot pass vacuously', () => {
    expect(canonIds().size).toBeGreaterThan(1000);
    expect(tableRows().length).toBeGreaterThan(300);
  });
});
