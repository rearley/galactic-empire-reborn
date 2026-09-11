import { TeamRepository } from '../../../src/game/team/team.repository';
import { PrismaService } from '../../../src/prisma/prisma.service';
import type { Mock } from 'vitest';

function makePrisma(findFirstResult: unknown = null) {
  return {
    team: {
      findFirst: vi.fn().mockResolvedValue(findFirstResult),
    },
  } as unknown as PrismaService;
}

function makePrismaWithUnique(findUniqueResult: unknown = null) {
  return {
    team: {
      findUnique: vi.fn().mockResolvedValue(findUniqueResult),
    },
  } as unknown as PrismaService;
}

describe('TeamRepository.findByNameLower', () => {
  it('escapes ILIKE wildcards in the supplied name, so a pattern cannot match an unrelated team', async () => {
    // `mode: 'insensitive'` renders as `teamname ILIKE $1` with the value
    // used verbatim as the pattern. Team names are free text (no character
    // restriction — see team-name.ts), so a name of "%" would match every
    // team, letting a caller brute-force any team's password via joinByPassword.
    const prisma = makePrisma(null);
    const repo = new TeamRepository(prisma);

    await repo.findByNameLower('%');

    const where = (prisma.team.findFirst as Mock).mock.calls[0][0].where;
    expect(where.teamname.equals).toBe('\\%');
  });

  it('still finds a team by ordinary case-insensitive name', async () => {
    const prisma = makePrisma({ teamcode: 1n, teamname: 'Rebels', password: 'x' });
    const repo = new TeamRepository(prisma);

    await repo.findByNameLower('rebels');

    const where = (prisma.team.findFirst as Mock).mock.calls[0][0].where;
    expect(where.teamname.equals).toBe('rebels');
    expect(where.teamname.mode).toBe('insensitive');
  });
});

/**
 * `tea` (showTeam) and `dat` both issue this exact `findFirst` — same `where`,
 * same `select` — to render a teamcode as a name. Two identical call sites is
 * the duplication `findNameByCode` exists to end.
 * @see tea.handler.ts showTeam, dat.handler.ts handle
 */
describe('TeamRepository.findNameByCode', () => {
  it('issues the same findFirst the two command handlers used', async () => {
    const prisma = makePrisma({ teamname: 'Rebels' });
    const repo = new TeamRepository(prisma);

    const result = await repo.findNameByCode(4n);

    expect(prisma.team.findFirst).toHaveBeenCalledWith({
      where: { teamcode: 4n },
      select: { teamname: true },
    });
    expect(result).toEqual({ teamname: 'Rebels' });
  });
});

/**
 * `rep acc` looks a captain's team up by its primary key, so the port's
 * `report.handler.ts` call site used `findUnique` rather than `findFirst` —
 * canon has no Prisma verbs to disagree about; this is a port-side
 * distinction from `findNameByCode`, preserved rather than merged into it.
 * @see report.handler.ts
 */
describe('TeamRepository.getName', () => {
  it('issues findUnique on the teamcode primary key', async () => {
    const prisma = makePrismaWithUnique({ teamname: 'Rebels' });
    const repo = new TeamRepository(prisma);

    const result = await repo.getName(4n);

    expect(prisma.team.findUnique).toHaveBeenCalledWith({
      where: { teamcode: 4n },
      select: { teamname: true },
    });
    expect(result).toEqual({ teamname: 'Rebels' });
  });
});
