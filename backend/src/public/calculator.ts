import {
  BASEPRICE, ITEM_KEYWORDS, ITEM_NAMES, ITEM_TONS, MANHOURS, MAXPL, NUMITEMS,
  I_FOOD, I_MEN, I_TROOPS,
} from '../game/constants/items';
import { PLANTOCK_SECONDS } from '../game/constants';
import { applyEconomyTickWithLosses, revoltPressure } from '../game/planet/planet-economy';
import { clampRateToBudget } from '../game/planet/rate-budget';
import { PlanetState } from '../game/planet/planet-state.types';

/**
 * The public planet calculator.
 *
 * An addition, not a port artefact — the original shipped nothing like it. What
 * makes it defensible on a site that claims fidelity is that it does not model
 * the economy, it RUNS it: {@link simulate} builds a throwaway PlanetState from
 * the caller's numbers and hands it to `applyEconomyTickWithLosses`, the same
 * pure function the six-hourly tick calls. Every per-item figure below is a
 * diff of that function's output, so the page cannot quietly drift from the
 * game the way a second implementation would.
 *
 * The advisory figures — minimum food rate, doubling time, whether a tax rate
 * pays for itself — are the calculator's own, because canon computes no such
 * thing. They are derived from the same constants and covered by their own
 * tests.
 *
 * @see GEPLANET.C:195 `void  FUNC multiply()`
 */

const SECONDS_PER_DAY = 86_400;

/**
 * Units of food eaten per hundred people, per tick.
 * @see GEPLANET.C:223 `if (temp > plptr->items[I_TROOPS].qty/100)`
 */
const MOUTHS_PER_UNIT = 100;

/**
 * Upper bound on the food-rate search. Far past the budget of 100, so a
 * colony that no legal spread can feed still gets a number rather than a hang.
 */
const MAX_FOOD_RATE_SEARCHED = 1_000;

export interface PlanetModelItem {
  index: number;
  name: string;
  keyword: string;
  manhours: number;
  maxpl: number;
  baseprice: number;
  tons: number;
}

export interface PlanetModel {
  /** Seconds between production ticks for one planet, as deployed. */
  tickSeconds: number;
  ticksPerDay: number;
  items: PlanetModelItem[];
}

export interface CalculatorInput {
  /** Current stock, 14 slots. Index 0 is men, 5 food, 8 troops. */
  stock: number[];
  /** Production rate per slot, 0-100, sharing one budget of 100. */
  rates: number[];
  enviorn: number;
  resource: number;
  taxrate: number;
  planetCash: number;
}

export interface CalculatorItemResult {
  index: number;
  name: string;
  rate: number;
  producedPerTick: number;
  stockAfter: number;
  capacity: number;
  atCapacity: boolean;
  ticksToCapacity: number | null;
  creditsPerTick: number;
  tonsPerTick: number;
}

/** One rate the shared budget of 100 would not allow in full. */
export interface RateClamp {
  index: number;
  requested: number;
  allowed: number;
}

export interface CalculatorResult {
  /** The rates the tick actually ran with, after the budget of 100 was applied. */
  rates: number[];
  /** Rates the budget reduced, in the order they were squeezed out. */
  rateClamps: RateClamp[];
  /**
   * The tax rate the tick actually ran at, after clamping.
   *
   * Echoed so the page renders what was computed rather than what the reader
   * has typed: the two disagree for as long as a request is in flight, and a
   * verdict that contradicts the figures beside it is worse than a slow one.
   */
  taxrate: number;
  fact: number;
  rateBudgetUsed: number;
  items: CalculatorItemResult[];
  food: {
    eatenPerTick: number;
    producedPerTick: number;
    netPerTick: number;
    starvationFloor: number;
    minimumRate: number;
    safe: boolean;
  };
  tax: {
    perTick: number;
    goodsLostPerTick: number;
    troopsToHoldOrder: number;
    willRevolt: boolean;
    sustainingTroopRate: number;
    worthwhile: boolean;
  };
  growth: {
    perTickPercent: number;
    doublingDays: number | null;
    populationCap: number;
    daysToCap: number | null;
  };
  starvedMen: number;
  starvedTroops: number;
}

export function buildPlanetModel(): PlanetModel {
  return {
    tickSeconds: PLANTOCK_SECONDS,
    ticksPerDay: SECONDS_PER_DAY / PLANTOCK_SECONDS,
    items: ITEM_NAMES.map((name, index) => ({
      index,
      name,
      keyword: ITEM_KEYWORDS[index],
      manhours: MANHOURS[index],
      maxpl: MAXPL[index],
      baseprice: BASEPRICE[index],
      tons: ITEM_TONS[index],
    })),
  };
}

/** Clamp a caller-supplied number into range; the page is public and unauthenticated. */
function bound(n: unknown, lo: number, hi: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.min(hi, Math.max(lo, Math.floor(v)));
}

function fourteen(src: unknown, lo: number, hi: number): number[] {
  const arr = Array.isArray(src) ? src : [];
  return Array.from({ length: NUMITEMS }, (_, i) => bound(arr[i], lo, hi));
}

/**
 * Apply canon's shared budget of 100 across the whole array.
 *
 * `adm rate` does not warn about an over-spend, it REFUSES it: the request is
 * cut to whatever is unallocated and the player is told —
 * GEMAIN.C:3550 `if ((titems[usrnum].rate + pcnt) > 100)`, message ADMEN2FA. A calculator that merely flagged the over-spend and then
 * computed anyway would quote production no colony can reach, which is worse
 * than not answering — so the same `clampRateToBudget` the game uses runs here.
 *
 * Slots are settled in index order, which is the order a player sets them in
 * and the only order available to a single request carrying all fourteen at
 * once. Earlier items therefore keep their rate and later ones absorb the cut.
 */
function applyBudget(requested: number[]): { rates: number[]; clamps: RateClamp[] } {
  const rates = new Array<number>(NUMITEMS).fill(0);
  const clamps: RateClamp[] = [];
  for (let i = 0; i < NUMITEMS; i++) {
    const { value, clamped } = clampRateToBudget(rates, i, requested[i]);
    rates[i] = value;
    if (clamped) clamps.push({ index: i, requested: requested[i], allowed: value });
  }
  return { rates, clamps };
}

/** Normalise whatever arrived over the wire into something the tick can eat. */
export function sanitise(raw: Partial<CalculatorInput>): CalculatorInput {
  return {
    stock: fourteen(raw.stock, 0, 2_000_000_000),
    rates: applyBudget(fourteen(raw.rates, 0, 100)).rates,
    enviorn: bound(raw.enviorn, 0, 3),
    resource: bound(raw.resource, 0, 3),
    taxrate: bound(raw.taxrate, 0, 100),
    planetCash: bound(raw.planetCash, 0, 2_000_000_000),
  };
}

/**
 * The production multiplier, for display only.
 *
 * Mirrors the three terms multiply() folds together, the first of them
 * GEPLANET.C:280 `fact *= ((float)(plptr->enviorn+plptr->resource+2) * .25);`. The cash
 * bonus is the one worth surfacing: it is checked AFTER the per-item decay, so
 * a planet holding any gold-derived cash at all runs half again as fast as one
 * holding none — and it also lowers the food rate, because that requirement is
 * `52.5 / fact`.
 */
function productionFactor(input: CalculatorInput): number {
  const envFact = (input.enviorn + input.resource + 2) * 0.25;
  const taxfact = 1 - input.taxrate / 120;
  const tfact = 0.95 - ((6 - input.resource - input.enviorn) * 10) / 100;
  const bonus = Math.floor(input.planetCash * tfact) > 0 ? 1.5 : 1;
  return envFact * taxfact * bonus;
}

function toPlanetState(input: CalculatorInput): PlanetState {
  return {
    xsect: 0, ysect: 0, plnum: 1, type: 0, xcoord: 0, ycoord: 0,
    userid: 'calculator', name: 'calculator',
    enviorn: input.enviorn, resource: input.resource,
    cash: BigInt(input.planetCash), debt: 0n, tax: 0n,
    taxrate: input.taxrate, warnings: 0,
    password: '', lastattack: '', beacon: '', spyowner: '',
    technology: 0, teamcode: 0n,
    items: input.stock.map((qty, i) => ({
      qty: BigInt(qty),
      rate: input.rates[i],
      sell: false,
      reserve: 0,
      markup2a: 0,
      sold2a: 0n,
    })),
  };
}

export function simulate(raw: Partial<CalculatorInput>): CalculatorResult {
  const input = sanitise(raw);
  const { clamps: rateClamps } = applyBudget(fourteen(raw.rates, 0, 100));
  const before = toPlanetState(input);
  const { state: after, starved } = applyEconomyTickWithLosses(before);

  const fact = productionFactor(input);
  const men = input.stock[I_MEN];
  const troops = input.stock[I_TROOPS];

  // Food is the one slot whose delta is not production: the debit lands first.
  // @see GEPLANET.C:221 `/* eat the food */` — and this port's stated
  // deviation that colonists eat too, not only troops.
  const eaten =
    Math.floor(men / MOUTHS_PER_UNIT) + Math.floor(troops / MOUTHS_PER_UNIT);

  const items: CalculatorItemResult[] = input.stock.map((stockBefore, i) => {
    const stockAfter = Number(after.items[i].qty);
    // Recover gross production from the tick's own output: men and troops can
    // be culled by starvation, and food is debited before anything is added.
    let produced = stockAfter - stockBefore;
    if (i === I_FOOD) produced += Math.min(stockBefore, eaten);
    if (i === I_MEN) produced += starved.men;
    if (i === I_TROOPS) produced += starved.troops;
    produced = Math.max(0, produced);

    const capacity = Math.floor(MAXPL[i] * fact);
    const headroom = capacity - stockAfter;
    return {
      index: i,
      name: ITEM_NAMES[i],
      rate: input.rates[i],
      producedPerTick: produced,
      stockAfter,
      capacity,
      atCapacity: stockAfter >= capacity,
      ticksToCapacity: produced > 0 && headroom > 0 ? Math.ceil(headroom / produced) : null,
      creditsPerTick: produced * BASEPRICE[i],
      tonsPerTick: produced * ITEM_TONS[i],
    };
  });

  const foodProduced = items[I_FOOD].producedPerTick;
  const minimumRate = minimumFoodRate(input);
  const starvationFloor = starvationFloorOf(men, troops);

  const pressure = revoltPressure(input.taxrate, men);
  const taxPerTick = Number(after.tax);

  // What the tax rate costs: every good is produced at `1 - taxrate/120`, so
  // the credits forgone are that fraction of what an untaxed planet would make.
  const untaxed = input.taxrate > 0 ? simulateGoodsValue({ ...input, taxrate: 0 }) : 0;
  const taxedGoods = items.reduce((sum, it) => sum + it.creditsPerTick, 0);
  const goodsLost = Math.max(0, untaxed - taxedGoods);

  const menRate = input.rates[I_MEN];
  // Derived from the tick's own men production, not re-derived from the rate
  // formula — the same reason every other figure on this page is a diff.
  const growthPerTick = men > 0 ? (items[I_MEN].producedPerTick / men) * 100 : 0;
  const ticksPerDay = SECONDS_PER_DAY / PLANTOCK_SECONDS;
  const populationCap = Math.floor(MAXPL[I_MEN] * fact);
  const ratio = growthPerTick / 100;

  return {
    rates: input.rates,
    rateClamps,
    taxrate: input.taxrate,
    fact,
    rateBudgetUsed: input.rates.reduce((a, b) => a + b, 0),
    items,
    food: {
      eatenPerTick: eaten,
      producedPerTick: foodProduced,
      netPerTick: foodProduced - eaten,
      starvationFloor,
      minimumRate,
      safe: input.stock[I_FOOD] >= starvationFloor && input.rates[I_FOOD] >= minimumRate,
    },
    tax: {
      perTick: taxPerTick,
      goodsLostPerTick: goodsLost,
      troopsToHoldOrder: Math.ceil(pressure),
      willRevolt: pressure > troops,
      sustainingTroopRate: menRate * input.taxrate * 0.051042,
      worthwhile: taxPerTick > goodsLost,
    },
    growth: {
      perTickPercent: growthPerTick,
      doublingDays: ratio > 0 ? Math.log(2) / Math.log1p(ratio) / ticksPerDay : null,
      populationCap,
      daysToCap:
        ratio > 0 && men > 0 && men < populationCap
          ? Math.log(populationCap / men) / Math.log1p(ratio) / ticksPerDay
          : null,
    },
    starvedMen: starved.men,
    starvedTroops: starved.troops,
  };
}

/**
 * The smallest food stock that gets through a tick without starving anyone.
 *
 * Troops are tested against the stock before anything is eaten, then both
 * populations eat, then colonists are tested against what is left. So the
 * stock has to hold the garrison's share once and the colonists' share twice:
 * once eaten, once still on the shelf.
 *
 * @see GEPLANET.C:206-209 troop test, GEPLANET.C:221-230 the debit
 */
function starvationFloorOf(men: number, troops: number): number {
  return Math.floor(troops / MOUTHS_PER_UNIT) + Math.floor(men / MOUTHS_PER_UNIT) * 2;
}

/**
 * The lowest food rate a colony can hold indefinitely.
 *
 * NOT break-even. The floor above is two ticks of eating, so it rises with the
 * population, and a rate that merely replaces what was eaten holds the stock
 * level while the floor climbs past it. That is the figure this page used to
 * give, and a colony set to it starved an eighth of 3.8 million people.
 *
 * Found by running the real tick rather than by rearranging the rate formula:
 * start the larder exactly on the floor, run one tick, and ask whether the
 * stock is still on (or above) the floor the grown colony needs. The margin
 * rises with the food rate, so the first rate that passes is the answer.
 */
function minimumFoodRate(input: CalculatorInput): number {
  const men = input.stock[I_MEN];
  if (men <= 0) return 0;

  const margin = (rate: number): number => {
    const stock = input.stock.slice();
    stock[I_FOOD] = starvationFloorOf(men, input.stock[I_TROOPS]);
    const rates = input.rates.slice();
    rates[I_FOOD] = rate;
    const { state } = applyEconomyTickWithLosses(toPlanetState({ ...input, stock, rates }));
    const floorAfter = starvationFloorOf(
      Number(state.items[I_MEN].qty),
      Number(state.items[I_TROOPS].qty),
    );
    return Number(state.items[I_FOOD].qty) - floorAfter;
  };

  let lo = 0;
  let hi = MAX_FOOD_RATE_SEARCHED;
  if (margin(hi) < 0) return hi;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (margin(mid) >= 0) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Total credit value of one tick's production, used for the tax comparison. */
function simulateGoodsValue(input: CalculatorInput): number {
  const before = toPlanetState(input);
  const { state: after, starved } = applyEconomyTickWithLosses(before);
  const eaten =
    Math.floor(input.stock[I_MEN] / MOUTHS_PER_UNIT) +
    Math.floor(input.stock[I_TROOPS] / MOUTHS_PER_UNIT);
  return input.stock.reduce((sum, stockBefore, i) => {
    let produced = Number(after.items[i].qty) - stockBefore;
    if (i === I_FOOD) produced += Math.min(stockBefore, eaten);
    if (i === I_MEN) produced += starved.men;
    if (i === I_TROOPS) produced += starved.troops;
    return sum + Math.max(0, produced) * BASEPRICE[i];
  }, 0);
}
