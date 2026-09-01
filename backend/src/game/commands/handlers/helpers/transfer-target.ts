import { ITEM_TONS, NUMITEMS } from '../../../constants/items';

/**
 * Resolves the target of a ship-to-ship `tra`.
 *
 * Ship-to-ship transfer is a port addition — C's `cmd_transfer` only moves
 * cargo between a ship and the planet it orbits (GECMDS.C cmd_transfer) — so
 * the addressing scheme is ours, and the first one was wrong. It looked the
 * target up with `allShips.find(s => s.shipno === n)`, but `shipno` is a
 * PER-USER index: every captain's first hull is shipno 1. That made another
 * captain's ship impossible to name, and made the lookup return whichever
 * ship sat first in the map. The same mistake had already been fixed once in
 * kill attribution, which used to credit "the first ship in the map with that
 * per-user index".
 *
 * A NAME addresses anyone — the form `loc`, `dat` and `sca sh` already use. A
 * bare number keeps its only unambiguous meaning: a hull in your OWN fleet.
 */

export interface TransferShip {
  readonly userid: string;
  readonly shipno: number;
  readonly shipname: string;
  readonly items: bigint[];
  readonly maxTons?: number;
  readonly status: number;
  readonly xcoord: number;
  readonly ycoord: number;
}

export type TransferTarget =
  | { ok: true; ship: TransferShip }
  | { ok: false; reason: 'SELF' | 'OFFLINE' | 'SECTOR' };

const ACTIVE = 1;

export function resolveTransferTarget(
  arg: string,
  self: TransferShip,
  allShips: readonly TransferShip[],
): TransferTarget {
  const query = (arg ?? '').trim();
  if (query === '') return { ok: false, reason: 'OFFLINE' };

  let found: TransferShip | undefined;

  if (/^\d+$/.test(query)) {
    // Your own fleet only — a number cannot name a stranger's hull.
    const shipno = parseInt(query, 10);
    found = allShips.find(
      (s) => s.userid === self.userid && s.shipno === shipno && s.status === ACTIVE,
    );
  } else {
    const q = query.toLowerCase();
    const active = allShips.filter((s) => s.status === ACTIVE);
    found =
      active.find((s) => s.shipname.toLowerCase() === q) ??
      active.find((s) => s.shipname.toLowerCase().startsWith(q)) ??
      active.find((s) => s.shipname.toLowerCase().includes(q));
  }

  if (!found) return { ok: false, reason: 'OFFLINE' };
  if (found.userid === self.userid && found.shipno === self.shipno) {
    return { ok: false, reason: 'SELF' };
  }
  if (Math.floor(found.xcoord) !== Math.floor(self.xcoord) ||
      Math.floor(found.ycoord) !== Math.floor(self.ycoord)) {
    return { ok: false, reason: 'SECTOR' };
  }
  return { ok: true, ship: found };
}

/**
 * Tonnage the receiving hold can still take.
 *
 * The planet path has always checked this for the SENDER; the ship-to-ship
 * path checked neither side, so a trader pushed a 1,000-ton Interceptor to
 * 1,018.5 tons of cargo.
 */
export function receiverFreeTons(target: TransferShip): number {
  let used = 0;
  for (let i = 0; i < NUMITEMS; i++) {
    used += Number(target.items[i] ?? 0n) * ITEM_TONS[i];
  }
  return Math.max(0, (target.maxTons ?? 1000) - used);
}
