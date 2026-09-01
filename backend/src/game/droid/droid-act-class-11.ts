/**
 * Murdonian Transport (class 32) decision tree.
 * Pure function — receives current state; returns action descriptor.
 * Caller applies mutations and fires weapons.
 *
 * @see GEDROIDS.C:302 droid_act_class_11
 */

import type { ShipState } from '../ship/ship-state.types';
import type { Random } from '../combat/random.port';
import {
  rollAnnoy,
  rollConfuseHeading,
  pickHoldCourseDuration,
  missileAttached,
} from './droid-decisions';
import { DROID_ANNOY_DENOM, PMINFIRE } from '../constants';
import { cdistance, inScanRange } from '../combat/combat-math';

export interface Class11Action {
  /** Set when jammed */
  jammedFlee?: { speed2b: number; holdcourse: number };
  /** Speed adjustment during scan (not on holdcourse) */
  scanSpeed?: number;
  /** Shield command from scan loop: 1=up, 0=down */
  shieldCommand?: 1 | 0;
  /** Passive annoys from scan range */
  passiveAnnoys: Array<{ target: ShipState; message: string }>;
  /** A player came into scan range — shortens the droid's countdown. @see GEDROIDS.C:335 */
  detected?: boolean;
  /** Fight-back branch (cantexit > 0 && lastfired >= 0) */
  fightback?: {
    target: ShipState;
    helpMessage: string;
    /** 'hyper' = firehp in hyperspace, 'normal' = firep in normal space, null = no fire */
    fireMode: 'hyper' | 'normal' | null;
    ddist: number;
    /** Confuse heading change (normal space only, 1-in-10 roll) */
    confuse?: { head2b: number; speed2b: number; holdcourse: number };
    /** Missile-evade exit hyperspace (when in hyperspace and missiles locked) */
    hypEvade?: { speed2b: number; holdcourse: number };
    /** Raise shields when not evading in hyperspace */
    raiseShields?: boolean;
  };
}

/**
 * @see GEDROIDS.C:302-404 droid_act_class_11
 */
export function droidActClass11(
  droid: ShipState,
  players: ShipState[],
  scanRange: number,
  confuseDenom: number,
  pickPassiveMsg: (shipname: string, rng: Random) => string,
  pickHelpMsg: (shipname: string, rng: Random) => string,
  rng: Random,
): Class11Action {
  if (droid.jammer > 0) {
    // @see GEDROIDS.C:396-399 — jammed flee
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
  let scanSpeed: number | undefined;

  for (const player of players) {
    if (player.status !== 1) continue;
    if (inScanRange(droid, player, scanRange)) {
      // `if (ptr->holdcourse == 0) ptr->speed2b = rndm(999.9);` — the droid
      // drops to sub-warp the moment it sees a player, unconditionally and
      // BEFORE the separate 1-in-4 chatter roll. The port left this branch
      // empty and applied the drop only when the chatter roll landed, so three
      // times in four a spotted droid kept sailing past at warp.
      // @see GEDROIDS.C:330-331
      if (droid.holdcourse === 0) {
        scanSpeed = rng.next() * 999.9;
      }
      // `ptr->tick = CYBTICKTIME + gernd()%CYBTICKTIME` — spotting a player
      // sharpens the droid's reaction time. @see GEDROIDS.C:335
      detected = true;
      shieldCommand = droid.speed < 1000.0 ? 1 : 0;
      if (rollAnnoy(DROID_ANNOY_DENOM, rng)) {
        passiveAnnoys.push({ target: player, message: pickPassiveMsg(droid.shipname, rng) });
      }
    }
  }

  // Fight-back branch: cantexit > 0 && lastfired >= 0 (note: >=, not >)
  // @see GEDROIDS.C:338-393
  if (droid.cantexit > 0 && droid.lastfired >= 0) {
    // Match on the unique channel, not `shipno`: every player's first ship is
    // shipno 1, so the droid used to fight back against whichever player
    // happened to sit first in the list rather than the one that shot it.
    // @see GEMAIN.H:340, ShipChannelRegistry
    const attackerState = players.find((p) => p.channel === droid.lastfired);
    if (attackerState) {
      const ddist = cdistance(droid, attackerState) * 10_000;
      const helpMessage = pickHelpMsg(droid.shipname, rng);

      let fireMode: 'hyper' | 'normal' | null = null;
      let confuse: { head2b: number; speed2b: number; holdcourse: number } | undefined;
      let hypEvade: { speed2b: number; holdcourse: number } | undefined;
      let raiseShields: boolean | undefined;

      if (droid.where === 1 && attackerState.where === 1) {
        // Both in hyperspace
        if (ddist < 30_000) {
          fireMode = 'hyper';
        }
      } else if (
        (droid.where === 0 && attackerState.where === 0) ||
        (droid.where === 0 && attackerState.where >= 2)
      ) {
        // Normal space (or attacker in orbit) — only fire if attacker is within scanner range.
        // C-source `firep` relies on `pdamage` falloff at `disfact=20000+phasrtype*4000` to
        // attenuate to zero; TS `phaserDamage` falloff is broken (audit 022 C-002), so we
        // gate explicitly on scanRange (mirrors the player-side C-001 fix in
        // PhaserHandlerService and the AI-side defense-in-depth gate in droid-tick.service).
        // @see specs/022-fidelity-audit-v2/findings.md A-001
        if (droid.phasr >= PMINFIRE && attackerState.cloak !== 10 && ddist < scanRange) {
          fireMode = 'normal';
        }
        if (droid.holdcourse === 0 && Math.floor(rng.next() * confuseDenom) === 0) {
          confuse = rollConfuseHeading(rng);
        }
      }

      if (droid.where === 1) {
        // Hyperspace missile evade
        if (missileAttached(droid)) {
          hypEvade = {
            speed2b: rng.next() * 999.0,
            holdcourse: pickHoldCourseDuration('hyperEvade', rng),
          };
        }
      } else {
        raiseShields = true;
      }

      return {
        passiveAnnoys,
        shieldCommand,
        fightback: {
          target: attackerState,
          helpMessage,
          fireMode,
          ddist,
          confuse,
          hypEvade,
          raiseShields,
        },
      };
    }
  }

  return { passiveAnnoys, shieldCommand, scanSpeed, detected };
}
