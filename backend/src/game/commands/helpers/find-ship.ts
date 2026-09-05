import { inScanRange } from '../../combat/combat-math';
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
  /**
   * The caller's scan table — `sca lo`/`ra`/`se` letter assignments. Canon
   * addresses ships by LETTER and nothing else. Optional so callers without a
   * scan table (and older tests) still resolve by name.
   */
  scantab?: ReadonlyArray<{ shipKey: string; letter: string }>,
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
    // In the original C, `lock` is a channel (slot index into warsptr[]).
    // In this TypeScript port we use `shipno` as the channel — it is a small
    // stable integer assigned at ship creation. The `loc` handler stores
    // `target.shipno` into `contextShip.lock`, so the reverse lookup here
    // matches by `shipno`, excluding self. This convention is project-wide
    // (ltorpsChannel, lmisslChannel, lastfired, Mine.channel all store shipno values).
    const selfKey = shipKey(contextShip.userid, contextShip.shipno);
    // Prefer the composite key: `lock` holds only the target's shipno, and every
    // droid (plus every player's first ship) is shipno 1, so matching on it
    // alone can resolve to a completely different ship. C's lock is a global
    // slot index (GECMDS.C:1443). Fall back to shipno for state that predates
    // lockKey.
    const lockKey = contextShip.lockKey;
    const target = lockKey
      ? allShips.find((s) => shipKey(s.userid, s.shipno) === lockKey && shipKey(s.userid, s.shipno) !== selfKey)
      : allShips.find((s) => s.shipno === lock && shipKey(s.userid, s.shipno) !== selfKey);
    if (!isIngame(target)) {
      return { ok: false, message: 'Locked target no longer in game.', clearedLock: true };
    }
    if (!inScanRange(contextShip, target, scanRange)) {
      return { ok: false, message: 'Locked target out of scanner range.', clearedLock: true };
    }
    return { ok: true, ship: target };
  }

  // Canon resolves a ship by its SCAN LETTER, and only that:
  //
  //   letter = toupper(*ptr);
  //   for (i=0;i<NOSCANTAB;++i)
  //       if (scantab[usrnum].ship[i].letter == letter) { shpnum = ...; break; }
  //
  // — GECMDS.C:1473-1487 findshp. It reads ONE character, which is why "Bravo"
  // and "B" are the same query. This helper had no letter branch at all, so
  // `loc B` answered "No such ship: B." while `sca sh B` worked, because
  // `sca sh` grew its own letter lookup and the shared helper never did. The
  // same miss broke `tor B` and `mis B`.
  if (scantab && scantab.length > 0) {
    const letter = trimmed[0].toUpperCase();
    const selfKey = shipKey(contextShip.userid, contextShip.shipno);
    const entry = scantab.find((e) => e.letter === letter);
    if (entry) {
      const target = allShips.find(
        (s) => `${s.userid}#${s.shipno}` === entry.shipKey || shipKey(s.userid, s.shipno) === entry.shipKey,
      );
      if (
        isIngame(target) &&
        shipKey(target.userid, target.shipno) !== selfKey &&
        inScanRange(contextShip, target, scanRange)
      ) {
        return { ok: true, ship: target };
      }
      // A letter that resolves to nothing usable is a miss, not a fall-through
      // to a name search: canon returns -1 here.
      return { ok: false, message: `No such ship: ${trimmed}.` };
    }
  }

  // Name matching is OURS, kept as a fallback: a name is more use than a
  // letter when the scan table is stale, and canon never had to type in a
  // browser. Canon would have returned -1 above.
  const needle = trimmed.toLowerCase();
  for (const candidate of allShips) {
    if (!isIngame(candidate)) continue;
    if (shipKey(candidate.userid, candidate.shipno) === shipKey(contextShip.userid, contextShip.shipno)) {
      continue; // never lock onto self
    }
    if (!candidate.shipname.toLowerCase().startsWith(needle)) continue;
    if (!inScanRange(contextShip, candidate, scanRange)) continue;
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
