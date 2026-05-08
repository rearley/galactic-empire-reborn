import { CommandRouterService } from '../../../src/game/commands/command-router.service';
import { RosHandlerService } from '../../../src/game/commands/handlers/ros.handler';
import { TeamRepository } from '../../../src/game/team/team.repository';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../src/game/commands/command.types';

const emptyTeamRepo = { findTeamsByCodes: jest.fn().mockResolvedValue([]) } as unknown as TeamRepository;

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
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

const ctx: CommandContext = {};

function buildRouter(users: Array<{ userid: string; score: bigint; kills: number; planets: number; population: bigint }>): CommandRouterService {
  const prismaMock = {
    user: { findMany: jest.fn().mockResolvedValue(users) },
  } as unknown as PrismaService;
  const handler = new RosHandlerService(prismaMock, emptyTeamRepo);
  const router = new CommandRouterService();
  router.register(handler.command);
  return router;
}

describe('ros dispatch integration', () => {
  it('ros with human players returns header + rows', async () => {
    const users = [
      { userid: 'admiral', score: 1000n, kills: 5, planets: 2, population: 500n },
      { userid: 'captain', score: 500n, kills: 2, planets: 1, population: 200n },
    ];
    const router = buildRouter(users);
    const result = await router.dispatch('ros', makeShip(), ctx);
    const header = result.lines[0];
    expect(header.category).toBe('system');
    expect(header.text).toMatch(/Rank/i);
    const rows = result.lines.filter((l) => l.category === 'info');
    expect(rows).toHaveLength(2);
    expect(rows[0].text).toContain('admiral');
  });

  it('ros all passes to Prisma with all cap', async () => {
    const prismaMock = { user: { findMany: jest.fn().mockResolvedValue([]) } } as unknown as PrismaService;
    const handler = new RosHandlerService(prismaMock, emptyTeamRepo);
    const router = new CommandRouterService();
    router.register(handler.command);
    await router.dispatch('ros all', makeShip(), ctx);
    expect((prismaMock.user.findMany as jest.Mock).mock.calls[0][0].take).toBe(200);
  });

  it('ros with empty result returns only header', async () => {
    const router = buildRouter([]);
    const result = await router.dispatch('ros', makeShip(), ctx);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].category).toBe('system');
  });
});
