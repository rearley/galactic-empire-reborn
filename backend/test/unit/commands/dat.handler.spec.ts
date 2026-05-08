import { DatHandlerService } from '../../../src/game/commands/handlers/dat.handler';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../src/game/commands/command.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Alpha',
    shpclass: 1, heading: 45, head2b: 0, speed: 5, speed2b: 0,
    xcoord: 5, ycoord: 3, damage: 10, energy: 800,
    phasr: 0, phasrtype: 0, kills: 3, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n, 12n, 13n, 14n],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeHandler(ships: ShipState[], teamname?: string): DatHandlerService {
  const shipSvc = { findAllShips: () => ships } as unknown as ShipStateService;
  const prismaMock = {
    team: {
      findFirst: jest.fn().mockResolvedValue(teamname ? { teamname } : null),
    },
  } as unknown as PrismaService;
  return new DatHandlerService(shipSvc, prismaMock);
}

const ctx: CommandContext = {};

describe('DatHandlerService', () => {
  describe('command metadata', () => {
    it('keyword is "dat"', () => {
      expect(makeHandler([]).command.keyword).toBe('dat');
    });

    it('minArgs is 1', () => {
      expect(makeHandler([]).command.minArgs).toBe(1);
    });

    it('argMissingMessage mentions usage', () => {
      expect(makeHandler([]).command.argMissingMessage).toMatch(/Usage: dat/i);
    });
  });

  describe('FR-004: case-insensitive substring match', () => {
    it('matches by lowercase fragment', async () => {
      const ship = makeShip({ shipname: 'StarFighter' });
      const handler = makeHandler([ship]);
      const result = await handler.command.handler(makeShip(), ['star'], ctx);
      expect(result.lines.some((l) => l.text.includes('StarFighter'))).toBe(true);
    });

    it('self-match is allowed', async () => {
      const ship = makeShip({ userid: 'u1', shipno: 1, shipname: 'Alpha', cloak: 0 });
      const handler = makeHandler([ship]);
      const result = await handler.command.handler(ship, ['alp'], ctx);
      expect(result.lines.some((l) => l.text.includes('Alpha'))).toBe(true);
    });
  });

  describe('FR-005: cloak filters as not-found', () => {
    it('returns "Ship not found." for cloaked ship', async () => {
      const ship = makeShip({ shipname: 'Ghost', cloak: 1 });
      const handler = makeHandler([ship]);
      const result = await handler.command.handler(makeShip(), ['ghost'], ctx);
      expect(result.lines[0].text).toBe('Ship not found.');
    });
  });

  describe('FR-006: all 14 cargo slots rendered', () => {
    it('renders Men through Spy cargo lines', async () => {
      const ship = makeShip();
      const handler = makeHandler([ship]);
      const result = await handler.command.handler(makeShip(), ['alp'], ctx);
      const allText = result.lines.map((l) => l.text).join('\n');
      expect(allText).toContain('Men');
      expect(allText).toContain('Missiles');
      expect(allText).toContain('Torpedos');
      expect(allText).toContain('Gold');
      expect(allText).toContain('Spy');
    });
  });

  describe('FR-007: no match returns Ship not found', () => {
    it('returns system line for unknown fragment', async () => {
      const handler = makeHandler([makeShip()]);
      const result = await handler.command.handler(makeShip(), ['zzz'], ctx);
      expect(result.lines[0].text).toBe('Ship not found.');
      expect(result.lines[0].category).toBe('system');
    });
  });

  describe('team name resolved when teamcode present', () => {
    it('shows team name in the stat block', async () => {
      const ship = makeShip({ shipname: 'Alpha', teamcode: 42n });
      const handler = makeHandler([ship], 'Pirates');
      const result = await handler.command.handler(makeShip(), ['alp'], ctx);
      const allText = result.lines.map((l) => l.text).join('\n');
      expect(allText).toContain('Pirates');
    });

    it('shows em-dash when no team', async () => {
      const ship = makeShip({ shipname: 'Loner', teamcode: undefined });
      const handler = makeHandler([ship]);
      const result = await handler.command.handler(makeShip(), ['lon'], ctx);
      const allText = result.lines.map((l) => l.text).join('\n');
      expect(allText).toContain('—');
    });
  });
});
