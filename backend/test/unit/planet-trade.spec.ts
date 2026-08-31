/**
 * T024 — Planet trade pure-math unit tests.
 * Tests computeBuyOutcome() and computeSellOutcome().
 * @see GECMDS.C:4201 cmd_buy, GECMDS.C:4147 sell fee
 */
import { computeBuyOutcome, computeSellOutcome } from '../../src/game/planet/planet-trade';
import { PlanetState } from '../../src/game/planet/planet-state.types';
import { BASEPRICE, NUMITEMS, I_FOOD, I_MEN } from '../../src/game/constants/items';

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
    userid: 'owner', name: 'TestPlanet',
    enviorn: 1, resource: 1,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0,
    warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items,
    ...overrides,
  };
}

describe('computeBuyOutcome', () => {
  it('owner pays baseprice', () => {
    const planet = makePlanet();
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: true, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 100, isNeutralZone: false,
    });
    expect(outcome).toMatchObject({ ok: true, unitPrice: BASEPRICE[I_FOOD], transferred: 10 });
  });

  it('non-owner pays markup2a', () => {
    const planet = makePlanet();
    planet.items[I_FOOD].markup2a = 8;
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 100, isNeutralZone: false,
    });
    expect(outcome).toMatchObject({ ok: true, unitPrice: 8 });
  });

  it('returns SELL_FLAG_OFF when sell=false', () => {
    const planet = makePlanet();
    planet.items[I_FOOD].sell = false;
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: true, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 100, isNeutralZone: false,
    });
    expect(outcome).toEqual({ ok: false, reason: 'SELL_FLAG_OFF' });
  });

  it('returns AT_RESERVE when qty - reserve <= 0', () => {
    const planet = makePlanet();
    planet.items[I_FOOD].qty = 100n;
    planet.items[I_FOOD].reserve = 100;
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: true, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 100, isNeutralZone: false,
    });
    expect(outcome).toEqual({ ok: false, reason: 'AT_RESERVE' });
  });

  it('caps transferred by reserve', () => {
    const planet = makePlanet();
    planet.items[I_FOOD].qty = 110n;
    planet.items[I_FOOD].reserve = 100;
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: true, itemIndex: I_FOOD,
      requestedQty: 50, buyerCargoCapacityRemaining: 100, isNeutralZone: false,
    });
    expect(outcome).toMatchObject({ ok: true, transferred: 10 });
  });

  it('returns CAPACITY_FULL when buyerCargoCapacityRemaining <= 0', () => {
    const planet = makePlanet();
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: true, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 0, isNeutralZone: false,
    });
    expect(outcome).toEqual({ ok: false, reason: 'CAPACITY_FULL' });
  });

  it('neutral zone: planet inventory not decremented (mutatePlanet=false)', () => {
    const planet = makePlanet({ xsect: 0, ysect: 0 });
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 100, isNeutralZone: true,
    });
    expect(outcome).toMatchObject({ ok: true, transferred: 10, mutatePlanet: false });
  });

  it('totalCost = transferred * unitPrice', () => {
    const planet = makePlanet();
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: true, itemIndex: I_FOOD,
      requestedQty: 30, buyerCargoCapacityRemaining: 100, isNeutralZone: false,
    });
    if (outcome.ok) {
      expect(outcome.totalCost).toBe(BigInt(outcome.transferred) * BigInt(outcome.unitPrice));
    }
  });
});

describe('computeSellOutcome', () => {
  it('happy path: returns correct proceeds and fee', () => {
    // GECMDS.C:4147: fee = 1 + (doll / 1000), doll = baseprice * qty
    const qty = 10;
    const doll = BigInt(BASEPRICE[I_FOOD]) * BigInt(qty); // 2 * 10 = 20
    const fee = 1n + doll / 1000n; // 1 + 0 = 1
    const proceeds = doll - fee; // 20 - 1 = 19
    const outcome = computeSellOutcome({ itemIndex: I_FOOD, requestedQty: qty, sellerShipQty: qty });
    expect(outcome).toMatchObject({ ok: true, transferred: qty, proceeds, fee });
  });

  it('INSUFFICIENT_CARGO when ship qty < requested', () => {
    const outcome = computeSellOutcome({ itemIndex: I_FOOD, requestedQty: 10, sellerShipQty: 5 });
    expect(outcome).toEqual({ ok: false, reason: 'INSUFFICIENT_CARGO' });
  });

  it('clamps fee: if doll < fee, fee = doll (proceeds = 0)', () => {
    // With qty=1 and high-cost item: fee should never exceed doll
    const outcome = computeSellOutcome({ itemIndex: I_MEN, requestedQty: 1, sellerShipQty: 1 });
    if (outcome.ok) {
      expect(outcome.proceeds).toBeGreaterThanOrEqual(0n);
      expect(outcome.fee).toBeLessThanOrEqual(BigInt(BASEPRICE[I_MEN]) * BigInt(1));
    }
  });
});

/**
 * Cargo capacity is measured in TONS, but the buy path compared the remaining
 * tonnage against a UNIT count: `maxByCapacity = floor(remainingTons)`. Anything
 * heavier than a ton therefore loaded at a multiple of what fits.
 *
 * Found while stocking a colony ship: 300 men (1t), 200 food (2t) and 150 troops
 * (2t) on top of 3 flux pods (20t each) left `rep inv` reporting
 * "1060 tons in cargo (capacity: 1000 tons)".
 */
describe('computeBuyOutcome — cargo capacity is tonnage, not unit count', () => {
  const I_FOOD = 5;   // 2 tons each
  const I_MEN = 0;    // 1 ton each

  function planetWith(itemIndex: number): PlanetState {
    const p = makePlanet();
    p.items[itemIndex] = { ...p.items[itemIndex], qty: 100_000n, sell: true, reserve: 0, markup2a: 5 };
    return p;
  }

  it('caps a 2-ton item by the tonnage it occupies', () => {
    const out = computeBuyOutcome({
      planet: planetWith(I_FOOD),
      buyerIsOwner: false,
      itemIndex: I_FOOD,
      requestedQty: 500,
      buyerCargoCapacityRemaining: 200, // tons
      isNeutralZone: false,
    });
    expect(out.ok).toBe(true);
    // 200 tons of a 2-ton item is 100 units, not 200.
    expect((out as { transferred: number }).transferred).toBe(100);
  });

  it('still fills a 1-ton item to the full tonnage', () => {
    const out = computeBuyOutcome({
      planet: planetWith(I_MEN),
      buyerIsOwner: false,
      itemIndex: I_MEN,
      requestedQty: 500,
      buyerCargoCapacityRemaining: 200,
      isNeutralZone: false,
    });
    expect((out as { transferred: number }).transferred).toBe(200);
  });

  it('applies the same tonnage cap at the neutral-zone hub', () => {
    // The hub does not decrement its stock, but the buyer's holds are finite.
    const out = computeBuyOutcome({
      planet: planetWith(I_FOOD),
      buyerIsOwner: false,
      itemIndex: I_FOOD,
      requestedQty: 500,
      buyerCargoCapacityRemaining: 200,
      isNeutralZone: true,
    });
    expect((out as { transferred: number }).transferred).toBe(100);
  });

  it('refuses when the remaining tonnage cannot hold even one unit', () => {
    const out = computeBuyOutcome({
      planet: planetWith(I_FOOD),
      buyerIsOwner: false,
      itemIndex: I_FOOD,
      requestedQty: 10,
      buyerCargoCapacityRemaining: 1, // one ton; food needs two
      isNeutralZone: false,
    });
    expect(out.ok).toBe(false);
  });
});
