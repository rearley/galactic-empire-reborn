/**
 * `droid_annoy` message pools, partitioned by droid class and variant.
 *
 * The text is CANON, generated from the 3.2e shipped message file into
 * ./droid-annoy-catalog.generated.ts and pinned against the original by
 * backend/test/balance/ai-taunt-canon.balance.spec.ts. Do not hand-edit it.
 *
 * `droid_annoy` differs from `cyb_annoy`: it is handed literal message ids
 * rather than computing a base from the ship class, so the slices below are
 * exactly the [first,last] pairs at the five call sites.
 *
 *   class 31 Lydorian Garbage Scow  -> droid_act_class_10
 *     droid_annoy(ptr,zothusn,4,DRDMSG6,DRDMSG6)      GEDROIDS.C:279
 *     (a single message, and no fight-back branch at all)
 *
 *   class 32 Murdonian Transport    -> droid_act_class_11
 *     droid_annoy(ptr,zothusn,4,DRDMSG11,DRDMSG15)    GEDROIDS.C:336
 *     droid_annoy(ptr,zothusn,4,DRDHLP11,DRDHLP15)    GEDROIDS.C:346
 *
 *   class 33 Vakory Survey Drone    -> droid_act_class_12
 *     droid_annoy(ptr,zothusn,4,DRDMSG1,DRDMSG5)      GEDROIDS.C:441
 *     droid_annoy(ptr,zothusn,4,DRDHLP1,DRDHLP5)      GEDROIDS.C:453
 *
 * The class-to-function binding is by typename in canon
 * (GEDROIDS.C:203-210), and MBMGESHP.MSG S31NAME/S32NAME/S33NAME give
 * Lydorian Garbage Scow / Murdonian Transport / Vakory Survey Drone.
 *
 * DRDMSG7..DRDMSG10 exist in the message file but no call site references
 * them; they are deliberately absent here.
 *
 * @see GEDROIDS.C:232-245 droid_annoy
 */

import type { Random } from '../combat/random.port';
import { DRD_ANNOY } from './droid-annoy-catalog.generated';

/** Build a contiguous slice of the canon catalogue by mnemonic. */
function slice(prefix: 'DRDMSG' | 'DRDHLP', first: number, last: number): readonly string[] {
  const out: string[] = [];
  for (let n = first; n <= last; n += 1) {
    const msg = DRD_ANNOY[`${prefix}${n}`];
    if (msg === undefined) throw new Error(`missing canon message ${prefix}${n}`);
    out.push(msg);
  }
  return out;
}

/** %s is substituted with the droid's shipname at emit time — prfmsg(..., ptr->shipname). */

// ── Vakory Survey Drone (33) — passive beacon, DRDMSG1..5 ────────────────────
const VAKORY_PASSIVE = slice('DRDMSG', 1, 5);

// ── Vakory Survey Drone (33) — fight-back hail, DRDHLP1..5 ───────────────────
const VAKORY_HELP = slice('DRDHLP', 1, 5);

// ── Lydorian Garbage Scow (31) — passive beacon, DRDMSG6 (single) ────────────
const SCOW_PASSIVE = slice('DRDMSG', 6, 6);

// ── Murdonian Transport (32) — passive beacon, DRDMSG11..15 ──────────────────
const MURDONIAN_PASSIVE = slice('DRDMSG', 11, 15);

// ── Murdonian Transport (32) — fight-back hail, DRDHLP11..15 ─────────────────
const MURDONIAN_HELP = slice('DRDHLP', 11, 15);

type DroidVariant = 'passive' | 'help';

/**
 * Pick a random annoy message from the pool for the given class and variant.
 *
 *   prfmsg(first + gernd()%(last-first+1), ptr->shipname)
 *
 * @param classNumber  31 = Scow, 32 = Murdonian, 33 = Vakory
 * @param variant      'passive' | 'help'
 * @param shipname     Substituted for %s in the message
 * @param rng          Seeded PRNG for deterministic tests
 * @see GEDROIDS.C:241 droid_annoy
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
  // The Scow has no fight-back branch in canon — droid_act_class_10 never
  // inspects `cantexit` — so it has no help family to draw from.
  if (classNumber === 31) return SCOW_PASSIVE;
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
