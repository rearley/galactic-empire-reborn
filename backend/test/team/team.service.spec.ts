import { TeamService } from '../../src/game/team/team.service';
import { TeamRepository } from '../../src/game/team/team.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { TEAM_LIST_DISPLAY_CAP, MAXTEAMS, MAX_TEAMNAME_LENGTH, MAX_TEAM_PASSWORD_LENGTH } from '../../src/game/team/team.types';
import { TEAMMAX } from '../../src/game/constants';


/**
 * Prisma double for joinByPassword, which does its count-and-join inside a
 * $transaction with the team row locked FOR UPDATE -- read-then-write outside a
 * transaction is a TOCTOU race that lets two concurrent joins share the last
 * slot. The mock runs the callback against the same doubles so the sequence is
 * exercised rather than stubbed away.
 */
function makePrisma(opts: { memberCount: number; update?: jest.Mock }): PrismaService {
  const update = opts.update ?? jest.fn().mockResolvedValue({});
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: { count: jest.fn().mockResolvedValue(opts.memberCount), update },
  };
  return {
    user: { update, count: jest.fn().mockResolvedValue(opts.memberCount) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
}

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

function makeService(
  repoOverrides: Partial<TeamRepository> = {},
  prismaOverrides: Partial<PrismaService> = {},
): TeamService {
  const repo = {
    getMaxTeamcode: jest.fn().mockResolvedValue(0n),
    insertTeam: jest.fn().mockResolvedValue(undefined),
    findByNameLower: jest.fn().mockResolvedValue(null),
    liveCountsGroupBy: jest.fn().mockResolvedValue([]),
    findTeamsByCodes: jest.fn().mockResolvedValue([]),
    ...repoOverrides,
  } as unknown as TeamRepository;

  const prisma = {
    $transaction: jest.fn().mockImplementation(async (fn: (p: unknown) => unknown) => fn(prisma)),
    user: {
      update: jest.fn().mockResolvedValue({}),
      groupBy: jest.fn().mockResolvedValue([]),
      // joinByPassword counts live members to enforce TEAMMAX (GECMDS.C:5357).
      count: jest.fn().mockResolvedValue(0),
    },
    team: {
      aggregate: jest.fn().mockResolvedValue({ _max: { teamcode: null } }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...prismaOverrides,
  } as unknown as PrismaService;

  return new TeamService(prisma, repo);
}

// ── T009: US1 — TeamService.create ────────────────────────────────────────────

describe('TeamService.create', () => {
  it('allocates teamcode as MAX(teamcode)+1', async () => {
    const repo = {
      getMaxTeamcode: jest.fn().mockResolvedValue(5n),
      insertTeam: jest.fn().mockResolvedValue(undefined),
      findByNameLower: jest.fn(),
      liveCountsGroupBy: jest.fn(),
      findTeamsByCodes: jest.fn(),
    } as unknown as TeamRepository;
    const userUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (fn: (p: unknown) => unknown) => fn(prisma)),
      user: { update: userUpdate },
    } as unknown as PrismaService;
    const svc = new TeamService(prisma, repo);
    const ship = makeShip({ teamcode: undefined });
    const result = await svc.create({ ship, name: 'Raiders', password: 'pw' });
    expect(result).toMatchObject({ ok: true, teamcode: 6n });
  });

  it('sets User.teamcode in the transaction', async () => {
    const repo = {
      getMaxTeamcode: jest.fn().mockResolvedValue(0n),
      insertTeam: jest.fn().mockResolvedValue(undefined),
    } as unknown as TeamRepository;
    const userUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (fn: (p: unknown) => unknown) => fn(prisma)),
      user: { update: userUpdate },
    } as unknown as PrismaService;
    const svc = new TeamService(prisma, repo);
    const ship = makeShip({ userid: 'alice', teamcode: undefined });
    await svc.create({ ship, name: 'Raiders', password: 'pw' });
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { userid: 'alice' } }));
  });

  it('mirrors ShipState.teamcode after create', async () => {
    const repo = {
      getMaxTeamcode: jest.fn().mockResolvedValue(0n),
      insertTeam: jest.fn().mockResolvedValue(undefined),
    } as unknown as TeamRepository;
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (fn: (p: unknown) => unknown) => fn(prisma)),
      user: { update: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const svc = new TeamService(prisma, repo);
    const ship = makeShip({ teamcode: undefined });
    await svc.create({ ship, name: 'Raiders', password: 'pw' });
    expect(ship.teamcode).toBe(1n);
    expect(ship.dirty).toBe(true);
  });

  it('preserves original casing of team name (FR-006)', async () => {
    const insertTeam = jest.fn().mockResolvedValue(undefined);
    const repo = {
      getMaxTeamcode: jest.fn().mockResolvedValue(0n),
      insertTeam,
    } as unknown as TeamRepository;
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (fn: (p: unknown) => unknown) => fn(prisma)),
      user: { update: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const svc = new TeamService(prisma, repo);
    const ship = makeShip({ teamcode: undefined });
    const result = await svc.create({ ship, name: 'Galactic Raiders', password: 'pw' });
    expect(result).toMatchObject({ ok: true, teamname: 'Galactic Raiders' });
    expect(insertTeam).toHaveBeenCalledWith(expect.objectContaining({ teamname: 'Galactic Raiders' }));
  });

  it('returns already_on_team when ship.teamcode is set', async () => {
    const svc = makeService();
    const ship = makeShip({ teamcode: 5n });
    const result = await svc.create({ ship, name: 'Raiders', password: 'pw' });
    expect(result).toEqual({ error: 'already_on_team' });
  });

  it('returns name_taken on P2002 after 3 retries', async () => {
    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    const repo = {
      getMaxTeamcode: jest.fn().mockResolvedValue(0n),
      insertTeam: jest.fn().mockRejectedValue(p2002),
    } as unknown as TeamRepository;
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (fn: (p: unknown) => unknown) => fn(prisma)),
      user: { update: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const svc = new TeamService(prisma, repo);
    const ship = makeShip({ teamcode: undefined });
    const result = await svc.create({ ship, name: 'Raiders', password: 'pw' });
    expect(result).toEqual({ error: 'name_taken' });
    expect(repo.insertTeam).toHaveBeenCalledTimes(3);
  });

  it('retries and succeeds when P2002 occurs once then succeeds', async () => {
    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    let callCount = 0;
    const repo = {
      getMaxTeamcode: jest.fn().mockResolvedValue(0n),
      insertTeam: jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw p2002;
        return Promise.resolve(undefined);
      }),
    } as unknown as TeamRepository;
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (fn: (p: unknown) => unknown) => fn(prisma)),
      user: { update: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const svc = new TeamService(prisma, repo);
    const ship = makeShip({ teamcode: undefined });
    const result = await svc.create({ ship, name: 'Raiders', password: 'pw' });
    expect(result).toMatchObject({ ok: true });
    expect(callCount).toBe(2);
  });
});

// ── T016: US2 — TeamService.joinByPassword ────────────────────────────────────

describe('TeamService.joinByPassword', () => {
  it('returns no_such_team when name has no case-insensitive match', async () => {
    const repo = { findByNameLower: jest.fn().mockResolvedValue(null) } as unknown as TeamRepository;
    const prisma = makePrisma({ memberCount: 0 });
    const svc = new TeamService(prisma, repo);
    const result = await svc.joinByPassword({ ship: makeShip(), name: 'Unknown', password: 'pw' });
    expect(result).toEqual({ error: 'no_such_team' });
  });

  it('returns wrong_password when team exists but password mismatch', async () => {
    const repo = {
      findByNameLower: jest.fn().mockResolvedValue({ teamcode: 1n, teamname: 'Raiders', password: 'correct' }),
    } as unknown as TeamRepository;
    const prisma = makePrisma({ memberCount: 0 });
    const svc = new TeamService(prisma, repo);
    const result = await svc.joinByPassword({ ship: makeShip(), name: 'Raiders', password: 'wrong' });
    expect(result).toEqual({ error: 'wrong_password' });
  });

  it('password comparison is case-sensitive', async () => {
    const repo = {
      findByNameLower: jest.fn().mockResolvedValue({ teamcode: 1n, teamname: 'Raiders', password: 'Secret' }),
    } as unknown as TeamRepository;
    const prisma = makePrisma({ memberCount: 0 });
    const svc = new TeamService(prisma, repo);
    const result = await svc.joinByPassword({ ship: makeShip(), name: 'Raiders', password: 'secret' });
    expect(result).toEqual({ error: 'wrong_password' });
  });

  it('returns already_on_team when ship already has a team', async () => {
    const svc = makeService();
    const ship = makeShip({ teamcode: 3n });
    const result = await svc.joinByPassword({ ship, name: 'Raiders', password: 'pw' });
    expect(result).toEqual({ error: 'already_on_team' });
  });

  it('returns ok and mirrors ShipState on success', async () => {
    const repo = {
      findByNameLower: jest.fn().mockResolvedValue({ teamcode: 7n, teamname: 'Raiders', password: 'pw' }),
    } as unknown as TeamRepository;
    const prisma = makePrisma({ memberCount: 0 });
    const svc = new TeamService(prisma, repo);
    const ship = makeShip({ teamcode: undefined });
    const result = await svc.joinByPassword({ ship, name: 'Raiders', password: 'pw' });
    expect(result).toEqual({ ok: true, teamname: 'Raiders' });
    expect(ship.teamcode).toBe(7n);
    expect(ship.dirty).toBe(true);
  });

  it('refuses to join a team that is already at TEAMMAX', async () => {
    // GECMDS.C:5357 refuses outright once teamcount >= team_max. Counted live
    // from the user table, not from Team.teamcount, which the midnight job
    // only recomputes daily -- reading that column would let a team overfill
    // freely within a single day.
    const repo = {
      findByNameLower: jest.fn().mockResolvedValue({ teamcode: 7n, teamname: 'Raiders', password: 'pw' }),
    } as unknown as TeamRepository;
    const update = jest.fn().mockResolvedValue({});
    const prisma = makePrisma({ memberCount: TEAMMAX, update });
    const svc = new TeamService(prisma, repo);
    const ship = makeShip({ teamcode: undefined });
    const result = await svc.joinByPassword({ ship, name: 'Raiders', password: 'pw' });
    expect(result).toEqual({ error: 'team_full', limit: TEAMMAX });
    expect(update).not.toHaveBeenCalled();
    expect(ship.teamcode).toBeUndefined();
  });

  it('counts and joins inside one transaction, with the team row locked', async () => {
    // The cap is only meaningful if the check and the write are atomic. Two
    // pilots taking the last slot concurrently would otherwise both read
    // TEAMMAX-1 and both succeed. The original could not hit this -- a BBS ran
    // one session at a time -- but a websocket server can.
    const repo = {
      findByNameLower: jest.fn().mockResolvedValue({ teamcode: 7n, teamname: 'Raiders', password: 'pw' }),
    } as unknown as TeamRepository;
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { count: jest.fn().mockResolvedValue(0), update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    const svc = new TeamService(prisma, repo);

    await svc.joinByPassword({ ship: makeShip({ teamcode: undefined }), name: 'Raiders', password: 'pw' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // The lock is taken BEFORE the count, or it serialises nothing.
    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0];
    const countOrder = tx.user.count.mock.invocationCallOrder[0];
    const updateOrder = tx.user.update.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(countOrder);
    expect(countOrder).toBeLessThan(updateOrder);
  });

  it('admits the member who exactly fills the last slot', async () => {
    const repo = {
      findByNameLower: jest.fn().mockResolvedValue({ teamcode: 7n, teamname: 'Raiders', password: 'pw' }),
    } as unknown as TeamRepository;
    const prisma = makePrisma({ memberCount: TEAMMAX - 1 });
    const svc = new TeamService(prisma, repo);
    const result = await svc.joinByPassword({ ship: makeShip({ teamcode: undefined }), name: 'Raiders', password: 'pw' });
    expect(result).toEqual({ ok: true, teamname: 'Raiders' });
  });
});

// ── T020: US3 — TeamService.list ──────────────────────────────────────────────

describe('TeamService.list', () => {
  it('returns empty array when no teams', async () => {
    const svc = makeService({ liveCountsGroupBy: jest.fn().mockResolvedValue([]) });
    expect(await svc.list()).toEqual([]);
  });

  it('returns teams ordered by score desc', async () => {
    const repo = {
      liveCountsGroupBy: jest.fn().mockResolvedValue([
        { teamcode: 1n, count: 2 },
        { teamcode: 2n, count: 3 },
      ]),
      findTeamsByCodes: jest.fn().mockResolvedValue([
        { teamcode: 1n, teamname: 'Alpha', teamscore: 100n },
        { teamcode: 2n, teamname: 'Beta', teamscore: 200n },
      ]),
    } as unknown as TeamRepository;
    const svc = makeService(repo);
    const entries = await svc.list();
    expect(entries[0].teamname).toBe('Beta');
    expect(entries[1].teamname).toBe('Alpha');
  });

  it('tie-breaks equal scores by teamcode asc', async () => {
    const repo = {
      liveCountsGroupBy: jest.fn().mockResolvedValue([
        { teamcode: 3n, count: 1 },
        { teamcode: 1n, count: 1 },
      ]),
      findTeamsByCodes: jest.fn().mockResolvedValue([
        { teamcode: 3n, teamname: 'Third', teamscore: 500n },
        { teamcode: 1n, teamname: 'First', teamscore: 500n },
      ]),
    } as unknown as TeamRepository;
    const svc = makeService(repo);
    const entries = await svc.list();
    expect(entries[0].teamcode).toBe(1n);
    expect(entries[1].teamcode).toBe(3n);
  });

  it('excludes teams with 0 live members', async () => {
    const repo = {
      liveCountsGroupBy: jest.fn().mockResolvedValue([
        { teamcode: 1n, count: 2 },
        { teamcode: 2n, count: 0 },
      ]),
      findTeamsByCodes: jest.fn().mockResolvedValue([
        { teamcode: 1n, teamname: 'Alpha', teamscore: 100n },
      ]),
    } as unknown as TeamRepository;
    const svc = makeService(repo);
    const entries = await svc.list();
    expect(entries.length).toBe(1);
    expect(entries[0].teamname).toBe('Alpha');
  });

  it('caps results at TEAM_LIST_DISPLAY_CAP (20)', async () => {
    const counts = Array.from({ length: 25 }, (_, i) => ({ teamcode: BigInt(i + 1), count: 1 }));
    const teams = counts.map((c) => ({ teamcode: c.teamcode, teamname: `Team${c.teamcode}`, teamscore: 0n }));
    const repo = {
      liveCountsGroupBy: jest.fn().mockResolvedValue(counts),
      findTeamsByCodes: jest.fn().mockResolvedValue(teams),
    } as unknown as TeamRepository;
    const svc = makeService(repo);
    const entries = await svc.list();
    expect(entries.length).toBe(20);
  });

  it('does not include password in returned TeamListEntry', async () => {
    const repo = {
      liveCountsGroupBy: jest.fn().mockResolvedValue([{ teamcode: 1n, count: 2 }]),
      findTeamsByCodes: jest.fn().mockResolvedValue([
        { teamcode: 1n, teamname: 'Alpha', teamscore: 100n },
      ]),
    } as unknown as TeamRepository;
    const svc = makeService(repo);
    const entries = await svc.list();
    expect(entries[0]).not.toHaveProperty('password');
  });
});

// ── T022: Balance regression constants ────────────────────────────────────────

describe('Balance regression constants', () => {
  it('TEAM_LIST_DISPLAY_CAP === 20', () => {
    expect(TEAM_LIST_DISPLAY_CAP).toBe(20);
  });

  it('MAXTEAMS === 50 (GEMAIN.H:240)', () => {
    expect(MAXTEAMS).toBe(50);
  });

  it('MAX_TEAMNAME_LENGTH === 30 (GEMAIN.H:307 teamname[31])', () => {
    expect(MAX_TEAMNAME_LENGTH).toBe(30);
  });

  it('MAX_TEAM_PASSWORD_LENGTH === 10, the canon field width', () => {
    // Was 8, as "FR-011a, documented deviation from original 10". The entry it
    // pointed at (DECISIONS.md, 2026-05-08) justifies auto-assigned teamcodes
    // and a single password, and says nothing about the length -- so the cap
    // was written down but never argued for, which is not the same as a
    // documented deviation. Canon is `password[11]` (GEMAIN.H:650) filled by
    // `strncpy(tmp.password, margv[4], 10)` (GECMDS.C:5518).
    expect(MAX_TEAM_PASSWORD_LENGTH).toBe(10);
  });
});
