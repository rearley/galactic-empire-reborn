import { TeamService } from '../../src/game/team/team.service';
import { TeamRepository } from '../../src/game/team/team.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { TEAM_LIST_DISPLAY_CAP, MAXTEAMS, MAX_TEAMNAME_LENGTH, MAX_TEAM_PASSWORD_LENGTH } from '../../src/game/team/team.types';
import { TEAMMAX } from '../../src/game/constants';
import { makeShip as baseMakeShip } from '../helpers/make-ship';
import type { Mock } from 'vitest';


/**
 * Prisma double for joinByPassword, which does its count-and-join inside a
 * $transaction with the team row locked FOR UPDATE -- read-then-write outside a
 * transaction is a TOCTOU race that lets two concurrent joins share the last
 * slot. The mock runs the callback against the same doubles so the sequence is
 * exercised rather than stubbed away.
 */
function makePrisma(opts: { memberCount: number; update?: Mock }): PrismaService {
  const update = opts.update ?? vi.fn().mockResolvedValue({});
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    user: { count: vi.fn().mockResolvedValue(opts.memberCount), update },
  };
  return {
    user: { update, count: vi.fn().mockResolvedValue(opts.memberCount) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
}

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    ...overrides,
  });
}

function makeService(
  repoOverrides: Partial<TeamRepository> = {},
  prismaOverrides: Partial<PrismaService> = {},
): TeamService {
  const repo = {
    getMaxTeamcode: vi.fn().mockResolvedValue(0n),
    countTeams: vi.fn().mockResolvedValue(0),
    insertTeam: vi.fn().mockResolvedValue(undefined),
    findByNameLower: vi.fn().mockResolvedValue(null),
    liveCountsGroupBy: vi.fn().mockResolvedValue([]),
    findTeamsByCodes: vi.fn().mockResolvedValue([]),
    ...repoOverrides,
  } as unknown as TeamRepository;

  const prisma = {
    // `create` takes a transaction-scoped advisory lock as the callback's first
    // statement, so the double has to answer $queryRaw. @see issue #14
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn().mockImplementation(async (fn: (p: unknown) => unknown) => fn(prisma)),
    user: {
      update: vi.fn().mockResolvedValue({}),
      groupBy: vi.fn().mockResolvedValue([]),
      // joinByPassword counts live members to enforce TEAMMAX (GECMDS.C:5357).
      count: vi.fn().mockResolvedValue(0),
    },
    team: {
      aggregate: vi.fn().mockResolvedValue({ _max: { teamcode: null } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...prismaOverrides,
  } as unknown as PrismaService;

  return new TeamService(prisma, repo);
}

// ── T009: US1 — TeamService.create ────────────────────────────────────────────

describe('TeamService.create', () => {
  it('allocates teamcode as MAX(teamcode)+1', async () => {
    const repo = {
      getMaxTeamcode: vi.fn().mockResolvedValue(5n),
      countTeams: vi.fn().mockResolvedValue(0),
      insertTeam: vi.fn().mockResolvedValue(undefined),
      findByNameLower: vi.fn(),
      liveCountsGroupBy: vi.fn(),
      findTeamsByCodes: vi.fn(),
    } as unknown as TeamRepository;
    const userUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn().mockImplementation(async (fn: (p: unknown) => unknown) => fn(prisma)),
      user: { update: userUpdate },
    } as unknown as PrismaService;
    const svc = new TeamService(prisma, repo);
    const ship = makeShip({ teamcode: undefined });
    const result = await svc.create({ ship, name: 'Raiders', password: 'pw' });
    expect(result).toMatchObject({ ok: true, teamcode: 6n });
  });

  it('sets User.teamcode in the transaction', async () => {
    const repo = {
      getMaxTeamcode: vi.fn().mockResolvedValue(0n),
      countTeams: vi.fn().mockResolvedValue(0),
      insertTeam: vi.fn().mockResolvedValue(undefined),
    } as unknown as TeamRepository;
    const userUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn().mockImplementation(async (fn: (p: unknown) => unknown) => fn(prisma)),
      user: { update: userUpdate },
    } as unknown as PrismaService;
    const svc = new TeamService(prisma, repo);
    const ship = makeShip({ userid: 'alice', teamcode: undefined });
    await svc.create({ ship, name: 'Raiders', password: 'pw' });
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { userid: 'alice' } }));
  });

  it('mirrors ShipState.teamcode after create', async () => {
    const repo = {
      getMaxTeamcode: vi.fn().mockResolvedValue(0n),
      countTeams: vi.fn().mockResolvedValue(0),
      insertTeam: vi.fn().mockResolvedValue(undefined),
    } as unknown as TeamRepository;
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn().mockImplementation(async (fn: (p: unknown) => unknown) => fn(prisma)),
      user: { update: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const svc = new TeamService(prisma, repo);
    const ship = makeShip({ teamcode: undefined });
    await svc.create({ ship, name: 'Raiders', password: 'pw' });
    expect(ship.teamcode).toBe(1n);
    expect(ship.dirty).toBe(true);
  });

  it('preserves original casing of team name (FR-006)', async () => {
    const insertTeam = vi.fn().mockResolvedValue(undefined);
    const repo = {
      getMaxTeamcode: vi.fn().mockResolvedValue(0n),
      countTeams: vi.fn().mockResolvedValue(0),
      insertTeam,
    } as unknown as TeamRepository;
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn().mockImplementation(async (fn: (p: unknown) => unknown) => fn(prisma)),
      user: { update: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const svc = new TeamService(prisma, repo);
    const ship = makeShip({ teamcode: undefined });
    const result = await svc.create({ ship, name: 'Galactic Raiders', password: 'pw' });
    expect(result).toMatchObject({ ok: true, teamname: 'Galactic Raiders' });
    expect(insertTeam).toHaveBeenCalledWith(
      expect.objectContaining({ teamname: 'Galactic Raiders' }),
      // The transaction client — both writes ride it. @see issue #14
      expect.anything(),
    );
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
      getMaxTeamcode: vi.fn().mockResolvedValue(0n),
      countTeams: vi.fn().mockResolvedValue(0),
      insertTeam: vi.fn().mockRejectedValue(p2002),
    } as unknown as TeamRepository;
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn().mockImplementation(async (fn: (p: unknown) => unknown) => fn(prisma)),
      user: { update: vi.fn().mockResolvedValue({}) },
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
      getMaxTeamcode: vi.fn().mockResolvedValue(0n),
      countTeams: vi.fn().mockResolvedValue(0),
      insertTeam: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw p2002;
        return Promise.resolve(undefined);
      }),
    } as unknown as TeamRepository;
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn().mockImplementation(async (fn: (p: unknown) => unknown) => fn(prisma)),
      user: { update: vi.fn().mockResolvedValue({}) },
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
    const repo = { findByNameLower: vi.fn().mockResolvedValue(null) } as unknown as TeamRepository;
    const prisma = makePrisma({ memberCount: 0 });
    const svc = new TeamService(prisma, repo);
    const result = await svc.joinByPassword({ ship: makeShip(), name: 'Unknown', password: 'pw' });
    expect(result).toEqual({ error: 'no_such_team' });
  });

  it('returns wrong_password when team exists but password mismatch', async () => {
    const repo = {
      findByNameLower: vi.fn().mockResolvedValue({ teamcode: 1n, teamname: 'Raiders', password: 'correct' }),
    } as unknown as TeamRepository;
    const prisma = makePrisma({ memberCount: 0 });
    const svc = new TeamService(prisma, repo);
    const result = await svc.joinByPassword({ ship: makeShip(), name: 'Raiders', password: 'wrong' });
    expect(result).toEqual({ error: 'wrong_password' });
  });

  it('password comparison is case-sensitive', async () => {
    const repo = {
      findByNameLower: vi.fn().mockResolvedValue({ teamcode: 1n, teamname: 'Raiders', password: 'Secret' }),
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
      findByNameLower: vi.fn().mockResolvedValue({ teamcode: 7n, teamname: 'Raiders', password: 'pw' }),
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
      findByNameLower: vi.fn().mockResolvedValue({ teamcode: 7n, teamname: 'Raiders', password: 'pw' }),
    } as unknown as TeamRepository;
    const update = vi.fn().mockResolvedValue({});
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
      findByNameLower: vi.fn().mockResolvedValue({ teamcode: 7n, teamname: 'Raiders', password: 'pw' }),
    } as unknown as TeamRepository;
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: { count: vi.fn().mockResolvedValue(0), update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
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
      findByNameLower: vi.fn().mockResolvedValue({ teamcode: 7n, teamname: 'Raiders', password: 'pw' }),
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
    const svc = makeService({ liveCountsGroupBy: vi.fn().mockResolvedValue([]) });
    expect(await svc.list()).toEqual([]);
  });

  it('returns teams ordered by score desc', async () => {
    const repo = {
      liveCountsGroupBy: vi.fn().mockResolvedValue([
        { teamcode: 1n, count: 2 },
        { teamcode: 2n, count: 3 },
      ]),
      findTeamsByCodes: vi.fn().mockResolvedValue([
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
      liveCountsGroupBy: vi.fn().mockResolvedValue([
        { teamcode: 3n, count: 1 },
        { teamcode: 1n, count: 1 },
      ]),
      findTeamsByCodes: vi.fn().mockResolvedValue([
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
      liveCountsGroupBy: vi.fn().mockResolvedValue([
        { teamcode: 1n, count: 2 },
        { teamcode: 2n, count: 0 },
      ]),
      findTeamsByCodes: vi.fn().mockResolvedValue([
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
      liveCountsGroupBy: vi.fn().mockResolvedValue(counts),
      findTeamsByCodes: vi.fn().mockResolvedValue(teams),
    } as unknown as TeamRepository;
    const svc = makeService(repo);
    const entries = await svc.list();
    expect(entries.length).toBe(20);
  });

  it('does not include password in returned TeamListEntry', async () => {
    const repo = {
      liveCountsGroupBy: vi.fn().mockResolvedValue([{ teamcode: 1n, count: 2 }]),
      findTeamsByCodes: vi.fn().mockResolvedValue([
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

/**
 * Canon refuses to create the 51st team.
 *
 *   numteams = 0;
 *   for (next=0;next<MAXTEAMS;++next) {
 *       if (teamtab[next].teamcode == 0) break;
 *       numteams++;
 *   }
 *   if (numteams >= MAXTEAMS) { prfmsg(TOOMANY,MAXTEAMS); outprf(usrnum); return; }
 *
 * @see GECMDS.C:5477-5490 (cmd_team, "start" branch)
 * @see GEMAIN.H:240 `#define MAXTEAMS 50`
 *
 * `MAXTEAMS` was declared twice in the port (team.types.ts, midnight.constants.ts)
 * and read by neither: the cap existed as documentation only. It matters for the
 * same reason TEAMMAX does — the midnight job pays TEAMBONU per member and
 * ranks the team table — so an unbounded table is a scoreboard problem, not a
 * storage one.
 */
describe('TeamService.create enforces MAXTEAMS (GECMDS.C:5484)', () => {
  it('refuses when the table is already full', async () => {
    const svc = makeService({ countTeams: vi.fn().mockResolvedValue(MAXTEAMS) });

    const res = await svc.create({ ship: makeShip(), name: 'Latecomers', password: 'pw' });

    expect(res).toEqual({ error: 'too_many', limit: MAXTEAMS });
  });

  it('allows the last free slot — the gate is >=, not >', async () => {
    const svc = makeService({ countTeams: vi.fn().mockResolvedValue(MAXTEAMS - 1) });

    const res = await svc.create({ ship: makeShip(), name: 'JustInTime', password: 'pw' });

    expect(res).toMatchObject({ ok: true, teamname: 'JustInTime' });
  });

  it('does not write a team row when it refuses', async () => {
    const insertTeam = vi.fn().mockResolvedValue(undefined);
    const svc = makeService({ countTeams: vi.fn().mockResolvedValue(MAXTEAMS), insertTeam });

    await svc.create({ ship: makeShip(), name: 'Latecomers', password: 'pw' });

    expect(insertTeam).not.toHaveBeenCalled();
  });
});
