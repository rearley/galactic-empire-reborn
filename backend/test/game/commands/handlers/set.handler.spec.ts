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

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
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

function makeService(ship: ShipState) {
  const mockShipState = {
    mutate: jest.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        fn(ship);
        return ship;
      },
    ),
  } as unknown as ShipStateService;
  const mockPrisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ options: [] }),
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  return { handler: new SetHandlerService(mockShipState, mockPrisma), mockShipState, mockPrisma };
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
