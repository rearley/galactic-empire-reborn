import type { Random } from '../combat/random.port';
import {
  CYB_TAUNTS,
  CYB_TAUNT_FIRST_CLASS,
  CYB_TAUNTS_PER_CLASS,
} from './cyb-taunt-catalog.generated';

/**
 * `cyb_annoy` — Cybertron taunts.
 *
 * Release 3.2e replaced the pre-3.2d generic CYBMSG1..19 set with thirteen
 * per-class families of sixteen messages, and split each family into four
 * bands of four keyed to what the Cybertron is doing:
 *
 *   M1..M4    approaching from a distance      rnd 60   GECYBS.C:769
 *   M5..M8    braking to engage                rnd 30   GECYBS.C:782, 801
 *   M9..M12   in range, declining to attack    rnd 20   GECYBS.C:300
 *   M13..M16  attacking                        rnd 20   GECYBS.C:295
 *
 * The band comments are canon's own — MBMGEMSG.MSG annotates each group of
 * four in the CYBBASEM..CYBLASTM block ("The next four messages are displayed
 * when a cybertron attacks another player.").
 *
 * The message text itself lives in the generated catalogue, which is pinned
 * against the original file by
 * backend/test/balance/ai-taunt-canon.balance.spec.ts.
 *
 * @see GECYBS.C:382-410 cyb_annoy
 */

/** One of the four four-message bands within a class family. */
export interface CybAnnoyBand {
  /** `rnd` — the 1-in-N gate. */
  readonly odds: number;
  /** `first`, 1-based within the family. */
  readonly first: number;
  /** `last`, 1-based within the family, inclusive. */
  readonly last: number;
}

/**
 * The four call-site bands, with the odds each call site passes.
 * @see GECYBS.C:295, 300, 769, 782, 801
 */
export const CYB_ANNOY_BANDS = {
  /** cyb_annoy(ptr, low_ship, 60, 1, 4) — closing from beyond the brake band. */
  APPROACH: { odds: 60, first: 1, last: 4 },
  /** cyb_annoy(ptr, low_ship, 30, 5, 8) — braking to engage. Two call sites. */
  BRAKE: { odds: 30, first: 5, last: 8 },
  /** cyb_annoy(ptr, zothusn, 20, 9, 12) — in range but choosing not to fire. */
  DECLINE: { odds: 20, first: 9, last: 12 },
  /** cyb_annoy(ptr, zothusn, 20, 13, 16) — opening fire. */
  ATTACK: { odds: 20, first: 13, last: 16 },
} as const satisfies Record<string, CybAnnoyBand>;

export type CybAnnoyBandName = keyof typeof CYB_ANNOY_BANDS;

/**
 * Pick a taunt for this Cybertron class and situation, with `%s` already
 * replaced by the taunting ship's name (`prfmsg(sel, ptr->shipname)`).
 *
 * Selection mirrors the C exactly:
 *
 *   base = CYBBASEM + (ptr->shpclass - cyb_class) * 16
 *   sel  = (first + base) + gernd() % (last - first + 1)
 *
 * INDEX BASIS — C's `shpclass` is 0-based and `cyb_class` is the 0-based index
 * of the first CYBORG slot; our `classNumber` is 1-based and the first CYBORG
 * slot is 21. The DIFFERENCE `shpclass - cyb_class` is therefore identical in
 * both bases and no off-by-one correction is needed. Spelled out because this
 * project has shipped index-basis bugs before (see the scanRange drift).
 *
 * Returns null for a class with no family — C's `if (sel < CYBLASTM)` guard.
 * In the shipped configuration that never happens for classes 21..33.
 *
 * @see GECYBS.C:392-403
 */
export function pickTaunt(
  rand: Random,
  classNumber: number,
  band: CybAnnoyBand,
  shipname: string,
): string | null {
  const family = CYB_TAUNTS[classNumber];
  if (!family) return null;
  const span = band.last - band.first + 1;
  const offset = band.first + Math.floor(rand.next() * span); // 1-based M-number
  if (offset < 1 || offset > CYB_TAUNTS_PER_CLASS) return null;
  const msg = family[offset - 1];
  if (msg === undefined) return null;
  return msg.replace('%s', shipname);
}

/** Reverse-lookup a band's name, for the taunt payload's observability field. */
export function bandName(band: CybAnnoyBand): CybAnnoyBandName {
  for (const [name, b] of Object.entries(CYB_ANNOY_BANDS)) {
    if (b.first === band.first && b.last === band.last) return name as CybAnnoyBandName;
  }
  return 'ATTACK';
}

export { CYB_TAUNTS, CYB_TAUNT_FIRST_CLASS };
