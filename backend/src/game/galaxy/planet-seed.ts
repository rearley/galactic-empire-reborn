import { NUMITEMS, I_MEN, I_FOOD } from '../constants/items';

/**
 * Probability that a freshly generated planet is already inhabited.
 *
 * C rolls `if (rndm(3.99) > 3)` where `rndm(n)` is uniform over [0, n), which
 * is (3.99 - 3) / 3.99 ≈ 24.8%.
 *
 * @see GEPLANET.C:617
 */
export const INHABITED_CHANCE = (3.99 - 3) / 3.99;

/** Minimal RNG surface — anything that yields a float in [0, 1). */
export interface UniformRng {
  next(): number;
}

export interface PlanetInventory {
  itemsQty: bigint[];
  itemsRate: number[];
}

/**
 * Rolls a new planet's starting stock and production rates.
 *
 * Roughly a quarter of planets come out of generation already inhabited: every
 * item gets a small rate, and men/food get a starting stock plus a much higher
 * rate. The rest are barren — zero stock, zero rate — and stay that way until
 * an owner ships population in.
 *
 * The generator previously skipped this branch, so *every* planet in the galaxy
 * was barren and a claimed colony produced nothing forever.
 *
 * @see GEPLANET.C:617-627
 */
export function rollPlanetInventory(rng: UniformRng): PlanetInventory {
  const itemsQty = new Array<bigint>(NUMITEMS).fill(0n);
  const itemsRate = new Array<number>(NUMITEMS).fill(0);

  // rndm(3.99) > 3
  if (rng.next() * 3.99 <= 3) {
    return { itemsQty, itemsRate };
  }

  for (let k = 0; k < NUMITEMS; k++) {
    itemsRate[k] = Math.floor(rng.next() * 5.1); // rndm(5.1) → 0..5
  }

  itemsQty[I_MEN] = BigInt(Math.floor(rng.next() * 50_000));
  itemsRate[I_MEN] = 5 + Math.floor(rng.next() * 25);
  itemsQty[I_FOOD] = BigInt(Math.floor(rng.next() * 3_200));
  itemsRate[I_FOOD] = 15 + Math.floor(rng.next() * 15);

  return { itemsQty, itemsRate };
}
