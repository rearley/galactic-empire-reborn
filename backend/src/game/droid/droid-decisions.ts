/**
 * Pure-function decision helpers for the Droid AI — all randomness flows through
 * the injected Random port for deterministic test replay.
 *
 * @see GEDROIDS.C — droid_init, droid_act_class_10/11/12, missl_attached
 */

import type { Random } from '../combat/random.port';
import type { ShipState } from '../ship/ship-state.types';
import { MAXMISSL } from '../constants';
import { I_FLUX, I_DECOY, I_TORP, I_MINE, I_JAMMER, I_MISSL, I_ION, I_GOLD } from '../constants/items';

/**
 * Returns true if the annoy roll succeeds (1-in-DROID_ANNOY_DENOM).
 * @see GEDROIDS.C:237 droid_annoy — if ((gernd()%rnd) == 1)
 */
export function rollAnnoy(denom: number, rng: Random): boolean {
  return Math.floor(rng.next() * denom) === 1;
}

/**
 * Murdonian confuse branch — randomize heading, speed, hold course.
 * @see GEDROIDS.C:371-375 — rndm(10000.0), rndm(359.9), gernd()%10+3
 */
export function rollConfuseHeading(rng: Random): { head2b: number; speed2b: number; holdcourse: number } {
  return {
    speed2b: rng.next() * 10_000.0,
    head2b: rng.next() * 359.9,
    holdcourse: Math.floor(rng.next() * 10) + 3,
  };
}

/**
 * Vakory alter-attack-vector branch.
 * @see GEDROIDS.C:491-494 — rndm(5000.0), rndm(359.9), gernd()%10+3
 */
export function rollAlterAttackVector(rng: Random): { head2b: number; speed2b: number; holdcourse: number } {
  return {
    speed2b: rng.next() * 5_000.0,
    head2b: rng.next() * 359.9,
    holdcourse: Math.floor(rng.next() * 10) + 3,
  };
}

/**
 * Vakory torpedo volley size: 0 or 1.
 * @see GEDROIDS.C:472 — j = gernd()%2 → loop for i=0;i<j
 */
export function rollVakoryTorpedoVolley(rng: Random): 0 | 1 {
  return (Math.floor(rng.next() * 2) as 0 | 1);
}

/**
 * Hold-course duration based on context.
 * @see GEDROIDS.C:287 jammed scow, 398 jammed murdonian/vakory, 375 confuse, 526 jammed vakory
 */
export function pickHoldCourseDuration(
  context: 'jammed' | 'flee75' | 'missileEvade' | 'confuse' | 'alterVector' | 'hyperEvade',
  rng: Random,
): number {
  switch (context) {
    case 'jammed':
      return Math.floor(rng.next() * 50) + 10; // gernd()%50 + 10
    case 'flee75':
      return Math.floor(rng.next() * 30) + 20; // gernd()%30 + 20
    case 'missileEvade':
      return Math.floor(rng.next() * 5) + 5;   // gernd()%5 + 5
    case 'confuse':
      return Math.floor(rng.next() * 10) + 3;  // gernd()%10 + 3
    case 'alterVector':
      return Math.floor(rng.next() * 10) + 3;  // gernd()%10 + 3
    case 'hyperEvade':
      return Math.floor(rng.next() * 15) + 5;  // gernd()%15 + 5
  }
}

/**
 * Returns true if any missile slot on the given ship has distance > 0.
 * @see GEDROIDS.C:551 missl_attached — mptr->distance > 0
 */
export function missileAttached(ship: ShipState): boolean {
  for (let i = 0; i < MAXMISSL; i++) {
    if ((ship.lmisslDistance[i] ?? 0) > 0) return true;
  }
  return false;
}

/**
 * Randomized loadout for Murdonian Transport.
 * @see GEDROIDS.C:147-155 — gernd()%50, %250, %250, %100, %100, %100, %25, %250
 */
export function randomMurdonianLoadout(rng: Random): bigint[] {
  const items = new Array<bigint>(14).fill(0n);
  items[I_FLUX]  = BigInt(Math.floor(rng.next() * 50));
  items[I_DECOY] = BigInt(Math.floor(rng.next() * 250));
  items[I_TORP]  = BigInt(Math.floor(rng.next() * 250));
  items[I_MINE]  = BigInt(Math.floor(rng.next() * 100));
  items[I_JAMMER]= BigInt(Math.floor(rng.next() * 100));
  items[I_MISSL] = BigInt(Math.floor(rng.next() * 100));
  items[I_ION]   = BigInt(Math.floor(rng.next() * 25));
  items[I_GOLD]  = BigInt(Math.floor(rng.next() * 250));
  return items;
}

/**
 * Sparse loadout for Lydorian Garbage Scow and Vakory Survey Drone.
 * @see GEDROIDS.C:159-163 — gernd()%50, %25, %10, %10
 */
export function randomSparseLoadout(rng: Random): bigint[] {
  const items = new Array<bigint>(14).fill(0n);
  items[I_FLUX]  = BigInt(Math.floor(rng.next() * 50));
  items[I_DECOY] = BigInt(Math.floor(rng.next() * 25));
  items[I_MINE]  = BigInt(Math.floor(rng.next() * 10));
  items[I_JAMMER]= BigInt(Math.floor(rng.next() * 10));
  return items;
}
