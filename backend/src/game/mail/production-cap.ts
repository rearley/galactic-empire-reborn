/**
 * The production-cap notice family — canon's `MESG08+i`.
 *
 * When a planet's stock of item `i` reaches `(long)(maxpl[i]*fact)`, C clamps
 * the stock and mails the owner one of fourteen bodies:
 *
 *   mail.class = MAIL_CLASS_PRODRPT;
 *   mail.type  = MESG08+i;
 *   mail.long1 = max;
 *
 * @see GEPLANET.C:313-326 — the trigger and the field mapping
 * @see GEFUNCS.C:2267-2283 — mailit()'s MESG08..MESG19B arm, topic "Status Message"
 */

import { NUMITEMS } from '../constants/items';

/**
 * MailStat.type for each item slot's cap notice.
 *
 * Slots 0-11 take canon's own label numbers, MESG08..MESG19. Slots 12 and 13
 * are canon's MESG19A and MESG19B — LETTERED ids, with no numeric label to
 * borrow. Continuing the run into 20 and 21 is what canon's message compiler
 * does, but this port already spends 20 on MESG20, the nightly production
 * report (midnight.constants.ts MESG20), and those rows are on disk. 190/191
 * keep both families addressable without renumbering stored mail.
 *
 * @see GE/REL/MBMGEMSG.MSG:4079-4176 — MESG08 .. MESG19B, in slot order
 */
export const PRODUCTION_CAP_MAIL_TYPES: readonly number[] = Object.freeze([
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 190, 191,
]);

/** C's `strcpy(mail.topic,"Status Message")`. @see GEFUNCS.C:2282 */
export const PRODUCTION_CAP_TOPIC = 'Status Message';

/**
 * The fourteen message bodies, one per item slot, with `%s` (canon's
 * `mail.long1`, the ceiling) substituted. Transcribed from the shipped option
 * database, joined onto one line — the port has no `.MSG` renderer.
 *
 * @see GE/REL/MBMGEMSG.MSG:4079 MESG08   men
 * @see GE/REL/MBMGEMSG.MSG:4086 MESG09   missiles
 * @see GE/REL/MBMGEMSG.MSG:4093 MESG10   torpedoes
 * @see GE/REL/MBMGEMSG.MSG:4100 MESG11   ion cannons
 * @see GE/REL/MBMGEMSG.MSG:4107 MESG12   flux pods
 * @see GE/REL/MBMGEMSG.MSG:4114 MESG13   food
 * @see GE/REL/MBMGEMSG.MSG:4121 MESG14   fighters
 * @see GE/REL/MBMGEMSG.MSG:4128 MESG15   decoys
 * @see GE/REL/MBMGEMSG.MSG:4135 MESG16   troops
 * @see GE/REL/MBMGEMSG.MSG:4142 MESG17   zippers
 * @see GE/REL/MBMGEMSG.MSG:4149 MESG18   jammers
 * @see GE/REL/MBMGEMSG.MSG:4156 MESG19   mines
 * @see GE/REL/MBMGEMSG.MSG:4163 MESG19A  gold
 * @see GE/REL/MBMGEMSG.MSG:4171 MESG19B  spies
 */
const BODIES: readonly ((n: string) => string)[] = Object.freeze([
  (n) => `The population has reached the maximum sustainable on this planet. Implementing birth control procedures. Population now ${n}.`,
  (n) => `There are no more facilities for storing missiles, the missile production has been suspended at ${n}.`,
  (n) => `There are no more facilities for storing torpedoes, the torpedo production has been suspended at ${n}.`,
  (n) => `There are no more facilities for storing ion cannons, the production has been suspended at ${n}.`,
  (n) => `There are no more facilities for storing flux pods, the production has been suspended at ${n}.`,
  (n) => `There are no more facilities for stockpiling food supplies. The production has been suspended at ${n}.`,
  (n) => `There are no more support facilities for fighters, the production has been suspended at ${n}.`,
  (n) => `There are no more facilities for storing decoys, the production has been suspended at ${n}.`,
  (n) => `There are no more facilities for housing troops, the training has been suspended at ${n} troops in active duty.`,
  (n) => `There are no more storage facilities for zippers, the production has been suspended at ${n}.`,
  (n) => `There are no more storage facilities for jammers, the production has been suspended at ${n}.`,
  (n) => `There are no more storage facilities for mines, the production has been suspended at ${n}.`,
  (n) => `There are no more storage facilities for gold, the production has been suspended at ${n}.`,
  (n) => `The PIA (Planetary Intelligence Agency) has closed enrollment for its operative training facility at ${n} agents.`,
]);

/** The item slot a cap-notice `type` refers to, or `null` if it is not one. */
export function capItemIndexForType(type: number): number | null {
  const i = PRODUCTION_CAP_MAIL_TYPES.indexOf(type);
  return i === -1 ? null : i;
}

/** Renders MESG08+`itemIndex` with the ceiling substituted for its `%s`. */
export function renderProductionCapBody(itemIndex: number, cap: bigint): string {
  if (itemIndex < 0 || itemIndex >= NUMITEMS) return `Storage is full at ${cap.toLocaleString()}.`;
  return BODIES[itemIndex](cap.toLocaleString());
}
