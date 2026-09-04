/**
 * T021 — Integration test: `sca ra 5` over a mock gateway scenario.
 *
 * Verifies:
 *   - Success path: `command:result` (info line, header text only) and
 *     `scan:render` (kind='ra', full cells, correct mode) both arrive.
 *   - Failure path (docked — where >= 10): only `command:result` is emitted
 *     with a system-category line; no `scan:render`.
 *
 * Strategy: wire ScanHandlerService directly (no DB — prisma mocked), then
 * run the handler result through GameGateway.emitCommandResult to verify the
 * two-event split.
 *
 * @see GECMDS.C:2484 scan_ra
 * @see specs/015-scan-modes/tasks.md T021
 * @see specs/015-scan-modes/contracts/scan-render.md §1
 */

import { GameGateway } from '../../src/gateway/game.gateway';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { MineRegistry } from '../../src/game/combat/mine.registry';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { mockRandom } from '../fixtures/mock-random';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandResult, ScanRenderEvent } from '../../src/game/commands/command.types';
import { Socket } from 'socket.io';
import { SCAN_GRID_WIDTH, SCAN_GRID_HEIGHT } from '../../src/game/constants';

// ── helpers ──────────────────────────────────────────────────────────────────

interface EmittedCall {
  event: string;
  payload: unknown;
}

function makeMockSocket(): { socket: Socket; calls: EmittedCall[] } {
  const calls: EmittedCall[] = [];
  const socket = {
    emit: jest.fn((event: string, payload: unknown) => {
      calls.push({ event, payload });
    }),
    id: 'test-socket-id',
    data: {},
  } as unknown as Socket;
  return { socket, calls };
}

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'TestShip', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

/** Build a ScanHandlerService with mocked dependencies. */
async function makeScanService(ships: ShipState[], scanRange = 50_000) {
  const shipServiceMock = {
    findAllShips: jest.fn().mockReturnValue(ships),
    findByName: jest.fn().mockReturnValue(undefined),
    findByUserid: jest.fn().mockReturnValue([]),
  };
  const prismaMock = {
    shipClass: {
      findMany: jest.fn().mockResolvedValue([{ classNumber: 1, scanRange }]),
    },
  };
  const galaxyMock = {
    getSectorPlanets: jest.fn().mockReturnValue([]),
    getSectorWormholes: jest.fn().mockReturnValue([]),
    findPlanetByName: jest.fn().mockReturnValue(null),
  };
  const planetServiceMock = { get: jest.fn().mockReturnValue(undefined) };

  const service = new ScanHandlerService(
    shipServiceMock as unknown as ShipStateService,
    prismaMock as unknown as PrismaService,
    galaxyMock as unknown as GalaxyService,
    planetServiceMock as unknown as PlanetStateService,
    new MineRegistry(),
  );
  await service.onModuleInit();
  return service;
}

/** Build a minimal GameGateway with mocked non-scan dependencies. */
function makeGateway(scanHandler: ScanHandlerService): GameGateway {
  return new GameGateway(
    {} as unknown as ShipStateService,
    {} as unknown as CommandRouterService,
    {} as unknown as ConnectedShipsRegistry,
    {} as unknown as WsAuthGuard,
    {} as unknown as PrismaService,
    {} as unknown as OnboardingService,
    scanHandler,
    { getTypeName: jest.fn() } as never,
    mockRandom,
    { emit: jest.fn(), on: jest.fn() } as never,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('T021 — sca ra 5 gateway integration', () => {
  describe('success path: ship in flight (where=0)', () => {
    let gateway: GameGateway;
    let calls: EmittedCall[];
    let socket: Socket;
    let commandResultPayload: { lines: Array<{ text: string; category: string }> };
    let scanRenderPayload: ScanRenderEvent;

    beforeEach(async () => {
      const self = makeShip({ userid: 'player1', shipno: 1, xcoord: 10, ycoord: 7, scanHome: false, where: 0 });
      const ai = makeShip({ userid: 'ai1', shipno: 1, xcoord: 10.005, ycoord: 7, status: 2 });
      const human = makeShip({ userid: 'player2', shipno: 1, xcoord: 10.003, ycoord: 7.002, status: 0 });

      const scanService = await makeScanService([self, ai, human], 50_000);
      gateway = makeGateway(scanService);

      // Execute the handler
      const result = await (scanService.command.handler(self, ['ra', '5'], {}) as Promise<CommandResult>);

      // Push through gateway event routing
      ({ socket, calls } = makeMockSocket());
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, result);

      commandResultPayload = calls.find(c => c.event === 'command:result')!.payload as typeof commandResultPayload;
      scanRenderPayload = calls.find(c => c.event === 'scan:render')!.payload as ScanRenderEvent;
    });

    it('emits both command:result and scan:render', () => {
      const events = calls.map(c => c.event);
      expect(events).toContain('command:result');
      expect(events).toContain('scan:render');
    });

    it('command:result carries exactly one info-category line with the header text', () => {
      expect(commandResultPayload.lines).toHaveLength(1);
      expect(commandResultPayload.lines[0].category).toBe('info');
      expect(commandResultPayload.lines[0].text).toMatch(/^Range: /);
      expect(commandResultPayload.lines[0].text).toContain('— Sector 10,7');
    });

    it('scan:render kind is "ra"', () => {
      expect(scanRenderPayload.kind).toBe('ra');
    });

    it('scan:render mode is "append" (scanHome=false)', () => {
      expect(scanRenderPayload.mode).toBe('append');
    });

    it('scan:render cells array is present and non-empty', () => {
      expect(Array.isArray(scanRenderPayload.cells)).toBe(true);
      expect(scanRenderPayload.cells.length).toBeGreaterThan(0);
    });

    it('scan:render includes self-cell at centre (15,7)', () => {
      const selfCell = scanRenderPayload.cells.find(c => c.type === 'self');
      expect(selfCell).toBeDefined();
      expect(selfCell!.x).toBe(Math.floor(SCAN_GRID_WIDTH / 2));
      expect(selfCell!.y).toBe(Math.floor(SCAN_GRID_HEIGHT / 2));
      expect(selfCell!.char).toBe('*');
      expect(selfCell!.colour).toBe('self');
    });

    it('scan:render includes AI ship with colour "ai"', () => {
      const aiCells = scanRenderPayload.cells.filter(c => c.colour === 'ai');
      expect(aiCells.length).toBeGreaterThan(0);
    });

    it('scan:render includes human ship with colour "human"', () => {
      const humanCells = scanRenderPayload.cells.filter(c => c.colour === 'human');
      expect(humanCells.length).toBeGreaterThan(0);
    });

    it('scan:render header matches command:result line text', () => {
      expect(scanRenderPayload.header).toBe(commandResultPayload.lines[0].text);
    });

    it('command:result does NOT contain cells or scanRender properties', () => {
      const payload = commandResultPayload as unknown as Record<string, unknown>;
      expect(payload).not.toHaveProperty('cells');
      expect(payload).not.toHaveProperty('scanRender');
    });
  });

  describe('success path: scanHome=true → mode overwrite', () => {
    it('scan:render mode is "overwrite" when scanHome=true', async () => {
      const self = makeShip({ userid: 'player1', shipno: 1, scanHome: true, where: 0 });
      const scanService = await makeScanService([self]);
      const gateway = makeGateway(scanService);

      const result = await (scanService.command.handler(self, ['ra', '5'], {}) as Promise<CommandResult>);
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, result);

      const renderPayload = calls.find(c => c.event === 'scan:render')!.payload as ScanRenderEvent;
      expect(renderPayload.mode).toBe('overwrite');
    });
  });

  describe('in orbit (where >= 10) — canon has no gate', () => {
    // scan_ra (GECMDS.C:2484) and scan_se (:2580) test `where` nowhere; the
    // only scan-side `where` test in the file is scan_hy at :2737, inside
    // `#ifdef NOTHING`. The port's guard cited spec documents against the C,
    // and blinded a pilot for the whole time they were parked shopping.
    let calls: EmittedCall[];

    beforeEach(async () => {
      const self = makeShip({ userid: 'player1', shipno: 1, where: 10 });
      const scanService = await makeScanService([self]);
      const gateway = makeGateway(scanService);

      const result = await (scanService.command.handler(self, ['ra', '5'], {}) as Promise<CommandResult>);
      const { socket, calls: c } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, result);
      calls = c;
    });

    it('renders a scan just as it does in flight', () => {
      const events = calls.map(c => c.event);
      expect(events).toContain('command:result');
      expect(events).toContain('scan:render');
    });
  });
});
