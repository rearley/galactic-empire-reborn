import { RosHandlerService } from '../../src/game/commands/handlers/ros.handler';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamRepository } from '../../src/game/team/team.repository';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandContext } from '../../src/game/commands/command.types';

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

type UserRow = { userid: string; score: bigint; kills: number; planets: number; population: bigint; teamcode: bigint | null };

function makeHandler(
  rows: UserRow[],
  teams: { teamcode: bigint; teamname: string }[] = [],
  rosterMax = 20,
): { handler: RosHandlerService; findTeamsByCodes: jest.Mock } {
  process.env['ROSTER_MAX'] = rosterMax.toString();
  const findTeamsByCodes = jest.fn().mockResolvedValue(
    teams.map((t) => ({ teamcode: t.teamcode, teamname: t.teamname, teamscore: 0n })),
  );
  const repoMock = { findTeamsByCodes } as unknown as TeamRepository;
  const prismaMock = {
    user: { findMany: jest.fn().mockResolvedValue(rows) },
  } as unknown as PrismaService;
  return { handler: new RosHandlerService(prismaMock, repoMock), findTeamsByCodes };
}

const ctx: CommandContext = {};

describe('RosHandlerService — team column (T027)', () => {
  it('header includes "Team" column between UserID and Score', async () => {
    const { handler } = makeHandler([]);
    const result = await handler.command.handler(makeShip(), [], ctx);
    const header = result.lines[0].text;
    const userIdPos = header.indexOf('UserID');
    const teamPos = header.indexOf('Team');
    const scorePos = header.indexOf('Score');
    expect(teamPos).toBeGreaterThan(userIdPos);
    expect(scorePos).toBeGreaterThan(teamPos);
  });

  it('team name ≤ 12 chars is padded to 12 in row', async () => {
    const rows: UserRow[] = [{ userid: 'alice', score: 100n, kills: 1, planets: 0, population: 0n, teamcode: 1n }];
    const { handler } = makeHandler(rows, [{ teamcode: 1n, teamname: 'Raiders' }]);
    const result = await handler.command.handler(makeShip(), [], ctx);
    const infoLine = result.lines.find((l) => l.category === 'info')!;
    // "Raiders" is 7 chars, should be padded to 12
    expect(infoLine.text).toContain('Raiders     ');
  });

  it('team name > 12 chars is truncated to 11 chars + ellipsis', async () => {
    const rows: UserRow[] = [{ userid: 'alice', score: 100n, kills: 1, planets: 0, population: 0n, teamcode: 1n }];
    const { handler } = makeHandler(rows, [{ teamcode: 1n, teamname: 'Galactic Raiders' }]);
    const result = await handler.command.handler(makeShip(), [], ctx);
    const infoLine = result.lines.find((l) => l.category === 'info')!;
    expect(infoLine.text).toContain('Galactic Ra…');
  });

  it('null teamcode renders "---" padded to 12', async () => {
    const rows: UserRow[] = [{ userid: 'bob', score: 50n, kills: 0, planets: 0, population: 0n, teamcode: null }];
    const { handler } = makeHandler(rows, []);
    const result = await handler.command.handler(makeShip(), [], ctx);
    const infoLine = result.lines.find((l) => l.category === 'info')!;
    expect(infoLine.text).toContain('---         ');
  });

  it('teamcode=0 renders "---" padded to 12', async () => {
    const rows: UserRow[] = [{ userid: 'bob', score: 50n, kills: 0, planets: 0, population: 0n, teamcode: 0n }];
    const { handler } = makeHandler(rows, []);
    const result = await handler.command.handler(makeShip(), [], ctx);
    const infoLine = result.lines.find((l) => l.category === 'info')!;
    expect(infoLine.text).toContain('---         ');
  });

  it('missing teamcode reference (deleted team) renders "---" gracefully', async () => {
    const rows: UserRow[] = [{ userid: 'alice', score: 100n, kills: 1, planets: 0, population: 0n, teamcode: 999n }];
    // No matching team in findTeamsByCodes result
    const { handler } = makeHandler(rows, []);
    const result = await handler.command.handler(makeShip(), [], ctx);
    const infoLine = result.lines.find((l) => l.category === 'info')!;
    expect(infoLine.text).toContain('---         ');
  });
});

describe('RosHandlerService — query budget (T028)', () => {
  it('performs at most ONE findTeamsByCodes call per ros invocation', async () => {
    const rows: UserRow[] = [
      { userid: 'a', score: 100n, kills: 1, planets: 0, population: 0n, teamcode: 1n },
      { userid: 'b', score: 90n, kills: 1, planets: 0, population: 0n, teamcode: 1n },
      { userid: 'c', score: 80n, kills: 1, planets: 0, population: 0n, teamcode: 2n },
    ];
    const { handler, findTeamsByCodes } = makeHandler(rows, [
      { teamcode: 1n, teamname: 'Raiders' },
      { teamcode: 2n, teamname: 'Alpha' },
    ]);
    await handler.command.handler(makeShip(), [], ctx);
    expect(findTeamsByCodes).toHaveBeenCalledTimes(1);
  });
});

describe('roster shows the player NAME, not the internal userid', () => {
  /**
   * C's roster prints `userid` (GECMDS.C:cmd_geroster via username(),
   * GEFUNCS.C:2603) — but in MajorBBS the userid WAS the player's handle, e.g.
   * "MADMAX". This port splits that into a synthetic `userid` (`usr_<hex>`) and
   * a human `username`, so printing userid is literally faithful yet
   * semantically wrong: the roster showed rows like
   * `usr_a9070dc745a8688f`, which no player can identify.
   *
   * Found by reading the roster during a playtest.
   */
  it('renders username, never the usr_ identifier', async () => {
    const rows = [
      { userid: 'usr_a9070dc745a8688f9ed71a0c', username: 'RickTestPilot', score: 20500n, kills: 22, planets: 0, population: 0n, teamcode: null },
    ];
    const prisma = { user: { findMany: jest.fn().mockResolvedValue(rows) } };
    const teamRepo = { findTeamsByCodes: jest.fn().mockResolvedValue([]) };
    const svc = new RosHandlerService(prisma as never, teamRepo as never);

    const result = await (svc.command.handler({} as never, [], {} as never) as Promise<{ lines: Array<{ text: string }> }>);
    const body = result.lines.map((l) => l.text).join('\n');

    expect(body).toContain('RickTestPilot');
    expect(body).not.toContain('usr_');
  });

  it('right-aligns Score/Kills/Planets/Population under their headers', async () => {
    const rows = [
      { userid: 'u1', username: 'RickTestPilot', score: 20500n, kills: 22, planets: 3, population: 4500n, teamcode: null },
    ];
    const prisma = { user: { findMany: jest.fn().mockResolvedValue(rows) } };
    const teamRepo = { findTeamsByCodes: jest.fn().mockResolvedValue([]) };
    const svc = new RosHandlerService(prisma as never, teamRepo as never);
    const result = await (svc.command.handler({} as never, [], {} as never) as Promise<{ lines: Array<{ text: string }> }>);

    const ends = (line: string): number[] =>
      [...line.matchAll(/\S+/g)].map((m) => m.index! + m[0].length);
    // Rank + the four numeric columns are right-aligned; Name and Team use
    // padEnd, so their end columns legitimately differ from the header's.
    const rightAligned = (line: string): number[] => {
      const e = ends(line);
      return [e[0], e[3], e[4], e[5], e[6]];
    };
    expect(rightAligned(result.lines[1].text)).toEqual(rightAligned(result.lines[0].text));
  });

  it('labels the column Name rather than UserID', async () => {
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } };
    const teamRepo = { findTeamsByCodes: jest.fn().mockResolvedValue([]) };
    const svc = new RosHandlerService(prisma as never, teamRepo as never);
    const result = await (svc.command.handler({} as never, [], {} as never) as Promise<{ lines: Array<{ text: string }> }>);
    expect(result.lines[0].text).toMatch(/Name/);
    expect(result.lines[0].text).not.toMatch(/UserID/);
  });
});
