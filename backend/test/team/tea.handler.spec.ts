import { TeaHandlerService } from '../../src/game/commands/handlers/tea.handler';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { TeamService } from '../../src/game/team/team.service';
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
    scanNames: false, scanHome: false,
    dirty: false,
    ...overrides,
  };
}

function makeHandler(teamSvcOverrides: Partial<TeamService> = {}, foundTeam: { teamcode: bigint; teamname: string } | null = null): TeaHandlerService {
  const prismaMock = {
    team: { findFirst: jest.fn().mockResolvedValue(foundTeam) },
    user: { update: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  const shipStateSvcMock = {} as unknown as ShipStateService;
  const teamSvc = {
    create: jest.fn().mockResolvedValue({ ok: true, teamcode: 1n, teamname: 'Raiders' }),
    joinByPassword: jest.fn().mockResolvedValue({ ok: true, teamname: 'Raiders' }),
    list: jest.fn().mockResolvedValue([]),
    ...teamSvcOverrides,
  } as unknown as TeamService;
  return new TeaHandlerService(prismaMock, shipStateSvcMock, teamSvc);
}

const ctx: CommandContext = {};

// ── T010: US1 — tea create branch ─────────────────────────────────────────────

describe('TeaHandlerService — tea create', () => {
  it('returns success line on create', async () => {
    const teamSvc = {
      create: jest.fn().mockResolvedValue({ ok: true, teamcode: 1n, teamname: 'Galactic Raiders' }),
      list: jest.fn(),
      joinByPassword: jest.fn(),
    } as unknown as TeamService;
    const handler = makeHandler(teamSvc);
    const result = await handler.command.handler(makeShip(), ['create', 'Galactic', 'Raiders', 's3cret'], ctx);
    expect(result.lines[0].text).toBe('Team Galactic Raiders created. You are its first member.');
    expect(result.lines[0].category).toBe('success');
  });

  it('emits player.snapshot broadcast on create success', async () => {
    const handler = makeHandler({ create: jest.fn().mockResolvedValue({ ok: true, teamcode: 1n, teamname: 'Raiders' }) });
    const result = await handler.command.handler(makeShip(), ['create', 'Raiders', 'pw'], ctx);
    expect(result.broadcasts?.some((b) => b.event === 'player.snapshot')).toBe(true);
  });

  it('returns already-on-team error', async () => {
    const handler = makeHandler({ create: jest.fn().mockResolvedValue({ error: 'already_on_team' }) });
    const result = await handler.command.handler(makeShip(), ['create', 'Raiders', 'pw'], ctx);
    expect(result.lines[0].text).toBe("You are already on a team. Use 'tea leave' first.");
    expect(result.lines[0].category).toBe('system');
  });

  it('returns usage error for missing name/password', async () => {
    const handler = makeHandler();
    const result = await handler.command.handler(makeShip(), ['create'], ctx);
    expect(result.lines[0].text).toBe('Usage: tea create <name> <password>');
    expect(result.lines[0].category).toBe('system');
  });

  it('returns name-too-long error', async () => {
    const handler = makeHandler({ create: jest.fn().mockResolvedValue({ error: 'name_too_long' }) });
    const result = await handler.command.handler(makeShip(), ['create', 'a'.repeat(31), 'pw'], ctx);
    expect(result.lines[0].text).toBe('Team name must be 30 characters or fewer.');
    expect(result.lines[0].category).toBe('system');
  });

  it('returns password-too-long error', async () => {
    const handler = makeHandler({ create: jest.fn().mockResolvedValue({ error: 'password_too_long' }) });
    const result = await handler.command.handler(makeShip(), ['create', 'Raiders', '123456789'], ctx);
    expect(result.lines[0].text).toBe('Team password must be 8 characters or fewer.');
    expect(result.lines[0].category).toBe('system');
  });

  it('returns password-has-space error', async () => {
    const handler = makeHandler({ create: jest.fn().mockResolvedValue({ error: 'password_has_space' }) });
    const result = await handler.command.handler(makeShip(), ['create', 'Raiders', 'a b'], ctx);
    expect(result.lines[0].text).toBe('Team password may not contain spaces.');
    expect(result.lines[0].category).toBe('system');
  });

  it('returns name-taken error', async () => {
    const handler = makeHandler({ create: jest.fn().mockResolvedValue({ error: 'name_taken' }) });
    const result = await handler.command.handler(makeShip(), ['create', 'Raiders', 'pw'], ctx);
    expect(result.lines[0].text).toBe('Team name already taken.');
    expect(result.lines[0].category).toBe('system');
  });
});

// ── T015: US2 — tea <name> <password> join branch ─────────────────────────────

describe('TeaHandlerService — tea password-gated join', () => {
  it('returns success line on join with correct password', async () => {
    const handler = makeHandler({ joinByPassword: jest.fn().mockResolvedValue({ ok: true, teamname: 'Galactic Raiders' }) });
    const result = await handler.command.handler(makeShip(), ['Galactic', 'Raiders', 's3cret'], ctx);
    expect(result.lines[0].text).toBe('You have joined team Galactic Raiders.');
    expect(result.lines[0].category).toBe('success');
  });

  it('emits player.snapshot broadcast on join success', async () => {
    const handler = makeHandler({ joinByPassword: jest.fn().mockResolvedValue({ ok: true, teamname: 'Raiders' }) });
    const result = await handler.command.handler(makeShip(), ['Raiders', 'pw'], ctx);
    expect(result.broadcasts?.some((b) => b.event === 'player.snapshot')).toBe(true);
  });

  it('returns already-on-team error', async () => {
    const handler = makeHandler({ joinByPassword: jest.fn().mockResolvedValue({ error: 'already_on_team' }) });
    const result = await handler.command.handler(makeShip(), ['Raiders', 'pw'], ctx);
    expect(result.lines[0].text).toBe("You are already on a team. Use 'tea leave' first.");
    expect(result.lines[0].category).toBe('system');
  });

  it('returns no-such-team error', async () => {
    const handler = makeHandler({ joinByPassword: jest.fn().mockResolvedValue({ error: 'no_such_team' }) });
    const result = await handler.command.handler(makeShip(), ['Nonexistent', 'pw'], ctx);
    expect(result.lines[0].text).toBe('No such team: Nonexistent');
    expect(result.lines[0].category).toBe('system');
  });

  it('returns wrong-password error', async () => {
    const handler = makeHandler({ joinByPassword: jest.fn().mockResolvedValue({ error: 'wrong_password' }) });
    const result = await handler.command.handler(makeShip(), ['Raiders', 'wrongpw'], ctx);
    expect(result.lines[0].text).toBe('Wrong password.');
    expect(result.lines[0].category).toBe('system');
  });

  it('single-token form routes to show-current-team (FR-016a regression)', async () => {
    const handler = makeHandler({}, { teamcode: 1n, teamname: 'Raiders' });
    const ship = makeShip({ teamcode: 1n });
    const result = await handler.command.handler(ship, ['Raiders'], ctx);
    // Should show team, NOT attempt a join (no joinByPassword call)
    expect(result.lines[0].text).toMatch(/Raiders/);
    expect(result.lines[0].category).toBe('info');
  });
});

// ── T021: US3 — tea list ──────────────────────────────────────────────────────

describe('TeaHandlerService — tea list', () => {
  it('returns header line', async () => {
    const handler = makeHandler({
      list: jest.fn().mockResolvedValue([
        { rank: 1, teamcode: 1n, teamname: 'Raiders', members: 3, score: 100n },
      ]),
    });
    const result = await handler.command.handler(makeShip(), ['list'], ctx);
    expect(result.lines[0].text).toBe('  Rank  Team                            Members  Score');
    expect(result.lines[0].category).toBe('system');
  });

  it('returns row with correct fixed-width fields', async () => {
    const handler = makeHandler({
      list: jest.fn().mockResolvedValue([
        { rank: 1, teamcode: 1n, teamname: 'Raiders', members: 3, score: 12450n },
      ]),
    });
    const result = await handler.command.handler(makeShip(), ['list'], ctx);
    const row = result.lines[1];
    expect(row.category).toBe('info');
    expect(row.text).toContain('Raiders');
    expect(row.text).toContain('12450');
    expect(row.text).toContain('3');
  });

  it('returns "No teams have been formed." when empty', async () => {
    const handler = makeHandler({ list: jest.fn().mockResolvedValue([]) });
    const result = await handler.command.handler(makeShip(), ['list'], ctx);
    expect(result.lines[0].text).toBe('No teams have been formed.');
    expect(result.lines[0].category).toBe('info');
  });
});
