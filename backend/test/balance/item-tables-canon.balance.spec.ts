/**
 * Item tables must match the original MBMGEMSG.MSG.
 *
 * Parses the original option database at test time, independently of
 * tools/extract-item-tables.mjs, and checks the four tables that ARE canon.
 *
 * These previously carried "@see reference/wiki/items.md" and were wrong by up
 * to three orders of magnitude. The wiki page is a rounded human summary, and
 * it is demonstrably unreliable: it gives the ion cannon planet cap as 500_000
 * against canon's 250, spies as 10_000 against 5, and gold's cargo weight as
 * 0.5 against 2. The ion cannon figure was the one that reached players -- a
 * mature colony could mount a battery the original could never accumulate.
 *
 * BASEPRICE used to be exempt here, on the belief that `baseprice[i] =
 * numopt(ITMPR01+i,...)` (GEMAIN.C:569) post-dated the shipped .MSG. It did
 * not -- we were reading the wrong copy. GE/MSG/MBMGEMSG.MSG is an EARLIER
 * snapshot missing 277 ids, nine of which the C source reads by name
 * (ITMPR01, SHLDPR01, PHSRPR01, HYPDST1/2, CYBNEW, DROIDNEW, CYBBASEM,
 * CYBLASTM). The complete file is GE/REL/MBMGEMSG.MSG, byte-identical to the
 * distribution root copy, and it carries all 25 ITMPR blocks. The two copies
 * agree on every numeric option they share, so nothing else moved.
 *
 * @see GEMAIN.C:550-570
 * @see reference/ge-upstream/PROVENANCE.md
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MAXPL, ITEM_TONS, ITEM_VALUE, MANHOURS, BASEPRICE, NUMITEMS, ITEM_NAMES, I_ION, I_GOLD, I_SPY,
} from '../../src/game/constants/items';

const MSG = resolve(
  __dirname,
  '../../../reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG',
);
const text = readFileSync(MSG, 'utf8');

/** Defaults for ITM<family><nn>, in index order, for all NUMITEMS slots. */
function family(prefix: string): number[] | null {
  const out: number[] = [];
  for (let i = 1; i <= NUMITEMS; i++) {
    const tag = `${prefix}${String(i).padStart(2, '0')}`;
    const m = new RegExp(`^${tag} \\{([^}]*)\\}`, 'm').exec(text);
    if (!m) return null;
    const inner = m[1];
    const c = inner.lastIndexOf(': ');
    out.push(Number((c !== -1 ? inner.slice(c + 2) : inner).trim()));
  }
  return out;
}

describe('item tables match MBMGEMSG.MSG', () => {
  it('parses all four canon families for every item', () => {
    for (const prefix of ['ITMPL', 'ITMWT', 'ITMVAL', 'ITMMH']) {
      expect(family(prefix)).toHaveLength(NUMITEMS);
    }
  });

  it.each(ITEM_NAMES.map((n, i) => [i, n] as const))(
    'item %s (%s) matches canon in every table',
    (index) => {
      expect(MAXPL[index]).toBe(family('ITMPL')![index]);
      // ITMWT is the weight of ONE HUNDRED units.
      expect(ITEM_TONS[index]).toBeCloseTo(family('ITMWT')![index] / 100, 10);
      expect(ITEM_VALUE[index]).toBe(family('ITMVAL')![index]);
      expect(MANHOURS[index]).toBe(family('ITMMH')![index]);
    },
  );
});

describe('the values the wiki got wrong', () => {
  // Named explicitly so a future "tidy-up" back to round numbers fails loudly.
  it('ion cannons cap at 250 per planet, not 500_000', () => {
    expect(MAXPL[I_ION]).toBe(250);
  });

  it('a planet holds 5 spies, not 10_000', () => {
    expect(MAXPL[I_SPY]).toBe(5);
  });

  it('gold weighs 0.5 tons per unit', () => {
    // ITMWT13 {Weight of 100 Gold: 50}. We briefly carried 2, transcribed from
    // GE/MSG/MBMGEMSG.MSG, which says 200 -- one of only three numeric options
    // on which the stale snapshot disagrees with the shipped file (the others
    // are PFIRDST and HPFIRDST).
    expect(ITEM_TONS[I_GOLD]).toBe(0.5);
  });
});

describe('base prices come from ITMPR01-14', () => {
  it('matches the shipped option defaults item for item', () => {
    const canon = family('ITMPR');
    expect(canon).not.toBeNull();
    for (let i = 0; i < NUMITEMS; i++) {
      expect([ITEM_NAMES[i], BASEPRICE[i]]).toEqual([ITEM_NAMES[i], canon![i]]);
    }
  });
});
