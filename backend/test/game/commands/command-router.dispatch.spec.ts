/**
 * T050 — Router dispatch integration test.
 * Exercises every new keyword (cloak, maint, transfer, jettison, set, destruct, abort, abandon)
 * and their aliases, plus unknown-keyword and insufficient-args branches (SC-007).
 * @see command-router.service.ts
 * @see specs/013-ship-management/tasks.md T050
 */
import { CommandRouterService } from '../../../src/game/commands/command-router.service';
import { CloakHandlerService } from '../../../src/game/commands/handlers/cloak.handler';
import { MaintHandlerService } from '../../../src/game/commands/handlers/maint.handler';
import { TransferHandlerService } from '../../../src/game/commands/handlers/transfer.handler';
import { JettisonHandlerService } from '../../../src/game/commands/handlers/jettison.handler';
import { SetHandlerService } from '../../../src/game/commands/handlers/set.handler';
import { DestructHandlerService } from '../../../src/game/commands/handlers/destruct.handler';
import { AbortHandlerService } from '../../../src/game/commands/handlers/abort.handler';
import { AbandonHandlerService } from '../../../src/game/commands/handlers/abandon.handler';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { CLOAK_ENERGY_USE_DEFAULT } from '../../../src/game/commands/cloak.config';

// ---------------------------------------------------------------------------
// Ship factory
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 10, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 10, // in orbit (needed for maint)
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false,
    dirty: false,
    autoShield: false,
    autoRepair: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Harness — build a router with all 8 new handlers registered
// ---------------------------------------------------------------------------

function buildRouter() {
  const ship = makeShip();

  // Common mocks
  const mockShipState = {
    findAllShips: jest.fn().mockReturnValue([ship]),
    mutate: jest.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        fn(ship);
        return ship;
      },
    ),
    removeFromGame: jest.fn(),
  } as unknown as ShipStateService;

  const mockPlanet = {
    get: jest.fn().mockReturnValue({ items: [{ qty: 50_000n }] }),
  } as unknown as PlanetStateService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ cash: 100_000n }),
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;

  const router = new CommandRouterService();

  router.register(new CloakHandlerService(mockShipState, CLOAK_ENERGY_USE_DEFAULT).command);
  router.register(new MaintHandlerService(mockShipState, mockPlanet, mockPrisma).command);
  router.register(new TransferHandlerService(mockShipState).command);
  router.register(new JettisonHandlerService(mockShipState).command);
  router.register(new SetHandlerService(mockShipState).command);
  router.register(new DestructHandlerService(mockShipState).command);
  router.register(new AbortHandlerService(mockShipState).command);
  router.register(new AbandonHandlerService(mockShipState).command);

  return { router, ship };
}

// ---------------------------------------------------------------------------
// Keyword reachability — every handler responds (not UNKNOWN_CMD)
// ---------------------------------------------------------------------------

describe('command router dispatch — new keywords reach their handlers', () => {
  it('cloak on → CLOAK_ENGAGED (keyword)', async () => {
    const { router, ship } = buildRouter();
    const result = await Promise.resolve(router.dispatch('cloak on', ship, {})) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.CLOAK_ENGAGED));
  });

  it('clo on → CLOAK_ENGAGED (alias)', async () => {
    const { router, ship } = buildRouter();
    const result = await Promise.resolve(router.dispatch('clo on', ship, {})) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.CLOAK_ENGAGED));
  });

  it('set ? → SET_STATUS', async () => {
    const { router, ship } = buildRouter();
    const result = await Promise.resolve(router.dispatch('set ?', ship, {})) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SET_STATUS, 'OFF', 'OFF'));
  });

  it('destruct → DESTRUCT_START (keyword, not NZ)', async () => {
    const { router, ship } = buildRouter();
    const result = await Promise.resolve(router.dispatch('destruct', ship, {})) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.DESTRUCT_START));
  });

  it('des → DESTRUCT_START (alias)', async () => {
    const { router, ship } = buildRouter();
    const result = await Promise.resolve(router.dispatch('des', ship, {})) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.DESTRUCT_START));
  });

  it('abort with active countdown → ABORT_OK (keyword)', async () => {
    const { router, ship } = buildRouter();
    ship.destruct = 10;
    const result = await Promise.resolve(router.dispatch('abort', ship, {})) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABORT_OK));
  });

  it('abo with active countdown → ABORT_OK (alias)', async () => {
    const { router, ship } = buildRouter();
    ship.destruct = 5;
    const result = await Promise.resolve(router.dispatch('abo', ship, {})) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABORT_OK));
  });

  it('abandon → ABANDON_OK (keyword)', async () => {
    const { router, ship } = buildRouter();
    const result = await Promise.resolve(router.dispatch('abandon', ship, {})) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABANDON_OK, ship.shipname));
  });
});

describe('command router dispatch — transfer and jettison (minArgs gate)', () => {
  it('transfer with fewer than 3 args → TRAN_FMT (argMissingMessage)', async () => {
    const { router, ship } = buildRouter();
    const result = await Promise.resolve(router.dispatch('transfer 10 food', ship, {})) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TRAN_FMT));
  });

  it('jettison with fewer than 2 args → JET_FMT (argMissingMessage)', async () => {
    const { router, ship } = buildRouter();
    const result = await Promise.resolve(router.dispatch('jettison 10', ship, {})) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JET_FMT));
  });

  it('transfer alias "tra" → TRAN_FMT on insufficient args', async () => {
    const { router, ship } = buildRouter();
    const result = await Promise.resolve(router.dispatch('tra', ship, {})) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TRAN_FMT));
  });

  it('jettison alias "jet" → JET_FMT on insufficient args', async () => {
    const { router, ship } = buildRouter();
    const result = await Promise.resolve(router.dispatch('jet', ship, {})) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JET_FMT));
  });

  it('maint alias "mai" → reaches maint handler (not UNKNOWN_CMD)', async () => {
    const { router, ship } = buildRouter();
    const result = await Promise.resolve(router.dispatch('mai', ship, {})) as { lines: { text: string }[] };
    // ship.where=10 (orbit), damage=10, NZ test needs planet mock — expect maint message family
    const text = result.lines[0].text;
    expect(text).not.toBe(formatMessage(MessageId.UNKNOWN_CMD));
  });

  it('abandon alias "aba" → reaches abandon handler', async () => {
    const { router, ship } = buildRouter();
    ship.status = 1;
    const result = await Promise.resolve(router.dispatch('aba', ship, {})) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABANDON_OK, 'Test'));
  });
});

describe('command router dispatch — unknown command', () => {
  it('completely unknown command → UNKNOWN_CMD', async () => {
    const { router, ship } = buildRouter();
    const result = await Promise.resolve(router.dispatch('xyzzy', ship, {})) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.UNKNOWN_CMD));
  });

  it('empty input → empty lines array', async () => {
    const { router, ship } = buildRouter();
    const result = await Promise.resolve(router.dispatch('', ship, {})) as { lines: unknown[] };
    expect(result.lines).toHaveLength(0);
  });
});
