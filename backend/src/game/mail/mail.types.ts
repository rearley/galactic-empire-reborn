/**
 * In-memory derived types for the mail inbox feature.
 * @see GEMAIN.H:531 MAILSTAT — persistent schema
 * @see specs/017-mail-inbox/data-model.md §In-memory
 */

export interface MailListEntry {
  /** 1-based position within the current sort order. */
  index: number;
  userid: string;
  class: number;
  msgno: bigint;
  classLabel: string;
  /** Resolved sender display name (R3 fallback chain). */
  sender: string;
  topic: string;
  /** Stamp formatted as "YYYY-MM-DD". */
  date: string;
  stamp: number;
  payload:
    | ProductionReportPayload
    | ProductionCapPayload
    | DistressSignalPayload
    | SpyReportPayload
    | SpyIntelPayload
    | StarvationPayload
    | RevoltPayload
    | ShipLossPayload
    | GenericPayload;
}

export interface ProductionReportPayload {
  kind: 'production_report';
  planetName: string;
  cash: bigint;
  debt: bigint;
  tax: bigint;
  itemqty: bigint[];
}

/**
 * A planet whose stock of one item hit its ceiling — canon's MESG08+i.
 *
 * Shares MAIL_CLASS_PRODRPT with the nightly report (GEPLANET.C:317), so it is
 * `type`, not `class`, that tells the two apart.
 *
 * @see GEPLANET.C:313-326
 */
export interface ProductionCapPayload {
  kind: 'production_cap';
  /** Item slot 0-13 — the `i` in MESG08+i. */
  itemIndex: number;
  planetName: string;
  sectorX: number;
  sectorY: number;
  /** C's `mail.long1` = `max` = `(long)(maxpl[i]*fact)`. */
  cap: bigint;
}

/**
 * A planted spy's report on a planet somebody else owns.
 *
 * Canon's call_4_help sends SPYM3 (attack repelled) or SPYM4 (planet taken) to
 * `plptr->spyowner`, topic "Intelligence Report", written from the operative's
 * point of view: "Our operative on %s in sector %d %d reports that hostile
 * forces commanded by %s...". @see GECMDS.C:3972-3992
 *
 * Distinct from DistressSignalPayload because the recipient does NOT own the
 * planet — rendering the owner's body here told a spy his own colony had
 * defended itself.
 */
export interface SpyReportPayload {
  kind: 'spy_report';
  /** 'taken' = SPYM4, the planet fell. 'held' = SPYM3, the attack was repelled. */
  outcome: 'taken' | 'held';
  planetName: string;
  sectorX: number;
  sectorY: number;
  /** SPYM3/SPYM4's fourth slot — `warsptr->userid`, the attacking commander. */
  attackerUserid: string;
}

/**
 * The periodic inventory report a planted spy files — canon's SPYM2.
 *
 * The count is deliberately INEXACT: canon deviates it either side by a random
 * amount bounded by `confidence`, and the message states that confidence
 * outright. @see GEPLANET.C:149-186
 */
export interface SpyIntelPayload {
  kind: 'spy_intel';
  planetName: string;
  sectorX: number;
  sectorY: number;
  itemIndex: number;
  /** The reported figure — not the true stock. */
  reportedQty: bigint;
  /** Stated accuracy, 50-98%. */
  confidence: number;
}

export interface DistressSignalPayload {
  kind: 'distress_signal';
  /** Attacker ship name stored in MailStat.topic at time of attack. */
  attackerShipName: string;
  /** Planet name stored in MailStat.name1. */
  planetName: string;
  sectorX: number;
  sectorY: number;
}

/**
 * A colony that ran out of food. Distinct from an attack: nobody fired on it,
 * so rendering `topic` as an attacker name would be a lie.
 *
 * @see GEPLANET.C:211 MESG06 (troops) / :246 MESG07 (men)
 */
export interface StarvationPayload {
  kind: 'starvation';
  /** 'troops' | 'men' — which population died. */
  who: 'troops' | 'men';
  planetName: string;
  sectorX: number;
  sectorY: number;
  lost: bigint;
}

/**
 * The colony threw its owner out. Not an attack — no ship was involved — so it
 * needs its own shape rather than borrowing the attacker field.
 *
 * @see GEPLANET.C:368 MESG30
 */
export interface RevoltPayload {
  kind: 'revolt';
  planetName: string;
  sectorX: number;
  sectorY: number;
  /** Garrison left after the uprising. */
  troopsRemaining: bigint;
}

/**
 * A ship destroyed while its captain was logged off.
 *
 * PORT-ORIGINAL. Canon has no ship-loss mail because it needs none — `warhupa`
 * removes a hung-up ship from the universe (GEMAIN.C:1398-1440), so it cannot
 * be shot. Our persistent world creates the event; the shape follows canon's
 * own distress mails, which exist to report what happened to your property on
 * the server's clock rather than yours.
 *
 * @see ShipLossMailService
 */
export interface ShipLossPayload {
  kind: 'ship_loss';
  /** Who destroyed it — a commander, an automaton, or an unknown assailant. */
  killer: string;
  sectorX: number;
  sectorY: number;
  /**
   * What ended the ship, when it was not another captain.
   *
   * Canon credits nobody for a collision — `ptr->damage = 101.0`
   * (GEFUNCS.C:887) sets no `lastfired`, and killem's attribution block is
   * guarded on `who >= 0` (GEFUNCS.C:1105). But the port's mail has to SAY
   * something, and saying "an unknown assailant" for a pilot who flew into a
   * planet invents an enemy out of a fact the server knew exactly.
   *
   * Absent for an ordinary ship-vs-ship kill, where `killer` is the answer.
   * Self-destruct is NOT listed: the `des` countdown is not implemented (it
   * survives only as a comment in ship-tick.service.ts), so a branch for it
   * would be unreachable code with a passing test implying coverage.
   */
  cause?: 'gravity';
}

export interface GenericPayload {
  kind: 'generic';
}

export interface MailListing {
  userid: string;
  /** Entries in newest-first order; index field equals 1..entries.length. */
  entries: MailListEntry[];
  empty: boolean;
}
