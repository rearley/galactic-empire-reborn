/**
 * A team disbanded at midnight for having no members must stop being findable.
 *
 * C frees the team's slot in the fixed `teamtab` array (`teamcode = -1`,
 * GEMAIN.C:1293), so the name is gone and can be taken again. The port keeps
 * the row and marks it `removed`, so every lookup that stands in for "scan
 * teamtab for a live team" has to exclude it — otherwise a disbanded team is
 * still joinable by name with its old password.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamRepository } from '../../src/game/team/team.repository';

let app: TestingModule;
let prisma: PrismaService;
let repo: TeamRepository;

beforeAll(async () => {
  app = await Test.createTestingModule({
    imports: [PrismaModule],
    providers: [TeamRepository],
  }).compile();
  prisma = app.get(PrismaService);
  repo = app.get(TeamRepository);
  await app.init();
});

afterAll(async () => {
  await prisma.team.deleteMany({ where: { teamname: { startsWith: 'rmtest-' } } });
  await app.close();
});

beforeEach(async () => {
  await prisma.team.deleteMany({ where: { teamname: { startsWith: 'rmtest-' } } });
});

describe('TeamRepository.findByNameLower excludes disbanded teams', () => {
  it('finds a live team by name', async () => {
    await prisma.team.create({
      data: { teamcode: 9001n, teamname: 'rmtest-Live', password: 'pw' },
    });
    expect(await repo.findByNameLower('rmtest-live')).toMatchObject({ teamcode: 9001n });
  });

  it('does not find a team that midnight marked removed', async () => {
    await prisma.team.create({
      data: { teamcode: 9002n, teamname: 'rmtest-Gone', password: 'pw', removed: true },
    });
    expect(await repo.findByNameLower('rmtest-gone')).toBeNull();
  });
});
