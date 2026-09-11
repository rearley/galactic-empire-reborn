/**
 * T015 — Unit tests for SetHandlerService scannames/scanhome options.
 *
 * Covers:
 * - set scannames on/off: ShipState.scanNames update + User.options[0] write-through
 * - set scanhome on/off: ShipState.scanHome update + User.options[1] write-through
 * - set ? listing: all 4 options pipe-separated
 * - unknown option returns SET_UNKNOWN
 * - bogus toggle value returns SET_FMT
 * - Prisma write-through correctness
 *
 * @see GECMDS.C:5190 cmd_set (canonical — reinterpreted, see research.md D4)
 * @see contracts/scan-render.md §4
 */
import { SetHandlerService } from '../../src/game/commands/handlers/set.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { UserRepository } from '../../src/game/player/user.repository';
import { makeShip as baseMakeShip } from '../helpers/make-ship';
import type { Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    xcoord: 5,
    ycoord: 5,
    energy: 10000,
    items: Array(14).fill(0n) as bigint[],
    ...overrides,
  });
}

interface MockPrisma {
  user: {
    findUnique: Mock;
    update: Mock;
  };
}

function makeService(ship: ShipState, dbOptions: number[] = []) {
  const mockShipState = {
    mutate: vi.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        fn(ship);
        return ship;
      },
    ),
  } as unknown as ShipStateService;

  const mockPrisma: MockPrisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ options: dbOptions }),
      update: vi.fn().mockResolvedValue({}),
    },
  };

  return {
    handler: new SetHandlerService(mockShipState, new UserRepository(mockPrisma as unknown as PrismaService)),
    mockShipState,
    mockPrisma,
  };
}

// ---------------------------------------------------------------------------
// scannames option
// ---------------------------------------------------------------------------

describe('SetHandlerService — scannames option', () => {
  it('set scannames on → scanNames=true, writes User.options[0]=1', async () => {
    const ship = makeShip({ scanNames: false });
    const { handler, mockPrisma } = makeService(ship, [0, 0]);

    const result = await (handler.command.handler(ship, ['scannames', 'on'], {}) as Promise<{ lines: { text: string; category: string }[] }>);

    expect(ship.scanNames).toBe(true);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SET_OK_ON, 'scannames'));
    expect(result.lines[0].category).toBe('success');

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { userid: 'u1' },
      select: { options: true },
    });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { userid: 'u1' },
      data: { options: [1, 0] },
    });
  });

  it('set scannames off → scanNames=false, writes User.options[0]=0', async () => {
    const ship = makeShip({ scanNames: true });
    const { handler, mockPrisma } = makeService(ship, [1, 0]);

    await (handler.command.handler(ship, ['scannames', 'off'], {}) as Promise<unknown>);

    expect(ship.scanNames).toBe(false);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { userid: 'u1' },
      data: { options: [0, 0] },
    });
  });

  it('set scannames on with empty DB options array — pads and sets index 0', async () => {
    const ship = makeShip({ scanNames: false });
    const { handler, mockPrisma } = makeService(ship, []);

    await (handler.command.handler(ship, ['scannames', 'on'], {}) as Promise<unknown>);

    expect(ship.scanNames).toBe(true);
    // Should have padded the array to at least length 1 and set [0]=1
    const updateCall = mockPrisma.user.update.mock.calls[0][0] as { data: { options: number[] } };
    expect(updateCall.data.options[0]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// scanhome option
// ---------------------------------------------------------------------------

describe('SetHandlerService — scanhome option', () => {
  it('set scanhome on → scanHome=true, writes User.options[1]=1', async () => {
    const ship = makeShip({ scanHome: false });
    const { handler, mockPrisma } = makeService(ship, [0, 0]);

    const result = await (handler.command.handler(ship, ['scanhome', 'on'], {}) as Promise<{ lines: { text: string; category: string }[] }>);

    expect(ship.scanHome).toBe(true);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SET_OK_ON, 'scanhome'));
    expect(result.lines[0].category).toBe('success');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { userid: 'u1' },
      data: { options: [0, 1] },
    });
  });

  it('set scanhome off → scanHome=false, writes User.options[1]=0', async () => {
    const ship = makeShip({ scanHome: true });
    const { handler, mockPrisma } = makeService(ship, [0, 1]);

    await (handler.command.handler(ship, ['scanhome', 'off'], {}) as Promise<unknown>);

    expect(ship.scanHome).toBe(false);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { userid: 'u1' },
      data: { options: [0, 0] },
    });
  });

  it('set scanhome on with empty DB options array — pads and sets index 1', async () => {
    const ship = makeShip({ scanHome: false });
    const { handler, mockPrisma } = makeService(ship, []);

    await (handler.command.handler(ship, ['scanhome', 'on'], {}) as Promise<unknown>);

    expect(ship.scanHome).toBe(true);
    const updateCall = mockPrisma.user.update.mock.calls[0][0] as { data: { options: number[] } };
    expect(updateCall.data.options[1]).toBe(1);
  });

  it('set scanhome on with only 1 element in DB options — pads to 2 and sets index 1', async () => {
    const ship = makeShip({ scanHome: false });
    const { handler, mockPrisma } = makeService(ship, [1]);

    await (handler.command.handler(ship, ['scanhome', 'on'], {}) as Promise<unknown>);

    const updateCall = mockPrisma.user.update.mock.calls[0][0] as { data: { options: number[] } };
    expect(updateCall.data.options[0]).toBe(1); // existing value preserved
    expect(updateCall.data.options[1]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// set ? listing format
// ---------------------------------------------------------------------------

describe('SetHandlerService — set ? listing format', () => {
  it('lists canon\u2019s four options pipe-separated with correct ON/OFF values', async () => {
    const ship = makeShip({ scanNames: true, scanHome: false });
    const { handler } = makeService(ship);

    const result = await (handler.command.handler(ship, ['?'], {}) as Promise<{ lines: { text: string; category: string }[] }>);

    expect(result.lines[0].text).toBe('scannames: ON | scanhome: OFF | scanfull: OFF | filter: OFF');
    expect(result.lines[0].category).toBe('info');
  });

  it('all options off', async () => {
    const ship = makeShip({ scanNames: false, scanHome: false });
    const { handler } = makeService(ship);

    const result = await (handler.command.handler(ship, ['?'], {}) as Promise<{ lines: { text: string }[] }>);

    expect(result.lines[0].text).toBe('scannames: OFF | scanhome: OFF | scanfull: OFF | filter: OFF');
  });

  it('all options on', async () => {
    const ship = makeShip({ scanNames: true, scanHome: true, scanFull: true, msgFilter: true });
    const { handler } = makeService(ship);

    const result = await (handler.command.handler(ship, ['?'], {}) as Promise<{ lines: { text: string }[] }>);

    expect(result.lines[0].text).toBe('scannames: ON | scanhome: ON | scanfull: ON | filter: ON');
  });
});

// ---------------------------------------------------------------------------
// Rejection paths for new options
// ---------------------------------------------------------------------------

describe('SetHandlerService — rejection paths', () => {
  it('unknown option returns SET_UNKNOWN, no DB write', async () => {
    const ship = makeShip();
    const { handler, mockShipState, mockPrisma } = makeService(ship);

    const result = await (handler.command.handler(ship, ['frobnicate', 'on'], {}) as Promise<{ lines: { text: string }[] }>);

    expect(result.lines[0].text).toBe(formatMessage(MessageId.SET_UNKNOWN));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('scannames with bogus toggle value returns SET_FMT, no state change', async () => {
    const ship = makeShip({ scanNames: false });
    const { handler, mockShipState, mockPrisma } = makeService(ship);

    const result = await (handler.command.handler(ship, ['scannames', 'bogus'], {}) as Promise<{ lines: { text: string }[] }>);

    expect(result.lines[0].text).toBe(formatMessage(MessageId.SET_FMT));
    expect(ship.scanNames).toBe(false);
    expect(mockShipState.mutate).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('scanhome with bogus toggle value returns SET_FMT, no state change', async () => {
    const ship = makeShip({ scanHome: false });
    const { handler, mockShipState, mockPrisma } = makeService(ship);

    const result = await (handler.command.handler(ship, ['scanhome', 'maybe'], {}) as Promise<{ lines: { text: string }[] }>);

    expect(result.lines[0].text).toBe(formatMessage(MessageId.SET_FMT));
    expect(ship.scanHome).toBe(false);
    expect(mockShipState.mutate).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Write-through correctness — verify Prisma is called with correct values
// ---------------------------------------------------------------------------

describe('SetHandlerService — Prisma write-through correctness', () => {
  it('scannames: preserves existing options[1] when setting options[0]', async () => {
    const ship = makeShip({ scanNames: false });
    const { handler, mockPrisma } = makeService(ship, [0, 1]); // scanhome is ON in DB

    await (handler.command.handler(ship, ['scannames', 'on'], {}) as Promise<unknown>);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { userid: 'u1' },
      data: { options: [1, 1] }, // options[1] preserved as 1
    });
  });

  it('scanhome: preserves existing options[0] when setting options[1]', async () => {
    const ship = makeShip({ scanHome: false });
    const { handler, mockPrisma } = makeService(ship, [1, 0]); // scannames is ON in DB

    await (handler.command.handler(ship, ['scanhome', 'on'], {}) as Promise<unknown>);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { userid: 'u1' },
      data: { options: [1, 1] }, // options[0] preserved as 1
    });
  });

  it('an unknown option touches Prisma not at all', async () => {
    // Was "does not call Prisma for auto-shield (non-persisted option)". That
    // option was a port invention and is gone; the property that mattered —
    // a rejected option must not write — is now checked against a name canon
    // never had either.
    const ship = makeShip({});
    const { handler, mockPrisma } = makeService(ship);

    await (handler.command.handler(ship, ['auto-shield', 'on'], {}) as Promise<unknown>);

    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
