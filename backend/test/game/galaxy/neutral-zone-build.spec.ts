import { GalaxyService } from '../../../src/game/galaxy/galaxy.service';
import { BASEPRICE, NUMITEMS, I_MEN, I_FOOD, I_TROOPS, I_MISSL, I_GOLD } from '../../../src/game/constants/items';

/**
 * What the two neutral-zone shops sell on the day the galaxy is built.
 *
 * Canon builds them in `GEPLANET.C`, and the two are deliberately different:
 *
 *   `build_plan_1` (Zygor)  — stocks 32 000 MEN and never marks them for sale.
 *     Missiles, torpedoes, ion cannons, flux pods, fighters, decoys, mines,
 *     jammers and zippers each get `qty 32000`, `sell 'Y'` and
 *     `markup2a = baseprice*2`. It is the weapons hub. (GEPLANET.C:665-726)
 *
 *   `build_plan_2` (Tahanian Station) — troops, men and food only, each at
 *     `qty 1032000`, `sell 'Y'`, `markup2a = baseprice*2`. (GEPLANET.C:730-768)
 *
 * So on a fresh galaxy the ONLY place to buy men is planet 2, which is what a
 * playtest report half-remembered as "men are cheaper on planet 2" (#16). They
 * are not cheaper anywhere: both posts price at `baseprice*2`, and the nightly
 * GE22e patch re-rolls both to `baseprice*2 + rnd(baseprice)` — men land on 4
 * or 5 credits at either. The difference is availability, not price.
 *
 * This port used to open Zygor with all fourteen items for sale, applying the
 * midnight patch's end state at build time and erasing that distinction on day
 * one. @see issue #16  @see midnight.repository.ts refreshNeutralZone
 */
type ItemArrays = {
  itemsQty: bigint[]; itemsSell: number[]; itemsMarkup2a: number[];
};
const build = (n: 1 | 2): ItemArrays =>
  (GalaxyService as unknown as Record<string, () => ItemArrays>)[`s00ItemsPlan${n}`]();

describe('the neutral zone as canon first builds it', () => {
  describe('Zygor — the weapons hub', () => {
    const z = build(1);

    it('sells the nine weapon-shop items at twice base price', () => {
      for (const i of [I_MISSL, 2, 3, 4, 6, 7, 9, 10, 11]) {
        expect(`item ${i} sell=${z.itemsSell[i]}`).toBe(`item ${i} sell=1`);
        expect(z.itemsMarkup2a[i]).toBe(BASEPRICE[i] * 2);
        expect(z.itemsQty[i]).toBe(32_000n);
      }
    });

    it('stocks men but does NOT sell them — that is planet 2 trade', () => {
      expect(z.itemsQty[I_MEN]).toBe(32_000n);
      expect(z.itemsSell[I_MEN]).toBe(0);
      expect(z.itemsMarkup2a[I_MEN]).toBe(0);
    });

    it('sells no food, no troops and no gold on day one', () => {
      for (const i of [I_FOOD, I_TROOPS, I_GOLD, 13]) {
        expect(`item ${i} sell=${z.itemsSell[i]}`).toBe(`item ${i} sell=0`);
      }
    });
  });

  describe('Tahanian Station — troops, men and food', () => {
    const t = build(2);

    it('sells exactly those three, each at twice base price', () => {
      for (const i of [I_TROOPS, I_MEN, I_FOOD]) {
        expect(t.itemsSell[i]).toBe(1);
        expect(t.itemsQty[i]).toBe(1_032_000n);
        expect(t.itemsMarkup2a[i]).toBe(BASEPRICE[i] * 2);
      }
      const sellable = t.itemsSell.filter((s) => s === 1).length;
      expect(sellable).toBe(3);
    });
  });

  it('prices men the same at both posts once Zygor stocks them — no discount anywhere', () => {
    // The claim in #16, checked: there is no per-planet discount in canon.
    // Both use baseprice*2 at build and baseprice*2 + rnd(baseprice) nightly.
    expect(build(2).itemsMarkup2a[I_MEN]).toBe(BASEPRICE[I_MEN] * 2);
  });

  it('leaves every item array the full length, whatever is for sale', () => {
    for (const arrays of [build(1), build(2)]) {
      expect(arrays.itemsQty).toHaveLength(NUMITEMS);
      expect(arrays.itemsSell).toHaveLength(NUMITEMS);
      expect(arrays.itemsMarkup2a).toHaveLength(NUMITEMS);
    }
  });
});
