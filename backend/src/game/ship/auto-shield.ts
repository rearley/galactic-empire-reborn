import { ShipState } from './ship-state.types';

/** Result of one auto-shield evaluation. */
export type AutoShieldDecision =
  | { action: 'raise' }
  | { action: 'noop' };

/**
 * Pure auto-shield decision. Returns 'raise' when:
 *  - ship.autoShield === true (caller responsibility)
 *  - shields are currently down (shieldstat === 0)
 *  - ship is NOT in combat lock (cantexit === 0)
 *  - at least one transient trigger flag is set:
 *      recentlyWarpedExit === true, OR
 *      recentlySelfFiredTorp === true
 *
 * Trigger flags are consumed (cleared) on 'raise' — the caller MUST apply the
 * flag-clear delta alongside the shields-up mutation. This prevents re-triggering
 * on subsequent ticks.
 *
 * NOTE: This is a port-original QoL feature — no C-source equivalent.
 * JSDoc intentionally omits @see GEFUNCS.C because there is no original counterpart.
 * @see specs/019-physics-polish/spec.md US4
 */
export function decideAutoShield(ship: ShipState): AutoShieldDecision {
  // Guard: hyperspace forbids shields at all.
  //
  // `cmd_shields` refuses outright there — `if (warsptr->where == 1)
  // { prfmsg(SHLD1); return; }` (GECMDS.C:3125-3130) — and `hyperspace()`
  // drops them on the way in (GEFUNCS.C:590). This feature is port-original,
  // but it must not manufacture a state the game forbids: without this gate
  // `set autoshield on` put shields back up in hyperspace on the next tick,
  // silently, where no command could have done it.
  if (ship.where === 1) return { action: 'noop' };

  // Guard: combat lock prevents raise
  if (ship.cantexit > 0) return { action: 'noop' };

  // Guard: shields already up
  if (ship.shieldstat !== 0) return { action: 'noop' };

  // At least one trigger must be set
  if (!ship.recentlyWarpedExit && !ship.recentlySelfFiredTorp) {
    return { action: 'noop' };
  }

  return { action: 'raise' };
}
