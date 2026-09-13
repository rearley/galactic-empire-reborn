/**
 * T031 — Unit spec for SetHandlerService.
 * Covers the canon options, the set ? listing, unknown option and bad toggle.
 * The invented `auto-shield` / `auto-repair` options are gone; their absence is
 * pinned by set-canon-options.spec.ts.
 * @see GECMDS.C:5190 cmd_set (semantics reinterpreted — see research.md D4)
 * @see contracts/commands.md §set
 */
import { SetHandlerService } from '../../../../src/game/commands/handlers/set.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../../src/prisma/prisma.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { UserRepository } from '../../../../src/game/player/user.repository';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

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

function makeService(ship: ShipState) {
  const mockShipState = {
    mutate: vi.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        fn(ship);
        return ship;
      },
    ),
  } as unknown as ShipStateService;
  const mockPrisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ options: [] }),
      update: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  return { handler: new SetHandlerService(mockShipState, new UserRepository(mockPrisma)), mockShipState, mockPrisma };
}

// ---------------------------------------------------------------------------
// set ? status listing
// ---------------------------------------------------------------------------

describe('SetHandlerService — set ? listing', () => {
  it('lists canon\u2019s four options, all off', async () => {
    const ship = makeShip({ scanNames: false, scanHome: false, scanFull: false, msgFilter: false });
    const { handler } = makeService(ship);
    const result = await (handler.command.handler(ship, ['?'], {}) as Promise<{ lines: { text: string; category: string }[] }>);
    expect(result.lines[0].text).toBe('scannames: OFF | scanhome: OFF | scanfull: OFF | filter: OFF');
    expect(result.lines[0].category).toBe('info');
  });

  it('reflects the ones that are on', async () => {
    const ship = makeShip({ scanNames: true, scanHome: false, scanFull: true, msgFilter: false });
    const { handler } = makeService(ship);
    const result = await (handler.command.handler(ship, ['?'], {}) as Promise<{ lines: { text: string }[] }>);
    expect(result.lines[0].text).toBe('scannames: ON | scanhome: OFF | scanfull: ON | filter: OFF');
  });
});

// ---------------------------------------------------------------------------
// Rejection paths
// ---------------------------------------------------------------------------

describe('SetHandlerService — rejection paths', () => {
  it('unknown option → SET_UNKNOWN, no mutation', async () => {
    const ship = makeShip();
    const { handler, mockShipState } = makeService(ship);
    const result = await (handler.command.handler(ship, ['auto-coffee', 'on'], {}) as Promise<{ lines: { text: string }[] }>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SET_UNKNOWN));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('valid option but missing toggle arg → SET_FMT', async () => {
    const ship = makeShip();
    const { handler, mockShipState } = makeService(ship);
    const result = await (handler.command.handler(ship, ['scanfull'], {}) as Promise<{ lines: { text: string }[] }>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SET_FMT));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('valid option with invalid toggle value → SET_FMT', async () => {
    const ship = makeShip();
    const { handler, mockShipState } = makeService(ship);
    const result = await (handler.command.handler(ship, ['scanfull', 'maybe'], {}) as Promise<{ lines: { text: string }[] }>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SET_FMT));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });
});

describe('SetHandlerService — command metadata', () => {
  it('keyword is "set", no aliases, minArgs is 1', () => {
    const ship = makeShip();
    const { handler } = makeService(ship);
    expect(handler.command.keyword).toBe('set');
    expect(handler.command.aliases).toHaveLength(0);
    expect(handler.command.minArgs).toBe(1);
  });
});
