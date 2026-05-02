/**
 * T037 — Planet economy unit tests.
 * Tests the applyEconomyTick() pure function.
 * @see GEPLANET.C:195-340 multiply()
 */
import { applyEconomyTick } from '../../src/game/planet/planet-economy';
import { PlanetState } from '../../src/game/planet/planet-state.types';
import { NUMITEMS, I_MEN, I_FOOD, I_TROOPS, I_GOLD } from '../../src/game/constants/items';

function makePlanet(overrides: Partial<PlanetState> = {}): PlanetState {
  const items = Array.from({ length: NUMITEMS }, () => ({
    qty: 1000n,
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

  it('gold-to-cash conversion zeroes gold qty and increases cash (zero-pop planet to isolate gold logic)', () => {
    // With men=0 the production loop breaks immediately, so the cash-decay tfact is not applied.
    // This lets us verify the gold conversion in isolation.
    const planet = makePlanet();
    planet.items[I_MEN].qty = 0n;
    planet.items[I_GOLD].qty = 100n;
    const initialCash = planet.cash;
    const result = applyEconomyTick(planet);
    expect(result.items[I_GOLD].qty).toBe(0n);
    // cash += 100 * BASEPRICE[I_GOLD] (100) = +10000n
    expect(result.cash).toBeGreaterThan(initialCash);
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
