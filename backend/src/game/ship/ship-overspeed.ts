import { ShipState } from './ship-state.types';
import { GESTAT_USER } from '../constants';

/**
 * Injected RNG interface — allows deterministic injection in tests.
 * @see GEFUNCS.C gernd() — calls into the MajorBBS RNG
 */
export interface OverspeedRng {
  /** Return a random integer in [0, n). */
  intBelow(n: number): number;
}

/** Tagged-union result of one overspeed evaluation. */
export type OverspeedDecision =
  | { kind: 'noop' }
  | { kind: 'warn'; warncntr: number }
  | { kind: 'break'; warncntr: number; topspeed: number; speed2b: number; damage: number }
  | { kind: 'recover'; topspeed: number; speed2b: number; warncntr: number };

/**
 * Pure overspeed engine-break decision. No side effects — returns the deltas
 * to apply to ship state.
 *
 * Formula per GEFUNCS.C:733-792:
 *
 *   intspeed = floor(speed / 1000)
 *   if intspeed > topspeed AND speed <= speed2b:
 *     diff = ((intspeed - topspeed) * 100) / intspeed
 *     diff = 60 - diff
 *     if diff < 0: diff = 5
 *     if rng.intBelow(diff) == 0:
 *       if warncntr > 4: engine break
 *       else: warn, warncntr++
 *   else:
 *     if warncntr > 0: recovery
 *
 * @see GEFUNCS.C:733 overspeed check
 */
export function decideOverspeed(ship: ShipState, rng: OverspeedRng): OverspeedDecision {
  // C wraps the ENTIRE block — warn, break and the warncntr recovery — in
  // `if (ptr->speed > 1000.0 && ptr->status == GESTAT_USER)`. AI ships never
  // blow their own engines, and a sublight ship is never even considered.
  // @see GEFUNCS.C:733
  if (ship.speed <= 1000 || ship.status !== GESTAT_USER) return { kind: 'noop' };

  const intspeed = Math.floor(ship.speed / 1000);

  // Overspeed condition: going faster than rated topspeed and still accelerating
  if (intspeed > ship.topspeed && ship.speed <= ship.speed2b) {
    let diff = ((intspeed - ship.topspeed) * 100) / intspeed;
    diff = 60 - diff;
    if (diff < 0) diff = 5;
    // Ensure diff is at least 1 to avoid modulo-by-zero
    const safeDiff = Math.max(1, Math.floor(diff));

    if (rng.intBelow(safeDiff) === 0) {
      if (ship.warncntr > 4) {
        // Engine break
        return {
          kind: 'break',
          warncntr: ship.warncntr,
          topspeed: 0,
          speed2b: 0,
          damage: rng.intBelow(20),
        };
      } else {
        // Warn — escalate counter
        return { kind: 'warn', warncntr: ship.warncntr + 1 };
      }
    }

    return { kind: 'noop' };
  }

  // Recovery: speed normalised; reset warncntr if it was elevated
  if (ship.warncntr > 0) {
    const newTopspeed = Math.max(0, Math.floor(ship.topspeed / ship.warncntr));
    return {
      kind: 'recover',
      topspeed: newTopspeed,
      speed2b: newTopspeed * 1000,
      warncntr: 0,
    };
  }

  return { kind: 'noop' };
}
