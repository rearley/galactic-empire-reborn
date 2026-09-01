/**
 * Vakory Survey Drone (class 33) decision tree.
 * Pure function — returns action descriptor; caller fires weapons and applies state.
 *
 * @see GEDROIDS.C:410 droid_act_class_12
 */

import type { ShipState } from '../ship/ship-state.types';
import type { Random } from '../combat/random.port';
import {
  rollAnnoy,
  rollAlterAttackVector,
  rollVakoryTorpedoVolley,
  pickHoldCourseDuration,
  missileAttached,
} from './droid-decisions';
import { DROID_ANNOY_DENOM, PMINFIRE } from '../constants';
import { cdistance, inScanRange } from '../combat/combat-math';

export interface Class12Action {
  jammedFlee?: { speed2b: number; holdcourse: number };
  shieldCommand?: 1 | 0;
  passiveAnnoys: Array<{ target: ShipState; message: string }>;
  /** A player came into scan range — shortens the droid's countdown. @see GEDROIDS.C:442 */
  detected?: boolean;
  fightback?: {
    target: ShipState;
    helpMessage: string;
    fireMode: 'hyper' | 'normal' | null;
    ddist: number;
    /** Number of torpedoes to fire (0 or 1). @see GEDROIDS.C:472 j=gernd()%2 */
    torpCount: 0 | 1;
    alterVector?: { head2b: number; speed2b: number; holdcourse: number };
    missileEvade?: { speed2b: number; holdcourse: number };
    /** Vakory >75% damage: mine + jammer + flee. @see GEDROIDS.C:503-521 */
    damageFlee?: { speed2b: number; head2b: number; holdcourse: number; layMine: boolean; deployJammer: boolean };
  };
}

/**
 * @see GEDROIDS.C:410-530 droid_act_class_12
 */
export function droidActClass12(
  droid: ShipState,
  players: ShipState[],
  scanRange: number,
  alterVectorDenom: number,
  damageThreshold: number,
  pickPassiveMsg: (shipname: string, rng: Random) => string,
  pickHelpMsg: (shipname: string, rng: Random) => string,
  rng: Random,
): Class12Action {
  if (droid.jammer > 0) {
    // @see GEDROIDS.C:524-527 — jammed flee
    return {
      jammedFlee: {
        speed2b: droid.topspeed * 1000,
        holdcourse: pickHoldCourseDuration('jammed', rng),
      },
      passiveAnnoys: [],
    };
  }

  const passiveAnnoys: Array<{ target: ShipState; message: string }> = [];
  let shieldCommand: 1 | 0 | undefined;
  let detected = false;

  for (const player of players) {
    if (player.status !== 1) continue;
    if (inScanRange(droid, player, scanRange)) {
      // `ptr->tick = CYBTICKTIME + gernd()%CYBTICKTIME` — spotting a player
      // sharpens the droid's reaction time. @see GEDROIDS.C:442
      detected = true;
      shieldCommand = droid.speed < 1000.0 ? 1 : 0;
      if (rollAnnoy(DROID_ANNOY_DENOM, rng)) {
        passiveAnnoys.push({ target: player, message: pickPassiveMsg(droid.shipname, rng) });
      }
    }
  }

  // Fight-back: cantexit > 0 && lastfired > 0 (strictly >, not >=)
  // @see GEDROIDS.C:443 — ptr->lastfired > 0
  if (droid.cantexit > 0 && droid.lastfired > 0) {
    // Match on the unique channel, not `shipno`: every player's first ship is
    // shipno 1, so the droid used to fight back against whichever player
    // happened to sit first in the list rather than the one that shot it.
    // @see GEMAIN.H:340, ShipChannelRegistry
    const attackerState = players.find((p) => p.channel === droid.lastfired);
    if (attackerState) {
      const ddist = cdistance(droid, attackerState) * 10_000;
      const helpMessage = pickHelpMsg(droid.shipname, rng);

      let fireMode: 'hyper' | 'normal' | null = null;
      let torpCount: 0 | 1 = 0;
      let alterVector: { head2b: number; speed2b: number; holdcourse: number } | undefined;
      let missileEvade: { speed2b: number; holdcourse: number } | undefined;
      let damageFlee: { speed2b: number; head2b: number; holdcourse: number; layMine: boolean; deployJammer: boolean } | undefined;

      if (droid.where === 1 && attackerState.where === 1) {
        if (ddist < 30_000) fireMode = 'hyper';
      } else if (
        (droid.where === 0 && attackerState.where === 0) ||
        (droid.where === 0 && attackerState.where >= 2)
      ) {
        // Range gate — see A-001 note in droid-act-class-11.ts.
        // @see specs/022-fidelity-audit-v2/findings.md A-001
        if (droid.phasr >= PMINFIRE && attackerState.cloak !== 10 && ddist < scanRange) {
          fireMode = 'normal';
        }
        // @see GEDROIDS.C:472 — torpedo volley j=gernd()%2
        torpCount = rollVakoryTorpedoVolley(rng);
        if (droid.holdcourse === 0 && Math.floor(rng.next() * alterVectorDenom) === 1) {
          alterVector = rollAlterAttackVector(rng);
        }
      }

      // Missile evade (regardless of space type) @see GEDROIDS.C:496-499
      if (missileAttached(droid)) {
        missileEvade = {
          speed2b: rng.next() * 5_900.0 + 5_000.0,
          holdcourse: pickHoldCourseDuration('missileEvade', rng),
        };
      }

      // @see GEDROIDS.C:503-521 — >75% damage: mine + jammer + flee
      if (droid.damage > damageThreshold) {
        const layMine = Number(droid.items[11] ?? 0n) > 0; // I_MINE = 11
        const deployJammer = Number(droid.items[10] ?? 0n) > 0; // I_JAMMER = 10
        damageFlee = {
          speed2b: droid.topspeed * 1000,
          head2b: rng.next() * 359.9,
          holdcourse: pickHoldCourseDuration('flee75', rng),
          layMine,
          deployJammer,
        };
      }

      return {
        passiveAnnoys,
        shieldCommand,
        fightback: {
          target: attackerState,
          helpMessage,
          fireMode,
          ddist,
          torpCount,
          alterVector,
          missileEvade,
          damageFlee,
        },
      };
    }
  }

  return { passiveAnnoys, shieldCommand, detected };
}
