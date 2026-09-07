import { TeamRepository } from '../../../src/game/team/team.repository';
import { PrismaService } from '../../../src/prisma/prisma.service';

function makePrisma(findFirstResult: unknown = null) {
  return {
    team: {
      findFirst: jest.fn().mockResolvedValue(findFirstResult),
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

    const where = (prisma.team.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.teamname.equals).toBe('\\%');
  });

  it('still finds a team by ordinary case-insensitive name', async () => {
    const prisma = makePrisma({ teamcode: 1n, teamname: 'Rebels', password: 'x' });
    const repo = new TeamRepository(prisma);

    await repo.findByNameLower('rebels');

    const where = (prisma.team.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.teamname.equals).toBe('rebels');
    expect(where.teamname.mode).toBe('insensitive');
  });
});
