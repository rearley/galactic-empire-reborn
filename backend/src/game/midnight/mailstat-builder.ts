/**
 * Pure helper: construct a Prisma MailStat create-input for a planet production report.
 *
 * One row is inserted per owned planet during midnight phase 2.
 * Field mapping from GEMAIN.C:1138-1167 (tmpstat assignments).
 *
 * @see GEMAIN.C:1138-1167 — tmpstat field assignments before mailit()
 * @see specs/009-midnight-job/data-model.md — MailStat field table
 */

import { MAIL_CLASS_PRODRPT, MESG20 } from './midnight.constants';

export interface ProductionPlanet {
  userid: string;
  name: string;
  xsect: number;
  ysect: number;
  cash: bigint;
  debt: bigint;
  tax: bigint;
  itemsQty: bigint[];
}

export interface MailStatCreateData {
  userid: string;
  class: number;
  msgno: bigint;
  type: number;
  stamp: number;
  dtime: string;
  topic: string;
  name1: string;
  int1: number;
  int2: number;
  cash: bigint;
  debt: bigint;
  tax: bigint;
  itemqty: bigint[];
}

/**
 * Builds the nightly production-report MailStat row.
 *
 * `dtime` stays empty on purpose: this port repurposes it as the sender's
 * userid (spec 017 R3 — ShipStateService lookup → raw dtime → "(system)"), and
 * a production report has no sender ship. It previously held an ISO timestamp,
 * which surfaced verbatim in the `mai` From column.
 *
 * @see GEMAIN.C:1138-1167 tmpstat field assignments
 */
export function buildProductionMailStat(planet: ProductionPlanet, msgno: bigint): MailStatCreateData {
  return {
    userid: planet.userid,
    class: MAIL_CLASS_PRODRPT,
    msgno,
    type: MESG20,
    stamp: Math.floor(Date.now() / 1000),
    dtime: '',
    topic: '',
    name1: planet.name.slice(0, 25),
    int1: planet.xsect,
    int2: planet.ysect,
    cash: planet.cash,
    debt: planet.debt,
    tax: planet.tax,
    itemqty: [...planet.itemsQty],
  };
}
