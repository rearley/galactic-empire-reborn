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
  payload: ProductionReportPayload | DistressSignalPayload | GenericPayload;
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

export interface GenericPayload {
  kind: 'generic';
}

export interface MailListing {
  userid: string;
  /** Entries in newest-first order; index field equals 1..entries.length. */
  entries: MailListEntry[];
  empty: boolean;
}
