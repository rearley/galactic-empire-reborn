/**
 * T026 — Integration test: `sca se` over a mock gateway scenario.
 *
 * Verifies:
 *   - Round-trip `sca se`: `command:result` (info line, header) and `scan:render`
 *     (kind='se', cells, correct mode) both arrive.
 *   - Header format is "Sector <x>,<y>".
 *   - Letters assigned in a preceding `sca ra` call are preserved in `sca se`
 *     (shared scantab cross-mode stickiness).
 *   - Failure path (docked — where >= 10): only `command:result` with system line.
 *
 * @see GECMDS.C:2562 scan_se
 * @see specs/015-scan-modes/tasks.md T026
 * @see specs/015-scan-modes/contracts/scan-render.md §1
 */

import { GameGateway } from '../../src/gateway/game.gateway';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { MineRegistry } from '../../src/game/combat/mine.registry';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandResult, ScanRenderEvent } from '../../src/game/commands/command.types';
import { Socket } from 'socket.io';
import { SCAN_GRID_WIDTH, SCAN_GRID_HEIGHT } from '../../src/game/constants';
import { makeGateway as makeTestGateway } from '../helpers/make-gateway';

// ── helpers ───────────────────────────────────────────────────────────────────

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
    xcoord: 10.5, ycoord: 7.5, damage: 0, energy: 50000,
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
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

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

function makeGateway(scanHandler: ScanHandlerService): GameGateway {
  return makeTestGateway({ scanHandler });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('T026 — sca se gateway integration', () => {
  describe('success path: ship in flight (where=0)', () => {
    let gateway: GameGateway;
    let calls: EmittedCall[];
    let commandResultPayload: { lines: Array<{ text: string; category: string }> };
    let scanRenderPayload: ScanRenderEvent;

    const SELF_X = 10.5;
    const SELF_Y = 7.5;
    const XSECT = Math.floor(SELF_X);  // 10
    const YSECT = Math.floor(SELF_Y);  // 7

    beforeEach(async () => {
      const self = makeShip({ userid: 'player1', shipno: 1, xcoord: SELF_X, ycoord: SELF_Y, scanHome: false, where: 0 });
      // AI ship in the same sector
      const ai = makeShip({ userid: 'ai1', shipno: 1, xcoord: 10.2, ycoord: 7.2, status: 2 });
      // Human ship in the same sector
      const human = makeShip({ userid: 'player2', shipno: 1, xcoord: 10.8, ycoord: 7.8, status: 0 });
      // Ship in a different sector — should NOT appear
      const outsider = makeShip({ userid: 'player3', shipno: 1, xcoord: 11.5, ycoord: 7.5, status: 0 });

      const scanService = await makeScanService([self, ai, human, outsider], 50_000);
      gateway = makeGateway(scanService);

      const result = await (scanService.command.handler(self, ['se'], {}) as Promise<CommandResult>);

      const { socket, calls: c } = makeMockSocket();
      calls = c;
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
      expect(commandResultPayload.lines[0].text).toBe(`   Sector Scan mag:1x (s:${XSECT} ${YSECT})`);
    });

    it('scan:render kind is "se"', () => {
      expect(scanRenderPayload.kind).toBe('se');
    });

    it('scan:render mode is "append" (scanHome=false)', () => {
      expect(scanRenderPayload.mode).toBe('append');
    });

    it('scan:render cells array is present and non-empty', () => {
      expect(Array.isArray(scanRenderPayload.cells)).toBe(true);
      expect(scanRenderPayload.cells.length).toBeGreaterThan(0);
    });

    it('scan:render includes self-cell `*` with colour "self"', () => {
      const selfCell = scanRenderPayload.cells.find(c => c.type === 'self');
      expect(selfCell).toBeDefined();
      expect(selfCell!.char).toBe('*');
      expect(selfCell!.colour).toBe('self');
    });

    it('all cells have valid grid coordinates', () => {
      for (const cell of scanRenderPayload.cells) {
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.x).toBeLessThan(SCAN_GRID_WIDTH);
        expect(cell.y).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeLessThan(SCAN_GRID_HEIGHT);
      }
    });

    it('in-sector AI ship appears with colour "ai"', () => {
      const aiCells = scanRenderPayload.cells.filter(c => c.colour === 'ai');
      expect(aiCells.length).toBeGreaterThan(0);
    });

    it('in-sector human ship appears with colour "human"', () => {
      const humanCells = scanRenderPayload.cells.filter(c => c.colour === 'human');
      expect(humanCells.length).toBeGreaterThan(0);
    });

    it('out-of-sector ship does NOT appear in cells', () => {
      // The outsider at (11.5, 7.5) is in sector (11,7), not (10,7)
      // All ship cells should be in-sector ships only (ai + human = 2 ships)
      const shipCells = scanRenderPayload.cells.filter(c => c.type === 'ship');
      // 2 in-sector ships (ai + human), not 3
      expect(shipCells.length).toBe(2);
    });

    it('scan:render header matches command:result line text', () => {
      expect(scanRenderPayload.header).toBe(commandResultPayload.lines[0].text);
    });

    it('header is SCAN25 "   Sector Scan mag:1x (s:<x> <y>)"', () => {
      // SCAN25 — @see GE/REL/MBMGEMSG.MSG:3625
      expect(scanRenderPayload.header).toBe(`   Sector Scan mag:1x (s:${XSECT} ${YSECT})`);
    });
  });

  describe('success path: scanHome=true → mode overwrite', () => {
    it('scan:render mode is "overwrite" when scanHome=true', async () => {
      const self = makeShip({ userid: 'player1', shipno: 1, xcoord: 5.5, ycoord: 5.5, scanHome: true, where: 0 });
      const scanService = await makeScanService([self]);
      const gateway = makeGateway(scanService);

      const result = await (scanService.command.handler(self, ['se'], {}) as Promise<CommandResult>);
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, result);

      const renderPayload = calls.find(c => c.event === 'scan:render')!.payload as ScanRenderEvent;
      expect(renderPayload.mode).toBe('overwrite');
    });
  });

  describe('cross-mode letter stickiness: sca ra letters survive sca se', () => {
    it('letters from sca ra match letters in follow-up sca se (shared scantab)', async () => {
      const self = makeShip({ userid: 'player1', shipno: 1, xcoord: 10.5, ycoord: 7.5, where: 0 });
      // Other ship in same sector — visible in both sca ra and sca se
      const other = makeShip({ userid: 'other1', shipno: 1, xcoord: 10.3, ycoord: 7.3, status: 0 });
      const scanService = await makeScanService([self, other], 50_000);
      const gateway = makeGateway(scanService);

      // First call: sca ra
      const raResult = await (scanService.command.handler(self, ['ra', '5'], {}) as Promise<CommandResult>);
      const raCells = raResult.scanRender!.cells.filter(c => c.type === 'ship');
      expect(raCells.length).toBeGreaterThan(0);
      const raLetter = raCells[0].char;

      // Second call: sca se
      const seResult = await (scanService.command.handler(self, ['se'], {}) as Promise<CommandResult>);
      const { socket, calls } = makeMockSocket();
      (gateway as unknown as { emitCommandResult: (s: Socket, r: CommandResult) => void })
        .emitCommandResult(socket, seResult);

      const seRenderPayload = calls.find(c => c.event === 'scan:render')!.payload as ScanRenderEvent;
      const seCells = seRenderPayload.cells.filter(c => c.type === 'ship');
      expect(seCells.length).toBeGreaterThan(0);
      // Letter must match the one assigned in sca ra
      expect(seCells[0].char).toBe(raLetter);
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

      const result = await (scanService.command.handler(self, ['se'], {}) as Promise<CommandResult>);
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
