/**
 * T028 — Idempotency: running MidnightService.run() twice produces identical
 * User/Team state and exactly doubles MailStat row count.
 *
 * SC-003 / FR-003: The only divergence on a second run is duplicate MailStat
 * rows from phase 2 (explicitly accepted per spec).
 *
 * @see specs/009-midnight-job/tasks.md T028
 * @see specs/009-midnight-job/spec.md SC-003 / FR-003
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { MidnightService } from '../../../src/game/midnight/midnight.service';
import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';
import { ScheduleModule } from '@nestjs/schedule';
import { NUMITEMS, I_MEN } from '../../../src/game/constants/items';
import { PLTYPE_PLNT } from '../../../src/game/constants';

let app: TestingModule;
let prisma: PrismaService;
let service: MidnightService;

function makeItemsQty(menQty: bigint = 0n): bigint[] {
  const qty = Array<bigint>(NUMITEMS).fill(0n);
  qty[I_MEN] = menQty;
  return qty;
}

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

describe('idempotency — two runs on same fixture (SC-003/FR-003)', () => {
  it('produces identical User state on second run', async () => {
    await prisma.user.createMany({
      data: [
        { userid: 'alice', username: 'alice', klscore: 500n },
        { userid: 'bob', username: 'bob', klscore: 1000n },
      ],
    });
    await prisma.planet.createMany({
      data: [
        {
          xsect: 1, ysect: 1, plnum: 1, type: PLTYPE_PLNT,
          xcoord: 1, ycoord: 1, userid: 'alice', name: 'Planet1',
          enviorn: 0, resource: 0, cash: 100_000n, debt: 0n, tax: 10_000n,
          taxrate: 0, warnings: 0, password: '', lastattack: '', beacon: '',
          spyowner: '', technology: 0, teamcode: 0n,
          itemsQty: makeItemsQty(0n),
          itemsRate: Array(NUMITEMS).fill(0),
          itemsSell: Array(NUMITEMS).fill(0),
          itemsReserve: Array(NUMITEMS).fill(0),
          itemsMarkup2a: Array(NUMITEMS).fill(0),
          itemsSold2a: Array(NUMITEMS).fill(0n),
        },
      ],
    });

    // First run
    await service.run();
    const alice1 = await prisma.user.findUniqueOrThrow({ where: { userid: 'alice' } });
    const bob1 = await prisma.user.findUniqueOrThrow({ where: { userid: 'bob' } });

    // Second run (manual endpoint re-run on same day)
    await service.run();
    const alice2 = await prisma.user.findUniqueOrThrow({ where: { userid: 'alice' } });
    const bob2 = await prisma.user.findUniqueOrThrow({ where: { userid: 'bob' } });

    expect(alice2.score).toBe(alice1.score);
    expect(alice2.plscore).toBe(alice1.plscore);
    expect(alice2.rospos).toBe(alice1.rospos);
    expect(alice2.klscore).toBe(alice1.klscore);
    expect(bob2.score).toBe(bob1.score);
    expect(bob2.rospos).toBe(bob1.rospos);
  });

  it('MailStat row count exactly doubles on second run (FR-003)', async () => {
    await prisma.user.create({ data: { userid: 'alice', username: 'alice', klscore: 0n } });
    await prisma.planet.create({
      data: {
        xsect: 1, ysect: 1, plnum: 1, type: PLTYPE_PLNT,
        xcoord: 1, ycoord: 1, userid: 'alice', name: 'Planet1',
        enviorn: 0, resource: 0, cash: 100_000n, debt: 0n, tax: 0n,
        taxrate: 0, warnings: 0, password: '', lastattack: '', beacon: '',
        spyowner: '', technology: 0, teamcode: 0n,
        itemsQty: makeItemsQty(),
        itemsRate: Array(NUMITEMS).fill(0),
        itemsSell: Array(NUMITEMS).fill(0),
        itemsReserve: Array(NUMITEMS).fill(0),
        itemsMarkup2a: Array(NUMITEMS).fill(0),
        itemsSold2a: Array(NUMITEMS).fill(0n),
      },
    });

    await service.run();
    const afterRun1 = await prisma.mailStat.count();
    expect(afterRun1).toBe(1);

    await service.run();
    const afterRun2 = await prisma.mailStat.count();
    expect(afterRun2).toBe(2);
  });

  it('Team state is identical on second run', async () => {
    await prisma.team.create({ data: { teamcode: 5n, teamname: 'Alpha' } });
    await prisma.user.createMany({
      data: [
        { userid: 'alice', username: 'alice', teamcode: 5n, klscore: 100n },
        { userid: 'bob', username: 'bob', teamcode: 5n, klscore: 200n },
      ],
    });

    await service.run();
    const team1 = await prisma.team.findUniqueOrThrow({ where: { teamcode: 5n } });

    await service.run();
    const team2 = await prisma.team.findUniqueOrThrow({ where: { teamcode: 5n } });

    expect(team2.teamscore).toBe(team1.teamscore);
    expect(team2.teamcount).toBe(team1.teamcount);
  });
});
