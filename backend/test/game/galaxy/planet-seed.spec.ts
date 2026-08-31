import { rollPlanetInventory, INHABITED_CHANCE } from '../../../src/game/galaxy/planet-seed';
import { NUMITEMS, I_MEN, I_FOOD } from '../../../src/game/constants/items';
import { Rng } from '../../../src/game/galaxy/rng';

/**
 * GEPLANET.C:617-627 — when a sector is first created, roughly a quarter of its
 * planets are generated already inhabited: every item gets a small production
 * rate, and men/food get a starting stock plus a much higher rate. The port's
 * generator skipped this branch entirely, so every planet in the galaxy had
 * rate 0 and 0 men — a claimed colony produced nothing, forever, and the whole
 * planet economy (production reports, tax, cash) was dead content.
 */
describe('rollPlanetInventory — GEPLANET.C:617-627', () => {
  /** rndm(3.99) > 3 → (3.99-3)/3.99 ≈ 0.248 */
  it('inhabits about a quarter of planets', () => {
    expect(INHABITED_CHANCE).toBeCloseTo((3.99 - 3) / 3.99, 6);

    const rng = new Rng(12345);
    let inhabited = 0;
    for (let i = 0; i < 4000; i++) {
      if (rollPlanetInventory(rng).itemsQty[I_MEN] > 0n) inhabited++;
    }
    expect(inhabited / 4000).toBeGreaterThan(0.20);
    expect(inhabited / 4000).toBeLessThan(0.30);
  });

  it('an uninhabited planet has all-zero stock and rates', () => {
    const result = rollPlanetInventory({ next: () => 0 });
    expect(result.itemsQty).toEqual(Array<bigint>(NUMITEMS).fill(0n));
    expect(result.itemsRate).toEqual(Array<number>(NUMITEMS).fill(0));
  });

  it('an inhabited planet stocks men and food and gives every item a rate', () => {
    // next()=0.999 clears the >3 gate and lands at the top of every range.
    const result = rollPlanetInventory({ next: () => 0.999 });

    expect(result.itemsQty[I_MEN]).toBeGreaterThan(0n);
    expect(result.itemsQty[I_MEN]).toBeLessThan(50_000n);
    expect(result.itemsQty[I_FOOD]).toBeGreaterThan(0n);
    expect(result.itemsQty[I_FOOD]).toBeLessThan(3_200n);

    // rndm(5.1) → 0..5 for ordinary items
    for (let i = 0; i < NUMITEMS; i++) {
      if (i === I_MEN || i === I_FOOD) continue;
      expect(result.itemsRate[i]).toBeGreaterThanOrEqual(0);
      expect(result.itemsRate[i]).toBeLessThanOrEqual(5);
    }
    // men 5+rndm(25) → 5..29, food 15+rndm(15) → 15..29
    expect(result.itemsRate[I_MEN]).toBeGreaterThanOrEqual(5);
    expect(result.itemsRate[I_MEN]).toBeLessThanOrEqual(29);
    expect(result.itemsRate[I_FOOD]).toBeGreaterThanOrEqual(15);
    expect(result.itemsRate[I_FOOD]).toBeLessThanOrEqual(29);
  });

  it('every returned array is NUMITEMS long', () => {
    const result = rollPlanetInventory({ next: () => 0.5 });
    expect(result.itemsQty).toHaveLength(NUMITEMS);
    expect(result.itemsRate).toHaveLength(NUMITEMS);
  });
});
