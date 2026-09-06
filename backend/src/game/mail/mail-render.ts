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
  SpyReportPayload,
  ProductionReportPayload,
  StarvationPayload,
  RevoltPayload,
  ShipLossPayload,
  ProductionCapPayload,
} from './mail.types';
import { renderProductionCapBody } from './production-cap';

/** Returns the display label for a MailStat class value. */
export function classLabel(klass: number): string {
  if (klass === MAIL_CLASS_DISTRESS) return 'Distress Signal';
  if (klass === MAIL_CLASS_PRODRPT) return 'Production Report';
  return 'Message';
}

/** Renders a single list-view row for `rea`. */
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

  if (entry.payload.kind === 'ship_loss') {
    const p = entry.payload as ShipLossPayload;
    lines.push(`Sector:   (${p.sectorX}, ${p.sectorY})`);
    // Does NOT claim the captain was absent: the mail is written on every
    // destruction, and a pilot who was online has already seen YOURDEAD live.
    // Asserting "you were not aboard" was wrong half the time.
    if (p.cause === 'gravity') {
      lines.push(`Distress beacon recovered: your ship flew into ${p.killer}.`);
    } else {
      lines.push(`Distress beacon recovered: your ship was destroyed by ${p.killer}.`);
    }
  } else if (entry.payload.kind === 'revolt') {
    const p = entry.payload as RevoltPayload;
    lines.push(`Planet:   ${p.planetName}   Sector: (${p.sectorX}, ${p.sectorY})`);
    lines.push(
      `The colony has revolted and thrown off your rule. ${p.troopsRemaining.toLocaleString()} troops remain.`,
    );
  } else if (entry.payload.kind === 'starvation') {
    const p = entry.payload as StarvationPayload;
    const who = p.who === 'troops' ? 'troops' : 'colonists';
    lines.push(`Planet:   ${p.planetName}   Sector: (${p.sectorX}, ${p.sectorY})`);
    lines.push(`${p.lost.toLocaleString()} ${who} starved to death — the colony is out of food.`);
  } else if (entry.payload.kind === 'spy_report') {
    // The operative's own words. The reader does NOT own this planet, which is
    // why it cannot borrow the distress body below. @see GECMDS.C:3972-3992
    const p = entry.payload as SpyReportPayload;
    lines.push('Classification: TOP SECRET');
    lines.push(`Planet:   ${p.planetName}   Sector: (${p.sectorX}, ${p.sectorY})`);
    lines.push(
      p.outcome === 'taken'
        ? `Our operative reports hostile forces commanded by ${p.attackerUserid} have`
          + ' toppled the defenses and taken over the planet.'
        : `Our operative reports hostile forces commanded by ${p.attackerUserid} launched`
          + ' an attack on this planet. The outcome was unclear as of this report.',
    );
  } else if (entry.payload.kind === 'distress_signal') {
    const p = entry.payload as DistressSignalPayload;
    lines.push(`Attacker: ${p.attackerShipName}`);
    lines.push(`Planet:   ${p.planetName}   Sector: (${p.sectorX}, ${p.sectorY})`);
  } else if (entry.payload.kind === 'production_cap') {
    // MESG08+i. `topic` is "Status Message" here, not a sender, so the body
    // has to come from the item slot. @see GEPLANET.C:313-326
    const p = entry.payload as ProductionCapPayload;
    lines.push(`Planet:   ${p.planetName}   Sector: (${p.sectorX}, ${p.sectorY})`);
    lines.push(renderProductionCapBody(p.itemIndex, p.cap));
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
