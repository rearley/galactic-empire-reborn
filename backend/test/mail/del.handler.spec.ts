/**
 * T019 — Unit tests for DelHandlerService.
 * Covers: success path, usage, invalid-message, race-with-purge (P2025).
 */

import { DelHandlerService } from '../../src/game/commands/handlers/del.handler';
import { MailInboxService } from '../../src/game/mail/mail-inbox.service';
import { ShipState } from '../../src/game/ship/ship-state.types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'alice', shipno: 1, shipname: 'AliceShip', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 10000,
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
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeService(deleteByIndexResult: boolean) {
  const mockInbox = {
    deleteByIndex: jest.fn().mockResolvedValue(deleteByIndexResult),
    list: jest.fn(),
    resolveIndex: jest.fn(),
  } as unknown as MailInboxService;

  const handler = new DelHandlerService(mockInbox);
  return { handler, mockInbox };
}

// ─── Usage line ───────────────────────────────────────────────────────────────

describe('DelHandlerService — usage line', () => {
  it('returns usage when no args provided', async () => {
    const { handler } = makeService(true);
    const result = await handler.command.handler(makeShip(), [], {});
    expect(result.lines.some((l) => l.text.toLowerCase().includes('usage'))).toBe(true);
  });

  it('does NOT call deleteByIndex on missing arg', async () => {
    const { handler, mockInbox } = makeService(true);
    await handler.command.handler(makeShip(), [], {});
    expect(mockInbox.deleteByIndex).not.toHaveBeenCalled();
  });
});

// ─── Invalid message ──────────────────────────────────────────────────────────

describe('DelHandlerService — invalid message', () => {
  it('returns "Invalid message." for index 0', async () => {
    const { handler } = makeService(false);
    const result = await handler.command.handler(makeShip(), ['0'], {});
    expect(result.lines.some((l) => l.text.includes('Invalid message.'))).toBe(true);
  });

  it('returns "Invalid message." for index -1', async () => {
    const { handler } = makeService(false);
    const result = await handler.command.handler(makeShip(), ['-1'], {});
    expect(result.lines.some((l) => l.text.includes('Invalid message.'))).toBe(true);
  });

  it('returns "Invalid message." for non-numeric arg', async () => {
    const { handler } = makeService(false);
    const result = await handler.command.handler(makeShip(), ['abc'], {});
    expect(result.lines.some((l) => l.text.includes('Invalid message.'))).toBe(true);
  });

  it('returns "Invalid message." for out-of-range (deleteByIndex returns false)', async () => {
    const { handler } = makeService(false);
    const result = await handler.command.handler(makeShip(), ['99'], {});
    expect(result.lines.some((l) => l.text.includes('Invalid message.'))).toBe(true);
  });

  it('invalid-message line has "system" category', async () => {
    const { handler } = makeService(false);
    const result = await handler.command.handler(makeShip(), ['99'], {});
    const line = result.lines.find((l) => l.text.includes('Invalid message.'));
    expect(line?.category).toBe('system');
  });

  it('does NOT call deleteByIndex for index 0 (handler rejects before service call)', async () => {
    const { handler, mockInbox } = makeService(false);
    await handler.command.handler(makeShip(), ['0'], {});
    expect(mockInbox.deleteByIndex).not.toHaveBeenCalled();
  });

  it('does NOT call deleteByIndex for negative index', async () => {
    const { handler, mockInbox } = makeService(false);
    await handler.command.handler(makeShip(), ['-1'], {});
    expect(mockInbox.deleteByIndex).not.toHaveBeenCalled();
  });
});

// ─── Success path ─────────────────────────────────────────────────────────────

describe('DelHandlerService — success path', () => {
  it('emits "Message N deleted." on success', async () => {
    const { handler } = makeService(true);
    const result = await handler.command.handler(makeShip(), ['2'], {});
    expect(result.lines.some((l) => l.text.includes('Message 2 deleted.'))).toBe(true);
  });

  it('success line has "success" category', async () => {
    const { handler } = makeService(true);
    const result = await handler.command.handler(makeShip(), ['2'], {});
    const line = result.lines.find((l) => l.text.includes('Message 2 deleted.'));
    expect(line?.category).toBe('success');
  });

  it('calls deleteByIndex exactly once', async () => {
    const { handler, mockInbox } = makeService(true);
    await handler.command.handler(makeShip(), ['2'], {});
    expect(mockInbox.deleteByIndex).toHaveBeenCalledTimes(1);
    expect(mockInbox.deleteByIndex).toHaveBeenCalledWith('alice', 2);
  });
});

// ─── Race-with-purge (P2025) ──────────────────────────────────────────────────

describe('DelHandlerService — race-with-purge', () => {
  it('emits "Invalid message." when deleteByIndex returns false (P2025)', async () => {
    const { handler } = makeService(false);
    const result = await handler.command.handler(makeShip(), ['1'], {});
    expect(result.lines.some((l) => l.text.includes('Invalid message.'))).toBe(true);
  });

  it('does not throw on P2025', async () => {
    const { handler } = makeService(false);
    await expect(handler.command.handler(makeShip(), ['1'], {})).resolves.toBeDefined();
  });
});

// ─── Command registration ─────────────────────────────────────────────────────

describe('DelHandlerService — command config', () => {
  it('keyword is "del"', () => {
    const { handler } = makeService(true);
    expect(handler.command.keyword).toBe('del');
  });

  it('has no aliases', () => {
    const { handler } = makeService(true);
    expect(handler.command.aliases).toHaveLength(0);
  });
});
