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
    | DistressSignalPayload
    | StarvationPayload
    | RevoltPayload
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

export interface GenericPayload {
  kind: 'generic';
}

export interface MailListing {
  userid: string;
  /** Entries in newest-first order; index field equals 1..entries.length. */
  entries: MailListEntry[];
  empty: boolean;
}
