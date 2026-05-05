/**
 * Static message catalog for droid_annoy messages, partitioned by class and variant.
 * Ported from the original DRDMSG1..15 / DRDHLP1..15 / DRDMSG6 catalog.
 *
 * @see GEDROIDS.C:droid_act_class_10 — DRDMSG6 (single message, passive)
 * @see GEDROIDS.C:droid_act_class_11 — DRDMSG11..15 (passive), DRDHLP11..15 (help)
 * @see GEDROIDS.C:droid_act_class_12 — DRDMSG1..5 (passive), DRDHLP1..5 (help)
 */

import type { Random } from '../combat/random.port';

/**
 * %s in message strings is substituted with the Droid's shipname at emit time.
 * Mirror of original printf format arg (ptr->shipname).
 */

// ── Vakory Survey Drone — passive (DRDMSG1..5) ───────────────────────────────
const VAKORY_PASSIVE: readonly string[] = [
  '%s drifts past, scanning your hull...',
  '%s sweeps sensors across your vessel.',
  '%s chirps: "Scanning... scanning... fascinating."',
  '%s broadcasts a proximity warning.',
  '%s locks sensors on your ship momentarily.',
];

// ── Vakory Survey Drone — help/fight-back (DRDHLP1..5) ───────────────────────
const VAKORY_HELP: readonly string[] = [
  '%s transmits: "Hostile contact! Requesting support!"',
  '%s activates combat mode: "Defensive perimeter breached!"',
  '%s: "Under attack! Initiating countermeasures!"',
  '%s sounds battle stations: "Hull integrity compromised!"',
  '%s: "Intruder alert! All hands to combat stations!"',
];

// ── Lydorian Garbage Scow — passive (DRDMSG6, single entry) ─────────────────
const SCOW_PASSIVE: readonly string[] = [
  '%s rumbles past trailing debris.',
];

// ── Murdonian Transport — passive (DRDMSG11..15) ─────────────────────────────
const MURDONIAN_PASSIVE: readonly string[] = [
  '%s hails: "Stand clear — hazardous cargo aboard!"',
  '%s broadcasts: "Make way for Murdonian Transport!"',
  '%s transmits: "Cargo manifest sealed. Keep your distance."',
  '%s: "Do not approach. You have been warned."',
  '%s warns: "Murdonian Transport in transit. Clear the lane!"',
];

// ── Murdonian Transport — help/fight-back (DRDHLP11..15) ─────────────────────
const MURDONIAN_HELP: readonly string[] = [
  '%s: "Mayday! Mayday! Murdonian Transport under attack!"',
  '%s transmits: "We are being fired upon! Send assistance!"',
  '%s: "Hostile engagement! Convoy protection required!"',
  '%s broadcasts: "Armed escort needed! Position compromised!"',
  '%s: "Transport under fire! Requesting immediate support!"',
];

type DroidVariant = 'passive' | 'help';

/**
 * Pick a random annoy message from the pool for the given class and variant.
 * Draws uniformly from the matching slice using the injected PRNG.
 *
 * @param classNumber  31 = Scow, 32 = Murdonian, 33 = Vakory
 * @param variant      'passive' | 'help'
 * @param shipname     Substituted for %s in the message
 * @param rng          Seeded PRNG for deterministic tests
 * @see GEDROIDS.C:237 droid_annoy — first+gernd()%(last-first+1)
 */
export function pickAnnoy(
  classNumber: number,
  variant: DroidVariant,
  shipname: string,
  rng: Random,
): string {
  const pool = getPool(classNumber, variant);
  const idx = Math.floor(rng.next() * pool.length);
  return pool[idx]!.replace('%s', shipname);
}

function getPool(classNumber: number, variant: DroidVariant): readonly string[] {
  if (classNumber === 31) return SCOW_PASSIVE; // Scow has no help variant
  if (classNumber === 32) return variant === 'help' ? MURDONIAN_HELP : MURDONIAN_PASSIVE;
  if (classNumber === 33) return variant === 'help' ? VAKORY_HELP : VAKORY_PASSIVE;
  return SCOW_PASSIVE;
}

/** Exported pools for test verification. */
export const MESSAGE_POOLS = {
  VAKORY_PASSIVE,
  VAKORY_HELP,
  SCOW_PASSIVE,
  MURDONIAN_PASSIVE,
  MURDONIAN_HELP,
} as const;
