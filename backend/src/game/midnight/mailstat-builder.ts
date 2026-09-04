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
import { UNIVMAX } from '../constants';

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


/**
 * A deterministic message number for one planet's production report on one day.
 *
 * This used to be `Date.now() + loopIndex`, so a second midnight run for the
 * same day inserted a whole fresh set of reports. Five nights in round 5 left
 * one player with 36 copies of the same report, burying their real distress
 * mail — and it broke the project's own rule that running midnight twice must
 * produce identical results.
 *
 * The key is the day ordinal times a stride, plus the planet's own identity.
 * The loop index is NOT usable as identity: the phase-2 planet query carries no
 * `orderBy`, so row order is not stable between runs.
 *
 * Layout, and why:
 *   msgno = dayOrdinal * PLANET_KEY_STRIDE + planetKey
 *   planetKey = ((xsect + UNIVMAX) * SPAN + (ysect + UNIVMAX)) * 16 + plnum
 *
 * Multiplying the x offset by SPAN (not adding) keeps (3,-7) and (-7,3)
 * distinct. The stride exceeds every possible planetKey, so msgno stays
 * strictly increasing across days — which the mailbox depends on, since it
 * lists by msgno DESC and yesterday's last planet must not outrank today's
 * first.
 *
 * @see GEMAIN.C:1120-1170 phase-2 planet walk
 */
const SPAN = UNIVMAX * 2 + 1;
const PLANET_KEY_STRIDE = BigInt(SPAN * SPAN * 16);

export function productionMailMsgno(
  runDate: Date,
  planet: { xsect: number; ysect: number; plnum: number },
): bigint {
  const dayOrdinal = BigInt(Math.floor(runDate.getTime() / 86_400_000));
  const cell = (planet.xsect + UNIVMAX) * SPAN + (planet.ysect + UNIVMAX);
  const planetKey = BigInt(cell * 16 + planet.plnum);
  return dayOrdinal * PLANET_KEY_STRIDE + planetKey;
}
