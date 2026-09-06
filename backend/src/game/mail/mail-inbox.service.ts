import { Injectable } from '@nestjs/common';
import { MailStat } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ShipStateService } from '../ship/ship-state.service';
import { MailInboxRepository } from './mail-inbox.repository';
import {
  DistressSignalPayload,
  SpyReportPayload,
  StarvationPayload,
  RevoltPayload,
  GenericPayload,
  MailListEntry,
  MailListing,
  ProductionReportPayload,
  ShipLossPayload,
  ProductionCapPayload,
} from './mail.types';

/** SPYM3 / SPYM4 rows. @see MAIL_TYPE_MAP in planet-attack.service.ts */
const SPY_REPORT_HELD_TYPE = 33;
const SPY_REPORT_TAKEN_TYPE = 34;
import { capItemIndexForType } from './production-cap';
import { classLabel } from './mail-render';
import { MAIL_CLASS_DISTRESS } from '../constants';
import { MAIL_CLASS_PRODRPT } from '../midnight/midnight.constants';
import { MESG_SHIPLOSS, MESG_SHIPLOSS_GRAVITY } from '../player/ship-loss-mail.service';

/**
 * Inbox business logic: listing, index resolution, and delete.
 * All methods re-query on each call (R5 — no cross-invocation state).
 * @see GEMAIN.H:531 MAILSTAT
 */
@Injectable()
export class MailInboxService {
  constructor(
    private readonly repository: MailInboxRepository,
    private readonly shipState: ShipStateService,
    private readonly prisma: PrismaService,
  ) {}

  /** Returns a sorted, annotated listing of all messages for the given userid. */
  async list(userid: string): Promise<MailListing> {
    const rows = await this.repository.findByUserid(userid);
    const entries = rows.map((row, i) => this.toEntry(row, i + 1));
    return { userid, entries, empty: entries.length === 0 };
  }

  /**
   * Re-queries and resolves a 1-based index to an entry.
   * Returns null for missing/0/negative/non-integer/out-of-range indices (FR-011).
   */
  async resolveIndex(userid: string, index: number): Promise<MailListEntry | null> {
    if (!Number.isInteger(index) || index < 1) return null;
    const listing = await this.list(userid);
    if (index > listing.entries.length) return null;
    return listing.entries[index - 1];
  }

  /**
   * Deletes the message at the given 1-based index.
   * Returns false when the index is invalid or the row is already gone (P2025 race).
   */
  async deleteByIndex(userid: string, index: number): Promise<boolean> {
    const entry = await this.resolveIndex(userid, index);
    if (!entry) return false;
    return this.repository.deleteOne(userid, entry.class, entry.msgno);
  }

  /**
   * R3 sender resolution: active ShipStateService lookup → raw dtime → "(system)".
   */
  private resolveSender(dtime: string): string {
    if (!dtime) return '(system)';
    const ships = this.shipState.findByUserid(dtime);
    return ships.length > 0 ? ships[0].shipname : dtime;
  }

  private toEntry(row: MailStat, index: number): MailListEntry {
    const date = new Date(row.stamp * 1000).toISOString().slice(0, 10);
    return {
      index,
      userid: row.userid,
      class: row.class,
      msgno: row.msgno,
      classLabel: classLabel(row.class),
      sender: this.resolveSender(row.dtime),
      topic: row.topic,
      date,
      stamp: row.stamp,
      payload: this.buildPayload(row),
    };
  }

  private buildPayload(
    row: MailStat,
  ):
    | ProductionReportPayload
    | ProductionCapPayload
    | DistressSignalPayload
    | SpyReportPayload
    | StarvationPayload
    | RevoltPayload
    | ShipLossPayload
    | GenericPayload {
    if (row.class === MAIL_CLASS_PRODRPT) {
      // MESG08+i shares this class with the nightly MESG20 report
      // (GEPLANET.C:317), so route on `type` before falling through.
      const capItem = capItemIndexForType(row.type);
      if (capItem !== null) {
        return {
          kind: 'production_cap',
          itemIndex: capItem,
          planetName: row.name1,
          sectorX: row.int1,
          sectorY: row.int2,
          cap: row.cash,
        };
      }
      return {
        kind: 'production_report',
        planetName: row.name1,
        cash: row.cash,
        debt: row.debt,
        tax: row.tax,
        itemqty: [...row.itemqty],
      };
    }
    if (row.class === MAIL_CLASS_DISTRESS
      && (row.type === MESG_SHIPLOSS || row.type === MESG_SHIPLOSS_GRAVITY)) {
      // Ship lost. name1 carries the killer — or, for a collision, the body it
      // was flown into; the sector is int1/int2. MailStat has no field for a
      // cause, so the TYPE carries it. @see ShipLossMailService
      return {
        kind: 'ship_loss',
        killer: row.name1,
        sectorX: row.int1,
        sectorY: row.int2,
        ...(row.type === MESG_SHIPLOSS_GRAVITY ? { cause: 'gravity' as const } : {}),
      };
    }
    if (row.class === MAIL_CLASS_DISTRESS
      && (row.type === SPY_REPORT_HELD_TYPE || row.type === SPY_REPORT_TAKEN_TYPE)) {
      // A spy's report on somebody else's planet. `dtime` carries the attacking
      // commander — SPYM3/SPYM4's fourth slot. @see GECMDS.C:3972-3992
      return {
        kind: 'spy_report',
        outcome: row.type === SPY_REPORT_TAKEN_TYPE ? 'taken' : 'held',
        planetName: row.name1,
        sectorX: row.int1,
        sectorY: row.int2,
        attackerUserid: row.dtime,
      };
    }
    if (row.class === MAIL_CLASS_DISTRESS && row.type === 30) {
      // Revolt (MESG30) — MailStat.cash carries the surviving garrison.
      return {
        kind: 'revolt',
        planetName: row.name1,
        sectorX: row.int1,
        sectorY: row.int2,
        troopsRemaining: row.cash,
      };
    }
    if (row.class === MAIL_CLASS_DISTRESS && (row.type === 6 || row.type === 7)) {
      // Starvation, not an attack — MailStat.topic holds a label, not a ship
      // name, and MailStat.cash holds the body count.
      return {
        kind: 'starvation',
        who: row.type === 6 ? 'troops' : 'men',
        planetName: row.name1,
        sectorX: row.int1,
        sectorY: row.int2,
        lost: row.cash,
      };
    }
    if (row.class === MAIL_CLASS_DISTRESS) {
      return {
        kind: 'distress_signal',
        attackerShipName: row.topic,
        planetName: row.name1,
        sectorX: row.int1,
        sectorY: row.int2,
      };
    }
    return { kind: 'generic' };
  }
}
