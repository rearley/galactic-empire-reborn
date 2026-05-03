import { cdistance } from '../../combat/combat-math';
import { ShipState, shipKey } from '../../ship/ship-state.types';

/**
 * Sentinel for "no current target lock". Mirrors the original game's
 * `lock = -1` and `prfmsg(NOLOCK)` paths.
 *
 * @see GECMDS.C:1432-1490 findshp
 */
export const NOLOCK_SENTINEL = -1 as const;

export type FindShipResult =
  | { ok: true; ship: ShipState }
  | { ok: false; message: string; clearedLock?: boolean };

/**
 * Resolve a player target query against the active ship roster.
 *
 *   - `'@'` resolves to `contextShip.lock` and re-validates that target is
 *     still ingame and within scan range; otherwise clears the lock and
 *     returns NOLOCK.
 *   - Any other token is treated as a case-insensitive prefix match against
 *     ship names within scan range.
 *
 * Lazy-clear semantics (FR-021): if the looked-up target is not ingame or its
 * distance × 10000 exceeds scan range, the helper signals `clearedLock: true`
 * so the caller can persist `lock = NOLOCK_SENTINEL` on the context ship.
 *
 * @see GECMDS.C:1432 findshp
 * @see GEFUNCS.C:211 cdistance × 10000 vs scanrange
 */
export function findShip(
  query: string,
  contextShip: ShipState,
  allShips: ShipState[],
  scanRange: number,
): FindShipResult {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: 'Target name required.' };
  }

  // '@' → use the existing lock and re-validate it.
  if (trimmed === '@') {
    const lock = contextShip.lock;
    if (lock === NOLOCK_SENTINEL || lock < 0) {
      return { ok: false, message: 'No target locked.', clearedLock: true };
    }
    // `lock` is an opaque integer pointer in the original; here we treat it
    // as an index into the supplied roster (the only stable handle we have).
    const target = allShips[lock];
    if (!isIngame(target)) {
      return { ok: false, message: 'No target locked.', clearedLock: true };
    }
    const dist = cdistance(contextShip, target);
    if (dist * 10000 > scanRange) {
      return { ok: false, message: 'No target locked.', clearedLock: true };
    }
    return { ok: true, ship: target };
  }

  // Otherwise prefix-match against the active roster, in range.
  const needle = trimmed.toLowerCase();
  for (const candidate of allShips) {
    if (!isIngame(candidate)) continue;
    if (shipKey(candidate.userid, candidate.shipno) === shipKey(contextShip.userid, contextShip.shipno)) {
      continue; // never lock onto self
    }
    if (!candidate.shipname.toLowerCase().startsWith(needle)) continue;
    const dist = cdistance(contextShip, candidate);
    if (dist * 10000 > scanRange) continue;
    return { ok: true, ship: candidate };
  }

  return { ok: false, message: `No such ship: ${trimmed}.` };
}

/**
 * Mirrors GEFUNCS.C ingegame(): true when the ship slot is owned by an
 * active player or AI (status === GESTAT_USER=1 OR GESTAT_AUTO=2).
 */
function isIngame(ship: ShipState | undefined): ship is ShipState {
  if (!ship) return false;
  return ship.status === 1 || ship.status === 2;
}
