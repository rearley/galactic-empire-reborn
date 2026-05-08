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
