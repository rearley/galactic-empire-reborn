/**
 * Lydorian Garbage Scow (class 31) decision tree.
 * Pure function — receives current state and all players; returns action descriptor.
 * Caller applies mutations and emits events.
 *
 * @see GEDROIDS.C:253 droid_act_class_10
 */

import type { ShipState } from '../ship/ship-state.types';
import type { Random } from '../combat/random.port';
import { rollAnnoy, pickHoldCourseDuration } from './droid-decisions';
import { DROID_ANNOY_DENOM } from '../constants';
import { cdistance } from '../combat/combat-math';

export interface Class10Action {
  /** New speed2b when jammed */
  jammedSpeed?: number;
  /** New holdcourse when jammed */
  jammedHoldcourse?: number;
  /** Shields: 1 = up, 0 = down */
  shieldCommand: 1 | 0;
  /** Annoy targets: each entry carries the player to annoy */
  annoys: Array<{ target: ShipState; message: string }>;
}

/**
 * Computes the Garbage Scow decision for this tick.
 * @see GEDROIDS.C:253-298 droid_act_class_10
 */
export function droidActClass10(
  droid: ShipState,
  players: ShipState[],
  scanRange: number,
  pickMessage: (shipname: string, rng: Random) => string,
  rng: Random,
): Class10Action {
  const shieldCommand: 1 | 0 = droid.speed < 1000.0 ? 1 : 0;

  if (droid.jammer > 0) {
    // @see GEDROIDS.C:285-288 — jammed: sub-warp flee + hold
    return {
      jammedSpeed: 999.9,
      jammedHoldcourse: pickHoldCourseDuration('jammed', rng),
      shieldCommand,
      annoys: [],
    };
  }

  const annoys: Array<{ target: ShipState; message: string }> = [];

  for (const player of players) {
    if (player.status !== 1) continue; // GESTAT_USER
    const dist = cdistance(droid, player) * 10_000;
    if (dist < scanRange) {
      // @see GEDROIDS.C:278-283 — rollAnnoy(4, DRDMSG6, DRDMSG6)
      if (rollAnnoy(DROID_ANNOY_DENOM, rng)) {
        annoys.push({ target: player, message: pickMessage(droid.shipname, rng) });
      }
    }
  }

  return { shieldCommand, annoys };
}
