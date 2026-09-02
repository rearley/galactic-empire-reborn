import { computeBuyOutcome } from '../../src/game/planet/planet-trade';
import { I_GOLD, NUMITEMS, BASEPRICE } from '../../src/game/constants/items';

/**
 * `pri <n> gol` at Zygor-3 refused the exact purchase `buy <n> gol` then
 * completed. `price` carried its own copy of the buy gates, and the copy had
 * drifted: it checked planet stock for gold, but at Zygor-3 the gold bank is
 * backed by the BUYER'S CASH, not by planet stock
 * (`if (item == I_GOLD && neutral && plnum == 1) forsale = waruptr->cash;`
 * GECMDS.C:4406-4426 amt4sale).
 *
 * `price` now quotes through computeBuyOutcome — the same function `buy`
 * executes — so the two cannot disagree again. This pins the case that broke.
 */
function post(plnum: number) {
  return {
    plnum,
    userid: '**neutral**',
    items: Array.from({ length: NUMITEMS }, () => ({
      qty: 0n, rate: 0, sell: true, reserve: 0, markup2a: BASEPRICE[I_GOLD] * 2, sold2a: 0n,
    })),
  };
}

describe('price and buy agree about the Zygor gold bank', () => {
  const base = {
    itemIndex: I_GOLD,
    requestedQty: 10,
    buyerIsOwner: false,
    buyerCargoCapacityRemaining: 100_000,
    isNeutralZone: true,
  };

  it('sells gold at Zygor-3 against the buyer\'s cash, with no stock on hand', () => {
    // The post holds ZERO gold — the old stock check refused here.
    const r = computeBuyOutcome({ ...base, planet: post(1) as never, buyerCash: 1_000_000n });
    expect(r.ok).toBe(true);
  });

  it('still refuses when the buyer cannot cover it', () => {
    const r = computeBuyOutcome({ ...base, planet: post(1) as never, buyerCash: 1n });
    expect(r.ok).toBe(false);
  });

  it('does not extend the bank to the other neutral-zone post', () => {
    // The rule is plnum == 1 specifically; Nexus Prime holds no gold and sells none.
    const r = computeBuyOutcome({ ...base, planet: post(2) as never, buyerCash: 1_000_000n });
    expect(r.ok).toBe(false);
  });
});
