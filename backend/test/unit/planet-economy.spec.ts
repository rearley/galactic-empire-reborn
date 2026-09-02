/**
 * T037 — Planet economy unit tests.
 * Tests the applyEconomyTick() pure function.
 * @see GEPLANET.C:195-340 multiply()
 */
import { applyEconomyTick } from '../../src/game/planet/planet-economy';
import { PlanetState } from '../../src/game/planet/planet-state.types';
import { NUMITEMS, I_MEN, I_FOOD, I_TROOPS, I_GOLD, MAXPL } from '../../src/game/constants/items';

function makePlanet(overrides: Partial<PlanetState> = {}): PlanetState {
  // Stock every item at 1000, EXCEPT where canon's per-planet cap is lower.
  // GEPLANET.C applies `maxpl[i] * fact` as a storage ceiling that can clamp a
  // planet DOWN, so a fixture holding more than an item's cap is not a planet
  // the game can produce. A flat 1000 across the board was only viable while
  // MAXPL carried the wiki's rounded figures; canon caps spies at 5 and ion
  // cannons at 250, so those slots were being clamped and the "no growth at
  // zero population" assertion was reading a legitimate cap as growth.
  const items = Array.from({ length: NUMITEMS }, (_unused, i) => ({
    qty: BigInt(Math.min(1000, MAXPL[i])),
    rate: 10,
    sell: true,
    reserve: 0,
    markup2a: 5,
    sold2a: 0n,
  }));
  return {
    xsect: 1, ysect: 1, plnum: 1,
    type: 2, xcoord: 1.5, ycoord: 1.5,
    userid: 'u1', name: 'TestPlanet',
    enviorn: 1, resource: 1,
    cash: 1000n, debt: 0n, tax: 0n, taxrate: 0,
    warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items,
    ...overrides,
  };
}

describe('applyEconomyTick', () => {
  it('returns a new state (does not mutate original)', () => {
    const original = makePlanet();
    const originalItemQty = original.items[I_MEN].qty;
    const result = applyEconomyTick(original);
    // Original unchanged
    expect(original.items[I_MEN].qty).toBe(originalItemQty);
    // Result is a new object
    expect(result).not.toBe(original);
  });

  it('zero-population planet produces zero growth on numeric items (FR-017)', () => {
    const planet = makePlanet();
    planet.items[I_MEN].qty = 0n;
    const before = planet.items.map((it) => it.qty);
    const result = applyEconomyTick(planet);
    // Items with rate > 0 should have no production if men = 0
    for (let i = 0; i < NUMITEMS; i++) {
      if (i === I_FOOD || i === I_TROOPS || i === I_GOLD) continue; // these can change from starvation/gold-to-cash
      expect(result.items[i].qty).toBe(before[i]);
    }
  });

  it('men starvation reduces men when food is insufficient', () => {
    const planet = makePlanet();
    planet.items[I_MEN].qty = 10000n;
    planet.items[I_FOOD].qty = 10n; // Way too little food
    const result = applyEconomyTick(planet);
    expect(result.items[I_MEN].qty).toBeLessThan(10000n);
  });

  it('troop starvation reduces troops when food is insufficient', () => {
    const planet = makePlanet();
    planet.items[I_TROOPS].qty = 10000n;
    planet.items[I_FOOD].qty = 10n;
    const result = applyEconomyTick(planet);
    expect(result.items[I_TROOPS].qty).toBeLessThan(10000n);
  });

  it('gold-to-cash conversion zeroes gold qty and adds its value', () => {
    // The conversion happens before the production loop, so compare against
    // what the loop's tfact decay leaves of a planet holding no gold.
    // (A zero-population planet is no longer a useful isolation trick — C
    // never runs multiply() on one at all, GEMAIN.C:2132.)
    const withGold = makePlanet();
    withGold.items[I_GOLD].qty = 100n;
    const withoutGold = makePlanet();
    withoutGold.items[I_GOLD].qty = 0n;

    const a = applyEconomyTick(withGold);
    const b = applyEconomyTick(withoutGold);

    expect(a.items[I_GOLD].qty).toBe(0n);
    expect(a.cash).toBeGreaterThan(b.cash);
  });

  it('tax accrual increases tax proportional to taxrate and men count', () => {
    const planet = makePlanet({ taxrate: 60 });
    planet.items[I_MEN].qty = 120000n;
    const result = applyEconomyTick(planet);
    expect(result.tax).toBeGreaterThan(0n);
  });

  it('taxrate=0 produces zero tax accrual', () => {
    const planet = makePlanet({ taxrate: 0 });
    const result = applyEconomyTick(planet);
    expect(result.tax).toBe(0n);
  });

  it('items.length remains NUMITEMS after tick', () => {
    const planet = makePlanet();
    const result = applyEconomyTick(planet);
    expect(result.items).toHaveLength(NUMITEMS);
  });
});
