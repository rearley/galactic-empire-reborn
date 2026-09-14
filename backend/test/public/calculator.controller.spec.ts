import { CalculatorController } from '../../src/public/calculator.controller';
import { NUMITEMS, I_MEN, I_FOOD, I_GOLD } from '../../src/game/constants/items';

/**
 * `/public/calculator` takes numbers from anyone on the internet and feeds them
 * to the real economy tick. Everything below is about the seam between those
 * two facts: the tick trusts its PlanetState, so the controller must not pass
 * on anything the game could not itself have produced.
 */
describe('CalculatorController', () => {
  const controller = new CalculatorController();

  it('serves the canon tables without being asked for anything', () => {
    expect(controller.getModel().items).toHaveLength(NUMITEMS);
  });

  it('computes a colony from a well-formed body', () => {
    const stock = new Array(NUMITEMS).fill(0);
    stock[I_MEN] = 424_242;
    stock[I_FOOD] = 30_000;
    const rates = new Array(NUMITEMS).fill(0);
    rates[I_GOLD] = 2;

    const r = controller.calculate({
      stock, rates, enviorn: 3, resource: 2, taxrate: 0, planetCash: 1000,
    });
    expect(r.fact).toBeCloseTo(2.625, 6);
    // 424,242 x rate 2 / 1,400,000 x 2.625 = 1.59, truncated by the tick to 1.
    expect(r.items[I_GOLD].producedPerTick).toBe(1);
  });

  it('survives a body that is entirely the wrong shape', () => {
    const r = controller.calculate({} as never);
    expect(r.items).toHaveLength(NUMITEMS);
    expect(r.rateBudgetUsed).toBe(0);
  });

  it('clamps grades and tax to the ranges the game itself enforces', () => {
    const r = controller.calculate({
      stock: [], rates: [], enviorn: 99, resource: -5, taxrate: 5000, planetCash: -1,
    } as never);
    expect(r.fact).toBeGreaterThan(0);
    expect(Number.isFinite(r.fact)).toBe(true);
  });

  it('refuses junk in the arrays rather than producing NaN', () => {
    const r = controller.calculate({
      stock: ['x', null, Infinity, NaN] as never,
      rates: [{}, -40, 1e308] as never,
      enviorn: 3, resource: 3, taxrate: 0, planetCash: 0,
    } as never);
    r.items.forEach((it) => {
      expect(Number.isFinite(it.producedPerTick)).toBe(true);
      expect(it.producedPerTick).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(it.creditsPerTick)).toBe(true);
    });
    expect(Number.isFinite(r.growth.perTickPercent)).toBe(true);
  });

  it('never lets a rate exceed the hundred points a real colony has to spend', () => {
    const rates = new Array(NUMITEMS).fill(9999);
    const r = controller.calculate({
      stock: [], rates, enviorn: 0, resource: 0, taxrate: 0, planetCash: 0,
    } as never);
    r.items.forEach((it) => expect(it.rate).toBeLessThanOrEqual(100));
  });
});
