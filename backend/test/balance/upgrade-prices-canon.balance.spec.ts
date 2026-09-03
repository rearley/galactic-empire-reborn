/**
 * Shipyard prices must match the shipped option database.
 *
 * `new phaser`/`new shield` price off two 19-entry tables. In the original they
 * are NOT compiled constants: GEMAIN.C:575-591 fills them from sysop options,
 * `shieldprice[i] = lngopt(SHLDPR01+i,0L,201228378L)` and the PHSRPR01+i
 * equivalent. The literal arrays at GEMAIN.C:299-341 read like the real thing
 * but are inside an `OMITTED 3.2c.7` comment block, and transcribing them is
 * how SHIELD_PRICE came to end at 250,000,000 against a shipped 200,000,000.
 *
 * Note the source file: GE/REL/MBMGEMSG.MSG, not GE/MSG/MBMGEMSG.MSG. The
 * latter is an earlier partial snapshot with no SHLDPR/PHSRPR blocks at all.
 *
 * @see GEMAIN.C:575-591, reference/ge-upstream/PROVENANCE.md
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PHASER_PRICE, SHIELD_PRICE } from '../../src/game/commands/handlers/new-ship.handler';

const text = readFileSync(
  resolve(__dirname, '../../../reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG'),
  'utf8',
);

/** Defaults for <prefix>01..<prefix>19, in table order. */
function priceFamily(prefix: string): bigint[] {
  const out: bigint[] = [];
  for (let i = 1; i <= 19; i++) {
    const tag = `${prefix}${String(i).padStart(2, '0')}`;
    const m = new RegExp(`^${tag} \\{[^:}]*: *(\\d+)\\}`, 'm').exec(text);
    if (!m) throw new Error(`${tag} not found in MBMGEMSG.MSG`);
    out.push(BigInt(m[1]));
  }
  return out;
}

describe('shipyard prices match MBMGEMSG.MSG', () => {
  it.each([...Array(19).keys()])('Mark-%i+1 shield price is SHLDPR', (i) => {
    expect(SHIELD_PRICE[i]).toBe(priceFamily('SHLDPR')[i]);
  });

  it.each([...Array(19).keys()])('Mark-%i+1 phaser price is PHSRPR', (i) => {
    expect(PHASER_PRICE[i]).toBe(priceFamily('PHSRPR')[i]);
  });

  it('has exactly 19 entries each, matching TOPSHIELD/TOPPHASOR', () => {
    expect(SHIELD_PRICE).toHaveLength(19);
    expect(PHASER_PRICE).toHaveLength(19);
  });
});
