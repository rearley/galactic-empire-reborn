/**
 * T008 — Unit tests for mail-render.ts pure functions.
 * Snapshot-style assertions on emitted strings.
 */

import { classLabel, formatListLine, formatDetail } from '../../src/game/mail/mail-render';
import {
  MailListEntry,
  DistressSignalPayload,
  ProductionReportPayload,
  GenericPayload,
} from '../../src/game/mail/mail.types';
import { ITEM_NAMES } from '../../src/game/constants/items';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDistressEntry(overrides: Partial<MailListEntry> = {}): MailListEntry {
  const payload: DistressSignalPayload = {
    kind: 'distress_signal',
    attackerShipName: 'Black Sun',
    planetName: 'Vega',
    sectorX: 12,
    sectorY: 7,
  };
  return {
    index: 1,
    userid: 'owner1',
    class: 1,
    msgno: 100n,
    classLabel: 'Distress Signal',
    sender: 'Klingon Cmdr',
    topic: 'Black Sun',
    date: '2026-05-07',
    stamp: 1746576000,
    payload,
    ...overrides,
  };
}

function makeProductionEntry(overrides: Partial<MailListEntry> = {}): MailListEntry {
  const payload: ProductionReportPayload = {
    kind: 'production_report',
    planetName: 'Vega',
    cash: 1_250_000n,
    debt: 0n,
    tax: 87_500n,
    itemqty: Array(14).fill(0n).map((_, i) => BigInt((i + 1) * 100)),
  };
  return {
    index: 2,
    userid: 'owner1',
    class: 3,
    msgno: 200n,
    classLabel: 'Production Report',
    sender: 'Vega Council',
    topic: '',
    date: '2026-05-06',
    stamp: 1746489600,
    payload,
    ...overrides,
  };
}

function makeGenericEntry(overrides: Partial<MailListEntry> = {}): MailListEntry {
  const payload: GenericPayload = { kind: 'generic' };
  return {
    index: 3,
    userid: 'owner1',
    class: 99,
    msgno: 300n,
    classLabel: 'Message',
    sender: 'someone',
    topic: 'Hello there',
    date: '2026-05-01',
    stamp: 1746057600,
    payload,
    ...overrides,
  };
}

// ─── classLabel ──────────────────────────────────────────────────────────────

describe('classLabel', () => {
  it('returns "Distress Signal" for class 1', () => {
    expect(classLabel(1)).toBe('Distress Signal');
  });

  it('returns "Production Report" for class 3', () => {
    expect(classLabel(3)).toBe('Production Report');
  });

  it('returns "Message" for any other class', () => {
    expect(classLabel(0)).toBe('Message');
    expect(classLabel(2)).toBe('Message');
    expect(classLabel(99)).toBe('Message');
  });
});

// ─── formatListLine ───────────────────────────────────────────────────────────

describe('formatListLine', () => {
  it('includes index, class label, sender, topic, and date', () => {
    const line = formatListLine(makeDistressEntry());
    expect(line).toContain('1');
    expect(line).toContain('Distress Signal');
    expect(line).toContain('Klingon Cmdr');
    expect(line).toContain('Black Sun');
    expect(line).toContain('2026-05-07');
  });

  it('pads index to 3 chars', () => {
    const line = formatListLine(makeDistressEntry({ index: 1 }));
    expect(line.startsWith('  1')).toBe(true);
  });

  it('formats production report entry', () => {
    const line = formatListLine(makeProductionEntry());
    expect(line).toContain('Production Report');
    expect(line).toContain('Vega Council');
    expect(line).toContain('2026-05-06');
  });

  it('formats generic entry', () => {
    const line = formatListLine(makeGenericEntry());
    expect(line).toContain('Message');
    expect(line).toContain('someone');
  });
});

// ─── formatDetail — distress signal ──────────────────────────────────────────

describe('formatDetail — distress signal', () => {
  it('renders header with index and class label', () => {
    const lines = formatDetail(makeDistressEntry());
    expect(lines[0]).toBe('Message 1 — Distress Signal');
  });

  it('renders From and Date lines', () => {
    const lines = formatDetail(makeDistressEntry());
    expect(lines.some((l) => l.includes('From:') && l.includes('Klingon Cmdr'))).toBe(true);
    expect(lines.some((l) => l.includes('Date:') && l.includes('2026-05-07'))).toBe(true);
  });

  it('renders attacker ship name', () => {
    const lines = formatDetail(makeDistressEntry());
    expect(lines.some((l) => l.includes('Attacker:') && l.includes('Black Sun'))).toBe(true);
  });

  it('renders planet name and sector coords', () => {
    const lines = formatDetail(makeDistressEntry());
    expect(lines.some((l) => l.includes('Vega') && l.includes('(12, 7)'))).toBe(true);
  });
});

// ─── formatDetail — production report ────────────────────────────────────────

describe('formatDetail — production report', () => {
  it('renders header with index and class label', () => {
    const lines = formatDetail(makeProductionEntry());
    expect(lines[0]).toBe('Message 2 — Production Report');
  });

  it('renders planet name', () => {
    const lines = formatDetail(makeProductionEntry());
    expect(lines.some((l) => l.includes('Planet:') && l.includes('Vega'))).toBe(true);
  });

  it('renders cash, debt, tax', () => {
    const lines = formatDetail(makeProductionEntry());
    const financialLine = lines.find((l) => l.includes('Cash:') && l.includes('Debt:') && l.includes('Tax:'));
    expect(financialLine).toBeDefined();
    expect(financialLine).toContain('1,250,000');
    expect(financialLine).toContain('87,500');
  });

  it('renders all 14 item quantities', () => {
    const lines = formatDetail(makeProductionEntry());
    for (let i = 0; i < 14; i++) {
      const name = ITEM_NAMES[i];
      expect(lines.some((l) => l.includes(name!))).toBe(true);
    }
  });
});

// ─── formatDetail — generic fallback ─────────────────────────────────────────

describe('formatDetail — generic fallback', () => {
  it('renders header as "Message"', () => {
    const lines = formatDetail(makeGenericEntry());
    expect(lines[0]).toBe('Message 3 — Message');
  });

  it('renders Topic line with raw topic', () => {
    const lines = formatDetail(makeGenericEntry());
    expect(lines.some((l) => l.includes('Topic:') && l.includes('Hello there'))).toBe(true);
  });
});
