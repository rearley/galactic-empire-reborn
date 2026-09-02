/**
 * Pure production-tick formula. NO I/O, NO mutation.
 * Takes a PlanetState snapshot, returns a new PlanetState with mutated fields.
 * @see GEPLANET.C:195-340 multiply()
 */

import { BASEPRICE, I_FOOD, I_GOLD, I_MEN, I_TROOPS, MANHOURS, MAXPL, NUMITEMS } from '../constants/items';
import { PlanetState } from './planet-state.types';

/** How many troops and men a tick starved to death. Zero when the colony ate. */
export interface StarvationLosses {
  troops: number;
  men: number;
}

/**
 * Apply one economy tick to a planet state snapshot.
 * Ports GEPLANET.C:multiply lines 195–340 (stops before revolt — research Decision 6).
 * @see GEPLANET.C:195 multiply()
 */
/**
 * Does this planet's economy run at all this sweep?
 *
 *   if (plptr->items[0].qty > 0 && plptr->userid[0] != 0)
 *
 * Slot 0 is I_MEN, so a world with no civilians left is skipped ENTIRELY —
 * no starvation, no gold conversion, no tax. The port filtered on ownership
 * alone, so a garrisoned but depopulated world bled an eighth of its troops
 * every tick until the garrison was gone; in C it holds indefinitely.
 *
 * @see GEMAIN.C:2132
 */
export function shouldRunEconomy(state: PlanetState): boolean {
  return state.userid !== null && Number(state.items[I_MEN].qty) > 0;
}

export function applyEconomyTick(state: PlanetState): PlanetState {
  return applyEconomyTickWithLosses(state).state;
}

/**
 * As {@link applyEconomyTick}, but also reports what starved.
 *
 * C mails the owner a distress message on each starvation (MESG06 troops,
 * MESG07 men, GEPLANET.C:211/246). The caller needs the counts to do that, and
 * they cannot be recovered from the returned state alone once production has
 * added stock back on top.
 */
export function applyEconomyTickWithLosses(state: PlanetState): { state: PlanetState; starved: StarvationLosses } {
  // Deep-copy items to avoid mutating the original snapshot
  const items = state.items.map((it) => ({ ...it }));
  let cash = state.cash;
  let tax = state.tax;

  const men = Number(items[I_MEN].qty);
  const troops = Number(items[I_TROOPS].qty);
  const food = Number(items[I_FOOD].qty);

  // Troop starvation — GEPLANET.C:~217
  let updatedTroops = troops;
  let updatedFood = food;
  let updatedMen = men;

  const starved: StarvationLosses = { troops: 0, men: 0 };

  // C compares INTEGER quotients — `plptr->items[I_TROOPS].qty/100` on unsigned
  // longs — and takes an integer `qty/8` off the top. 150 troops against 1 food
  // gives 150/100 = 1, which is not > 1, so nobody starves; and 100 troops lose
  // 100/8 = 12, leaving 88 rather than 87. @see GEPLANET.C:206-209, 232-234
  if (Math.floor(updatedTroops / 100) > updatedFood) {
    const survivors = updatedTroops - Math.floor(updatedTroops / 8);
    starved.troops = updatedTroops - survivors;
    updatedTroops = survivors;
  }

  // Food eating — GEPLANET.C:221-230.
  //
  // FIXED, not reproduced. C debits food for TROOPS only
  // (`items[I_TROOPS].qty/100`) and then starves MEN against that same stock.
  // A colony with colonists and no garrison therefore eats NOTHING, forever —
  // a perpetual-motion economy in which food, one of the two goods Tahanian
  // Station exists to sell, is worthless. Colonists eat here.
  //
  // The rate is C's own: one unit of food per hundred people, integer-divided,
  // applied to both populations. @see docs/DECISIONS.md — colonists will eat
  const foodEaten = Math.min(
    updatedFood,
    Math.floor(updatedTroops / 100) + Math.floor(updatedMen / 100),
  );
  updatedFood -= foodEaten;

  // Men starvation — GEPLANET.C:~228
  if (Math.floor(updatedMen / 100) > updatedFood) {
    const survivors = updatedMen - Math.floor(updatedMen / 8);
    starved.men = updatedMen - survivors;
    updatedMen = survivors;
  }

  items[I_TROOPS].qty = BigInt(updatedTroops);
  items[I_FOOD].qty = BigInt(updatedFood);
  items[I_MEN].qty = BigInt(updatedMen);

  // Gold-to-cash conversion — GEPLANET.C:~234
  const goldQty = Number(items[I_GOLD].qty);
  cash += BigInt(goldQty) * BigInt(BASEPRICE[I_GOLD]);
  items[I_GOLD].qty = 0n;

  // Production — GEPLANET.C:~257-310
  const taxfact = 1 - state.taxrate / 120;
  const envFact = (state.enviorn + state.resource + 2) * 0.25;

  // C runs this loop over all fourteen slots with NO rate test. Two things in
  // the body are not production and must not be skipped: the cash decay and
  // the storage cap. Guarding the whole body on `rate !== 0` decayed cash
  // tfact^2 rather than tfact^14 on a fresh colony — 0.90 a tick instead of
  // 0.49 — which kept the `cash > 0` production bonus alive for many extra
  // ticks, and left rate-0 slots uncapped, so unlimited mines, ion cannons and
  // flux pods could be ferried onto a planet and stockpiled forever.
  // @see GEPLANET.C:265-332
  for (let i = 0; i < NUMITEMS; i++) {
    // `men` is re-read at the top of every iteration, and I_MEN is slot 0
    // written back at :332 — so slots 1-13 see the GROWN population, not the
    // post-starvation figure captured before the loop. @see GEPLANET.C:271
    const men = Number(items[I_MEN].qty);

    const rate = items[i].rate;

    // qty = (men * (rate/100) * (manhours[i]/10000/6)) / 7
    const qty = rate === 0 ? 0 : (men * (rate / 100) * (MANHOURS[i] / 10000 / 6)) / 7;

    let fact = envFact * taxfact;

    // tfact penalty on cash — outside the rate test in C.
    const tfact = 0.95 - ((6 - state.resource - state.enviorn) * 10) / 100;
    let cashF = Number(cash);
    cashF *= tfact;
    if (cashF > 0) fact *= 1.5;
    cash = BigInt(Math.max(0, Math.floor(cashF)));

    const currentQty = Number(items[i].qty);
    const maxAllowed = MAXPL[i] * fact;
    const newQty = Math.min(currentQty + qty * fact, maxAllowed);
    items[i].qty = BigInt(Math.max(0, Math.floor(newQty)));
  }

  // Population tax levy — also on the grown figure. @see GEPLANET.C:335-338
  tax += BigInt(Math.floor((state.taxrate / 1200) * Number(items[I_MEN].qty)));

  // Revolt and check_spy deferred to feature 006 (research Decision 6)

  return {
    state: {
      ...state,
      items,
      cash,
      tax,
    },
    starved,
  };
}
