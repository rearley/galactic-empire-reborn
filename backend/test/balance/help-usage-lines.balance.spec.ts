/**
 * Canon's help usage lines survive extraction.
 *
 * tools/extract-help.mjs stripped ANSI with /\x1b?\[[0-9;]*[A-Za-z]/g. The `?`
 * made the escape byte OPTIONAL, so any literal `[word]` in the help text
 * matched and was eaten — and canon writes every usage line in exactly that
 * form. Seventeen sequences across fourteen commands were corrupted, all of
 * them on the one line a player reads to learn the syntax:
 *
 *   transfer [up/down] [<number>] [men/...]  ->  transfer p/down] ... en/...]
 *   cloak [ON/OFF]                           ->  cloak N/OFF]
 *   roster [all]                             ->  roster ll]
 *   scan [se/sh/pl/ra/lo]                    ->  scan e/sh/pl/ra/lo]
 *
 * This re-reads the original and asserts the shipped pages still carry what it
 * says, so a stripper change cannot quietly eat page content again.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANON_HELP } from '../../src/game/commands/help/canon-help.generated';
import { canonHelpPage } from '../../src/game/commands/help/help-topics';

const HELP_MSG = join(
  __dirname,
  '../../../reference/ge-upstream/mbmgemp/GE/REL/MBMGEHLP.MSG',
);

const ESC = String.fromCharCode(27);

describe('canon help usage lines survive extraction', () => {
  const raw = readFileSync(HELP_MSG, 'latin1');

  it('the original really does use bracketed usage tokens', () => {
    // Guard the guard: were this ever empty, the assertions below would pass
    // vacuously.
    const tokens = raw.match(/\[[A-Za-z][^\]\n]*\]/g) ?? [];
    expect(tokens.length).toBeGreaterThan(10);
  });

  it.each([
    ['transfer', '[up/down]'],
    ['cloak', '[ON/OFF]'],
    ['roster', '[all]'],
    ['shield', '[up/down]'],
    ['report', '[nav/sys/inv/acc]'],
    ['scan', '[se/sh/pl/ra/lo]'],
    ['attack', '[tro/fig]'],
  ])('%s keeps its %s token', (topic, token) => {
    // Look it up the way the `hel` handler does — CANON_HELP is keyed by canon
    // message id (HLPTRA, HLPCLO...), not by topic name.
    const page = canonHelpPage(topic);
    expect(page).not.toBeNull();
    expect((page as readonly string[]).join('\n')).toContain(token);
  });

  it('leaves no ANSI escape behind in any shipped page', () => {
    const offenders = Object.entries(CANON_HELP)
      .filter(([, b]) => (b as readonly string[]).join('\n').includes(ESC))
      .map(([id]) => id);
    expect(offenders).toEqual([]);
  });
});
