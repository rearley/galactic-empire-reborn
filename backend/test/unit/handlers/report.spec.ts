import { CommandResult } from '../../../src/game/commands/command.types';
import { ReportHandlerService } from '../../../src/game/commands/handlers/report.handler';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'USS Test', shpclass: 1,
    heading: 270, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 3.25, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [100, 200, 300], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    dirty: false,
    ...overrides,
  };
}

function makeService(typeName = 'Interceptor', hasCloak = false) {
  const prismaMock = {
    shipClass: {
      findMany: jest.fn().mockResolvedValue([
        { classNumber: 1, typeName, hasCloak },
      ]),
    },
  };
  const service = new ReportHandlerService(prismaMock as unknown as PrismaService);
  return { service, prismaMock };
}

describe('ReportHandlerService', () => {
  describe('nav report', () => {
    it('returns REP01 header with typename and shipname', async () => {
      const { service } = makeService('Interceptor');
      await service.onModuleInit();
      const result = service.command.handler(makeShip(), ['nav'], {}) as CommandResult;
      expect(result.lines[0].text).toBe(formatMessage(MessageId.REP01, 'Interceptor', 'USS Test'));
      expect(result.lines[0].category).toBe('system');
    });

    it('returns DASHES after header', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      const result = service.command.handler(makeShip(), ['nav'], {}) as CommandResult;
      expect(result.lines[1].text).toBe(formatMessage(MessageId.DASHES));
    });

    it('returns REP35 navigation section header', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      const result = service.command.handler(makeShip(), ['nav'], {}) as CommandResult;
      const texts = result.lines.map(l => l.text);
      expect(texts).toContain(formatMessage(MessageId.REP35));
    });

    it('where==0 returns REP05 (in sector)', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      const result = service.command.handler(makeShip({ where: 0 }), ['nav'], {}) as CommandResult;
      const texts = result.lines.map(l => l.text);
      expect(texts.some(t => t.startsWith('In sector'))).toBe(true);
    });

    it('where==1 returns REP02 (in hyperspace)', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      const result = service.command.handler(makeShip({ where: 1 }), ['nav'], {}) as CommandResult;
      const texts = result.lines.map(l => l.text);
      expect(texts.some(t => t.startsWith('In hyperspace'))).toBe(true);
    });

    it('where>=10 returns REP08 (in orbit)', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      const result = service.command.handler(makeShip({ where: 15 }), ['nav'], {}) as CommandResult;
      const texts = result.lines.map(l => l.text);
      expect(texts.some(t => t.startsWith('Orbiting planet'))).toBe(true);
    });

    it('always includes REP32 position line', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      const result = service.command.handler(makeShip(), ['nav'], {}) as CommandResult;
      const texts = result.lines.map(l => l.text);
      expect(texts.some(t => t.startsWith('Position:'))).toBe(true);
    });
  });

  describe('sys report', () => {
    it('includes REP09 energy line', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      const result = service.command.handler(makeShip({ energy: 850 }), ['sys'], {}) as CommandResult;
      const texts = result.lines.map(l => l.text);
      expect(texts.some(t => t.includes('850'))).toBe(true);
    });

    it('REP09 has info category', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      const result = service.command.handler(makeShip(), ['sys'], {}) as CommandResult;
      const energyLine = result.lines.find(l => l.text.startsWith('Energy:'));
      expect(energyLine?.category).toBe('info');
    });

    it('REP10 included when shieldtype > 0 and shieldstat==1 (up)', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      const result = service.command.handler(
        makeShip({ shieldtype: 1, shieldstat: 1 }),
        ['sys'],
        {},
      ) as CommandResult;
      const texts = result.lines.map(l => l.text);
      expect(texts.some(t => t.toLowerCase().includes('shield'))).toBe(true);
    });

    it('REP11 included when shieldtype > 0 and shieldstat==0 (down)', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      const result = service.command.handler(
        makeShip({ shieldtype: 2, shieldstat: 0 }),
        ['sys'],
        {},
      ) as CommandResult;
      const texts = result.lines.map(l => l.text);
      expect(texts.some(t => t.toLowerCase().includes('shield'))).toBe(true);
    });

    it('cloak line included when ship has cloak capability', async () => {
      const { service } = makeService('Fighter', true);
      await service.onModuleInit();
      const result = service.command.handler(makeShip({ cloak: 0 }), ['sys'], {}) as CommandResult;
      const texts = result.lines.map(l => l.text);
      expect(texts.some(t => t.toLowerCase().includes('cloak'))).toBe(true);
    });
  });

  describe('missing arg returns REPFMT', () => {
    it('argMissingMessage is REPFMT', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      expect(service.command.argMissingMessage).toBe(formatMessage(MessageId.REPFMT));
    });
  });

  describe('alias', () => {
    it('keyword is "report", alias includes "rep"', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      expect(service.command.keyword).toBe('report');
      expect(service.command.aliases).toContain('rep');
    });
  });

  describe('cargo placeholder', () => {
    it('cargo returns a placeholder info line', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      const result = service.command.handler(makeShip(), ['cargo'], {}) as CommandResult;
      expect(result.lines.some(l => l.category === 'info')).toBe(true);
    });
  });
});
