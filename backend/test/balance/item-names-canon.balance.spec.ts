/**
 * `ITEM_NAMES` and `ITEM_KEYWORDS` are canon's two item tables, verbatim.
 *
 * The original keeps them SEPARATE and uses them for different jobs
 * (GECMDS.C:80-107):
 *
 *   char *kwrd[NUMITEMS]      = { "men", "mis", "tor", ... };   // parsing
 *   char *item_name[NUMITEMS] = { "men", "missiles", ... };     // display
 *
 * Parsing goes through `kwrd` — `genearas(kwrd[i], margv[n])` at :3287, :4133,
 * :4268, :4304, :4788 and :6111 — while narration interpolates `item_name`,
 * as in the salvage list `prf(", %s %s", amt, item_name[i])` (GEFUNCS.C:1136).
 *
 * The port had ONE Title-Case table doing both, so every cargo line read
 * "1 Mines" and "2 Torpedoes" where canon reads "1 mine"... well, "1 mines" —
 * canon does not singularise either, but it does not shout. It also spelled
 * two of them differently from canon: "Torpedoes" for canon's "torpedos", and
 * "Spies" for canon's "spy".
 *
 * This parses GECMDS.C at test time rather than trusting a transcription, the
 * same way ship-class-canon and item-tables-canon re-read their sources.
 * @see CLAUDE.md — "Do not hand-transcribe canon into the codebase."
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ITEM_NAMES, ITEM_KEYWORDS, NUMITEMS } from '../../src/game/constants/items';

const SRC = resolve(__dirname, '../../../reference/ge-source/GECMDS.C');
const text = readFileSync(SRC, 'utf8');

/** Pull a `char *NAME[NUMITEMS] = { "a", "b", ... };` initialiser out of the C. */
function cArray(name: string): string[] {
  const m = new RegExp(
    `char\\s*\\*\\s*${name}\\s*\\[\\s*NUMITEMS\\s*\\]\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*;`,
  ).exec(text);
  if (!m) throw new Error(`could not find ${name}[] in GECMDS.C`);
  return [...m[1].matchAll(/"([^"]*)"/g)].map((q) => q[1]);
}

describe('item tables match GECMDS.C verbatim', () => {
  const canonNames = cArray('item_name');
  const canonKwrd = cArray('kwrd');

  it('found both tables, fully populated', () => {
    expect(canonNames).toHaveLength(NUMITEMS);
    expect(canonKwrd).toHaveLength(NUMITEMS);
  });

  it('ITEM_NAMES is canon item_name[], character for character', () => {
    expect([...ITEM_NAMES]).toEqual(canonNames);
  });

  it('ITEM_KEYWORDS is canon kwrd[], character for character', () => {
    expect([...ITEM_KEYWORDS]).toEqual(canonKwrd);
  });

  it('names are lower case — canon never Title-Cases an item', () => {
    for (const n of ITEM_NAMES) expect(n).toBe(n.toLowerCase());
  });

  /** The two the port had spelled its own way. */
  it.each([
    [2, 'torpedos'],
    [13, 'spy'],
  ])('slot %i is %s', (i, expected) => {
    expect(ITEM_NAMES[i]).toBe(expected);
  });
});
