/**
 * `tea` sub-verbs that were missing from the port: members / kick / newpass /
 * newname, plus the canon verb aliases join / unjoin / score / start.
 *
 * @see GECMDS.C:5277 cmd_team
 */
import { TeaHandlerService } from '../../src/game/commands/handlers/tea.handler';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { TeamService } from '../../src/game/team/team.service';
import { TeamRepository } from '../../src/game/team/team.repository';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandContext } from '../../src/game/commands/command.types';
import { makeShip as baseMakeShip } from '../helpers/make-ship';
import type { Mock } from 'vitest';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    ...overrides,
  });
}

const ctx: CommandContext = {};

// ─────────────────────────────────────────────────────────────────────────────
// TeamService — the founder-gated admin verbs
// ─────────────────────────────────────────────────────────────────────────────

interface PrismaStub {
  team: { findFirst: Mock; update: Mock; create: Mock; aggregate: Mock; count: Mock };
  user: { findUnique: Mock; update: Mock; count: Mock; findMany: Mock };
  mailStat: { create: Mock };
  $transaction: Mock;
  /** `create` takes a transaction-scoped advisory lock first. @see issue #14 */
  $queryRaw: Mock;
}

function makePrisma(over: Partial<Record<string, unknown>> = {}): PrismaStub {
  const p: PrismaStub = {
    team: {
      findFirst: vi.fn().mockResolvedValue({
        teamcode: 7n, teamname: 'Raiders', secret: 'FOUND123', password: 'joinpw',
      }),
      update: vi.fn().mockResolvedValue({}),
      // countTeams() — canon's MAXTEAMS gate on `tea create` (GECMDS.C:5484).
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
      aggregate: vi.fn().mockResolvedValue({ _max: { teamcode: 0n } }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ userid: 'victim', teamcode: 7n }),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([{ userid: 'u1' }, { userid: 'victim' }]),
    },
    mailStat: { create: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(p)),
  };
  Object.assign(p, over);
  return p;
}

function makeService(prisma: PrismaStub): TeamService {
  const repo = new TeamRepository(prisma as unknown as PrismaService);
  return new TeamService(prisma as unknown as PrismaService, repo);
}

describe('TeamService.membersOf — `team members` (GECMDS.C:5565)', () => {
  it('refuses when the player is on no team', async () => {
    const svc = makeService(makePrisma());
    const r = await svc.membersOf(makeShip({ teamcode: undefined }));
    expect(r).toEqual({ error: 'not_on_team' });
  });

  it('returns the userids of everyone sharing the teamcode', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    const r = await svc.membersOf(makeShip({ teamcode: 7n }));
    expect(r).toEqual({ ok: true, teamname: 'Raiders', members: ['u1', 'victim'] });
  });
});

describe('TeamService founder gate (GECMDS.C:5674 TEAMBDSC)', () => {
  it('rejects a wrong founder password', async () => {
    const svc = makeService(makePrisma());
    const r = await svc.newPassword({ ship: makeShip({ teamcode: 7n }), secret: 'nope', password: 'x' });
    expect(r).toEqual({ error: 'bad_secret' });
  });

  it('rejects when the player is on no team', async () => {
    const svc = makeService(makePrisma());
    const r = await svc.newPassword({ ship: makeShip({ teamcode: undefined }), secret: 'FOUND123', password: 'x' });
    expect(r).toEqual({ error: 'not_on_team' });
  });
});

describe('TeamService.newPassword — `team newpass` (GECMDS.C:5682)', () => {
  it('writes the new join password', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    const r = await svc.newPassword({ ship: makeShip({ teamcode: 7n }), secret: 'FOUND123', password: 'newpw' });
    expect(r).toEqual({ ok: true, password: 'newpw' });
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { teamcode: 7n },
      data: { password: 'newpw' },
    });
  });

  it('rejects an over-length password before writing', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    const r = await svc.newPassword({ ship: makeShip({ teamcode: 7n }), secret: 'FOUND123', password: '1234567890X' });
    expect(r).toEqual({ error: 'password_too_long' });
    expect(prisma.team.update).not.toHaveBeenCalled();
  });
});

describe('TeamService.newName — `team newname` (GECMDS.C:5724)', () => {
  it('rejects a name shorter than 5 characters (TEAMBNAM)', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    const r = await svc.newName({ ship: makeShip({ teamcode: 7n }), secret: 'FOUND123', name: 'abcd' });
    expect(r).toEqual({ error: 'name_too_short' });
    expect(prisma.team.update).not.toHaveBeenCalled();
  });

  it('writes an acceptable name', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    const r = await svc.newName({ ship: makeShip({ teamcode: 7n }), secret: 'FOUND123', name: 'Star Vipers' });
    expect(r).toEqual({ ok: true, teamname: 'Star Vipers' });
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { teamcode: 7n },
      data: { teamname: 'Star Vipers' },
    });
  });

  it('refuses to duplicate an existing team name', async () => {
    const prisma = makePrisma();
    prisma.team.update.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const svc = makeService(prisma);
    const r = await svc.newName({ ship: makeShip({ teamcode: 7n }), secret: 'FOUND123', name: 'Star Vipers' });
    expect(r).toEqual({ error: 'name_taken' });
  });
});

describe('TeamService.kick — `team kick` (GECMDS.C:5614)', () => {
  it('clears the target teamcode and mails them', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    const r = await svc.kick({ ship: makeShip({ teamcode: 7n }), secret: 'FOUND123', userid: 'victim' });
    expect(r).toEqual({ ok: true, userid: 'victim', teamname: 'Raiders' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { userid: 'victim' },
      data: { teamcode: null },
    });
    const mail = prisma.mailStat.create.mock.calls[0][0].data;
    expect(mail.userid).toBe('victim');
    expect(mail.topic).toBe('Team Membership Revoked');
    expect(mail.dtime).toBe('u1');
  });

  it('reports an unknown userid (TEAMNFND)', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    const svc = makeService(prisma);
    const r = await svc.kick({ ship: makeShip({ teamcode: 7n }), secret: 'FOUND123', userid: 'ghost' });
    expect(r).toEqual({ error: 'user_not_found' });
    expect(prisma.mailStat.create).not.toHaveBeenCalled();
  });

  it('reports a userid on another team (TEAMNTM)', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ userid: 'other', teamcode: 9n });
    const svc = makeService(prisma);
    const r = await svc.kick({ ship: makeShip({ teamcode: 7n }), secret: 'FOUND123', userid: 'other' });
    expect(r).toEqual({ error: 'not_on_your_team' });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('TeamService.create — founder password (GECMDS.C:5559 TEAMCRT)', () => {
  it('generates and returns a founder password, and stores it as the secret', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    const r = await svc.create({ ship: makeShip({ teamcode: undefined }), name: 'Raiders', password: 'joinpw' });
    expect('ok' in r).toBe(true);
    if (!('ok' in r)) return;
    expect(r.secret).toMatch(/^[A-Z0-9]{8}$/);
    expect(prisma.team.create.mock.calls[0][0].data.secret).toBe(r.secret);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Handler routing + canon message text
// ─────────────────────────────────────────────────────────────────────────────

function makeHandler(teamSvcOver: Partial<Record<string, unknown>> = {}): {
  handler: TeaHandlerService;
  teamSvc: Record<string, Mock>;
  ships: ShipState[];
} {
  const prismaMock = {
    team: { findFirst: vi.fn().mockResolvedValue({ teamname: 'Raiders' }) },
    user: { update: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  const ships: ShipState[] = [];
  const shipStateSvcMock = {
    findByUserid: vi.fn((uid: string) => ships.filter((s) => s.userid === uid)),
  } as unknown as ShipStateService;
  const teamSvc = {
    create: vi.fn().mockResolvedValue({ ok: true, teamcode: 1n, teamname: 'Raiders', secret: 'ABCD1234' }),
    joinByPassword: vi.fn().mockResolvedValue({ ok: true, teamname: 'Raiders' }),
    list: vi.fn().mockResolvedValue([]),
    membersOf: vi.fn().mockResolvedValue({ ok: true, teamname: 'Raiders', members: ['u1', 'u2'] }),
    kick: vi.fn().mockResolvedValue({ ok: true, userid: 'victim', teamname: 'Raiders' }),
    newPassword: vi.fn().mockResolvedValue({ ok: true, password: 'newpw' }),
    newName: vi.fn().mockResolvedValue({ ok: true, teamname: 'Star Vipers' }),
    ...teamSvcOver,
  } as unknown as Record<string, Mock>;
  return {
    handler: new TeaHandlerService(prismaMock, shipStateSvcMock, teamSvc as unknown as TeamService),
    teamSvc,
    ships,
  };
}

const text = (r: { lines: { text: string }[] }): string => r.lines.map((l) => l.text).join('\n');

describe('tea members', () => {
  it('prints the canon header and a comma-separated member list', async () => {
    const { handler } = makeHandler();
    const r = await handler.command.handler(makeShip({ teamcode: 1n }), ['members'], ctx);
    expect(r.lines[0].text).toBe('The members of your team are...');
    expect(r.lines[1].text).toBe('u1, u2');
  });

  it('prints TEAMNOT when the player has no team', async () => {
    const { handler } = makeHandler({ membersOf: vi.fn().mockResolvedValue({ error: 'not_on_team' }) });
    const r = await handler.command.handler(makeShip(), ['members'], ctx);
    expect(r.lines[0].text).toBe("You don't seem to currently be a member of a valid team, Sorry!");
  });
});

describe('tea kick', () => {
  it('confirms with the canon TEAMKICK text', async () => {
    const { handler } = makeHandler();
    const r = await handler.command.handler(makeShip({ teamcode: 1n }), ['kick', 'ABCD1234', 'victim'], ctx);
    expect(text(r)).toContain('As you requested victim has been removed from the team and');
    expect(text(r)).toContain('sent an email message notifying him/her of this action.');
  });

  it('clears the kicked pilot in-memory ship teamcode', async () => {
    const { handler, ships } = makeHandler();
    const victim = makeShip({ userid: 'victim', teamcode: 1n });
    ships.push(victim);
    await handler.command.handler(makeShip({ teamcode: 1n }), ['kick', 'ABCD1234', 'victim'], ctx);
    expect(victim.teamcode).toBeUndefined();
    expect(victim.dirty).toBe(true);
  });

  it('prints TEAMBDSC on a bad founder password', async () => {
    const { handler } = makeHandler({ kick: vi.fn().mockResolvedValue({ error: 'bad_secret' }) });
    const r = await handler.command.handler(makeShip({ teamcode: 1n }), ['kick', 'wrong', 'victim'], ctx);
    expect(r.lines[0].text).toBe('Sorry, that is not the valid Founders Password.');
  });

  it('prints TEAMNFND for an unknown userid', async () => {
    const { handler } = makeHandler({ kick: vi.fn().mockResolvedValue({ error: 'user_not_found' }) });
    const r = await handler.command.handler(makeShip({ teamcode: 1n }), ['kick', 'pw', 'ghost'], ctx);
    expect(r.lines[0].text).toBe('That Userid does not seem to be currently in the game.');
  });

  it('prints TEAMNTM for a userid on another team', async () => {
    const { handler } = makeHandler({ kick: vi.fn().mockResolvedValue({ error: 'not_on_your_team' }) });
    const r = await handler.command.handler(makeShip({ teamcode: 1n }), ['kick', 'pw', 'other'], ctx);
    expect(r.lines[0].text).toBe('That Userid is not currently on your team.');
  });

  it('prints TEAMFMT when arguments are missing', async () => {
    const { handler, teamSvc } = makeHandler();
    const r = await handler.command.handler(makeShip({ teamcode: 1n }), ['kick', 'pw'], ctx);
    expect(r.lines[0].text).toBe('Type HELP TEAM for the correct usage.');
    expect(teamSvc.kick).not.toHaveBeenCalled();
  });
});

describe('tea newpass', () => {
  it('prints TEAMNPSS with the new password', async () => {
    const { handler } = makeHandler();
    const r = await handler.command.handler(makeShip({ teamcode: 1n }), ['newpass', 'ABCD1234', 'newpw'], ctx);
    expect(r.lines[0].text).toBe('The team password has been changed to "newpw".');
  });

  it('prints TEAMBPSS for an over-length password', async () => {
    const { handler } = makeHandler({ newPassword: vi.fn().mockResolvedValue({ error: 'password_too_long' }) });
    const r = await handler.command.handler(makeShip({ teamcode: 1n }), ['newpass', 'ABCD1234', '1234567890X'], ctx);
    expect(r.lines[0].text).toBe('That password is too long - please shorten it to 10 characters or less.');
  });
});

describe('tea newname', () => {
  it('prints TEAMNNAM with the new name', async () => {
    const { handler } = makeHandler();
    const r = await handler.command.handler(makeShip({ teamcode: 1n }), ['newname', 'ABCD1234', 'Star', 'Vipers'], ctx);
    expect(r.lines[0].text).toBe('The new team name is now "Star Vipers".');
  });

  it('joins the trailing tokens into one name', async () => {
    const { handler, teamSvc } = makeHandler();
    await handler.command.handler(makeShip({ teamcode: 1n }), ['newname', 'ABCD1234', 'Star', 'Vipers'], ctx);
    expect(teamSvc.newName.mock.calls[0][0].name).toBe('Star Vipers');
  });

  it('prints TEAMBNAM for a name under 5 characters', async () => {
    const { handler } = makeHandler({ newName: vi.fn().mockResolvedValue({ error: 'name_too_short' }) });
    const r = await handler.command.handler(makeShip({ teamcode: 1n }), ['newname', 'ABCD1234', 'abcd'], ctx);
    expect(r.lines[0].text).toBe('The team name must be at least 5 characters long.');
  });

  it('prints TEAMEXST when the name is taken', async () => {
    const { handler } = makeHandler({ newName: vi.fn().mockResolvedValue({ error: 'name_taken' }) });
    const r = await handler.command.handler(makeShip({ teamcode: 1n }), ['newname', 'ABCD1234', 'Raiders'], ctx);
    expect(r.lines[0].text).toBe('That team name or team code already exists...choose another.');
  });
});

describe('canon verb aliases (GECMDS.C:5299/5384/5431/5471)', () => {
  it('`tea score` renders the leaderboard, not the current team', async () => {
    const { handler, teamSvc } = makeHandler();
    await handler.command.handler(makeShip({ teamcode: 1n }), ['score'], ctx);
    expect(teamSvc.list).toHaveBeenCalled();
  });

  it('`tea unjoin` leaves the team', async () => {
    const { handler } = makeHandler();
    const ship = makeShip({ teamcode: 1n });
    const r = await handler.command.handler(ship, ['unjoin'], ctx);
    expect(ship.teamcode).toBeUndefined();
    expect(r.lines[0].category).toBe('success');
  });

  it('`tea join <name> <pw>` joins', async () => {
    const { handler, teamSvc } = makeHandler();
    await handler.command.handler(makeShip(), ['join', 'Raiders', 'pw'], ctx);
    expect(teamSvc.joinByPassword.mock.calls[0][0]).toMatchObject({ name: 'Raiders', password: 'pw' });
  });

  it('`tea start <name> <pw>` creates', async () => {
    const { handler, teamSvc } = makeHandler();
    await handler.command.handler(makeShip(), ['start', 'Raiders', 'pw'], ctx);
    expect(teamSvc.create).toHaveBeenCalled();
  });
});

describe('tea create founder password disclosure (TEAMCRT)', () => {
  it('shows the founder password once, with the canon warning', async () => {
    const { handler } = makeHandler();
    const r = await handler.command.handler(makeShip(), ['create', 'Raiders', 'joinpw'], ctx);
    const body = text(r);
    expect(body).toContain('Founder Password..: ABCD1234');
    expect(body).toContain('Please write down the Founder Password as you will not be able to change it');
    expect(body).toContain('or display it again.');
  });
});

/**
 * `tea newname` truncates a long name; it does not refuse it.
 *
 * Canon's newname checks only the LOWER bound —
 * `if (strlen(margv[3]) < 5) { badfmt(TEAMBNAM); return; }` — and then does
 * `strncpy(teamtab[i].teamname, margv[3], 30)`, which silently keeps the first
 * 30 characters (GECMDS.C:5745-5751). There is no too-long refusal anywhere in
 * cmd_team, so inventing one changes what a valid command does.
 */
describe('TeamService.newName — length handling', () => {
  it('truncates at 30 characters rather than refusing', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    const r = await svc.newName({
      ship: makeShip({ teamcode: 7n }), secret: 'FOUND123', name: 'A'.repeat(45),
    });
    expect(r).toEqual({ ok: true, teamname: 'A'.repeat(30) });
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { teamcode: 7n },
      data: { teamname: 'A'.repeat(30) },
    });
  });
});
