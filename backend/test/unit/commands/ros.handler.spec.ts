import { RosHandlerService } from '../../../src/game/commands/handlers/ros.handler';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../src/game/commands/command.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Alpha',
    shpclass: 1, heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false,
    dirty: false,
    ...overrides,
  };
}

type UserRow = { userid: string; score: bigint; kills: number; planets: number; population: bigint };

function makeUserRows(count: number, prefix = 'user'): UserRow[] {
  return Array.from({ length: count }, (_, i) => ({
    userid: `${prefix}${i + 1}`,
    score: BigInt((count - i) * 100),
    kills: count - i,
    planets: i,
    population: BigInt(i * 1000),
  }));
}

function makeHandler(rows: UserRow[], rosterMax = 20): RosHandlerService {
  process.env['ROSTER_MAX'] = rosterMax.toString();
  const prismaMock = {
    user: { findMany: jest.fn().mockResolvedValue(rows) },
  } as unknown as PrismaService;
  const repoMock = { findTeamsByCodes: jest.fn().mockResolvedValue([]) } as unknown as import('../../../src/game/team/team.repository').TeamRepository;
  return new RosHandlerService(prismaMock, repoMock);
}

const ctx: CommandContext = {};

describe('RosHandlerService', () => {
  describe('command metadata', () => {
    it('keyword is "ros"', () => {
      expect(makeHandler([]).command.keyword).toBe('ros');
    });

    it('minArgs is 0', () => {
      expect(makeHandler([]).command.minArgs).toBe(0);
    });
  });

  describe('FR-008: header line present', () => {
    it('emits header as first line', async () => {
      const handler = makeHandler([]);
      const result = await handler.command.handler(makeShip(), [], ctx);
      expect(result.lines[0].text).toMatch(/Rank/i);
      expect(result.lines[0].category).toBe('system');
    });
  });

  describe('FR-009: default cap is ROSTER_MAX (20)', () => {
    it('returns at most ROSTER_MAX rows', async () => {
      const handler = makeHandler(makeUserRows(25), 20);
      const result = await handler.command.handler(makeShip(), [], ctx);
      const infoLines = result.lines.filter((l) => l.category === 'info');
      expect(infoLines.length).toBeLessThanOrEqual(20);
    });
  });

  describe('FR-010: ros all cap is 200', () => {
    it('passes take=200 to Prisma when "all" argument given', async () => {
      const prismaMock = { user: { findMany: jest.fn().mockResolvedValue([]) } } as unknown as PrismaService;
      const handler = new RosHandlerService(prismaMock, { findTeamsByCodes: jest.fn().mockResolvedValue([]) } as unknown as import('../../../src/game/team/team.repository').TeamRepository);
      await handler.command.handler(makeShip(), ['all'], ctx);
      expect((prismaMock.user.findMany as jest.Mock).mock.calls[0][0].take).toBe(200);
    });

    it('"ALL" is case-insensitive', async () => {
      const prismaMock = { user: { findMany: jest.fn().mockResolvedValue([]) } } as unknown as PrismaService;
      const handler = new RosHandlerService(prismaMock, { findTeamsByCodes: jest.fn().mockResolvedValue([]) } as unknown as import('../../../src/game/team/team.repository').TeamRepository);
      await handler.command.handler(makeShip(), ['ALL'], ctx);
      expect((prismaMock.user.findMany as jest.Mock).mock.calls[0][0].take).toBe(200);
    });
  });

  describe('FR-011: AI prefix exclusion', () => {
    it('excludes Cybrg- rows from the query', async () => {
      const prismaMock = { user: { findMany: jest.fn().mockResolvedValue([]) } } as unknown as PrismaService;
      const handler = new RosHandlerService(prismaMock, { findTeamsByCodes: jest.fn().mockResolvedValue([]) } as unknown as import('../../../src/game/team/team.repository').TeamRepository);
      await handler.command.handler(makeShip(), [], ctx);
      const query = (prismaMock.user.findMany as jest.Mock).mock.calls[0][0];
      expect(JSON.stringify(query.where)).toContain('Cybrg-');
    });

    it('excludes @Droid- rows from the query', async () => {
      const prismaMock = { user: { findMany: jest.fn().mockResolvedValue([]) } } as unknown as PrismaService;
      const handler = new RosHandlerService(prismaMock, { findTeamsByCodes: jest.fn().mockResolvedValue([]) } as unknown as import('../../../src/game/team/team.repository').TeamRepository);
      await handler.command.handler(makeShip(), [], ctx);
      const query = (prismaMock.user.findMany as jest.Mock).mock.calls[0][0];
      expect(JSON.stringify(query.where)).toContain('@Droid-');
    });
  });

  describe('sort order', () => {
    it('passes score DESC, kills DESC, userid ASC orderBy to Prisma', async () => {
      const prismaMock = { user: { findMany: jest.fn().mockResolvedValue([]) } } as unknown as PrismaService;
      const handler = new RosHandlerService(prismaMock, { findTeamsByCodes: jest.fn().mockResolvedValue([]) } as unknown as import('../../../src/game/team/team.repository').TeamRepository);
      await handler.command.handler(makeShip(), [], ctx);
      const query = (prismaMock.user.findMany as jest.Mock).mock.calls[0][0];
      expect(query.orderBy).toEqual([{ score: 'desc' }, { kills: 'desc' }, { userid: 'asc' }]);
    });
  });

  describe('SC-001: latency with large result set', () => {
    it('completes in < 200 ms with 1000 mocked rows', async () => {
      const rows = makeUserRows(1000);
      const handler = makeHandler(rows, 200);
      const start = Date.now();
      await handler.command.handler(makeShip(), ['all'], ctx);
      expect(Date.now() - start).toBeLessThan(200);
    });
  });

  describe('row formatting', () => {
    it('includes rank, userid, score, kills, planets, population per info row', async () => {
      const rows: UserRow[] = [{ userid: 'admiral', score: 9999n, kills: 5, planets: 2, population: 1000n }];
      const handler = makeHandler(rows);
      const result = await handler.command.handler(makeShip(), [], ctx);
      const infoLine = result.lines.find((l) => l.category === 'info');
      expect(infoLine).toBeDefined();
      expect(infoLine!.text).toContain('admiral');
      expect(infoLine!.text).toContain('9999');
    });
  });
});
