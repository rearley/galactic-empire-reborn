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

  if (updatedTroops / 100 > updatedFood) {
    const survivors = Math.floor(updatedTroops - updatedTroops / 8);
    starved.troops = updatedTroops - survivors;
    updatedTroops = survivors;
  }

  // Food eating — GEPLANET.C:~222
  const foodEaten = Math.min(updatedFood, Math.floor(updatedTroops / 100));
  updatedFood -= foodEaten;

  // Men starvation — GEPLANET.C:~228
  if (updatedMen / 100 > updatedFood) {
    const survivors = Math.floor(updatedMen - updatedMen / 8);
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

  for (let i = 0; i < NUMITEMS; i++) {
    if (updatedMen === 0) break; // Zero population — FR-017

    const rate = items[i].rate;
    if (rate === 0) continue;

    // qty = (men * (rate/100) * (manhours[i]/10000/6)) / 7
    const qty = (updatedMen * (rate / 100) * (MANHOURS[i] / 10000 / 6)) / 7;

    let fact = envFact * taxfact;

    // tfact penalty on cash
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

  // Population tax levy — GEPLANET.C:~335
  tax += BigInt(Math.floor((state.taxrate / 1200) * updatedMen));

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
