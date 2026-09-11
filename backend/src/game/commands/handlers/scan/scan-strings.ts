import { MessageId } from '../../messages';
import { cbearing } from '../../../physics/physics-math';

/**
 * Convert raw speed units to a display string for the side panel.
 * - speed === 0            → 'Stopped'
 * - speed > 0 && < 1000   → 'Impulse'
 * - speed >= 1000          → 'Warp X.Y'  (e.g. 4500 → 'Warp 4.5')
 *
 * @see GECMDS.C:3019 printmapfull — speed formatting
 */

/**
 * The port's own Stopped/Impulse/Warp wording. Canon's side panel uses
 * `showarp` (GECMDS.C:3061), which is why this is no longer called from the
 * scan row — kept only for callers that genuinely want the prose form.
 */
export function showarpDisplay(speed: number): string {
  if (speed === 0) return 'Stopped';
  if (speed < 1000) return 'Impulse';
  return `Warp ${(speed / 1000).toFixed(1)}`;
}

/** Environment string table indexed by `enviorn` (0..3). @see GECMDS.C:2338-2349 */
export const ENV_STRINGS = [
  MessageId.SCAN12, // 0 — Inferno-like (worst)
  MessageId.SCAN13, // 1 — Toxic
  MessageId.SCAN14, // 2 — Hostile
  MessageId.SCAN15, // 3 — Earth-like (best)
] as const;

/** Resource string table indexed by `resource` (0..3). @see GECMDS.C:2351-2356 */
export const RES_STRINGS = [
  MessageId.SCAN12, // 0 — Barren (C reuses one table for both axes)
  MessageId.SCAN13, // 1 — Sparse
  MessageId.SCAN14, // 2 — Rich
  MessageId.SCAN15, // 3 — Abundant
] as const;

/**
 * The reconnaissance strings a NON-owner sees on `sca pl <n>`.
 *
 * These are SCAN28..SCAN34 in MBMGEMSG.MSG:3637-3390, filled from `gechrbuf`
 * words that the C builds inline (GECMDS.C:2377-2448). They are not in
 * `messages.ts` because that file is frozen this run and never carried these
 * ids — see the report; they belong there.
 *
 * Spelling is the original's: "Sparsly" and "Moderatly" are how the shipped
 * binary printed them (GECMDS.C:2381, 2387).
 */
/** Fill `%s` in a raw canon template. `formatMessage` only takes MessageIds. */
export function fmt(template: string, arg: string): string {
  return template.replace('%s', arg);
}

export const SCAN28_POPULATED = '%s Populated';
export const SCAN29_MISSILES = '%s stockpile of missiles';
export const SCAN30_TORPEDOES = '%s stockpile of torpedoes.';
export const SCAN31_NO_FIGHTERS = 'No sign of fighters anywhere.';
export const SCAN32_FIGHTERS = 'There are indications of fighters.';
export const SCAN33_FLUXPODS = '%s stockpile of fluxpods.';
export const SCAN34_FOOD = '%s stockpile of food.';
/**
 * SCANWRM / SCANWRM1 — GE/REL/MBMGEMSG.MSG:3676, 3676.
 *
 * Canon indents both with a leading space; we drop it to match the SCAN08/09/10
 * siblings above, which the port already renders unindented.
 */
export const SCANWRM = 'Object Class: Wormhole';
export const SCANWRM1 = 'Named: %s';

/**
 * Population band for the non-owner readout: men + troops, six bands.
 * @see GECMDS.C:2378-2392
 */
export function populationBand(total: bigint): string {
  if (total === 0n) return 'Not';
  if (total < 2500n) return 'Sparsly';
  if (total < 10000n) return 'Lightly';
  if (total < 100000n) return 'Moderatly';
  if (total < 1000000n) return 'Widely';
  return 'Heavily';
}

/**
 * Stockpile band for the non-owner readout — the same four words for missiles,
 * torpedoes, fluxpods and food.
 * @see GECMDS.C:2395-2404 (and the three identical ladders that follow)
 */
export function stockpileBand(qty: bigint): string {
  if (qty === 0n) return 'No';
  if (qty < 25n) return 'Small';
  if (qty < 100n) return 'Moderate';
  return 'Large';
}

/**
 * Canon indexes ONE table for both axes — SCAN12..SCAN15, Poor/Marginal/Good/
 * Very Good (GECMDS.C:2338-2356). A third hardcoded table lived here with the
 * comment "the original uses separate text for resources vs environment",
 * which is not true, and it showed: an owner's scan printed canon's word for
 * environment and ours for resources in the same block —
 *
 *   Environment:Good        <- SCAN14, canon
 *   Resources: Abundant     <- ours
 *
 * The words are axis-neutral on purpose, because they have to serve both.
 */
export const QUALITY = [MessageId.SCAN12, MessageId.SCAN13, MessageId.SCAN14, MessageId.SCAN15] as const;

/**
 * Relative bearing from a ship to a point, in whole degrees, 0 = dead ahead.
 *
 * @see GEFUNCS.C cbearing(from, to, heading)
 */
export function relativeBearing(
  ship: { xcoord: number; ycoord: number; heading: number },
  target: { xcoord: number; ycoord: number },
): number {
  // Delegates to the shared cbearing so scans report the SIGNED -180..180
  // bearing the original does. This used to fold to 0..359, which made every
  // target off the port bow print a value `pha` and `rot` reject outright.
  // @see GELIB.C:142-166
  return Math.round(cbearing(ship, target, ship.heading));
}
