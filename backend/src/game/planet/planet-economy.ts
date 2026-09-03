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
/**
 * A planet whose population has revolted. C writes this into the owner field
 * (`strcpy(plptr->userid,"**Free**")`, GEPLANET.C:377) rather than clearing it,
 * so the planet keeps running: the economy gate is `userid[0] != 0`
 * (GEMAIN.C:2129) and "**Free**" passes it.
 *
 * The port wrote null, which fails that gate — a revolted colony's economy
 * froze permanently, its population never grew, never starved, and it could
 * never recover or become worth reclaiming. It simply stopped existing as a
 * place while remaining on the map.
 */
export const FREE_PLANET_OWNER = '**Free**';

/** True when this planet has ever been claimed, revolted or not. */
export function isOwnedOrFree(state: PlanetState): boolean {
  return state.userid !== null && state.userid !== '';
}

/** True when a real player owns it — the gate for TAX and revolt, not economy. */
export function hasRealOwner(state: PlanetState): boolean {
  return isOwnedOrFree(state) && state.userid !== FREE_PLANET_OWNER;
}

export function shouldRunEconomy(state: PlanetState): boolean {
  // Population and production keep running on a free planet; only tax and the
  // revolt check need a real owner. @see GEPLANET.C:341, GEMAIN.C:2129
  return isOwnedOrFree(state) && Number(state.items[I_MEN].qty) > 0;
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
  // Tax accrues only for a REAL owner. A revolted planet keeps producing and
  // feeding its people, but there is nobody left to collect from it.
  // @see GEPLANET.C:341 — the tax branch is inside the owner test
  if (hasRealOwner(state)) {
    tax += BigInt(Math.floor((state.taxrate / 1200) * Number(items[I_MEN].qty)));
  }

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

/**
 * The flat stock the GE22e patch writes into every slot it restocks.
 * @see GEMAIN.C:2153 `planet.items[i].qty = 1032000L;`
 */
export const NEUTRAL_RESTOCK_QTY = 1_032_000n;

/** Item slots the T-station (plnum 2) restocks. @see GEMAIN.C:2160-2178 */
const T_STATION_SLOTS: readonly number[] = [I_TROOPS, I_MEN, I_FOOD];

/**
 * Is this one of the two neutral-zone trading posts the GE22e patch restocks?
 *
 * C tests `planet.xsect == 0 && planet.ysect == 0 && planet.plnum == 1` (Zygor)
 * and the same with `plnum == 2` (the T-station). Every other planet in sector
 * 0,0 — and every Zygor-numbered planet elsewhere — is an ordinary world.
 *
 * @see GEMAIN.C:2147, GEMAIN.C:2160
 */
export function isNeutralZoneRestockPlanet(state: PlanetState): boolean {
  return state.xsect === 0 && state.ysect === 0 && (state.plnum === 1 || state.plnum === 2);
}

/**
 * The GE22e "Updating Zygor" / "Updating T-station" patch.
 *
 * Both blocks live INSIDE `plarti`'s continuous planet loop and fire on the
 * same pass, immediately after `multiply()` has run for that record — so the
 * storage clamp `multiply` applies (`qty > maxpl[i]*fact` -> clamp,
 * GEPLANET.C:328-331) is undone the instant it happens and the hub always
 * holds 1,032,000 of everything it sells. Restoring only at midnight left the
 * shop selling MAXPL quantities for the rest of the day: spies five at a time,
 * ion cannons 250, and gold zero, since the tick converts the whole gold pile
 * into planet cash (GEPLANET.C:261-265).
 *
 * `rnd` returns a float in [0,1) and stands in for C's `gernd()`; the markup is
 * `(baseprice[i]*2) + (gernd()%baseprice[i])`.
 *
 * Pure: returns a new state, mutates nothing.
 *
 * @see GEMAIN.C:2145-2178 GE22e patch
 */
export function applyNeutralZoneRestock(
  state: PlanetState,
  rnd: () => number = Math.random,
): PlanetState {
  if (!isNeutralZoneRestockPlanet(state)) return state;

  const slots =
    state.plnum === 1 ? Array.from({ length: NUMITEMS }, (_, i) => i) : T_STATION_SLOTS;

  const items = state.items.map((it) => ({ ...it }));
  for (const i of slots) {
    items[i].qty = NEUTRAL_RESTOCK_QTY;
    items[i].sell = true;
    items[i].markup2a = BASEPRICE[i] * 2 + Math.floor(rnd() * BASEPRICE[i]);
  }

  return { ...state, items };
}
