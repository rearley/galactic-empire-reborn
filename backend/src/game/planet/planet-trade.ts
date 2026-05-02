/**
 * Pure-math buy/sell calculation module. NO I/O, NO mutation.
 * Takes read-only snapshots, returns typed outcome objects.
 * PlanetStateService consumes these outcomes and applies state changes.
 * @see GECMDS.C:4201 cmd_buy
 * @see GECMDS.C:4103 cmd_sell
 * @see GECMDS.C:4147 sell fee calculation
 */

import { BASEPRICE } from '../constants/items';
import { PlanetState } from './planet-state.types';

export interface BuyInput {
  planet: PlanetState;
  buyerIsOwner: boolean;
  itemIndex: number;
  requestedQty: number;
  buyerCargoCapacityRemaining: number;
  isNeutralZone: boolean;
}

export type BuyOutcome =
  | { ok: true; transferred: number; unitPrice: number; totalCost: bigint; mutatePlanet: boolean }
  | { ok: false; reason: 'SELL_FLAG_OFF' | 'AT_RESERVE' | 'CAPACITY_FULL' };

/**
 * Compute the outcome of a buy transaction.
 * @see GECMDS.C:4201 cmd_buy — owner pays baseprice, non-owner pays markup2a
 */
export function computeBuyOutcome(input: BuyInput): BuyOutcome {
  const { planet, buyerIsOwner, itemIndex, requestedQty, buyerCargoCapacityRemaining, isNeutralZone } = input;
  const item = planet.items[itemIndex];

  if (!item.sell) {
    return { ok: false, reason: 'SELL_FLAG_OFF' };
  }

  // In neutral zone, planet inventory is not decremented but transfer still happens
  if (!isNeutralZone) {
    const available = Number(item.qty) - item.reserve;
    if (available <= 0) {
      return { ok: false, reason: 'AT_RESERVE' };
    }

    if (buyerCargoCapacityRemaining <= 0) {
      return { ok: false, reason: 'CAPACITY_FULL' };
    }

    const maxByReserve = available;
    const maxByCapacity = Math.floor(buyerCargoCapacityRemaining);
    const transferred = Math.min(requestedQty, maxByReserve, maxByCapacity);

    if (transferred <= 0) {
      return { ok: false, reason: 'AT_RESERVE' };
    }

    const unitPrice = buyerIsOwner ? BASEPRICE[itemIndex] : item.markup2a;
    const totalCost = BigInt(transferred) * BigInt(unitPrice);

    return { ok: true, transferred, unitPrice, totalCost, mutatePlanet: true };
  }

  // Neutral zone: no planet-side cap check; cargo cap still applies
  if (buyerCargoCapacityRemaining <= 0) {
    return { ok: false, reason: 'CAPACITY_FULL' };
  }

  const transferred = Math.min(requestedQty, Math.floor(buyerCargoCapacityRemaining));
  if (transferred <= 0) {
    return { ok: false, reason: 'CAPACITY_FULL' };
  }

  const unitPrice = buyerIsOwner ? BASEPRICE[itemIndex] : item.markup2a;
  const totalCost = BigInt(transferred) * BigInt(unitPrice);

  return { ok: true, transferred, unitPrice, totalCost, mutatePlanet: false };
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
