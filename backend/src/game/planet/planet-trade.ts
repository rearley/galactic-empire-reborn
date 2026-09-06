/**
 * Pure-math buy/sell calculation module. NO I/O, NO mutation.
 * Takes read-only snapshots, returns typed outcome objects.
 * PlanetStateService consumes these outcomes and applies state changes.
 * @see GECMDS.C:4201 cmd_buy
 * @see GECMDS.C:4103 cmd_sell
 * @see GECMDS.C:4147 sell fee calculation
 */

import { BASEPRICE, ITEM_TONS, I_GOLD } from '../constants/items';
import { PlanetState } from './planet-state.types';

export interface BuyInput {
  planet: PlanetState;
  buyerIsOwner: boolean;
  itemIndex: number;
  requestedQty: number;
  buyerCargoCapacityRemaining: number;
  isNeutralZone: boolean;
  /** The buyer's credit balance. C gates the whole transfer on `tot <= waruptr->cash`. */
  buyerCash: bigint;
}

export type BuyOutcome =
  | { ok: true; transferred: number; unitPrice: number; totalCost: bigint; mutatePlanet: boolean }
  | {
      ok: false;
      reason: 'AT_RESERVE';
      /**
       * `avail` — what the planet will actually sell right now. C prints it:
       * `sprintf(gechrbuf,"%ld",avail); prfmsg(BUY3,gechrbuf,item_name[item]);`
       * Never negative: a stock below the reserve is simply nothing for sale.
       * @see GECMDS.C:4380-4381
       */
      available: number;
    }
  | {
      ok: false;
      reason:
        | 'SELL_FLAG_OFF'
        /** No free tonnage at all (C: chkweight with an empty hold). */
        | 'CAPACITY_FULL'
        /** Some room, but not enough for the whole order (C: BUY8). */
        | 'WONT_FIT'
        /** Order costs more than the buyer has (C: BUY2). */
        | 'INSUFFICIENT_FUNDS';
    };


/**
 * How many units of an item fit in the tonnage still free in the holds.
 *
 * Capacity is measured in TONS; this used to compare it against a UNIT count,
 * so anything heavier than a ton loaded at a multiple of what fits — 200 tons of
 * free space accepted 200 food cases at 2 tons each, and `rep inv` then read
 * "1060 tons in cargo (capacity: 1000 tons)".
 */
function unitsThatFit(remainingTons: number, itemIndex: number): number {
  // No canon item weighs zero — gold is the lightest at 0.5 — so there is no
  // divide to guard against. A `Math.max(1, tonsEach)` here used to round
  // gold's half-ton up to a whole one, halving how much of it a hold would
  // take: exactly the item the Zygor-3 bank exists to move in bulk.
  const tonsEach = ITEM_TONS[itemIndex] || 1;
  return Math.floor(remainingTons / tonsEach);
}

/**
 * Compute the outcome of a buy transaction.
 *
 * C runs four gates in order, and every one of them is ALL-OR-NOTHING — an
 * order that cannot be filled completely is refused with a message rather than
 * quietly shrunk (GECMDS.C:4324-4380):
 *
 *   1. `plptr->items[item].sell == 'Y'`, unless you own the planet   -> BUY4
 *   2. `chkweight(warsptr,item,amt)`      — does the whole order fit -> BUY8
 *   3. `avail = amt4sale(item); avail > 0 && avail >= amt`           -> BUY3
 *   4. `(tot = price(item,amt)) <= waruptr->cash`                    -> BUY2
 *
 * Only the *inventory decrement* is skipped in the neutral zone
 * (GECMDS.C:4336-4344); `amt4sale` and the cash check still run there. The port
 * previously skipped the availability gate entirely inside the neutral zone and
 * never read the buyer's balance anywhere, which made goods free.
 *
 * @see GECMDS.C:4201 cmd_buy  @see GECMDS.C:4406 amt4sale  @see GECMDS.C:4425 price
 */
export function computeBuyOutcome(input: BuyInput): BuyOutcome {
  const {
    planet,
    buyerIsOwner,
    itemIndex,
    requestedQty,
    buyerCargoCapacityRemaining,
    isNeutralZone,
    buyerCash,
  } = input;
  const item = planet.items[itemIndex];

  // 1. sell flag — the owner may always buy from their own planet
  if (!buyerIsOwner && !item.sell) {
    return { ok: false, reason: 'SELL_FLAG_OFF' };
  }

  // 2. weight
  if (buyerCargoCapacityRemaining <= 0) {
    return { ok: false, reason: 'CAPACITY_FULL' };
  }
  if (requestedQty > unitsThatFit(buyerCargoCapacityRemaining, itemIndex)) {
    return { ok: false, reason: 'WONT_FIT' };
  }

  // 3. availability. `amt4sale` gives the owner the full stock and everyone
  //    else the stock above the reserve. Runs in the neutral zone too.
  //
  //    Gold at Zygor-3 is the exception, and it OVERRIDES whatever the planet
  //    holds: `if (item == I_GOLD && neutral && plnum == 1) forsale =
  //    waruptr->cash;`. That is the game's cash-to-gold bank and the only
  //    reason to carry gold — the hub keeps no stock of it, so applying the
  //    ordinary check there refused every transaction.
  //    @see GECMDS.C:4406-4426 amt4sale
  const isGoldBank = itemIndex === I_GOLD && isNeutralZone && planet.plnum === 1;
  const available = isGoldBank
    ? Number(buyerCash)
    : buyerIsOwner
      ? Number(item.qty)
      : Number(item.qty) - item.reserve;
  if (available <= 0 || available < requestedQty) {
    return { ok: false, reason: 'AT_RESERVE', available: Math.max(0, available) };
  }

  // 4. price
  const unitPrice = buyerIsOwner ? BASEPRICE[itemIndex] : item.markup2a;
  const totalCost = BigInt(requestedQty) * BigInt(unitPrice);
  if (totalCost > buyerCash) {
    return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
  }

  return {
    ok: true,
    transferred: requestedQty,
    unitPrice,
    totalCost,
    // The neutral-zone market is bottomless stock-wise: the transfer happens
    // but the planet's inventory and takings are left alone.
    mutatePlanet: !isNeutralZone,
  };
}

export interface SellInput {
  itemIndex: number;
  requestedQty: number;
  sellerShipQty: number;
}

export type SellOutcome =
  | { ok: true; transferred: number; proceeds: bigint; fee: bigint }
  | { ok: false; reason: 'INSUFFICIENT_CARGO' };

/**
 * Compute the outcome of a sell transaction (galactic-market model).
 * fee = 1 + (baseprice * qty) / 1000, clamped so proceeds >= 0.
 * @see GECMDS.C:4147 sell fee calculation
 */
export function computeSellOutcome(input: SellInput): SellOutcome {
  const { itemIndex, requestedQty, sellerShipQty } = input;

  if (sellerShipQty < requestedQty) {
    return { ok: false, reason: 'INSUFFICIENT_CARGO' };
  }

  const transferred = requestedQty;
  const doll = BigInt(BASEPRICE[itemIndex]) * BigInt(transferred);
  let fee = 1n + doll / 1000n;

  // Clamp: if doll - fee < 0, fee = doll
  if (doll < fee) fee = doll;

  const proceeds = doll - fee;

  return { ok: true, transferred, proceeds, fee };
}
