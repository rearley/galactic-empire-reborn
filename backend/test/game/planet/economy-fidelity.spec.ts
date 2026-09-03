/**
 * Four divergences in the planet economy tick, all from the same shape of
 * mistake: guards added inside a loop C runs unconditionally, and integer
 * arithmetic carried as floats.
 *
 * @see GEPLANET.C:195-340 multiply()
 */

import { applyEconomyTick, shouldRunEconomy } from '../../../src/game/planet/planet-economy';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { NUMITEMS, I_MEN, I_FOOD, I_TROOPS, I_MINE, MAXPL } from '../../../src/game/constants/items';

function makePlanet(overrides: Partial<PlanetState> = {}): PlanetState {
  const items = Array.from({ length: NUMITEMS }, () => ({
    qty: 0n, rate: 0, sell: true, reserve: 0, markup2a: 5, sold2a: 0n,
  }));
  return {
    xsect: 1, ysect: 1, plnum: 1,
    type: 2, xcoord: 1.5, ycoord: 1.5,
    userid: 'u1', name: 'TestPlanet',
    enviorn: 3, resource: 3,
    cash: 1_000_000n, debt: 0n, tax: 0n, taxrate: 0,
    warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items, ...overrides,
  };
}

/**
 * `plptr->cash = (float)plptr->cash*tfact;` sits in the loop body OUTSIDE any
 * rate test (GEPLANET.C:286), so it runs once per SLOT — all fourteen of them
 * — not once per producing slot. A fresh colony has two non-zero rates, so the
 * port decayed cash by tfact^2 instead of tfact^14: 0.90 a tick instead of
 * 0.49 at best environment. The `if (cash > 0) fact *= 1.5` production bonus
 * therefore lingered for many extra ticks.
 */
describe('cash decay runs once per slot, not once per producing slot', () => {
  it('applies tfact fourteen times a tick', () => {
    // enviorn 3 + resource 3 -> j = 0, tfact = 0.95
    const planet = makePlanet({ cash: 1_000_000n });
    const after = applyEconomyTick(planet);
    const expected = Math.floor(1_000_000 * Math.pow(0.95, NUMITEMS));
    // Allow a unit of slack for per-slot flooring.
    expect(Number(after.cash)).toBeLessThanOrEqual(expected + NUMITEMS);
    expect(Number(after.cash)).toBeGreaterThanOrEqual(expected - NUMITEMS);
  });

  it('decays even when no slot is producing', () => {
    const planet = makePlanet({ cash: 500_000n });
    const after = applyEconomyTick(planet);
    expect(Number(after.cash)).toBeLessThan(500_000);
  });
});

/**
 * The storage cap (`if (temp > max) temp = max`) is likewise outside the rate
 * test (GEPLANET.C:328-332). Rate-0 slots were never truncated, so a player
 * could ferry unlimited mines, ion cannons and flux pods onto a planet with
 * that rate at zero and nothing culled them. MAXPL was used nowhere else in
 * the backend.
 */
describe('the storage cap applies to every slot, producing or not', () => {
  it('truncates an over-stuffed rate-0 slot to its ceiling', () => {
    const planet = makePlanet();
    planet.items[I_MINE].rate = 0;
    planet.items[I_MINE].qty = BigInt(MAXPL[I_MINE] * 100);

    const after = applyEconomyTick(planet);
    // The ceiling scales with `fact` — envFact 2 x taxfact 1 x the 1.5
    // cash bonus = 3 (GEPLANET.C:294-296 `max = (long)(maxf * fact)`).
    expect(Number(after.items[I_MINE].qty)).toBe(MAXPL[I_MINE] * 3);
    expect(Number(after.items[I_MINE].qty)).toBeLessThan(MAXPL[I_MINE] * 100);
  });

  it('leaves a slot below its ceiling alone', () => {
    const planet = makePlanet();
    planet.items[I_MINE].rate = 0;
    planet.items[I_MINE].qty = 5n;
    const after = applyEconomyTick(planet);
    expect(Number(after.items[I_MINE].qty)).toBe(5);
  });
});

/**
 * Starvation compares INTEGER quotients in C — `plptr->items[I_TROOPS].qty/100`
 * on unsigned longs — and takes `qty/8` off the top, also integer.
 *
 * 150 troops against 1 food: C computes 150/100 = 1, which is NOT > 1, so
 * nobody starves. The port compared 1.5 > 1 and killed a fifth of the garrison.
 * And 100 troops lose 100/8 = 12, leaving 88; the port's
 * `floor(qty - qty/8)` left 87.
 */
describe('starvation uses integer division, as C does', () => {
  it('does not starve when the integer quotient equals the food', () => {
    const planet = makePlanet();
    planet.items[I_TROOPS].qty = 150n;
    planet.items[I_FOOD].qty = 1n;
    planet.items[I_MEN].qty = 0n;
    const after = applyEconomyTick(planet);
    expect(after.items[I_TROOPS].qty).toBe(150n);
  });

  it('leaves 88 of 100 troops, not 87', () => {
    const planet = makePlanet();
    planet.items[I_TROOPS].qty = 100n;
    planet.items[I_FOOD].qty = 0n;
    planet.items[I_MEN].qty = 0n;
    const after = applyEconomyTick(planet);
    expect(after.items[I_TROOPS].qty).toBe(88n);
  });

  it('applies the same integer rule to civilians', () => {
    // The rule under test is the integer quotient: 150 men is 150/100 = 1,
    // which is not > 1, so nobody starves. The fixture carries 2 food rather
    // than 1 because civilians now EAT — one unit per hundred — so a single
    // unit would be consumed by the meal and leave the colony starving for a
    // reason that has nothing to do with integer division.
    const planet = makePlanet();
    planet.items[I_TROOPS].qty = 0n;
    planet.items[I_FOOD].qty = 2n;
    planet.items[I_MEN].qty = 150n;
    const after = applyEconomyTick(planet);
    expect(after.items[I_MEN].qty).toBe(150n);
  });
});

describe('civilians eat (an inherited C defect, deliberately fixed)', () => {
  // GEPLANET.C:221-230 debits food for TROOPS only and then starves MEN
  // against that same stock, so a colony with colonists and no garrison
  // consumes nothing forever. Food is one of the two goods Tahanian Station
  // exists to sell, and that made it worthless.
  // @see docs/DECISIONS.md — colonists will eat

  it('a garrison-free colony consumes food', () => {
    const planet = makePlanet();
    planet.items[I_TROOPS].qty = 0n;
    planet.items[I_MEN].qty = 500n;
    planet.items[I_FOOD].qty = 100n;
    const after = applyEconomyTick(planet);
    // 500 men eat 500/100 = 5.
    expect(after.items[I_FOOD].qty).toBe(95n);
  });

  it('feeds troops and civilians from the same store', () => {
    const planet = makePlanet();
    planet.items[I_TROOPS].qty = 300n;
    planet.items[I_MEN].qty = 500n;
    planet.items[I_FOOD].qty = 100n;
    const after = applyEconomyTick(planet);
    // 300/100 + 500/100 = 3 + 5 = 8.
    expect(after.items[I_FOOD].qty).toBe(92n);
  });

  it('starves civilians once the store cannot feed them', () => {
    const planet = makePlanet();
    planet.items[I_TROOPS].qty = 0n;
    planet.items[I_MEN].qty = 1000n;
    planet.items[I_FOOD].qty = 0n;
    const after = applyEconomyTick(planet);
    // 1000/100 = 10 > 0 food, so an eighth dies: 1000 - 125 = 875.
    expect(after.items[I_MEN].qty).toBe(875n);
  });

  it('never drives the food store negative', () => {
    const planet = makePlanet();
    planet.items[I_TROOPS].qty = 5000n;
    planet.items[I_MEN].qty = 5000n;
    planet.items[I_FOOD].qty = 3n;
    const after = applyEconomyTick(planet);
    expect(after.items[I_FOOD].qty).toBe(0n);
  });
});

/**
 * `men` is re-read from `plptr->items[I_MEN].qty` at the top of every loop
 * iteration (GEPLANET.C:271), and I_MEN is slot 0, written back at :332. So
 * slots 1-13 and the tax levy at :335-338 see the GROWN population, not the
 * post-starvation one the port captured before the loop.
 */
describe('production and tax see the grown population', () => {
  it('taxes the population after slot 0 has produced', () => {
    const planet = makePlanet({ taxrate: 12, cash: 0n });
    planet.items[I_MEN].qty = 10_000n;
    planet.items[I_MEN].rate = 100;
    planet.items[I_FOOD].qty = 1_000_000n;

    const after = applyEconomyTick(planet);
    const grownMen = Number(after.items[I_MEN].qty);
    expect(grownMen).toBeGreaterThan(10_000);
    expect(Number(after.tax)).toBe(Math.floor((12 / 1200) * grownMen));
  });
});

/**
 * A depopulated planet is frozen, not slowly bled.
 *
 * GEMAIN.C:2130 — `if (plptr->items[0].qty > 0 && plptr->userid[0] != 0)`.
 * Slot 0 is I_MEN, so a world with no civilians is skipped ENTIRELY: no
 * starvation, no gold conversion, no tax. The port filtered on ownership only,
 * so a garrisoned but depopulated world lost an eighth of its troops every
 * tick until the garrison was gone — in C it holds indefinitely.
 */
describe('a planet with no population is skipped entirely', () => {
  it('does not starve the garrison', () => {
    const planet = makePlanet();
    planet.items[I_MEN].qty = 0n;
    planet.items[I_TROOPS].qty = 5000n;
    planet.items[I_FOOD].qty = 0n;

    expect(shouldRunEconomy(planet)).toBe(false);
  });

  it('runs while anyone is still alive down there', () => {
    const planet = makePlanet();
    planet.items[I_MEN].qty = 1n;
    expect(shouldRunEconomy(planet)).toBe(true);
  });

  it('skips an unowned planet regardless of population', () => {
    const planet = makePlanet({ userid: null });
    planet.items[I_MEN].qty = 10_000n;
    expect(shouldRunEconomy(planet)).toBe(false);
  });
});
