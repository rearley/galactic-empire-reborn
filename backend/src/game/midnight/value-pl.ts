/**
 * Pure helper: compute the net-worth of a planet for scoring purposes.
 *
 * Original C formula (GEMAIN.C:1348-1359):
 *   v = (cash + tax) / (1000000L / pltvcash)
 *   for each item: v += value[i] * (qty[i] / pltvdiv)
 *
 * Since PLTVCASH = 201_228_378 > 1_000_000, the C integer expression
 * `1000000/pltvcash` truncates to 0. We preserve the mathematically
 * equivalent form that avoids zero-divisor: multiply then divide.
 *
 * BigInt arithmetic prevents overflow on large planet economies.
 *
 * @see GEMAIN.C:1348-1359 — value_pl / calc_networth
 */
export function valuePlanet(
  cash: bigint,
  tax: bigint,
  itemsQty: bigint[],
  itemBaseValues: readonly number[],
  PLTVCASH: number,
  PLTVDIV: number,
): bigint {
  const pltvdivBig = BigInt(PLTVDIV);
  const pltvcashBig = BigInt(PLTVCASH);

  // Mathematically equivalent to C: (cash+tax)/(1000000/pltvcash)
  // Rearranged to avoid zero-divisor: (cash+tax)*pltvcash/1000000
  let v = (cash + tax) * pltvcashBig / 1_000_000n;

  for (let i = 0; i < itemsQty.length; i++) {
    const basePrice = BigInt(itemBaseValues[i] ?? 0);
    v += basePrice * (itemsQty[i] / pltvdivBig);
  }

  return v;
}
