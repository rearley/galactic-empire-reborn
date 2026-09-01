/**
 * T045 — A planet with I_MEN=0 accrues no production or food consumption over 100 ticks.
 * Uses the pure applyEconomyTick function (no services needed).
 */

import { applyEconomyTick, shouldRunEconomy } from '../../src/game/planet/planet-economy';
import { PlanetState } from '../../src/game/planet/planet-state.types';
import { NUMITEMS, I_MEN, I_FOOD } from '../../src/game/constants/items';

function makeZeroPopPlanet(): PlanetState {
  const items = Array.from({ length: NUMITEMS }, () => ({
    qty: 0n,
    rate: 10,
    sell: true,
    reserve: 0,
    markup2a: 5,
    sold2a: 0n,
  }));

  // Keep food non-zero so we can verify it doesn't change
  items[I_FOOD].qty = 1000n;

  return {
    xsect: 3,
    ysect: 3,
    plnum: 1,
    type: 2,
    xcoord: 3.5,
    ycoord: 3.5,
    userid: 'owner',
    name: 'ZeroPop',
    enviorn: 1,
    resource: 2,
    cash: 1000n,
    debt: 0n,
    tax: 0n,
    taxrate: 5,
    warnings: 0,
    password: '',
    lastattack: '',
    beacon: '',
    spyowner: '',
    technology: 0,
    teamcode: 0n,
    items,
  };
}

function runTicks(initial: PlanetState, count: number): PlanetState {
  let state = initial;
  for (let i = 0; i < count; i++) {
    state = applyEconomyTick(state);
  }
  return state;
}

describe('T045 — applyEconomyTick with zero population', () => {
  it('zero men: food unchanged after 100 ticks', () => {
    const initial = makeZeroPopPlanet();
    expect(initial.items[I_MEN].qty).toBe(0n);

    const final = runTicks(initial, 100);

    expect(final.items[I_FOOD].qty).toBe(1000n);
  });

  it('a zero-population planet is never handed to the economy at all', () => {
    // C gates on `plptr->items[0].qty > 0 && plptr->userid[0] != 0`
    // (GEMAIN.C:2132), so the question is not what multiply() does to an empty
    // world — it is never called on one. That is what keeps a garrisoned but
    // depopulated planet frozen rather than slowly bleeding out.
    const initial = makeZeroPopPlanet();
    expect(shouldRunEconomy(initial)).toBe(false);
  });

  it('zero men: all non-food numeric item quantities remain zero after 100 ticks', () => {
    const initial = makeZeroPopPlanet();
    const final = runTicks(initial, 100);

    for (let i = 0; i < NUMITEMS; i++) {
      if (i === I_FOOD) continue; // food was seeded at 1000n — already checked above
      expect(final.items[i].qty).toBe(0n);
    }
  });
});
