import { ShipState } from '../ship/ship-state.types';
import { MAXTORPS, MAXDECOY } from '../constants';

/**
 * Apply the state change that crossing the hyperspace threshold causes.
 *
 * Entering costs you your defences and clears what is chasing you:
 *
 *   if (shieldstat == SHIELDUP) shieldstat = SHIELDDN;   // HYSHDN
 *   if (cloak > 0)              cloak = 0;               // HYCLDN
 *   where = 1;
 *   for (i=0;i<MAXTORPS;++i) ltorps[i].distance = 0;
 *   for (i=0;i<MAXDECOY;++i) decout[i] = 0;
 *
 * Leaving only sets `where = 0`.
 *
 * The port emitted a PHYSICS_HYPERSPACE event that nothing consumed, so
 * `where` never became 1 for a player: every `where === 1` gate in report,
 * cloak and combat was dead code, you could cruise at warp shielded and
 * cloaked, and a torpedo lock survived the jump.
 *
 * Note `cloak > 0` — a cloak that has been shot out (negative, recovering) is
 * left alone rather than reset.
 *
 * @see GEFUNCS.C:580-628 hyperspace
 */
export interface HyperspaceTransition {
  /** Shields were up and have been dropped — C prints HYSHDN. */
  shieldsDropped: boolean;
  /** Cloak was up and has been dropped — C prints HYCLDN. */
  cloakDropped: boolean;
}

export function applyHyperspaceTransition(
  ship: ShipState,
  direction: 'enter' | 'exit',
): HyperspaceTransition {
  if (direction === 'exit') {
    ship.where = 0;
    return { shieldsDropped: false, cloakDropped: false };
  }

  // C prints each message ONLY when it actually took something from you
  // (GEFUNCS.C:590-598), so the caller needs to know which applied. Telling a
  // pilot "shields down" when they were already down is noise; NOT telling them
  // when it just happened is how they die.
  const shieldsDropped = ship.shieldstat === 1;
  const cloakDropped = ship.cloak > 0;

  if (shieldsDropped) ship.shieldstat = 0;
  if (cloakDropped) ship.cloak = 0;
  ship.where = 1;

  for (let i = 0; i < MAXTORPS; i++) {
    if (ship.ltorpsDistance.length <= i) ship.ltorpsDistance.push(0);
    ship.ltorpsDistance[i] = 0;
  }
  for (let i = 0; i < Math.min(MAXDECOY, ship.decout.length); i++) {
    ship.decout[i] = 0;
  }

  return { shieldsDropped, cloakDropped };
}
