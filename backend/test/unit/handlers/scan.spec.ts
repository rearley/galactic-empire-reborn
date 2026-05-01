import { ScanHandlerService } from '../../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { SCAN_GRID_WIDTH, SCAN_GRID_HEIGHT } from '../../../src/game/constants';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
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
    dirty: false,
    ...overrides,
  };
}

function makeService(ships: ShipState[], scanRange = 5000) {
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
  const service = new ScanHandlerService(
    shipServiceMock as unknown as ShipStateService,
    prismaMock as unknown as PrismaService,
  );
  return { service, shipServiceMock, prismaMock };
}

describe('ScanHandlerService', () => {
  describe('scan lo — empty range', () => {
    it('returns scanGrid with only the self-cell when no ships in range', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const ship = makeShip();
      const result = service.command.handler(ship, ['lo'], {});
      expect(result.scanGrid).toBeDefined();
      expect(result.scanGrid!.length).toBe(1);
      const selfCell = result.scanGrid![0];
      expect(selfCell.x).toBe(Math.floor(SCAN_GRID_WIDTH / 2));
      expect(selfCell.y).toBe(Math.floor(SCAN_GRID_HEIGHT / 2));
      expect(selfCell.type).toBe('self');
      expect(selfCell.char).toBe('*');
    });
  });

  describe('scan lo — ship in range', () => {
    it('AI ship (status=1) at projected cell appears with char "+"', async () => {
      const playerShip = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 0 });
      const aiShip = makeShip({ userid: 'u2', shipno: 1, xcoord: 0.1, ycoord: 0, status: 1 });
      const { service } = makeService([playerShip, aiShip]);
      await service.onModuleInit();
      const result = service.command.handler(playerShip, ['lo'], {});
      const aiCell = result.scanGrid!.find(c => c.type === 'ship');
      expect(aiCell).toBeDefined();
      expect(aiCell!.char).toBe('+');
    });

    it('manual ship (status=0) appears with char "="', async () => {
      const playerShip = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 0 });
      const manualShip = makeShip({ userid: 'u2', shipno: 1, xcoord: 0.1, ycoord: 0, status: 0 });
      const { service } = makeService([playerShip, manualShip]);
      await service.onModuleInit();
      const result = service.command.handler(playerShip, ['lo'], {});
      const shipCell = result.scanGrid!.find(c => c.type === 'ship');
      expect(shipCell!.char).toBe('=');
    });

    it('self ship is excluded from ship cells', async () => {
      const ship = makeShip({ userid: 'u1', shipno: 1 });
      const { service } = makeService([ship]);
      await service.onModuleInit();
      const result = service.command.handler(ship, ['lo'], {});
      const selfCells = result.scanGrid!.filter(c => c.type === 'self');
      expect(selfCells).toHaveLength(1);
      const shipCells = result.scanGrid!.filter(c => c.type === 'ship');
      expect(shipCells).toHaveLength(0);
    });

    it('out-of-range ship is dropped from scanGrid', async () => {
      const playerShip = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 0 });
      // Very far away — will be off-grid
      const farShip = makeShip({ userid: 'u2', shipno: 1, xcoord: 9999, ycoord: 9999, status: 0 });
      const { service } = makeService([playerShip, farShip], 100); // tiny scan range
      await service.onModuleInit();
      const result = service.command.handler(playerShip, ['lo'], {});
      expect(result.scanGrid!.filter(c => c.type === 'ship')).toHaveLength(0);
    });
  });

  describe('bare scan (no sub-keyword) dispatches as scan lo', () => {
    it('bare scan returns scanGrid', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const ship = makeShip();
      const resultLo = service.command.handler(ship, ['lo'], {});
      const resultBare = service.command.handler(ship, [], {});
      // Both should return a scanGrid with just the self-cell
      expect(resultBare.scanGrid).toBeDefined();
      expect(resultBare.scanGrid!.length).toBe(resultLo.scanGrid!.length);
    });
  });

  describe('scan sh', () => {
    it('returns text-only result (no scanGrid field)', async () => {
      const { service, shipServiceMock } = makeService([]);
      await service.onModuleInit();
      const ship = makeShip();
      shipServiceMock.findByName.mockReturnValue(makeShip({ shipname: 'USS Target' }));
      const result = service.command.handler(ship, ['sh', 'USS', 'Target'], {});
      expect(result.scanGrid).toBeUndefined();
      expect(result.lines.length).toBeGreaterThan(0);
    });

    it('missing name arg returns SCANFMT', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const result = service.command.handler(makeShip(), ['sh'], {});
      expect(result.lines[0].text).toBe(formatMessage(MessageId.SCANFMT));
      expect(result.scanGrid).toBeUndefined();
    });
  });

  describe('scan pl', () => {
    it('returns text-only result (no scanGrid field)', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const result = service.command.handler(makeShip(), ['pl', 'Earth'], {});
      expect(result.scanGrid).toBeUndefined();
    });
  });

  describe('unknown sub-keyword', () => {
    it('returns SCANFMT', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const result = service.command.handler(makeShip(), ['xyz'], {});
      expect(result.lines[0].text).toBe(formatMessage(MessageId.SCANFMT));
    });
  });

  describe('keyword and alias', () => {
    it('keyword is "scan", alias includes "sc"', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      expect(service.command.keyword).toBe('scan');
      expect(service.command.aliases).toContain('sc');
    });
  });
});
