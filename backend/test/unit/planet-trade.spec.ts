/**
 * T024 — Planet trade pure-math unit tests.
 * Tests computeBuyOutcome() and computeSellOutcome().
 * @see GECMDS.C:4201 cmd_buy, GECMDS.C:4147 sell fee
 */
import { computeBuyOutcome, computeSellOutcome } from '../../src/game/planet/planet-trade';
import { PlanetState } from '../../src/game/planet/planet-state.types';
import { BASEPRICE, NUMITEMS, I_FOOD, I_MEN, I_GOLD } from '../../src/game/constants/items';

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
      requestedQty: 10, buyerCargoCapacityRemaining: 100, isNeutralZone: false, buyerCash: 1_000_000n,
    });
    expect(outcome).toMatchObject({ ok: true, unitPrice: BASEPRICE[I_FOOD], transferred: 10 });
  });

  it('non-owner pays markup2a', () => {
    const planet = makePlanet();
    planet.items[I_FOOD].markup2a = 8;
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 100, isNeutralZone: false, buyerCash: 1_000_000n,
    });
    expect(outcome).toMatchObject({ ok: true, unitPrice: 8 });
  });

  it('returns SELL_FLAG_OFF when sell=false', () => {
    const planet = makePlanet();
    planet.items[I_FOOD].sell = false;
    // The owner bypasses the sell flag in C — `sameas(userid) || sell == 'Y'`.
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 100, isNeutralZone: false, buyerCash: 1_000_000n,
    });
    expect(outcome).toEqual({ ok: false, reason: 'SELL_FLAG_OFF' });
  });

  it('returns AT_RESERVE when qty - reserve <= 0', () => {
    const planet = makePlanet();
    planet.items[I_FOOD].qty = 100n;
    planet.items[I_FOOD].reserve = 100;
    // amt4sale gives the OWNER the whole stock; the reserve binds everyone else.
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 100, isNeutralZone: false, buyerCash: 1_000_000n,
    });
    expect(outcome).toEqual({ ok: false, reason: 'AT_RESERVE' });
  });

  /**
   * C is all-or-nothing: `avail = amt4sale(item); if (avail > 0 && avail >= amt)`
   * — asking for more than is for sale prints BUY3 and transfers nothing. The
   * port used to silently clamp the order down, which is why `buy` part-filled
   * while `tra up` refused outright for the same shortfall.
   * @see GECMDS.C:4330-4331, 4378-4381
   */
  it('refuses rather than part-filling when the reserve leaves too little', () => {
    const planet = makePlanet();
    planet.items[I_FOOD].qty = 110n;
    planet.items[I_FOOD].reserve = 100;
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_FOOD,
      requestedQty: 50, buyerCargoCapacityRemaining: 100, isNeutralZone: false, buyerCash: 1_000_000n,
    });
    expect(outcome).toEqual({ ok: false, reason: 'AT_RESERVE' });
  });

  it('sells exactly the amount available when the order matches it', () => {
    const planet = makePlanet();
    planet.items[I_FOOD].qty = 110n;
    planet.items[I_FOOD].reserve = 100;
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 100, isNeutralZone: false, buyerCash: 1_000_000n,
    });
    expect(outcome).toMatchObject({ ok: true, transferred: 10 });
  });

  /**
   * `if ((tot = price(item,amt)) <= waruptr->cash)` gates the whole transfer;
   * the port never read the buyer's balance at all, so every weapon, troop and
   * bar of gold in the galaxy was free and cash ran arbitrarily negative.
   * @see GECMDS.C:4333
   */
  it('refuses when the buyer cannot afford the order', () => {
    const planet = makePlanet();
    const price = BigInt(planet.items[I_FOOD].markup2a);
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 1000, isNeutralZone: false,
      buyerCash: price * 10n - 1n,
    });
    expect(outcome).toEqual({ ok: false, reason: 'INSUFFICIENT_FUNDS' });
  });

  it('allows an order costing exactly the buyer\'s balance', () => {
    const planet = makePlanet();
    const price = BigInt(planet.items[I_FOOD].markup2a);
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 1000, isNeutralZone: false,
      buyerCash: price * 10n,
    });
    expect(outcome).toMatchObject({ ok: true, transferred: 10 });
  });

  it('checks affordability in the neutral zone too', () => {
    const planet = makePlanet({ xsect: 0, ysect: 0 });
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 1000, isNeutralZone: true,
      buyerCash: 0n,
    });
    expect(outcome).toEqual({ ok: false, reason: 'INSUFFICIENT_FUNDS' });
  });

  /**
   * `avail = amt4sale(item)` runs for EVERY purchase — only the inventory
   * decrement is skipped inside the neutral zone. The port skipped the whole
   * gate, so Zygor-3 sold stock it did not have.
   * @see GECMDS.C:4330-4331 vs 4336-4344
   */
  it('neutral zone still honours the planet stock and reserve', () => {
    const planet = makePlanet({ xsect: 0, ysect: 0 });
    planet.items[I_FOOD].qty = 5n;
    planet.items[I_FOOD].reserve = 0;
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_FOOD,
      requestedQty: 500, buyerCargoCapacityRemaining: 10000, isNeutralZone: true,
      buyerCash: 1_000_000n,
    });
    expect(outcome).toEqual({ ok: false, reason: 'AT_RESERVE' });
  });

  it('neutral zone refuses an order that will not fit, rather than part-filling', () => {
    const planet = makePlanet({ xsect: 0, ysect: 0 });
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_FOOD,
      requestedQty: 500, buyerCargoCapacityRemaining: 10, isNeutralZone: true,
      buyerCash: 1_000_000n,
    });
    expect(outcome).toEqual({ ok: false, reason: 'WONT_FIT' });
  });

  it('returns CAPACITY_FULL when buyerCargoCapacityRemaining <= 0', () => {
    const planet = makePlanet();
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: true, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 0, isNeutralZone: false, buyerCash: 1_000_000n,
    });
    expect(outcome).toEqual({ ok: false, reason: 'CAPACITY_FULL' });
  });

  it('neutral zone: planet inventory not decremented (mutatePlanet=false)', () => {
    const planet = makePlanet({ xsect: 0, ysect: 0 });
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 100, isNeutralZone: true, buyerCash: 1_000_000n,
    });
    expect(outcome).toMatchObject({ ok: true, transferred: 10, mutatePlanet: false });
  });

  it('totalCost = transferred * unitPrice', () => {
    const planet = makePlanet();
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: true, itemIndex: I_FOOD,
      requestedQty: 30, buyerCargoCapacityRemaining: 100, isNeutralZone: false, buyerCash: 1_000_000n,
    });
    if (outcome.ok) {
      expect(outcome.totalCost).toBe(BigInt(outcome.transferred) * BigInt(outcome.unitPrice));
    }
  });
});

/**
 * Zygor-3 sells gold against your wallet, not against a stockpile.
 *
 * `amt4sale` (GECMDS.C:4417-4423) ends with:
 *
 *   if (item == I_GOLD) {
 *     plnum = warsptr->where - 10; getplanetdat(usrnum);
 *     if (neutral(&warsptr->coord) && plnum == 1) forsale = waruptr->cash;
 *   }
 *
 * — overriding whatever the planet holds. That is the game's cash-to-gold
 * bank, and it is the only reason to carry gold at all. The port applied the
 * ordinary stock check there, and since the neutral-zone hub carries no gold
 * the bank refused every transaction with "that would deplete the planet's
 * reserve".
 */
describe('computeBuyOutcome — the Zygor-3 gold bank (GECMDS.C:4417-4423)', () => {
  const zygor = (over: Partial<PlanetState> = {}) =>
    makePlanet({ xsect: 0, ysect: 0, plnum: 1, ...over });

  it('sells gold up to the buyer\'s cash even with an empty vault', () => {
    const planet = zygor();
    planet.items[I_GOLD].qty = 0n;
    const price = BigInt(planet.items[I_GOLD].markup2a);
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_GOLD,
      requestedQty: 50, buyerCargoCapacityRemaining: 10_000, isNeutralZone: true,
      buyerCash: price * 50n,
    });
    expect(outcome).toMatchObject({ ok: true, transferred: 50 });
  });

  it('will not sell more gold than the buyer has cash', () => {
    const planet = zygor();
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_GOLD,
      requestedQty: 500, buyerCargoCapacityRemaining: 10_000, isNeutralZone: true,
      buyerCash: 100n,
    });
    expect(outcome).toEqual({ ok: false, reason: 'AT_RESERVE' });
  });

  it('does not apply the rule to other items at Zygor-3', () => {
    const planet = zygor();
    planet.items[I_FOOD].qty = 0n;
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_FOOD,
      requestedQty: 10, buyerCargoCapacityRemaining: 10_000, isNeutralZone: true,
      buyerCash: 1_000_000n,
    });
    expect(outcome).toEqual({ ok: false, reason: 'AT_RESERVE' });
  });

  it('does not apply the rule at the other neutral-zone planets', () => {
    // `plnum == 1` — only Zygor-3 is the bank.
    const planet = zygor({ plnum: 2 });
    planet.items[I_GOLD].qty = 0n;
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_GOLD,
      requestedQty: 10, buyerCargoCapacityRemaining: 10_000, isNeutralZone: true,
      buyerCash: 1_000_000n,
    });
    expect(outcome).toEqual({ ok: false, reason: 'AT_RESERVE' });
  });

  it('does not apply the rule outside the neutral zone', () => {
    const planet = makePlanet({ xsect: 4, ysect: 4, plnum: 1 });
    planet.items[I_GOLD].qty = 0n;
    const outcome = computeBuyOutcome({
      planet, buyerIsOwner: false, itemIndex: I_GOLD,
      requestedQty: 10, buyerCargoCapacityRemaining: 10_000, isNeutralZone: false,
      buyerCash: 1_000_000n,
    });
    expect(outcome).toEqual({ ok: false, reason: 'AT_RESERVE' });
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
      isNeutralZone: false, buyerCash: 1_000_000n,
    });
    // 200 tons of a 2-ton item is 100 units, not 200 — and C refuses the
    // over-large order outright (BUY8) rather than shrinking it.
    expect(out).toEqual({ ok: false, reason: 'WONT_FIT' });
  });

  it('fills a 2-ton item right up to the tonnage that fits', () => {
    const out = computeBuyOutcome({
      planet: planetWith(I_FOOD),
      buyerIsOwner: false,
      itemIndex: I_FOOD,
      requestedQty: 100,
      buyerCargoCapacityRemaining: 200,
      isNeutralZone: false, buyerCash: 1_000_000n,
    });
    expect(out).toMatchObject({ ok: true, transferred: 100 });
  });

  it('still fills a 1-ton item to the full tonnage', () => {
    const out = computeBuyOutcome({
      planet: planetWith(I_MEN),
      buyerIsOwner: false,
      itemIndex: I_MEN,
      requestedQty: 200,
      buyerCargoCapacityRemaining: 200,
      isNeutralZone: false, buyerCash: 1_000_000n,
    });
    expect((out as { transferred: number }).transferred).toBe(200);
  });

  it('applies the same tonnage cap at the neutral-zone hub', () => {
    // The hub does not decrement its stock, but the buyer's holds are finite.
    const out = computeBuyOutcome({
      planet: planetWith(I_FOOD),
      buyerIsOwner: false,
      itemIndex: I_FOOD,
      requestedQty: 100,
      buyerCargoCapacityRemaining: 200,
      isNeutralZone: true, buyerCash: 1_000_000n,
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
      isNeutralZone: false, buyerCash: 1_000_000n,
    });
    expect(out.ok).toBe(false);
  });
});
