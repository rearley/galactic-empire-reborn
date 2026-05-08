/**
 * T010 — Unit tests for MaiHandlerService.
 * Covers: no-arg → inbox listing (empty + non-empty); with-arg → MaintHandlerService delegate.
 * Asserts prisma.mailStat.delete is NEVER called (FR-013).
 */

import { MaiHandlerService } from '../../src/game/commands/handlers/mai.handler';
import { MailInboxService } from '../../src/game/mail/mail-inbox.service';
import { MaintHandlerService } from '../../src/game/commands/handlers/maint.handler';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { MailListing, MailListEntry, DistressSignalPayload } from '../../src/game/mail/mail.types';
import { CommandResult } from '../../src/game/commands/command.types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'alice', shipno: 1, shipname: 'AliceShip', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 30, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeEntry(index: number): MailListEntry {
  const payload: DistressSignalPayload = {
    kind: 'distress_signal',
    attackerShipName: 'TestShip',
    planetName: 'TestPlanet',
    sectorX: 1,
    sectorY: 2,
  };
  return {
    index,
    userid: 'alice',
    class: 1,
    msgno: BigInt(index),
    classLabel: 'Distress Signal',
    sender: 'Attacker',
    topic: 'TestShip',
    date: '2026-05-07',
    stamp: 1_746_576_000,
    payload,
  };
}

function makeEmptyListing(): MailListing {
  return { userid: 'alice', entries: [], empty: true };
}

function makeNonEmptyListing(count = 2): MailListing {
  const entries = Array.from({ length: count }, (_, i) => makeEntry(i + 1));
  return { userid: 'alice', entries, empty: false };
}

// ─── Service builders ─────────────────────────────────────────────────────────

function makeServices(listing: MailListing, maintResult: CommandResult = { lines: [] }) {
  const mockInbox = {
    list: jest.fn().mockResolvedValue(listing),
    resolveIndex: jest.fn(),
    deleteByIndex: jest.fn(),
  } as unknown as MailInboxService;

  const mockMaintCommandHandler = jest.fn().mockResolvedValue(maintResult);
  const mockMaint = {
    command: { handler: mockMaintCommandHandler },
  } as unknown as MaintHandlerService;

  const handler = new MaiHandlerService(mockInbox, mockMaint);
  return { handler, mockInbox, mockMaint, mockMaintCommandHandler };
}

// ─── No-arg form: empty inbox ─────────────────────────────────────────────────

describe('MaiHandlerService — no-arg, empty inbox', () => {
  it('returns "no mail" line', async () => {
    const { handler } = makeServices(makeEmptyListing());
    const ship = makeShip();
    const result = await handler.command.handler(ship, [], {});
    expect(result.lines.some((l) => l.text.toLowerCase().includes('no mail'))).toBe(true);
  });

  it('no-mail line has "system" category', async () => {
    const { handler } = makeServices(makeEmptyListing());
    const result = await handler.command.handler(makeShip(), [], {});
    const noMailLine = result.lines.find((l) => l.text.toLowerCase().includes('no mail'));
    expect(noMailLine?.category).toBe('system');
  });

  it('does NOT call resolveIndex or deleteByIndex (FR-013)', async () => {
    const { handler, mockInbox } = makeServices(makeEmptyListing());
    await handler.command.handler(makeShip(), [], {});
    expect(mockInbox.resolveIndex).not.toHaveBeenCalled();
    expect(mockInbox.deleteByIndex).not.toHaveBeenCalled();
  });
});

// ─── No-arg form: non-empty inbox ────────────────────────────────────────────

describe('MaiHandlerService — no-arg, non-empty inbox', () => {
  it('returns header line with message count', async () => {
    const { handler } = makeServices(makeNonEmptyListing(2));
    const result = await handler.command.handler(makeShip(), [], {});
    expect(result.lines.some((l) => l.text.includes('2'))).toBe(true);
  });

  it('returns one line per entry', async () => {
    const { handler } = makeServices(makeNonEmptyListing(3));
    const result = await handler.command.handler(makeShip(), [], {});
    const contentLines = result.lines.filter((l) => l.text.match(/^\s+\d+/));
    expect(contentLines).toHaveLength(3);
  });

  it('entry lines include class label and sender', async () => {
    const { handler } = makeServices(makeNonEmptyListing(1));
    const result = await handler.command.handler(makeShip(), [], {});
    const entryLine = result.lines.find((l) => l.text.includes('Distress Signal'));
    expect(entryLine).toBeDefined();
    expect(entryLine?.text).toContain('Attacker');
  });

  it('does NOT call deleteByIndex (FR-013)', async () => {
    const { handler, mockInbox } = makeServices(makeNonEmptyListing(2));
    await handler.command.handler(makeShip(), [], {});
    expect(mockInbox.deleteByIndex).not.toHaveBeenCalled();
  });
});

// ─── With-arg form: maintenance delegation ───────────────────────────────────

describe('MaiHandlerService — with-arg (maintenance delegate)', () => {
  it('delegates to MaintHandlerService.command.handler when args present', async () => {
    const maintResult: CommandResult = { lines: [{ text: 'Maintenance OK', category: 'success' }] };
    const { handler, mockMaintCommandHandler, mockInbox } = makeServices(makeEmptyListing(), maintResult);
    const ship = makeShip();
    const result = await handler.command.handler(ship, ['mypassword'], {});
    expect(mockMaintCommandHandler).toHaveBeenCalledWith(ship, ['mypassword'], {});
    expect(result).toStrictEqual(maintResult);
    expect(mockInbox.list).not.toHaveBeenCalled();
  });

  it('passes through MaintHandlerService result unchanged', async () => {
    const maintResult: CommandResult = {
      lines: [{ text: 'Error: not in orbit', category: 'system' }],
    };
    const { handler } = makeServices(makeEmptyListing(), maintResult);
    const result = await handler.command.handler(makeShip(), ['arg1', 'arg2'], {});
    expect(result).toStrictEqual(maintResult);
  });

  it('does NOT query inbox when args present', async () => {
    const { handler, mockInbox } = makeServices(makeEmptyListing());
    await handler.command.handler(makeShip(), ['somearg'], {});
    expect(mockInbox.list).not.toHaveBeenCalled();
    expect(mockInbox.resolveIndex).not.toHaveBeenCalled();
    expect(mockInbox.deleteByIndex).not.toHaveBeenCalled();
  });
});

// ─── Command registration ─────────────────────────────────────────────────────

describe('MaiHandlerService — command config', () => {
  it('keyword is "mai"', () => {
    const { handler } = makeServices(makeEmptyListing());
    expect(handler.command.keyword).toBe('mai');
  });

  it('has no aliases', () => {
    const { handler } = makeServices(makeEmptyListing());
    expect(handler.command.aliases).toHaveLength(0);
  });
});
