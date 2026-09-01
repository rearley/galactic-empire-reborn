/**
 * T009 — Pure-unit tests for valuePlanet helper.
 *
 * Original C formula (GEMAIN.C:1348-1359):
 *   v = (cash + tax) / (1000000L / pltvcash)
 *   for each item: v += value[i] * (qty[i] / pltvdiv)
 *
 * Since PLTVCASH = 201_228_378 > 1_000_000, we use the mathematically
 * equivalent rearrangement: (cash+tax) * PLTVCASH / 1_000_000.
 *
 * @see GEMAIN.C:1348-1359 — value_pl / calc_networth
 * @see specs/009-midnight-job/data-model.md — valuePlanet formula
 */

import { valuePlanet } from '../../../src/game/midnight/value-pl';
import { PLTVCASH, PLTVDIV } from '../../../src/game/midnight/midnight.constants';
import { NUMITEMS } from '../../../src/game/constants/items';

function makeItemsQty(qty: bigint[] = []): bigint[] {
  const result = Array<bigint>(NUMITEMS).fill(0n);
  for (let i = 0; i < qty.length; i++) result[i] = qty[i];
  return result;
}

const BASE_PRICES = [2, 20, 7, 33, 200, 2, 50, 18, 1, 99, 21, 16, 100, 100];

describe('valuePlanet — pure formula (GEMAIN.C:1348-1359)', () => {
  it('returns 0n for a planet with no cash, tax, or items', () => {
    const result = valuePlanet(0n, 0n, makeItemsQty(), BASE_PRICES, PLTVCASH, PLTVDIV);
    expect(result).toBe(0n);
  });

  it('computes cash-only value correctly using rearranged formula', () => {
    const cash = 1_000_000n;
    // (cash + 0) * PLTVCASH / 1_000_000
    const expected = (cash * BigInt(PLTVCASH)) / 1_000_000n;
    const result = valuePlanet(cash, 0n, makeItemsQty(), BASE_PRICES, PLTVCASH, PLTVDIV);
    expect(result).toBe(expected);
  });

  it('adds tax to cash for the base term', () => {
    const cash = 500_000n;
    const tax = 250_000n;
    const expected = (cash + tax) * BigInt(PLTVCASH) / 1_000_000n;
    const result = valuePlanet(cash, tax, makeItemsQty(), BASE_PRICES, PLTVCASH, PLTVDIV);
    expect(result).toBe(expected);
  });

  it('accumulates item contributions across all 14 items', () => {
    // qty = PLTVDIV → each item contributes exactly basePrice[i] * 1
    const qty = makeItemsQty(Array(NUMITEMS).fill(BigInt(PLTVDIV)));
    const expectedItems = BASE_PRICES.reduce((acc, bp) => acc + BigInt(bp), 0n);
    const result = valuePlanet(0n, 0n, qty, BASE_PRICES, PLTVCASH, PLTVDIV);
    expect(result).toBe(expectedItems);
  });

  it('uses integer (truncating) division for item quantities', () => {
    // qty = PLTVDIV - 1 → item contribution per-item = basePrice * 0 = 0
    const qty = makeItemsQty(Array(NUMITEMS).fill(BigInt(PLTVDIV) - 1n));
    const result = valuePlanet(0n, 0n, qty, BASE_PRICES, PLTVCASH, PLTVDIV);
    expect(result).toBe(0n);
  });

  it('BigInt safety — rich planet with 64-bit-range values', () => {
    // PLTVCASH is a DIVISOR now, so the inputs have to be correspondingly
    // larger to land the result in 64-bit territory.
    const cash = 2_000_000_000n * 1_000_000n; // 2 quadrillion
    const tax  = 1_000_000_000n * 1_000_000n; // 1 quadrillion
    const qty  = makeItemsQty(Array(NUMITEMS).fill(BigInt(PLTVDIV) * 1_000n));
    const cashTerm = (cash + tax) * BigInt(PLTVCASH) / 1_000_000n;
    const itemTerm = BASE_PRICES.reduce((acc, bp) => {
      return acc + BigInt(bp) * (BigInt(PLTVDIV) * 1_000n / BigInt(PLTVDIV));
    }, 0n);
    const expected = cashTerm + itemTerm;
    const result = valuePlanet(cash, tax, qty, BASE_PRICES, PLTVCASH, PLTVDIV);
    expect(result).toBe(expected);
    // Verify we're in 64-bit territory
    expect(result).toBeGreaterThan(2n ** 32n);
  });

  it('handles partial item quantities correctly (qty < PLTVDIV = 0 contribution)', () => {
    // A single item with qty just above PLTVDIV should contribute basePrice * 1
    const qty = makeItemsQty();
    qty[12] = BigInt(PLTVDIV) + 1n; // gold, basePrice=100, qty/PLTVDIV = 1
    const result = valuePlanet(0n, 0n, qty, BASE_PRICES, PLTVCASH, PLTVDIV);
    expect(result).toBe(100n); // 100 * 1 = 100
  });
});
