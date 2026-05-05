/**
 * T027 — US4: Team score reconciliation integration test.
 *
 * Verifies: per-team count, score = N × TEAMBONU + Σ(member.score / teamcount),
 * orphan teamcode reset, empty team sentinel.
 *
 * @see GEMAIN.C:1204-1295 — phase-4 team reconciliation
 * @see specs/009-midnight-job/tasks.md T027
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { MidnightService } from '../../../src/game/midnight/midnight.service';
import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';
import { ScheduleModule } from '@nestjs/schedule';
import { TEAMBONU } from '../../../src/game/midnight/midnight.constants';

let app: TestingModule;
let prisma: PrismaService;
let service: MidnightService;

async function truncateAll() {
  await prisma.midnightRun.deleteMany();
  await prisma.mailStat.deleteMany();
  await prisma.mail.deleteMany();
  await prisma.team.deleteMany();
  await prisma.planet.deleteMany();
  await prisma.ship.deleteMany();
  await prisma.user.deleteMany();
}

beforeAll(async () => {
  app = await Test.createTestingModule({
    imports: [PrismaModule, ScheduleModule.forRoot()],
    providers: [MidnightService, MidnightRepository],
  }).compile();
  prisma = app.get(PrismaService);
  service = app.get(MidnightService);
  await app.init();
});

afterAll(async () => {
  await truncateAll();
  await app.close();
});

beforeEach(async () => {
  await truncateAll();
});

describe('US4 — team reconciliation (T027)', () => {
  it('team score = N × TEAMBONU + Σ(member.score / teamcount)', async () => {
    await prisma.team.create({ data: { teamcode: 5n, teamname: 'Alpha' } });

    // 3 users on team 5 with equal klscore (so equal score after phase)
    await prisma.user.createMany({
      data: [
        { userid: 'alice', teamcode: 5n, klscore: 300n },
        { userid: 'bob', teamcode: 5n, klscore: 600n },
        { userid: 'carol', teamcode: 5n, klscore: 900n },
      ],
    });

    await service.run();

    const team = await prisma.team.findUniqueOrThrow({ where: { teamcode: 5n } });
    // After run: alice.score = 300, bob.score = 600, carol.score = 900 (klscore, no planets)
    // teamcount = 3
    // teamscore = 3 × TEAMBONU + (300/3 + 600/3 + 900/3) = 3 × TEAMBONU + (100 + 200 + 300)
    const expectedScore = 3n * TEAMBONU + (300n / 3n + 600n / 3n + 900n / 3n);
    expect(team.teamscore).toBe(expectedScore);
    expect(team.teamcount).toBe(3);
  });

  it('TEAMBONU is added once per member (inside per-user loop)', async () => {
    await prisma.team.create({ data: { teamcode: 9n, teamname: 'Beta' } });

    // 2 users on team 9
    await prisma.user.createMany({
      data: [
        { userid: 'dave', teamcode: 9n, klscore: 1000n },
        { userid: 'eve', teamcode: 9n, klscore: 2000n },
      ],
    });

    await service.run();

    const team = await prisma.team.findUniqueOrThrow({ where: { teamcode: 9n } });
    // teamscore = 2 × TEAMBONU + (1000/2 + 2000/2) = 2 × TEAMBONU + (500 + 1000)
    const expectedScore = 2n * TEAMBONU + (1000n / 2n + 2000n / 2n);
    expect(team.teamscore).toBe(expectedScore);
  });

  it('resets orphan teamcode to 0 when team does not exist', async () => {
    await prisma.user.create({ data: { userid: 'orphan', teamcode: 99n, klscore: 500n } });
    // Note: team 99 does NOT exist

    await service.run();

    const user = await prisma.user.findUniqueOrThrow({ where: { userid: 'orphan' } });
    expect(user.teamcode).toBe(0n);
  });

  it('marks empty teams removed with teamcode = -1', async () => {
    // Team 7 exists but has no members
    await prisma.team.create({ data: { teamcode: 7n, teamname: 'Empty' } });

    await service.run();

    const team = await prisma.team.findFirst({ where: { teamname: 'Empty' } });
    expect(team?.teamcode).toBe(-1n);
  });

  it('non-empty teams keep positive teamcode', async () => {
    await prisma.team.create({ data: { teamcode: 3n, teamname: 'Active' } });
    await prisma.user.create({ data: { userid: 'member', teamcode: 3n, klscore: 100n } });

    await service.run();

    const team = await prisma.team.findFirst({ where: { teamname: 'Active' } });
    expect(team?.teamcode).toBe(3n);
    expect(team?.teamcount).toBe(1);
  });

  it('mixed scenario: 3 on team 5, 2 on team 9, 1 orphan referencing team 99', async () => {
    await prisma.team.create({ data: { teamcode: 5n, teamname: 'Alpha' } });
    await prisma.team.create({ data: { teamcode: 9n, teamname: 'Beta' } });

    await prisma.user.createMany({
      data: [
        { userid: 'a1', teamcode: 5n, klscore: 100n },
        { userid: 'a2', teamcode: 5n, klscore: 200n },
        { userid: 'a3', teamcode: 5n, klscore: 300n },
        { userid: 'b1', teamcode: 9n, klscore: 500n },
        { userid: 'b2', teamcode: 9n, klscore: 500n },
        { userid: 'orphan', teamcode: 99n, klscore: 1000n },
      ],
    });

    await service.run();

    const team5 = await prisma.team.findUniqueOrThrow({ where: { teamcode: 5n } });
    const team9 = await prisma.team.findUniqueOrThrow({ where: { teamcode: 9n } });
    const orphan = await prisma.user.findUniqueOrThrow({ where: { userid: 'orphan' } });

    // Team 5: 3 × TEAMBONU + (100/3 + 200/3 + 300/3)
    const expected5 = 3n * TEAMBONU + (100n / 3n + 200n / 3n + 300n / 3n);
    expect(team5.teamscore).toBe(expected5);
    expect(team5.teamcount).toBe(3);

    // Team 9: 2 × TEAMBONU + (500/2 + 500/2)
    const expected9 = 2n * TEAMBONU + (500n / 2n + 500n / 2n);
    expect(team9.teamscore).toBe(expected9);
    expect(team9.teamcount).toBe(2);

    // Orphan reset
    expect(orphan.teamcode).toBe(0n);
  });
});
