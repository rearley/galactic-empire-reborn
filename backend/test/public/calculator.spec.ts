import {
  buildPlanetModel,
  simulate,
  CalculatorInput,
} from '../../src/public/calculator';
import { applyEconomyTickWithLosses, revoltPressure } from '../../src/game/planet/planet-economy';
import {
  BASEPRICE, ITEM_NAMES, ITEM_TONS, MANHOURS, MAXPL, NUMITEMS,
  I_MEN, I_FOOD, I_FLUX, I_GOLD, I_TROOPS,
} from '../../src/game/constants/items';
import { PLANTOCK_SECONDS } from '../../src/game/constants';
import { PlanetState } from '../../src/game/planet/planet-state.types';

/**
 * The public planet calculator.
 *
 * The whole point of this endpoint is that it does NOT reimplement the economy.
 * It builds a synthetic PlanetState from the caller's numbers and runs
 * `applyEconomyTickWithLosses` — the same pure function the six-hourly tick
 * calls. A calculator that drifts from the game is worse than no calculator on
 * a site whose pitch is fidelity, so the drift test below is the load-bearing
 * one: it asserts the endpoint's per-item output IS the real tick's output.
 */

/**
 * A synthetic colony, deliberately not anyone's.
 *
 * These were originally a real player's live figures, which is the same mistake
 * the page itself shipped with. Round, invented numbers here: a fixture is read
 * by everyone who opens the repo.
 */
function input(over: Partial<CalculatorInput> = {}): CalculatorInput {
  const stock = new Array(NUMITEMS).fill(0);
  stock[I_MEN] = 424_242;
  stock[I_FOOD] = 30_000;
  const rates = new Array(NUMITEMS).fill(0);
  rates[I_MEN] = 25;
  rates[I_FLUX] = 52;
  rates[I_FOOD] = 21;
  rates[I_GOLD] = 2;
  return { stock, rates, enviorn: 3, resource: 2, taxrate: 0, planetCash: 0, ...over };
}

describe('buildPlanetModel', () => {
  const model = buildPlanetModel();

  it('serves the generated canon tables rather than a second transcription', () => {
    expect(model.items).toHaveLength(NUMITEMS);
    model.items.forEach((it, i) => {
      expect(it.name).toBe(ITEM_NAMES[i]);
      expect(it.manhours).toBe(MANHOURS[i]);
      expect(it.maxpl).toBe(MAXPL[i]);
      expect(it.baseprice).toBe(BASEPRICE[i]);
      expect(it.tons).toBe(ITEM_TONS[i]);
    });
  });

  it('states the production cadence this deployment actually runs', () => {
    expect(model.tickSeconds).toBe(PLANTOCK_SECONDS);
    expect(model.ticksPerDay).toBeCloseTo(86_400 / PLANTOCK_SECONDS, 6);
  });
});

describe('simulate — agreement with the live economy', () => {
  it('reports exactly what applyEconomyTickWithLosses produced, slot for slot', () => {
    const inp = input();
    const result = simulate(inp);

    // Rebuild the same synthetic state independently and run the real tick.
    const items = inp.stock.map((qty, i) => ({
      qty: BigInt(qty), rate: inp.rates[i], sell: false,
      reserve: 0, markup2a: 0, sold2a: 0n,
    }));
    const state = {
      xsect: 0, ysect: 0, plnum: 1, type: 0, xcoord: 0, ycoord: 0,
      userid: 'calc', name: 'calc', enviorn: inp.enviorn, resource: inp.resource,
      cash: BigInt(inp.planetCash), debt: 0n, tax: 0n, taxrate: inp.taxrate,
      warnings: 0, password: '', lastattack: '', beacon: '', spyowner: '',
      technology: 0, teamcode: 0n, items,
    } as PlanetState;
    const real = applyEconomyTickWithLosses(state);

    result.items.forEach((it, i) => {
      expect(it.stockAfter).toBe(Number(real.state.items[i].qty));
    });
    expect(result.tax.perTick).toBe(Number(real.state.tax));
  });

  it('runs at fact 1.75 while planet cash is zero, and 2.625 once gold has landed', () => {
    expect(simulate(input({ planetCash: 0 })).fact).toBeCloseTo(1.75, 6);
    expect(simulate(input({ planetCash: 1000 })).fact).toBeCloseTo(2.625, 6);
  });

  it('produces the first gold at rate 2 but not at rate 1, at this population', () => {
    const rates = input().rates.slice();
    rates[I_GOLD] = 1;
    expect(simulate(input({ rates })).items[I_GOLD].producedPerTick).toBe(0);
    expect(simulate(input()).items[I_GOLD].producedPerTick).toBe(1);
  });
});

describe('simulate — the shared budget of 100', () => {
  it('refuses a total over 100 the way adm rate does, rather than merely noting it', () => {
    const rates = new Array(NUMITEMS).fill(0);
    rates[I_MEN] = 60;
    rates[I_FOOD] = 60;          // 120 between them; canon allows 100
    const r = simulate(input({ rates }));

    expect(r.rateBudgetUsed).toBeLessThanOrEqual(100);
    expect(r.rates[I_MEN]).toBe(60);
    expect(r.rates[I_FOOD]).toBe(40);   // clamped to what was left
  });

  it('names what it reduced, so the reader is not left wondering', () => {
    const rates = new Array(NUMITEMS).fill(0);
    rates[I_MEN] = 60;
    rates[I_FOOD] = 60;
    const r = simulate(input({ rates }));

    expect(r.rateClamps).toEqual([{ index: I_FOOD, requested: 60, allowed: 40 }]);
  });

  it('leaves a legal spread completely alone', () => {
    const r = simulate(input());   // 25 + 52 + 21 + 2 = 100
    expect(r.rateClamps).toEqual([]);
    expect(r.rateBudgetUsed).toBe(100);
    expect(r.rates[I_FLUX]).toBe(52);
  });

  it('gives nothing to an item whose budget was already spent', () => {
    const rates = new Array(NUMITEMS).fill(0);
    rates[I_MEN] = 100;
    rates[I_FOOD] = 40;
    const r = simulate(input({ rates }));
    expect(r.rates[I_FOOD]).toBe(0);
    expect(r.rateBudgetUsed).toBe(100);
  });

  it('produces nothing for a slot the budget squeezed to zero', () => {
    const rates = new Array(NUMITEMS).fill(0);
    rates[I_MEN] = 100;
    rates[I_FLUX] = 50;
    expect(simulate(input({ rates })).items[I_FLUX].producedPerTick).toBe(0);
  });
});

/**
 * Run the real tick `ticks` times and report the first starvation, if any.
 *
 * Break-even is not enough: the floor is two ticks of eating, so it climbs
 * with the population, and a stock held level by an exactly-balanced rate is
 * overtaken. A player set food to the calculator's old break-even figure and
 * lost an eighth of a 3.8 million colony. Only a multi-tick run shows it.
 */
function firstStarvation(inp: CalculatorInput, ticks: number): number | null {
  let state = {
    xsect: 1, ysect: 1, plnum: 1, type: 0, xcoord: 0, ycoord: 0,
    userid: 'calc', name: 'calc', enviorn: inp.enviorn, resource: inp.resource,
    cash: BigInt(inp.planetCash), debt: 0n, tax: 0n, taxrate: inp.taxrate,
    warnings: 0, password: '', lastattack: '', beacon: '', spyowner: '',
    technology: 0, teamcode: 0n,
    items: inp.stock.map((qty, i) => ({
      qty: BigInt(qty), rate: inp.rates[i], sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
    })),
  } as PlanetState;
  for (let t = 1; t <= ticks; t++) {
    const r = applyEconomyTickWithLosses(state);
    if (r.starved.men > 0 || r.starved.troops > 0) return t;
    state = r.state;
  }
  return null;
}

describe('simulate — survival advice', () => {
  it('counts colonists AND troops as eaters, which is this port stated deviation', () => {
    const stock = input().stock.slice();
    stock[I_TROOPS] = 40_000;
    const r = simulate(input({ stock }));
    expect(r.food.eatenPerTick).toBe(Math.floor(424_242 / 100) + Math.floor(40_000 / 100));
  });

  it('names the food stock below which an eighth of the colony dies', () => {
    // debit lands before the test, so the stock must cover it twice over
    expect(simulate(input()).food.starvationFloor).toBe(Math.floor(424_242 / 100) * 2);
  });

  it('counts the garrison in the floor, since troops eat before colonists are tested', () => {
    const stock = input().stock.slice();
    stock[I_TROOPS] = 40_000;
    const r = simulate(input({ stock }));
    expect(r.food.starvationFloor).toBe(Math.floor(40_000 / 100) + Math.floor(424_242 / 100) * 2);

    // One case under that floor and the real tick kills colonists.
    const under = stock.slice();
    under[I_FOOD] = r.food.starvationFloor - 1;
    expect(simulate(input({ stock: under })).starvedMen).toBeGreaterThan(0);
    const at = stock.slice();
    at[I_FOOD] = r.food.starvationFloor;
    expect(simulate(input({ stock: at })).starvedMen).toBe(0);
  });

  it('calls a colony unsafe while it is eating into its stores', () => {
    // Rate 21 clears the bill at fact 2.625 but not at 1.75 — which is exactly
    // the gap a colony sits in for one tick before its first gold lands.
    expect(simulate(input({ planetCash: 0 })).food.safe).toBe(false);
    expect(simulate(input({ planetCash: 1000 })).food.safe).toBe(true);
  });

  /** The fixture with food at `rate` and the larder exactly at its floor. */
  function atFloor(rate: number, over: Partial<CalculatorInput> = {}): CalculatorInput {
    const base = input({ planetCash: 1000, ...over });
    const rates = base.rates.slice(); rates[I_FOOD] = rate;
    const stock = base.stock.slice();
    stock[I_FOOD] = simulate(base).food.starvationFloor;
    return { ...base, rates, stock };
  }

  it('recommends a food rate that keeps a growing colony fed indefinitely', () => {
    const min = simulate(input({ planetCash: 1000 })).food.minimumRate;
    // 200 ticks is fifty days; the population nearly triples at men rate 25.
    expect(firstStarvation(atFloor(min), 200)).toBeNull();
  });

  it('recommends the LOWEST such rate — one point less starves', () => {
    const min = simulate(input({ planetCash: 1000 })).food.minimumRate;
    expect(firstStarvation(atFloor(min - 1), 200)).not.toBeNull();
  });

  it('asks for more than break-even while the colony grows', () => {
    // 20 exactly feeds this colony's current mouths (the old answer) and still
    // starves it within days, because the floor rises and the stock does not.
    const growing = simulate(input({ planetCash: 1000 }));
    expect(growing.food.minimumRate).toBe(21);
    expect(firstStarvation(atFloor(20), 200)).not.toBeNull();

    // With the colonist rate at zero there is no growth, and break-even holds.
    const rates = input().rates.slice(); rates[I_MEN] = 0;
    const still = simulate(input({ planetCash: 1000, rates }));
    expect(still.food.minimumRate).toBe(20);
    expect(firstStarvation(atFloor(20, { rates }), 200)).toBeNull();
  });

  it('does not call a break-even colony safe while it is growing', () => {
    expect(simulate(atFloor(20)).food.safe).toBe(false);
    expect(simulate(atFloor(21)).food.safe).toBe(true);
  });
});

describe('simulate — the cash bonus running out', () => {
  /**
   * The fixture with its two gold points moved to flux: the planet holds cash
   * today, so it runs at 1.5x, but nothing refills that cash and it decays
   * every tick. Whatever the food figures say at 1.5x stops being true within
   * a day.
   */
  function noGold(over: Partial<CalculatorInput> = {}): CalculatorInput {
    const base = input({ planetCash: 1000, ...over });
    const rates = base.rates.slice();
    rates[I_FLUX] += rates[I_GOLD];
    rates[I_GOLD] = 0;
    return { ...base, rates };
  }

  it('says nothing while a gold rate keeps the bonus on', () => {
    expect(simulate(input({ planetCash: 1000 })).food.bonusTicksLeft).toBeNull();
  });

  it('counts the ticks the bonus has left when nothing refills planet cash', () => {
    // env 3 / res 2 decays cash by 0.85 per slot, fourteen slots a tick:
    // 1000 -> ~102 -> ~10 -> 0. The food slot (5) still sees cash on the third
    // tick and none on the fourth.
    expect(simulate(noGold()).food.bonusTicksLeft).toBe(3);
  });

  it('reports zero when the planet has no bonus to lose', () => {
    expect(simulate(noGold({ planetCash: 0 })).food.bonusTicksLeft).toBe(0);
  });

  it('quotes the rate that survives the bonus running out, and the one that needed it', () => {
    const r = simulate(noGold());
    expect(r.food.minimumRate).toBe(simulate(noGold({ planetCash: 0 })).food.minimumRate);
    expect(r.food.minimumRateWithBonus).toBe(21);
    expect(r.food.minimumRate).toBeGreaterThan(r.food.minimumRateWithBonus);
  });

  it('keeps the colony fed at the quoted rate, where the bonus-rate starves it', () => {
    const r = simulate(noGold());
    const fed = (rate: number): CalculatorInput => {
      const base = noGold();
      const rates = base.rates.slice(); rates[I_FOOD] = rate;
      const stock = base.stock.slice(); stock[I_FOOD] = r.food.starvationFloor;
      return { ...base, rates, stock };
    };
    expect(firstStarvation(fed(r.food.minimumRate), 200)).toBeNull();
    expect(firstStarvation(fed(r.food.minimumRateWithBonus), 200)).not.toBeNull();
  });

  it('does not call a colony safe on a food rate that only the fading bonus supports', () => {
    const base = noGold();
    const stock = base.stock.slice(); stock[I_FOOD] = 100_000;
    const rates = base.rates.slice(); rates[I_FOOD] = 21;
    expect(simulate({ ...base, stock, rates }).food.safe).toBe(false);
  });
});

describe('simulate — tax advice', () => {
  it('uses the games own revolt threshold, not a copy of it', () => {
    const r = simulate(input({ taxrate: 30 }));
    expect(r.tax.troopsToHoldOrder).toBe(Math.ceil(revoltPressure(30, 424_242)));
    expect(r.tax.willRevolt).toBe(true);
  });

  it('is content once the garrison covers the pressure', () => {
    const stock = input().stock.slice();
    stock[I_TROOPS] = 40_000;
    expect(simulate(input({ stock, taxrate: 30 })).tax.willRevolt).toBe(false);
  });

  it('prices the tax against the production it costs, so the trade is visible', () => {
    const taxed = simulate(input({ taxrate: 30, planetCash: 1000 }));
    expect(taxed.tax.perTick).toBeGreaterThan(0);
    expect(taxed.tax.goodsLostPerTick).toBeGreaterThan(0);
    expect(taxed.tax.worthwhile).toBe(false);   // flux 52 is far above the break-even
  });

  it('echoes the rate it ran at, so a page cannot caption the wrong number', () => {
    expect(simulate(input({ taxrate: 30 })).taxrate).toBe(30);
    expect(simulate(input({ taxrate: 5000 })).taxrate).toBe(100);
  });

  it('needs no garrison at all when nobody is taxed', () => {
    const r = simulate(input({ taxrate: 0 }));
    expect(r.tax.troopsToHoldOrder).toBe(0);
    expect(r.tax.willRevolt).toBe(false);
  });
});

describe('simulate — growth', () => {
  it('projects compounding population, not a flat addition', () => {
    const r = simulate(input({ planetCash: 1000 }));
    expect(r.growth.perTickPercent).toBeCloseTo(25 * 2.625 * 8.3333e-5 * 100, 3);
    expect(r.growth.doublingDays).toBeGreaterThan(0);
    expect(r.growth.populationCap).toBe(Math.floor(MAXPL[I_MEN] * 2.625));
  });

  it('never claims a doubling time for a colony that is not growing', () => {
    const rates = new Array(NUMITEMS).fill(0);
    rates[I_FOOD] = 21;
    expect(simulate(input({ rates })).growth.doublingDays).toBeNull();
  });
});
