/**
 * T015 — Unit tests for ReaHandlerService.
 * Covers all branches: production-report, distress-signal, usage, invalid-message.
 * Asserts prisma.mailStat.delete is NEVER called (FR-013).
 */

import { ReaHandlerService } from '../../src/game/commands/handlers/rea.handler';
import { MailInboxService } from '../../src/game/mail/mail-inbox.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { makeShip as baseMakeShip } from '../helpers/make-ship';
import {
  MailListing,
  MailListEntry,
  DistressSignalPayload,
  ProductionReportPayload,
} from '../../src/game/mail/mail.types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'alice',
    shipname: 'AliceShip',
    xcoord: 5.5,
    ycoord: 5.5,
    energy: 10000,
    items: Array(14).fill(0n) as bigint[],
    ...overrides,
  });
}

function makeProductionEntry(): MailListEntry {
  const payload: ProductionReportPayload = {
    kind: 'production_report',
    planetName: 'Vega',
    cash: 1_250_000n,
    debt: 0n,
    tax: 87_500n,
    itemqty: Array.from({ length: 14 }, (_, i) => BigInt((i + 1) * 100)),
  };
  return {
    index: 1,
    userid: 'alice',
    class: 3,
    msgno: 100n,
    classLabel: 'Production Report',
    sender: 'Vega Council',
    topic: '',
    date: '2026-05-06',
    stamp: 1_746_489_600,
    payload,
  };
}

function makeDistressEntry(): MailListEntry {
  const payload: DistressSignalPayload = {
    kind: 'distress_signal',
    attackerShipName: 'Black Sun',
    planetName: 'Vega',
    sectorX: 12,
    sectorY: 7,
  };
  return {
    index: 2,
    userid: 'alice',
    class: 1,
    msgno: 200n,
    classLabel: 'Distress Signal',
    sender: 'Klingon Cmdr',
    topic: 'Black Sun',
    date: '2026-05-07',
    stamp: 1_746_576_000,
    payload,
  };
}

function makeService(
  resolveResult: MailListEntry | null = null,
  listing: MailListing = { userid: 'alice', entries: [], empty: true },
) {
  const mockInbox = {
    resolveIndex: jest.fn().mockResolvedValue(resolveResult),
    list: jest.fn().mockResolvedValue(listing),
    deleteByIndex: jest.fn(),
  } as unknown as MailInboxService;

  const handler = new ReaHandlerService(mockInbox);
  return { handler, mockInbox };
}

// ─── Bare form: mailbox listing ──────────────────────────────────────────────
//
// The listing moved here from `mai`: `mai` is cmd_maint in the original table
// (GECMDS.C:144), so bare `mai` must repair, and `rea` — not a canon keyword —
// carries both halves of the port's mailbox.

describe('ReaHandlerService — bare form lists the mailbox', () => {
  it('lists messages when no args are provided', async () => {
    const entry = makeDistressEntry();
    const { handler, mockInbox } = makeService(null, {
      userid: 'alice', entries: [entry], empty: false,
    });
    const result = await handler.command.handler(makeShip(), [], {});
    expect(mockInbox.list).toHaveBeenCalledWith('alice');
    expect(result.lines.some((l) => l.text.includes('Distress Signal'))).toBe(true);
  });

  it('does not print a usage line any more', async () => {
    const { handler } = makeService(null, { userid: 'alice', entries: [], empty: true });
    const result = await handler.command.handler(makeShip(), [], {});
    expect(result.lines.some((l) => l.text.toLowerCase().includes('usage'))).toBe(false);
  });

  it('says so when the mailbox is empty', async () => {
    const { handler } = makeService(null, { userid: 'alice', entries: [], empty: true });
    const result = await handler.command.handler(makeShip(), [], {});
    const line = result.lines.find((l) => l.text.toLowerCase().includes('no mail'));
    expect(line?.category).toBe('system');
  });

  it('does NOT call resolveIndex or deleteByIndex on the bare form (FR-013)', async () => {
    const { handler, mockInbox } = makeService(null, { userid: 'alice', entries: [], empty: true });
    await handler.command.handler(makeShip(), [], {});
    expect(mockInbox.resolveIndex).not.toHaveBeenCalled();
    expect(mockInbox.deleteByIndex).not.toHaveBeenCalled();
  });
});

// ─── Invalid message ──────────────────────────────────────────────────────────

describe('ReaHandlerService — invalid message', () => {
  it('returns "Invalid message." for index 0', async () => {
    const { handler } = makeService(null);
    const result = await handler.command.handler(makeShip(), ['0'], {});
    expect(result.lines.some((l) => l.text.includes('Invalid message.'))).toBe(true);
  });

  it('returns "Invalid message." for index -1', async () => {
    const { handler } = makeService(null);
    const result = await handler.command.handler(makeShip(), ['-1'], {});
    expect(result.lines.some((l) => l.text.includes('Invalid message.'))).toBe(true);
  });

  it('returns "Invalid message." for non-numeric arg', async () => {
    const { handler } = makeService(null);
    const result = await handler.command.handler(makeShip(), ['abc'], {});
    expect(result.lines.some((l) => l.text.includes('Invalid message.'))).toBe(true);
  });

  it('returns "Invalid message." for out-of-range (resolveIndex returns null)', async () => {
    const { handler } = makeService(null);
    const result = await handler.command.handler(makeShip(), ['99'], {});
    expect(result.lines.some((l) => l.text.includes('Invalid message.'))).toBe(true);
  });

  it('invalid-message line has "system" category', async () => {
    const { handler } = makeService(null);
    const result = await handler.command.handler(makeShip(), ['99'], {});
    const line = result.lines.find((l) => l.text.includes('Invalid message.'));
    expect(line?.category).toBe('system');
  });

  it('does NOT call deleteByIndex (FR-013)', async () => {
    const { handler, mockInbox } = makeService(null);
    await handler.command.handler(makeShip(), ['1'], {});
    expect(mockInbox.deleteByIndex).not.toHaveBeenCalled();
  });
});

// ─── Production report detail ─────────────────────────────────────────────────

describe('ReaHandlerService — production report detail', () => {
  it('renders Production Report header', async () => {
    const { handler } = makeService(makeProductionEntry());
    const result = await handler.command.handler(makeShip(), ['1'], {});
    expect(result.lines.some((l) => l.text.includes('Production Report'))).toBe(true);
  });

  it('renders planet name', async () => {
    const { handler } = makeService(makeProductionEntry());
    const result = await handler.command.handler(makeShip(), ['1'], {});
    expect(result.lines.some((l) => l.text.includes('Vega'))).toBe(true);
  });

  it('renders cash, debt, tax', async () => {
    const { handler } = makeService(makeProductionEntry());
    const result = await handler.command.handler(makeShip(), ['1'], {});
    expect(result.lines.some((l) => l.text.includes('Cash:'))).toBe(true);
    expect(result.lines.some((l) => l.text.includes('Debt:'))).toBe(true);
    expect(result.lines.some((l) => l.text.includes('Tax:'))).toBe(true);
  });

  it('renders 14 item lines', async () => {
    const { handler } = makeService(makeProductionEntry());
    const result = await handler.command.handler(makeShip(), ['1'], {});
    // Production report has 14 items, each on its own line
    expect(result.lines.length).toBeGreaterThanOrEqual(5 + 14);
  });
});

// ─── Distress signal detail ───────────────────────────────────────────────────

describe('ReaHandlerService — distress signal detail', () => {
  it('renders Distress Signal header', async () => {
    const { handler } = makeService(makeDistressEntry());
    const result = await handler.command.handler(makeShip(), ['2'], {});
    expect(result.lines.some((l) => l.text.includes('Distress Signal'))).toBe(true);
  });

  it('renders attacker ship name', async () => {
    const { handler } = makeService(makeDistressEntry());
    const result = await handler.command.handler(makeShip(), ['2'], {});
    expect(result.lines.some((l) => l.text.includes('Black Sun'))).toBe(true);
  });

  it('renders sector coordinates (int1, int2)', async () => {
    const { handler } = makeService(makeDistressEntry());
    const result = await handler.command.handler(makeShip(), ['2'], {});
    expect(result.lines.some((l) => l.text.includes('(12, 7)'))).toBe(true);
  });

  it('does NOT call deleteByIndex (FR-013)', async () => {
    const { handler, mockInbox } = makeService(makeDistressEntry());
    await handler.command.handler(makeShip(), ['2'], {});
    expect(mockInbox.deleteByIndex).not.toHaveBeenCalled();
  });
});

// ─── Race-with-purge case ─────────────────────────────────────────────────────

describe('ReaHandlerService — race-with-purge', () => {
  it('returns Invalid message when resolveIndex returns null (row purged mid-session)', async () => {
    const { handler } = makeService(null); // row already gone
    const result = await handler.command.handler(makeShip(), ['1'], {});
    expect(result.lines.some((l) => l.text.includes('Invalid message.'))).toBe(true);
  });

  it('does not throw when row is purged', async () => {
    const { handler } = makeService(null);
    await expect(handler.command.handler(makeShip(), ['1'], {})).resolves.toBeDefined();
  });
});

// ─── Command registration ─────────────────────────────────────────────────────

describe('ReaHandlerService — command config', () => {
  it('keyword is "rea"', () => {
    const { handler } = makeService();
    expect(handler.command.keyword).toBe('rea');
  });

  it('has no aliases', () => {
    const { handler } = makeService();
    expect(handler.command.aliases).toHaveLength(0);
  });
});
