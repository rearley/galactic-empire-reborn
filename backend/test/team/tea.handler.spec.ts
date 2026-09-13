import { TeaHandlerService } from '../../src/game/commands/handlers/tea.handler';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { TeamService } from '../../src/game/team/team.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandContext } from '../../src/game/commands/command.types';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { MAXTEAMS } from '../../src/game/team/team.types';
import { TEAMNOT } from '../../src/game/team/team-messages';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    ...overrides,
  });
}

function makeHandler(teamSvcOverrides: Partial<TeamService> = {}, foundTeam: { teamcode: bigint; teamname: string } | null = null): TeaHandlerService {
  const prismaMock = {
    team: { findFirst: vi.fn().mockResolvedValue(foundTeam) },
    user: { update: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  const shipStateSvcMock = {} as unknown as ShipStateService;
  const teamSvc = {
    create: vi.fn().mockResolvedValue({ ok: true, teamcode: 1n, teamname: 'Raiders' }),
    joinByPassword: vi.fn().mockResolvedValue({ ok: true, teamname: 'Raiders' }),
    list: vi.fn().mockResolvedValue([]),
    ...teamSvcOverrides,
  } as unknown as TeamService;
  return new TeaHandlerService(prismaMock, shipStateSvcMock, teamSvc);
}

const ctx: CommandContext = {};

// ── T010: US1 — tea create branch ─────────────────────────────────────────────

describe('TeaHandlerService — tea create', () => {
  it('returns success line on create', async () => {
    const teamSvc = {
      create: vi.fn().mockResolvedValue({ ok: true, teamcode: 1n, teamname: 'Galactic Raiders' }),
      list: vi.fn(),
      joinByPassword: vi.fn(),
    } as unknown as TeamService;
    const handler = makeHandler(teamSvc);
    const result = await handler.command.handler(makeShip(), ['create', 'Galactic', 'Raiders', 's3cret'], ctx);
    expect(result.lines[0].text).toBe('Team Galactic Raiders created. You are its first member.');
    expect(result.lines[0].category).toBe('success');
  });

  it('emits player.snapshot broadcast on create success', async () => {
    const handler = makeHandler({ create: vi.fn().mockResolvedValue({ ok: true, teamcode: 1n, teamname: 'Raiders' }) });
    const result = await handler.command.handler(makeShip(), ['create', 'Raiders', 'pw'], ctx);
    expect(result.broadcasts?.some((b) => b.event === 'player.snapshot')).toBe(true);
  });

  it('returns already-on-team error', async () => {
    const handler = makeHandler({ create: vi.fn().mockResolvedValue({ error: 'already_on_team' }) });
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
    const handler = makeHandler({ create: vi.fn().mockResolvedValue({ error: 'name_too_long' }) });
    const result = await handler.command.handler(makeShip(), ['create', 'a'.repeat(31), 'pw'], ctx);
    expect(result.lines[0].text).toBe('Team name must be 30 characters or fewer.');
    expect(result.lines[0].category).toBe('system');
  });

  it('returns password-too-long error', async () => {
    const handler = makeHandler({ create: vi.fn().mockResolvedValue({ error: 'password_too_long' }) });
    const result = await handler.command.handler(makeShip(), ['create', 'Raiders', '123456789'], ctx);
    expect(result.lines[0].text).toBe('Team password must be 8 characters or fewer.');
    expect(result.lines[0].category).toBe('system');
  });

  it('returns password-has-space error', async () => {
    const handler = makeHandler({ create: vi.fn().mockResolvedValue({ error: 'password_has_space' }) });
    const result = await handler.command.handler(makeShip(), ['create', 'Raiders', 'a b'], ctx);
    expect(result.lines[0].text).toBe('Team password may not contain spaces.');
    expect(result.lines[0].category).toBe('system');
  });

  it('returns name-taken error', async () => {
    const handler = makeHandler({ create: vi.fn().mockResolvedValue({ error: 'name_taken' }) });
    const result = await handler.command.handler(makeShip(), ['create', 'Raiders', 'pw'], ctx);
    expect(result.lines[0].text).toBe('Team name already taken.');
    expect(result.lines[0].category).toBe('system');
  });
});

// ── T015: US2 — tea <name> <password> join branch ─────────────────────────────

describe('TeaHandlerService — tea password-gated join', () => {
  it('returns success line on join with correct password', async () => {
    const handler = makeHandler({ joinByPassword: vi.fn().mockResolvedValue({ ok: true, teamname: 'Galactic Raiders' }) });
    const result = await handler.command.handler(makeShip(), ['Galactic', 'Raiders', 's3cret'], ctx);
    expect(result.lines[0].text).toBe('You have joined team Galactic Raiders.');
    expect(result.lines[0].category).toBe('success');
  });

  it('emits player.snapshot broadcast on join success', async () => {
    const handler = makeHandler({ joinByPassword: vi.fn().mockResolvedValue({ ok: true, teamname: 'Raiders' }) });
    const result = await handler.command.handler(makeShip(), ['Raiders', 'pw'], ctx);
    expect(result.broadcasts?.some((b) => b.event === 'player.snapshot')).toBe(true);
  });

  it('returns already-on-team error', async () => {
    const handler = makeHandler({ joinByPassword: vi.fn().mockResolvedValue({ error: 'already_on_team' }) });
    const result = await handler.command.handler(makeShip(), ['Raiders', 'pw'], ctx);
    expect(result.lines[0].text).toBe("You are already on a team. Use 'tea leave' first.");
    expect(result.lines[0].category).toBe('system');
  });

  it('returns no-such-team error', async () => {
    const handler = makeHandler({ joinByPassword: vi.fn().mockResolvedValue({ error: 'no_such_team' }) });
    const result = await handler.command.handler(makeShip(), ['Nonexistent', 'pw'], ctx);
    expect(result.lines[0].text).toBe('No such team: Nonexistent');
    expect(result.lines[0].category).toBe('system');
  });

  it('returns wrong-password error', async () => {
    const handler = makeHandler({ joinByPassword: vi.fn().mockResolvedValue({ error: 'wrong_password' }) });
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
  it('aligns numeric column right-edges with their headers', async () => {
    const handler = makeHandler({
      list: vi.fn().mockResolvedValue([
        { rank: 1, teamcode: 1n, teamname: 'Raiders', members: 3, score: 100n },
      ]),
    });
    const result = await handler.command.handler(makeShip(), ['list'], ctx);
    const ends = (line: string): number[] =>
      [...line.matchAll(/\S+/g)].map((m) => m.index! + m[0].length);
    // Rank/Members/Score are right-aligned, so their end columns must match the
    // header's. Team is left-aligned (padEnd) and is excluded.
    const numeric = (line: string): number[] => {
      const e = ends(line);
      return [e[0], e[2], e[3]];
    };
    expect(numeric(result.lines[1].text)).toEqual(numeric(result.lines[0].text));
  });

  it('returns header line', async () => {
    const handler = makeHandler({
      list: vi.fn().mockResolvedValue([
        { rank: 1, teamcode: 1n, teamname: 'Raiders', members: 3, score: 100n },
      ]),
    });
    const result = await handler.command.handler(makeShip(), ['list'], ctx);
    expect(result.lines[0].text).toBe('  Rank  Team                            Members       Score');
    expect(result.lines[0].category).toBe('system');
  });

  it('returns row with correct fixed-width fields', async () => {
    const handler = makeHandler({
      list: vi.fn().mockResolvedValue([
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
    const handler = makeHandler({ list: vi.fn().mockResolvedValue([]) });
    const result = await handler.command.handler(makeShip(), ['list'], ctx);
    expect(result.lines[0].text).toBe('No teams have been formed.');
    expect(result.lines[0].category).toBe('info');
  });
});

/**
 * The refusal a full team table produces is canon's TOOMANY, with the limit
 * interpolated:
 *
 *   prfmsg(TOOMANY,MAXTEAMS);
 *
 * @see GECMDS.C:5488
 * @see GE/REL/MBMGEMSG.MSG:5858 `TOOMANY {***\nThere are already a maximum of %d teams declared.}`
 *
 * Asserted against CANON_MESSAGES rather than a literal, so the string stays
 * pinned to the extracted .MSG rather than to my transcription of it.
 */
describe('tea create renders TOOMANY when the table is full (GECMDS.C:5488)', () => {
  it('prints canon text with the limit filled in', async () => {
    const handler = makeHandler({
      create: vi.fn().mockResolvedValue({ error: 'too_many', limit: MAXTEAMS }),
    } as unknown as Partial<TeamService>);

    const result = await handler.command.handler(makeShip(), ['create', 'Latecomers', 'pw'], ctx);

    expect(result.lines[0].text).toBe(formatMessage(MessageId.TEAM_TOO_MANY, MAXTEAMS));
    expect(result.lines[0].text).toContain(String(MAXTEAMS));
  });

  it('is not the generic usage line — a full table is not a typo', async () => {
    const handler = makeHandler({
      create: vi.fn().mockResolvedValue({ error: 'too_many', limit: MAXTEAMS }),
    } as unknown as Partial<TeamService>);

    const result = await handler.command.handler(makeShip(), ['create', 'Latecomers', 'pw'], ctx);

    expect(result.lines[0].text).not.toContain('Usage:');
  });
});

/**
 * `tea unjoin` from an unaffiliated pilot changes nothing and says so.
 *
 * Canon wraps the whole unjoin branch in `if (waruptr->teamcode > 0) { ... }`
 * and falls to `badfmt(TEAMNOT)` otherwise (GECMDS.C:5429-5468).
 *
 * `leaveTeam` was the one sub-verb that never routed through TeamService, so
 * it never learned the not_on_team answer every sibling already gives — it
 * wrote `teamcode: null` unconditionally and reported success.
 */
describe('tea leave requires actually being on a team (GECMDS.C:5464)', () => {
  it('answers TEAMNOT and does not touch the row', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      team: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { update },
    } as unknown as PrismaService;
    const handler = new TeaHandlerService(
      prisma, {} as unknown as ShipStateService, {} as unknown as TeamService,
    );

    const result = await handler.command.handler(makeShip({ teamcode: undefined }), ['leave'], ctx);

    expect(result.lines[0].text).toBe(TEAMNOT);
    expect(update).not.toHaveBeenCalled();
  });

  it('does not rebroadcast a snapshot for a no-op', async () => {
    const prisma = {
      team: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { update: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const handler = new TeaHandlerService(
      prisma, {} as unknown as ShipStateService, {} as unknown as TeamService,
    );

    const result = await handler.command.handler(makeShip({ teamcode: 0n }), ['leave'], ctx);

    expect(result.broadcasts ?? []).toHaveLength(0);
  });

  it('still lets a real member leave', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      team: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { update },
    } as unknown as PrismaService;
    const handler = new TeaHandlerService(
      prisma, {} as unknown as ShipStateService, {} as unknown as TeamService,
    );

    const result = await handler.command.handler(makeShip({ teamcode: 7n }), ['leave'], ctx);

    expect(result.lines[0].text).toBe('You have left your team.');
    expect(update).toHaveBeenCalled();
  });
});
