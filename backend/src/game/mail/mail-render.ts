/**
 * Pure rendering functions for the mail inbox — no side effects, no DI.
 * @see GEMAIN.H:220 MAIL_CLASS_* — class constants
 */

import { MAIL_CLASS_DISTRESS } from '../constants';
import { MAIL_CLASS_PRODRPT } from '../midnight/midnight.constants';
import { ITEM_NAMES } from '../constants/items';
import {
  MailListEntry,
  DistressSignalPayload,
  ProductionReportPayload,
} from './mail.types';

/** Returns the display label for a MailStat class value. */
export function classLabel(klass: number): string {
  if (klass === MAIL_CLASS_DISTRESS) return 'Distress Signal';
  if (klass === MAIL_CLASS_PRODRPT) return 'Production Report';
  return 'Message';
}

/** Renders a single list-view row for `mai`. */
export function formatListLine(entry: MailListEntry): string {
  const idx = entry.index.toString().padStart(3);
  const label = entry.classLabel.padEnd(18);
  const sender = entry.sender.padEnd(16);
  const topic = entry.topic.padEnd(30);
  return `${idx}  ${label} ${sender} ${topic} ${entry.date}`;
}

/**
 * Renders the detail block for `rea <index>`.
 * Returns an array of lines (no trailing newlines).
 */
export function formatDetail(entry: MailListEntry): string[] {
  const lines: string[] = [
    `Message ${entry.index} — ${entry.classLabel}`,
    `From:   ${entry.sender}`,
    `Date:   ${entry.date}`,
  ];

  if (entry.payload.kind === 'distress_signal') {
    const p = entry.payload as DistressSignalPayload;
    lines.push(`Attacker: ${p.attackerShipName}`);
    lines.push(`Planet:   ${p.planetName}   Sector: (${p.sectorX}, ${p.sectorY})`);
  } else if (entry.payload.kind === 'production_report') {
    const p = entry.payload as ProductionReportPayload;
    lines.push(`Planet: ${p.planetName}`);
    lines.push(
      `Cash:   ${p.cash.toLocaleString()}   Debt: ${p.debt.toLocaleString()}   Tax: ${p.tax.toLocaleString()}`,
    );
    for (let i = 0; i < p.itemqty.length; i++) {
      const name = ITEM_NAMES[i] ?? `Item ${i}`;
      lines.push(`  ${name}: ${p.itemqty[i].toLocaleString()}`);
    }
  } else {
    lines.push(`Topic:  ${entry.topic}`);
  }

  return lines;
}
