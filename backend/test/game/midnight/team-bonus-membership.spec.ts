/**
 * TEAMBONU is added for EVERY member, whatever their score.
 *
 * GEMAIN.C:1258-1286 gates only on `tmpusr.teamcode > 0` — there is no score
 * test anywhere in the block — and `teamcount`, the divisor each member's
 * contribution is scaled by, counts those members too. The port added
 * `score: { gt: 0n }` to the query, so a team's fresh recruits were counted in
 * the divisor but contributed no bonus: the team's score went DOWN for taking
 * someone on.
 *
 * The defect is latent at the shipped TEAMBONU of 0, which is why it survived
 * the original review. This test turns the option on — with a fresh module
 * registry, since the constant is resolved at import — so the behaviour is
 * actually observable.
 */

import { PrismaService } from '../../../src/prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../../src/prisma/prisma.module';

let app: TestingModule;
let prisma: PrismaService;

beforeAll(async () => {
  app = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
  prisma = app.get(PrismaService);
  await app.init();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { userid: { startsWith: 'tb-' } } });
  await prisma.team.deleteMany({ where: { teamname: { startsWith: 'tb-' } } });
  await app.close();
});

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { userid: { startsWith: 'tb-' } } });
  await prisma.team.deleteMany({ where: { teamname: { startsWith: 'tb-' } } });
});

async function repoWithBonus(bonus: string) {
  process.env['TEAMBONU'] = bonus;
  jest.resetModules();
  const { MidnightRepository } = await import('../../../src/game/midnight/midnight.repository');
  const { TEAMBONU } = await import('../../../src/game/midnight/midnight.constants');
  return { repo: new MidnightRepository(prisma), TEAMBONU };
}

afterEach(() => {
  delete process.env['TEAMBONU'];
});

describe('per-member team bonus — GEMAIN.C:1258-1286', () => {
  it('credits the bonus for a member with no score at all', async () => {
    const { repo, TEAMBONU } = await repoWithBonus('5');
    expect(TEAMBONU).toBeGreaterThan(0n);

    await prisma.team.create({ data: { teamcode: 8801n, teamname: 'tb-Recruits', teamcount: 2 } });
    await prisma.user.createMany({
      data: [
        { userid: 'tb-vet', username: 'tb-vet', teamcode: 8801n, score: 1000n },
        { userid: 'tb-rookie', username: 'tb-rookie', teamcode: 8801n, score: 0n },
      ],
    });

    await repo.applyPerMemberTeamScore(prisma);

    const team = await prisma.team.findUniqueOrThrow({ where: { teamcode: 8801n } });
    // Both members contribute the bonus; only the veteran contributes score.
    expect(team.teamscore).toBe(TEAMBONU * 2n + 1000n / 2n);
  });

  it('does not penalise a team for recruiting', async () => {
    const { repo, TEAMBONU } = await repoWithBonus('5');

    await prisma.team.create({ data: { teamcode: 8802n, teamname: 'tb-Solo', teamcount: 1 } });
    await prisma.user.create({
      data: { userid: 'tb-solo', username: 'tb-solo', teamcode: 8802n, score: 1000n },
    });
    await repo.applyPerMemberTeamScore(prisma);
    const solo = await prisma.team.findUniqueOrThrow({ where: { teamcode: 8802n } });

    await prisma.team.create({ data: { teamcode: 8803n, teamname: 'tb-Pair', teamcount: 2 } });
    await prisma.user.createMany({
      data: [
        { userid: 'tb-a', username: 'tb-a', teamcode: 8803n, score: 1000n },
        { userid: 'tb-b', username: 'tb-b', teamcode: 8803n, score: 0n },
      ],
    });
    await repo.applyPerMemberTeamScore(prisma);
    const pair = await prisma.team.findUniqueOrThrow({ where: { teamcode: 8803n } });

    // The pair halves the veteran's contribution but gains a second bonus.
    expect(pair.teamscore).toBe(solo.teamscore - 500n + TEAMBONU);
  });
});
