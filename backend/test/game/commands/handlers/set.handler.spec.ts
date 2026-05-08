/**
 * T031 — Unit spec for SetHandlerService.
 * Covers both options on/off, set ? listing, unknown option, bad toggle.
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
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    autoShield: false,
    autoRepair: false,
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
// auto-shield option
// ---------------------------------------------------------------------------

describe('SetHandlerService — auto-shield', () => {
  it('set auto-shield on → autoShield=true, returns SET_OK_ON (SC-007)', async () => {
    const ship = makeShip({ autoShield: false });
    const { handler } = makeService(ship);
    const result = await (handler.command.handler(ship, ['auto-shield', 'on'], {}) as Promise<{ lines: { text: string; category: string }[] }>);
    expect(ship.autoShield).toBe(true);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SET_OK_ON, 'auto-shield'));
    expect(result.lines[0].category).toBe('success');
  });

  it('set auto-shield off → autoShield=false, returns SET_OK_OFF', async () => {
    const ship = makeShip({ autoShield: true });
    const { handler } = makeService(ship);
    const result = await (handler.command.handler(ship, ['auto-shield', 'off'], {}) as Promise<{ lines: { text: string }[] }>);
    expect(ship.autoShield).toBe(false);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SET_OK_OFF, 'auto-shield'));
  });
});

// ---------------------------------------------------------------------------
// auto-repair option
// ---------------------------------------------------------------------------

describe('SetHandlerService — auto-repair', () => {
  it('set auto-repair on → autoRepair=true', async () => {
    const ship = makeShip({ autoRepair: false });
    const { handler } = makeService(ship);
    await (handler.command.handler(ship, ['auto-repair', 'on'], {}) as Promise<unknown>);
    expect(ship.autoRepair).toBe(true);
  });

  it('set auto-repair off → autoRepair=false', async () => {
    const ship = makeShip({ autoRepair: true });
    const { handler } = makeService(ship);
    await (handler.command.handler(ship, ['auto-repair', 'off'], {}) as Promise<unknown>);
    expect(ship.autoRepair).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// set ? status listing
// ---------------------------------------------------------------------------

describe('SetHandlerService — set ? listing', () => {
  it('returns status line with all 6 options (all off)', async () => {
    const ship = makeShip({ autoShield: false, autoRepair: false, scanNames: false, scanHome: false, scanFull: false, msgFilter: false });
    const { handler } = makeService(ship);
    const result = await (handler.command.handler(ship, ['?'], {}) as Promise<{ lines: { text: string; category: string }[] }>);
    expect(result.lines[0].text).toBe('auto-shield: OFF | auto-repair: OFF | scannames: OFF | scanhome: OFF | scanfull: OFF | filter: OFF');
    expect(result.lines[0].category).toBe('info');
  });

  it('returns status line with shield ON, repair OFF', async () => {
    const ship = makeShip({ autoShield: true, autoRepair: false, scanNames: false, scanHome: false });
    const { handler } = makeService(ship);
    const result = await (handler.command.handler(ship, ['?'], {}) as Promise<{ lines: { text: string }[] }>);
    expect(result.lines[0].text).toBe('auto-shield: ON | auto-repair: OFF | scannames: OFF | scanhome: OFF | scanfull: OFF | filter: OFF');
  });

  it('returns status line with both legacy flags ON', async () => {
    const ship = makeShip({ autoShield: true, autoRepair: true, scanNames: false, scanHome: false });
    const { handler } = makeService(ship);
    const result = await (handler.command.handler(ship, ['?'], {}) as Promise<{ lines: { text: string }[] }>);
    expect(result.lines[0].text).toBe('auto-shield: ON | auto-repair: ON | scannames: OFF | scanhome: OFF | scanfull: OFF | filter: OFF');
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
    const result = await (handler.command.handler(ship, ['auto-shield'], {}) as Promise<{ lines: { text: string }[] }>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SET_FMT));
    expect(mockShipState.mutate).not.toHaveBeenCalled();
  });

  it('valid option with invalid toggle value → SET_FMT', async () => {
    const ship = makeShip();
    const { handler, mockShipState } = makeService(ship);
    const result = await (handler.command.handler(ship, ['auto-shield', 'maybe'], {}) as Promise<{ lines: { text: string }[] }>);
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
