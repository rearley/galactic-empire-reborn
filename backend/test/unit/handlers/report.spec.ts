import { CommandResult } from '../../../src/game/commands/command.types';
import { ReportHandlerService } from '../../../src/game/commands/handlers/report.handler';
import { SHIELDDM } from '../../../src/game/constants';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
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
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeService(typeName = 'Interceptor', hasCloak = false) {
  const prismaMock = {};
  const shipClassCache = new ShipClassCacheService({} as never);
  shipClassCache.setForTest(1, { maxAcceleration: 0, maxWarp: 0, typeName, hasCloak });
  const service = new ReportHandlerService(
    prismaMock as unknown as PrismaService,
    undefined,
    shipClassCache,
  );
  return { service, prismaMock, shipClassCache };
}

describe('rep reads the ship class from the boot-time cache, not the database', () => {
  it('resolves typeName/hasCloak through ShipClassCacheService.get, not a query', async () => {
    const { service, shipClassCache } = makeService('Fighter', true);
    const getSpy = jest.spyOn(shipClassCache, 'get');

    const result = await (service.command.handler(makeShip(), ['nav'], {}) as Promise<CommandResult>);

    expect(getSpy).toHaveBeenCalledWith(1);
    expect(result.lines[0].text).toContain('Fighter');
  });
});

describe('ReportHandlerService', () => {
  describe('nav report', () => {
    it('returns REP01 header with typename and shipname', async () => {
      const { service } = makeService('Interceptor');
      const result = await (service.command.handler(makeShip(), ['nav'], {}) as Promise<CommandResult>);
      expect(result.lines[0].text).toBe(formatMessage(MessageId.REP01, 'Interceptor', 'USS Test'));
      expect(result.lines[0].category).toBe('system');
    });

    it('returns DASHES after header', async () => {
      const { service } = makeService();
      const result = await (service.command.handler(makeShip(), ['nav'], {}) as Promise<CommandResult>);
      expect(result.lines[1].text).toBe(formatMessage(MessageId.DASHES));
    });

    it('returns REP35 navigation section header', async () => {
      const { service } = makeService();
      const result = await (service.command.handler(makeShip(), ['nav'], {}) as Promise<CommandResult>);
      const texts = result.lines.map(l => l.text);
      expect(texts).toContain(formatMessage(MessageId.REP35));
    });

    it('where==0 returns REP05 (in sector)', async () => {
      const { service } = makeService();
      const result = await (service.command.handler(makeShip({ where: 0 }), ['nav'], {}) as Promise<CommandResult>);
      const texts = result.lines.map(l => l.text);
      // REP05 {Navigating SS# %d %d}
      expect(texts.some(t => t.startsWith('Navigating SS#'))).toBe(true);
    });

    it('where==1 returns REP02 (in hyperspace)', async () => {
      const { service } = makeService();
      const result = await (service.command.handler(makeShip({ where: 1 }), ['nav'], {}) as Promise<CommandResult>);
      const texts = result.lines.map(l => l.text);
      // REP02 {Nav Hyperspace (SS# %d %d)}
      expect(texts.some(t => t.startsWith('Nav Hyperspace'))).toBe(true);
    });

    it('where>=10 returns REP08 (in orbit)', async () => {
      const { service } = makeService();
      const result = await (service.command.handler(makeShip({ where: 15 }), ['nav'], {}) as Promise<CommandResult>);
      const texts = result.lines.map(l => l.text);
      // REP08 {Orbiting Planet........  %d SS# %d  %d}
      expect(texts.some(t => t.startsWith('Orbiting Planet'))).toBe(true);
    });

    it('always includes REP32 position line', async () => {
      const { service } = makeService();
      const result = await (service.command.handler(makeShip(), ['nav'], {}) as Promise<CommandResult>);
      const texts = result.lines.map(l => l.text);
      // REP32 {Galactic Pos. Xsect:%d Ysect:%d}
      expect(texts.some(t => t.startsWith('Galactic Pos.'))).toBe(true);
    });
  });

  describe('sys report', () => {
    it('includes REP09 energy line', async () => {
      const { service } = makeService();
      const result = await (service.command.handler(makeShip({ energy: 850 }), ['sys'], {}) as Promise<CommandResult>);
      const texts = result.lines.map(l => l.text);
      expect(texts.some(t => t.includes('850'))).toBe(true);
    });

    it('REP09 has info category', async () => {
      const { service } = makeService();
      const result = await (service.command.handler(makeShip(), ['sys'], {}) as Promise<CommandResult>);
      // REP09 {Neutron Flux............ %u} — canon calls it flux, not energy.
      const energyLine = result.lines.find(l => l.text.startsWith('Neutron Flux'));
      expect(energyLine?.category).toBe('info');
    });

    it('REP10 included when shieldtype > 0 and shieldstat==1 (up)', async () => {
      const { service } = makeService();
      const result = await (service.command.handler(
        makeShip({ shieldtype: 1, shieldstat: 1 }),
        ['sys'],
        {},
      ) as Promise<CommandResult>);
      const texts = result.lines.map(l => l.text);
      expect(texts.some(t => t.toLowerCase().includes('shield'))).toBe(true);
    });

    it('REP11 included when shieldtype > 0 and shieldstat==0 (down)', async () => {
      const { service } = makeService();
      const result = await (service.command.handler(
        makeShip({ shieldtype: 2, shieldstat: 0 }),
        ['sys'],
        {},
      ) as Promise<CommandResult>);
      const texts = result.lines.map(l => l.text);
      expect(texts.some(t => t.toLowerCase().includes('shield'))).toBe(true);
    });

    it('cloak line included when ship has cloak capability', async () => {
      const { service } = makeService('Fighter', true);
      const result = await (service.command.handler(makeShip({ cloak: 0 }), ['sys'], {}) as Promise<CommandResult>);
      const texts = result.lines.map(l => l.text);
      expect(texts.some(t => t.toLowerCase().includes('cloak'))).toBe(true);
    });
  });

  describe('missing arg returns REPFMT', () => {
    it('argMissingMessage is REPFMT', async () => {
      const { service } = makeService();
      expect(service.command.argMissingMessage).toBe(formatMessage(MessageId.REPFMT));
    });
  });

  describe('alias', () => {
    it('keyword is "report", alias includes "rep"', async () => {
      const { service } = makeService();
      expect(service.command.keyword).toBe('report');
      expect(service.command.aliases).toContain('rep');
    });
  });

  describe('cargo placeholder', () => {
    it('cargo returns a placeholder info line', async () => {
      const { service } = makeService();
      const result = await (service.command.handler(makeShip(), ['cargo'], {}) as Promise<CommandResult>);
      expect(result.lines.some(l => l.category === 'info')).toBe(true);
    });
  });
});

/**
 * `rep sys` should tell the pilot what is broken.
 *
 * GECMDS.C:2037-2050:
 *
 *   damage = (unsigned)(warsptr->damage+.5);
 *   damstr(damage);  prfmsg(REP14, gechrbuf);   // the WORD, not a number
 *   if (shieldstat == SHIELDDM) prfmsg(REP15);
 *   if (helm     < 0)           prfmsg(REP16);
 *   if (cloak    < 0)           prfmsg(REP17);
 *   if (tactical < 0)           prfmsg(REP18);
 *   if (repair   > 0)           prfmsg(REP18A, repair);
 *
 * The port printed a raw percentage into REP14 and never mentioned helm,
 * tactical, cloak damage or the repair countdown at all — it tracks all four
 * and acts on them, but the pilot was never told. REP15-18A were defined
 * nowhere.
 */
describe('rep sys — subsystem status (GECMDS.C:2037-2050)', () => {
  async function sysLines(over: Partial<ShipState>) {
    const { service } = makeService('Interceptor', true);
    const result = await (service.command.handler(
      makeShip(over), ['sys'], {},
    ) as Promise<CommandResult>);
    return result.lines.map((l) => l.text);
  }

  it('describes hull damage in words, not as a percentage', async () => {
    const lines = await sysLines({ damage: 30 });
    expect(lines).toContain(formatMessage(MessageId.REP14, 'moderate'));
    expect(lines.join('\n')).not.toMatch(/30%/);
  });

  it('rounds to the nearest whole point, as C does with +.5', async () => {
    // 11.6 rounds to 12, which is the "light" band, not "very light".
    expect(await sysLines({ damage: 11.6 })).toContain(formatMessage(MessageId.REP14, 'light'));
  });

  it('reports blown shields', async () => {
    const lines = await sysLines({ shieldstat: SHIELDDM });
    expect(lines).toContain(formatMessage(MessageId.REP15));
  });

  it('reports a damaged helm', async () => {
    expect(await sysLines({ helm: -4 })).toContain(formatMessage(MessageId.REP16));
  });

  it('reports a damaged cloak', async () => {
    expect(await sysLines({ cloak: -4 })).toContain(formatMessage(MessageId.REP17));
  });

  it('reports damaged tactical', async () => {
    expect(await sysLines({ tactical: -4 })).toContain(formatMessage(MessageId.REP18));
  });

  it('reports the repair countdown', async () => {
    expect(await sysLines({ repair: 7 })).toContain(formatMessage(MessageId.REP18A, 7));
  });

  it('says nothing about systems that are fine', async () => {
    const lines = await sysLines({});
    for (const id of [MessageId.REP15, MessageId.REP16, MessageId.REP17, MessageId.REP18]) {
      expect(lines).not.toContain(formatMessage(id));
    }
  });
});
